import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

/**
 * GET /api/shapes/session-events?session_id=123
 *
 * Electric shape proxy for session events. Verifies session ownership
 * via auth, then forwards to Electric with server-controlled WHERE clause.
 * The client never sees the table name or SQL — only the proxy URL.
 */

const ELECTRIC_PROTOCOL_PARAMS = new Set([
	...ELECTRIC_PROTOCOL_QUERY_PARAMS,
	"replica",
]);

function requestId(): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	);
}

function appendVaryHeader(headers: Headers): void {
	const current = headers.get("vary");
	const values = new Set(
		(current ?? "")
			.split(",")
			.map((part) => part.trim())
			.filter(Boolean),
	);
	values.add("Cookie");
	values.add("Authorization");
	headers.set("vary", Array.from(values).join(", "));
}

export const Route = createFileRoute("/api/shapes/session-events")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const reqId = requestId();
				const authSession = await requireAuth(request);
				const userId = authSession.user.id;

				const url = new URL(request.url);
				const sessionId = url.searchParams.get("session_id");
				if (!sessionId) {
					return new Response("Missing session_id", { status: 400 });
				}

				const parsedId = Number.parseInt(sessionId, 10);
				if (Number.isNaN(parsedId)) {
					return new Response("Invalid session_id", { status: 400 });
				}

				// Verify ownership
				const [session] = await db
					.select({ id: sessions.id })
					.from(sessions)
					.where(and(eq(sessions.id, parsedId), eq(sessions.userId, userId)))
					.limit(1);

				if (!session) {
					return new Response("Forbidden", { status: 403 });
				}

				const electricUrl = process.env.ELECTRIC_URL;
				const electricSourceId = process.env.ELECTRIC_SOURCE_ID;
				const electricSecret = process.env.ELECTRIC_SECRET;
				if (!electricUrl || !electricSourceId || !electricSecret) {
					return new Response("Electric not configured", { status: 500 });
				}

				const shapeUrl = new URL(`${electricUrl}/v1/shape`);
				shapeUrl.searchParams.set("source_id", electricSourceId);
				shapeUrl.searchParams.set("secret", electricSecret);
				shapeUrl.searchParams.set("table", "session_events");
				shapeUrl.searchParams.set("where", "session_id = $1");
				shapeUrl.searchParams.set("params", JSON.stringify([session.id]));
				// Keep payload light for live display.
				// We include part_data as a fallback for reasoning reconstruction,
				// while still excluding tool_input/tool_metadata.
				shapeUrl.searchParams.set(
					"columns",
					[
						"id",
						"session_id",
						"seq",
						"event_type",
						"part_id",
						"message_id",
						"opencode_session_id",
						"part_type",
						"text",
						"tool_name",
						"call_id",
						"tool_status",
						"tool_output",
						"tool_error",
						"tool_title",
						"tool_time_start",
						"tool_time_end",
						"status_text",
						"question_request_id",
						"question_token_id",
						"question_data",
						"message_role",
						"message_tokens_input",
						"message_tokens_output",
						"message_tokens_reasoning",
						"message_cost",
						"user_message_text",
						"user_message_images",
						"part_data",
						"created_at",
						"updated_at",
					].join(","),
				);

				// Forward Electric protocol params only (offset, handle, live, etc.)
				url.searchParams.forEach((value, key) => {
					if (ELECTRIC_PROTOCOL_PARAMS.has(key)) {
						shapeUrl.searchParams.set(key, value);
					}
				});

				let resp: Response;
				try {
					resp = await fetch(shapeUrl.toString());
				} catch (error) {
					console.error("[shapes/session-events] Electric fetch failed", {
						error,
						requestId: reqId,
						sessionId: session.id,
						handle: url.searchParams.get("handle"),
						offset: url.searchParams.get("offset"),
						cursor: url.searchParams.get("cursor"),
						expiredHandle: url.searchParams.get("expired_handle"),
						cacheBuster: url.searchParams.get("cache-buster"),
						logMode: url.searchParams.get("log"),
						live: url.searchParams.get("live"),
						replica: url.searchParams.get("replica"),
					});
					return new Response("Electric upstream unavailable", { status: 502 });
				}

				if (!resp.ok) {
					console.error("[shapes/session-events] Electric returned non-OK", {
						status: resp.status,
						statusText: resp.statusText,
						requestId: reqId,
						sessionId: session.id,
						handle: url.searchParams.get("handle"),
						offset: url.searchParams.get("offset"),
						cursor: url.searchParams.get("cursor"),
						expiredHandle: url.searchParams.get("expired_handle"),
						cacheBuster: url.searchParams.get("cache-buster"),
						logMode: url.searchParams.get("log"),
						live: url.searchParams.get("live"),
						replica: url.searchParams.get("replica"),
					});
				}

				// Fix headers for browser compatibility
				const headers = new Headers(resp.headers);
				headers.delete("content-encoding");
				headers.delete("content-length");
				appendVaryHeader(headers);
				headers.set("x-opencoder-shape", "session-events");
				headers.set("x-opencoder-upstream-status", String(resp.status));
				headers.set("x-opencoder-request-id", reqId);

				return new Response(resp.body, {
					status: resp.status,
					statusText: resp.statusText,
					headers,
				});
			},
		},
	},
});
