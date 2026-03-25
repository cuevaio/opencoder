import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

/**
 * GET /api/agent/sessions
 * List all sessions for the authenticated user, ordered by most recent.
 * Returns summary data only (no sessionData blob).
 */
export const Route = createFileRoute("/api/agent/sessions")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await requireAuth(request);
				const userId = session.user.id;

				const rows = await db
					.select({
						id: sessions.id,
						repoUrl: sessions.repoUrl,
						repoFullName: sessions.repoFullName,
						opencodeSessionId: sessions.opencodeSessionId,
						triggerRunId: sessions.triggerRunId,
						title: sessions.title,
						initialPrompt: sessions.initialPrompt,
						mode: sessions.mode,
						selectedModel: sessions.selectedModel,
						status: sessions.status,
						totalTokens: sessions.totalTokens,
						totalCost: sessions.totalCost,
						messageCount: sessions.messageCount,
						toolCallCount: sessions.toolCallCount,
						createdAt: sessions.createdAt,
						completedAt: sessions.completedAt,
					})
					.from(sessions)
					.where(eq(sessions.userId, userId))
					.orderBy(desc(sessions.createdAt))
					.limit(50);

				return Response.json({ sessions: rows });
			},
		},
	},
});
