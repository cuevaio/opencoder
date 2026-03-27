import { createFileRoute } from "@tanstack/react-router";
import { runs } from "@trigger.dev/sdk/v3";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

/**
 * GET /api/agent/sessions/:id
 * Get a single session summary row.
 * Pass `include_session_data=true` to include the sessionData replay blob.
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
				const url = new URL(request.url);

				const sessionId = parseSessionId(request);
				if (sessionId === null) {
					return Response.json(
						{ error: "Invalid session ID" },
						{ status: 400 },
					);
				}

				const includeSessionData =
					url.searchParams.get("include_session_data") === "true";

				const baseSelection = {
					id: sessions.id,
					repoUrl: sessions.repoUrl,
					repoFullName: sessions.repoFullName,
					opencodeSessionId: sessions.opencodeSessionId,
					triggerRunId: sessions.triggerRunId,
					title: sessions.title,
					initialPrompt: sessions.initialPrompt,
					lastPrompt: sessions.lastPrompt,
					mode: sessions.mode,
					selectedModel: sessions.selectedModel,
					selectedVariant: sessions.selectedVariant,
					status: sessions.status,
					totalTokens: sessions.totalTokens,
					totalCost: sessions.totalCost,
					messageCount: sessions.messageCount,
					toolCallCount: sessions.toolCallCount,
					eventSeq: sessions.eventSeq,
					createdAt: sessions.createdAt,
					completedAt: sessions.completedAt,
				};

				const [row] = includeSessionData
					? await db
							.select({
								...baseSelection,
								sessionData: sessions.sessionData,
							})
							.from(sessions)
							.where(
								and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
							)
							.limit(1)
					: await db
							.select(baseSelection)
							.from(sessions)
							.where(
								and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
							)
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
					// If the session is still running, cancel it first
					if (row.status === "running" && row.triggerRunId) {
						await cancelTriggerRun(row.triggerRunId, userId);
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

/**
 * Best-effort cancellation of a Trigger.dev run by setting
 * the `cancelRequested` metadata flag.
 */
async function cancelTriggerRun(runId: string, userId: string): Promise<void> {
	try {
		const run = await runs.retrieve(runId);
		const currentMeta = (run.metadata as Record<string, unknown>) || {};

		// Verify ownership via Trigger metadata
		if (currentMeta.userId !== userId) return;

		const triggerApiUrl =
			process.env.TRIGGER_API_URL || "https://api.trigger.dev";
		const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;

		if (!triggerSecretKey) return;

		await fetch(`${triggerApiUrl}/api/v1/runs/${runId}/metadata`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${triggerSecretKey}`,
			},
			body: JSON.stringify({
				metadata: { ...currentMeta, cancelRequested: true },
			}),
		});
	} catch {
		// Best-effort: if cancellation fails we still proceed with deletion
	}
}
