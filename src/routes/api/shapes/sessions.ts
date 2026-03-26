import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "#/lib/auth-helpers.ts";

/**
 * GET /api/shapes/sessions
 *
 * Electric shape proxy for the sessions list (sidebar).
 * Syncs summary columns filtered by user_id.
 * Replaces the polling GET /api/agent/sessions endpoint.
 */

const ELECTRIC_PROTOCOL_PARAMS = new Set([
	...ELECTRIC_PROTOCOL_QUERY_PARAMS,
	"replica",
]);

const SESSION_COLUMNS = [
	"id",
	"title",
	"repo_full_name",
	"status",
	"mode",
	"selected_model",
	"total_tokens",
	"total_cost",
	"message_count",
	"tool_call_count",
	"created_at",
	"completed_at",
	"initial_prompt",
	"repo_url",
	"trigger_run_id",
].join(",");

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

export const Route = createFileRoute("/api/shapes/sessions")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const reqId = requestId();
				const session = await requireAuth(request);
				const userId = session.user.id;

				const electricUrl = process.env.ELECTRIC_URL;
				const electricSourceId = process.env.ELECTRIC_SOURCE_ID;
				const electricSecret = process.env.ELECTRIC_SECRET;
				if (!electricUrl || !electricSourceId || !electricSecret) {
					return new Response("Electric not configured", { status: 500 });
				}

				const url = new URL(request.url);
				const shapeUrl = new URL(`${electricUrl}/v1/shape`);
				shapeUrl.searchParams.set("source_id", electricSourceId);
				shapeUrl.searchParams.set("secret", electricSecret);
				shapeUrl.searchParams.set("table", "agent_sessions");
				shapeUrl.searchParams.set("columns", SESSION_COLUMNS);
				shapeUrl.searchParams.set("where", "user_id = $1");
				shapeUrl.searchParams.set("params[1]", userId);

				// Forward Electric protocol params only
				url.searchParams.forEach((value, key) => {
					if (ELECTRIC_PROTOCOL_PARAMS.has(key)) {
						shapeUrl.searchParams.set(key, value);
					}
				});

				let resp: Response;
				try {
					resp = await fetch(shapeUrl.toString());
				} catch (error) {
					console.error("[shapes/sessions] Electric fetch failed", {
						error,
						requestId: reqId,
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
					console.error("[shapes/sessions] Electric returned non-OK", {
						status: resp.status,
						statusText: resp.statusText,
						requestId: reqId,
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
				headers.set("x-opencoder-shape", "sessions");
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
