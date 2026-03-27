import { createFileRoute } from "@tanstack/react-router";
import { runs } from "@trigger.dev/sdk/v3";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

/**
 * GET /api/agent/sessions/:id
 * Get a single session with full sessionData for replay.
 *
 * DELETE /api/agent/sessions/:id
 * Delete a session and all related data (events, git state cascade).
 * If the session is still running, cancels it first via Trigger.dev.
 */
export const Route = createFileRoute("/api/agent/sessions/$id")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const authSession = await requireAuth(request);
				const userId = authSession.user.id;

				const sessionId = parseSessionId(request);
				if (sessionId === null) {
					return Response.json(
						{ error: "Invalid session ID" },
						{ status: 400 },
					);
				}

				const [row] = await db
					.select()
					.from(sessions)
					.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
					.limit(1);

				if (!row) {
					return Response.json({ error: "Session not found" }, { status: 404 });
				}

				return Response.json({ session: row });
			},

			DELETE: async ({ request }) => {
				const authSession = await requireAuth(request);
				const userId = authSession.user.id;

				const sessionId = parseSessionId(request);
				if (sessionId === null) {
					return Response.json(
						{ error: "Invalid session ID" },
						{ status: 400 },
					);
				}

				// Fetch the session to verify ownership and check status
				const [row] = await db
					.select({
						id: sessions.id,
						status: sessions.status,
						triggerRunId: sessions.triggerRunId,
					})
					.from(sessions)
					.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
					.limit(1);

				if (!row) {
					return Response.json({ error: "Session not found" }, { status: 404 });
				}

				try {
					// If the session is still running, end the Trigger.dev run first
					if (row.status === "running" && row.triggerRunId) {
						await endTriggerRun(row.triggerRunId, userId);
					}

					// Delete the session — cascade constraints handle session_events
					// and agent_session_git_state cleanup automatically
					await db
						.delete(sessions)
						.where(
							and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
						);

					return Response.json({ ok: true });
				} catch (error: unknown) {
					console.error("Failed to delete session:", error);
					const message =
						error instanceof Error ? error.message : "Failed to delete session";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});

/** Extract the numeric session ID from the last URL path segment. */
function parseSessionId(request: Request): number | null {
	const url = new URL(request.url);
	const segments = url.pathname.split("/");
	const idParam = segments.at(-1);
	if (!idParam) return null;
	const id = Number.parseInt(idParam, 10);
	return Number.isNaN(id) ? null : id;
}

const TERMINAL_TRIGGER_STATUSES = new Set([
	"COMPLETED",
	"CANCELED",
	"FAILED",
	"CRASHED",
	"SYSTEM_FAILURE",
	"EXPIRED",
	"TIMED_OUT",
]);

async function endTriggerRun(runId: string, userId: string): Promise<void> {
	const run = await runs.retrieve(runId);
	const currentMeta = (run.metadata as Record<string, unknown>) || {};

	// Verify ownership via Trigger metadata
	if (currentMeta.userId !== userId) {
		throw new Error("Forbidden");
	}

	await runs.cancel(runId);

	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		const latest = await runs.retrieve(runId);
		if (TERMINAL_TRIGGER_STATUSES.has(latest.status)) {
			return;
		}

		await sleep(500);
	}

	throw new Error("Timed out waiting for Trigger.dev run to stop");
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
