import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

/**
 * GET /api/agent/sessions/:id
 * Get a single session with full sessionData for replay.
 */
export const Route = createFileRoute("/api/agent/sessions/$id")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const authSession = await requireAuth(request);
				const userId = authSession.user.id;

				// Extract the id param from the URL
				const url = new URL(request.url);
				const segments = url.pathname.split("/");
				const idParam = segments[segments.length - 1];
				const sessionId = Number.parseInt(idParam!, 10);

				if (Number.isNaN(sessionId)) {
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
		},
	},
});
