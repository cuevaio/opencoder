import os from "node:os";
import path from "node:path";
import { logger } from "@trigger.dev/sdk/v3";
import Database from "better-sqlite3";
import type { SessionExportData } from "#/lib/session-types";

/**
 * Resolve the XDG data directory ($XDG_DATA_HOME or ~/.local/share).
 * Inlined to avoid the ESM-only `xdg-basedir` package which fails
 * in Trigger.dev's bundler.
 */
const xdgData: string | undefined =
	process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");

/**
 * Import a previously exported session into OpenCode's SQLite database.
 * This allows "continuing" a past session by writing its data back into
 * a fresh OpenCode server instance.
 *
 * The OpenCode server must already be running (it creates the project row).
 * We use the SDK to discover the project ID and DB path, then write directly
 * to SQLite (WAL mode allows concurrent access).
 *
 * Returns the original OpenCode session ID that can be used with
 * `client.session.promptAsync()`.
 */
export async function importSessionToSqlite(
	// biome-ignore lint/suspicious/noExplicitAny: OpenCode client type is opaque
	client: any,
	exportData: SessionExportData,
	cloneDir: string,
): Promise<string> {
	// 1. Get current project ID from the running server
	const projectResult = await client.project.current();
	const newProjectId = projectResult.data?.id;
	if (!newProjectId) {
		throw new Error("Failed to get current project ID from OpenCode");
	}

	// 2. Compute the DB path using the same XDG data directory that OpenCode uses.
	// OpenCode stores its SQLite DB at `$XDG_DATA_HOME/opencode/opencode.db`.
	// Note: the `/path` API endpoint returns `state` (XDG state dir) which is a
	// different directory — using it would create an empty DB at the wrong path.
	if (!xdgData) {
		throw new Error("Could not determine XDG data directory");
	}
	const dbPath = path.join(xdgData, "opencode", "opencode.db");
	logger.info("Importing session to SQLite", {
		dbPath,
		projectId: newProjectId,
		sessionId: exportData.info.id,
	});

	// 3. Open SQLite DB
	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");

	try {
		const sessionInfo = exportData.info;
		const now = Date.now();

		// 4. Upsert session row (always patch project_id and directory)
		const insertSession = db.prepare(`
      INSERT INTO session (
        id, project_id, workspace_id, parent_id, slug, directory, title, version,
        share_url, summary_additions, summary_deletions, summary_files,
        summary_diffs, revert, permission,
        time_created, time_updated, time_compacting, time_archived
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        workspace_id = excluded.workspace_id,
        directory = excluded.directory,
        time_updated = excluded.time_updated
    `);

		insertSession.run(
			sessionInfo.id,
			newProjectId, // Patched to match current project
			sessionInfo.workspaceID ?? null,
			sessionInfo.parentID ?? null,
			sessionInfo.slug,
			cloneDir, // Patched to match current clone directory
			sessionInfo.title,
			sessionInfo.version,
			sessionInfo.share?.url ?? null,
			sessionInfo.summary?.additions ?? null,
			sessionInfo.summary?.deletions ?? null,
			sessionInfo.summary?.files ?? null,
			sessionInfo.summary?.diffs
				? JSON.stringify(sessionInfo.summary.diffs)
				: null,
			sessionInfo.revert ? JSON.stringify(sessionInfo.revert) : null,
			sessionInfo.permission ? JSON.stringify(sessionInfo.permission) : null,
			sessionInfo.time.created,
			now,
			sessionInfo.time.compacting ?? null,
			sessionInfo.time.archived ?? null,
		);

		// 5. Insert messages and parts in a transaction
		const insertMessage = db.prepare(`
      INSERT OR IGNORE INTO message (
        id, session_id, time_created, time_updated, data
      ) VALUES (?, ?, ?, ?, ?)
    `);

		const insertPart = db.prepare(`
      INSERT OR IGNORE INTO part (
        id, message_id, session_id, time_created, time_updated, data
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

		const importAll = db.transaction(() => {
			for (const msg of exportData.messages) {
				const { info, parts } = msg;

				// Store full message object in data blob. On read, OpenCode
				// reconstructs via { ...row.data, id: row.id, sessionID: row.session_id }
				// so top-level columns override blob values — storing them is harmless
				// and matches the reference `opencode import` behavior.
				const messageData = info;
				const msgTimeCreated = info.time.created;
				const msgTimeUpdated =
					"completed" in info.time && info.time.completed
						? info.time.completed
						: info.time.created;

				insertMessage.run(
					info.id,
					sessionInfo.id,
					msgTimeCreated,
					msgTimeUpdated,
					JSON.stringify(messageData),
				);

				// Insert parts
				for (const part of parts) {
					// Store full part object (matches reference import behavior)
					const partData = part;
					const partTimeCreated = getPartTimeCreated(part);

					insertPart.run(
						part.id,
						info.id,
						sessionInfo.id,
						partTimeCreated,
						now,
						JSON.stringify(partData),
					);
				}
			}
		});

		importAll();

		logger.info("Session imported to SQLite", {
			sessionId: sessionInfo.id,
			messageCount: exportData.messages.length,
			partCount: exportData.messages.reduce(
				(sum, m) => sum + m.parts.length,
				0,
			),
		});

		return sessionInfo.id;
	} finally {
		db.close();
	}
}

/**
 * Extract creation timestamp from a part.
 */
// biome-ignore lint/suspicious/noExplicitAny: SDK Part type has complex union
function getPartTimeCreated(part: any): number {
	// Tool parts have time.start
	if (part.type === "tool" && part.state?.time?.start) {
		return part.state.time.start;
	}
	// Text/reasoning parts may have time.start
	if (part.time?.start) {
		return part.time.start;
	}
	// RetryPart and others may have time.created
	if (part.time?.created) {
		return part.time.created;
	}
	// Fallback to now
	return Date.now();
}
