import { createFileRoute } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions, sessionEvents } from "#/db/schema.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

function parseSessionId(value: string | null): number | null {
	if (!value) return null;
	const id = Number.parseInt(value, 10);
	if (Number.isNaN(id)) return null;
	return id;
}

function parseLimit(value: string | null): number {
	if (!value) return 100;
	const limit = Number.parseInt(value, 10);
	if (Number.isNaN(limit) || limit <= 0) return 100;
	return Math.min(limit, 500);
}

function readPartDataText(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	if (!("text" in value)) return null;
	if (typeof value.text !== "string") return null;
	return value.text;
}

function preview(value: string | null): string | null {
	if (!value) return null;
	const text = value.replace(/\s+/g, " ").trim();
	if (!text) return null;
	if (text.length <= 160) return text;
	return `${text.slice(0, 160)}...`;
}

/**
 * GET /api/agent/session-reasoning?session_id=123&limit=100
 *
 * Debug endpoint to inspect persisted reasoning rows in Postgres.
 * Helps identify whether reasoning text exists in `text`, `part_data.text`,
 * or is missing before UI conversion/rendering.
 */
export const Route = createFileRoute("/api/agent/session-reasoning")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const authSession = await requireAuth(request);
				const userId = authSession.user.id;
				const url = new URL(request.url);

				const sessionId = parseSessionId(url.searchParams.get("session_id"));
				if (sessionId === null) {
					return Response.json(
						{ error: "Missing or invalid session_id" },
						{ status: 400 },
					);
				}

				const [session] = await db
					.select({ id: agentSessions.id })
					.from(agentSessions)
					.where(
						and(
							eq(agentSessions.id, sessionId),
							eq(agentSessions.userId, userId),
						),
					)
					.limit(1);

				if (!session) {
					return Response.json({ error: "Session not found" }, { status: 404 });
				}

				const limit = parseLimit(url.searchParams.get("limit"));
				const rows = await db
					.select({
						id: sessionEvents.id,
						seq: sessionEvents.seq,
						eventType: sessionEvents.eventType,
						partId: sessionEvents.partId,
						messageId: sessionEvents.messageId,
						partType: sessionEvents.partType,
						text: sessionEvents.text,
						partData: sessionEvents.partData,
						createdAt: sessionEvents.createdAt,
					})
					.from(sessionEvents)
					.where(
						and(
							eq(sessionEvents.sessionId, session.id),
							eq(sessionEvents.partType, "reasoning"),
						),
					)
					.orderBy(desc(sessionEvents.seq))
					.limit(limit);

				const debugRows = rows.map((row) => {
					const text = row.text ?? "";
					const partDataText = readPartDataText(row.partData);

					return {
						id: row.id,
						seq: row.seq,
						eventType: row.eventType,
						partId: row.partId,
						messageId: row.messageId,
						partType: row.partType,
						textLength: text.length,
						textPreview: preview(text),
						partDataTextLength: partDataText?.length ?? 0,
						partDataTextPreview: preview(partDataText),
						createdAt: row.createdAt,
					};
				});

				const summary = {
					totalRows: debugRows.length,
					rowsWithNonEmptyText: debugRows.filter((row) => row.textLength > 0)
						.length,
					rowsWithEmptyText: debugRows.filter((row) => row.textLength === 0)
						.length,
					rowsWithPartDataText: debugRows.filter(
						(row) => row.partDataTextLength > 0,
					).length,
				};

				return Response.json({
					sessionId: session.id,
					limit,
					summary,
					rows: debugRows,
				});
			},
		},
	},
});
