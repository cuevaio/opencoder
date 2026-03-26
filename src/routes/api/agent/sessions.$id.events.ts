import { createFileRoute } from "@tanstack/react-router";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { sessionEvents, agentSessions as sessions } from "#/db/schema.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2_000;

/**
 * GET /api/agent/sessions/:id/events
 * Returns ordered session events for an owned session.
 */
export const Route = createFileRoute("/api/agent/sessions/$id/events")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const authSession = await requireAuth(request);
				const userId = authSession.user.id;

				const url = new URL(request.url);
				const segments = url.pathname.split("/");
				const idParam = segments.at(-2);
				if (!idParam) {
					return Response.json(
						{ error: "Invalid session ID" },
						{ status: 400 },
					);
				}

				const sessionId = Number.parseInt(idParam, 10);
				if (Number.isNaN(sessionId)) {
					return Response.json(
						{ error: "Invalid session ID" },
						{ status: 400 },
					);
				}

				const afterSeqParam = url.searchParams.get("after_seq");
				const afterSeq = afterSeqParam
					? Number.parseInt(afterSeqParam, 10)
					: null;
				if (afterSeqParam && (afterSeq == null || Number.isNaN(afterSeq))) {
					return Response.json({ error: "Invalid after_seq" }, { status: 400 });
				}

				const limitParam = url.searchParams.get("limit");
				const requestedLimit = limitParam
					? Number.parseInt(limitParam, 10)
					: DEFAULT_LIMIT;
				if (Number.isNaN(requestedLimit) || requestedLimit <= 0) {
					return Response.json({ error: "Invalid limit" }, { status: 400 });
				}
				const limit = Math.min(requestedLimit, MAX_LIMIT);

				const [session] = await db
					.select({ id: sessions.id })
					.from(sessions)
					.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
					.limit(1);

				if (!session) {
					return Response.json({ error: "Session not found" }, { status: 404 });
				}

				const filters = [eq(sessionEvents.sessionId, session.id)];
				if (typeof afterSeq === "number") {
					filters.push(gt(sessionEvents.seq, afterSeq));
				}

				const events = await db
					.select({
						id: sessionEvents.id,
						session_id: sessionEvents.sessionId,
						seq: sessionEvents.seq,
						event_type: sessionEvents.eventType,
						part_id: sessionEvents.partId,
						message_id: sessionEvents.messageId,
						opencode_session_id: sessionEvents.opencodeSessionId,
						part_type: sessionEvents.partType,
						text: sessionEvents.text,
						tool_name: sessionEvents.toolName,
						call_id: sessionEvents.callId,
						tool_status: sessionEvents.toolStatus,
						tool_input: sessionEvents.toolInput,
						tool_output: sessionEvents.toolOutput,
						tool_error: sessionEvents.toolError,
						tool_title: sessionEvents.toolTitle,
						tool_metadata: sessionEvents.toolMetadata,
						tool_time_start: sessionEvents.toolTimeStart,
						tool_time_end: sessionEvents.toolTimeEnd,
						status_text: sessionEvents.statusText,
						question_request_id: sessionEvents.questionRequestId,
						question_token_id: sessionEvents.questionTokenId,
						question_data: sessionEvents.questionData,
						message_role: sessionEvents.messageRole,
						message_tokens_input: sessionEvents.messageTokensInput,
						message_tokens_output: sessionEvents.messageTokensOutput,
						message_tokens_reasoning: sessionEvents.messageTokensReasoning,
						message_cost: sessionEvents.messageCost,
						user_message_text: sessionEvents.userMessageText,
						user_message_images: sessionEvents.userMessageImages,
						part_data: sessionEvents.partData,
						created_at: sessionEvents.createdAt,
						updated_at: sessionEvents.updatedAt,
					})
					.from(sessionEvents)
					.where(and(...filters))
					.orderBy(asc(sessionEvents.seq))
					.limit(limit);

				return Response.json({ events });
			},
		},
	},
});
