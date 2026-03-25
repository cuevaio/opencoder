import { logger } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema";
import type { SessionExportData } from "#/lib/session-types";

interface ExportSessionParams {
	// biome-ignore lint/suspicious/noExplicitAny: OpenCode client type is opaque
	client: any;
	sessionId: string;
	dbSessionId: number;
	initialPrompt: string;
	toolCallCount: number;
	/** The status to set on the session row. */
	status: "idle" | "completed";
	/**
	 * Final event sequence counter from SessionDbWriter.
	 * Written in the same UPDATE as status/session_data to avoid a second
	 * Electric WAL change (which would cause a second re-render on the client).
	 */
	eventSeq: number;
	gitState?: {
		status: "ready" | "capture_failed";
		error: string | null;
		capturedAt: Date | null;
		bytes: number | null;
		head: string | null;
		branch: string | null;
	};
}

/**
 * Export the OpenCode session data and persist it to Postgres.
 * Called after the session completes (or is cancelled).
 * All fields are written in a single UPDATE to produce exactly one
 * Electric WAL change message — preventing a double re-render on the client.
 */
export async function exportAndPersistSession(
	params: ExportSessionParams,
): Promise<void> {
	const {
		client,
		sessionId,
		dbSessionId,
		initialPrompt,
		toolCallCount,
		status,
		eventSeq,
		gitState,
	} = params;

	try {
		// Fetch session info and messages from OpenCode
		const [sessionResult, messagesResult] = await Promise.all([
			client.session.get({ sessionID: sessionId }),
			client.session.messages({ sessionID: sessionId }),
		]);

		const sessionInfo = sessionResult.data;
		const messages = messagesResult.data;

		if (!sessionInfo || !messages) {
			logger.warn("Failed to export session: no data returned", { sessionId });
			// Still write the status/eventSeq even if export data is missing
			await db
				.update(sessions)
				.set({
					status,
					eventSeq,
					...(gitState
						? {
								gitStateStatus: gitState.status,
								gitStateError: gitState.error,
								gitStateCapturedAt: gitState.capturedAt,
								gitStateBytes: gitState.bytes,
								gitStateHead: gitState.head,
								gitStateBranch: gitState.branch,
							}
						: {}),
				})
				.where(eq(sessions.id, dbSessionId));
			return;
		}

		const exportData: SessionExportData = {
			info: sessionInfo,
			messages,
		};

		// Compute aggregate stats from messages
		let totalTokens = 0;
		let totalCost = 0;
		const messageCount = messages.length;

		for (const msg of messages) {
			const info = msg.info;
			if (info.tokens) {
				totalTokens +=
					(info.tokens.input ?? 0) +
					(info.tokens.output ?? 0) +
					(info.tokens.reasoning ?? 0);
			}
			if (info.cost != null) {
				// Cost is in dollars, store as microcents (integer) for precision
				totalCost += Math.round(info.cost * 1_000_000);
			}
		}

		// Derive title from session info or first prompt
		const title =
			sessionInfo.title || initialPrompt.slice(0, 100) || "Untitled session";

		// Single UPDATE — produces exactly ONE Electric WAL change message.
		// Includes eventSeq so db-writer.close() does not need a separate UPDATE.
		await db
			.update(sessions)
			.set({
				opencodeSessionId: sessionId,
				title,
				status,
				sessionData: exportData,
				totalTokens,
				totalCost,
				messageCount,
				toolCallCount,
				eventSeq,
				...(gitState
					? {
							gitStateStatus: gitState.status,
							gitStateError: gitState.error,
							gitStateCapturedAt: gitState.capturedAt,
							gitStateBytes: gitState.bytes,
							gitStateHead: gitState.head,
							gitStateBranch: gitState.branch,
						}
					: {}),
				completedAt: status === "completed" ? new Date() : null,
			})
			.where(eq(sessions.id, dbSessionId));

		logger.info("Session persisted to Postgres", {
			sessionId,
			messageCount,
			toolCallCount,
			totalTokens,
			eventSeq,
		});
	} catch (error) {
		// Don't throw — session export failure should not crash the task
		logger.error("Failed to export/persist session", {
			sessionId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
