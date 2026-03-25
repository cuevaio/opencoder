import type { Part } from "@opencode-ai/sdk/v2";
import { logger } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "#/db";
import { agentSessions as sessions } from "#/db/schema";
import { checkCancel } from "./cancel-checker";
import type { SessionDbWriter } from "./db-writer";
import { handleQuestion } from "./question-handler";
import type { MetadataHandle } from "./types";

export interface EventHandlerContext {
	// biome-ignore lint/suspicious/noExplicitAny: OpenCode client type is opaque
	client: any;
	sessionId: string;
	runId: string;
	dbSessionId: number;
	dbWriter: SessionDbWriter;
	toolCalls: string[];
	seenToolCallIds: Set<string>;
	/** Cache of Part snapshots, keyed by part ID. Used to merge deltas. */
	partCache: Map<string, Part>;
}

/**
 * Possible outcomes of processing one SSE subscription:
 * - "idle"        → session went idle, ready for follow-up
 * - "resubscribe" → need to re-subscribe to SSE (after question answered)
 * - "cancelled"   → user cancelled
 */
export type EventLoopOutcome = "idle" | "resubscribe" | "cancelled";

export async function processEventStream(
	ctx: EventHandlerContext,
	meta: MetadataHandle,
): Promise<EventLoopOutcome> {
	const { client, sessionId, dbWriter } = ctx;
	const { stream: sseStream } = await client.event.subscribe();

	for await (const event of sseStream) {
		// ── Part snapshot updates (full Part, no delta) ──
		if (event.type === "message.part.updated") {
			const { part } = event.properties;

			// Cache the full snapshot for merging with future deltas
			ctx.partCache.set(part.id, structuredClone(part));

			// Write part snapshot to Postgres (immediate)
			await dbWriter.writePartSnapshot(part, part.messageID);

			// Track tool calls for metadata counter
			if (part.type === "tool" && part.sessionID === sessionId) {
				const toolId = part.callID;
				if (!ctx.seenToolCallIds.has(toolId)) {
					ctx.seenToolCallIds.add(toolId);
					ctx.toolCalls.push(part.tool);
					meta.set("toolCalls", ctx.toolCalls);
				}
			}
		}

		// ── Part deltas (incremental text/reasoning chunks) ──
		if (event.type === "message.part.delta") {
			// biome-ignore lint/suspicious/noExplicitAny: OpenCode event typing
			const props = event.properties as any as {
				sessionID: string;
				messageID: string;
				partID: string;
				field: string;
				delta: string;
			};

			let cached = ctx.partCache.get(props.partID);

			if (!cached) {
				// Delta arrived before the first snapshot — create a synthetic Part
				if (props.field === "text") {
					cached = {
						id: props.partID,
						sessionID: props.sessionID,
						messageID: props.messageID,
						type: "text",
						text: props.delta,
					} as Part;
				} else if (props.field === "reasoning") {
					cached = {
						id: props.partID,
						sessionID: props.sessionID,
						messageID: props.messageID,
						type: "reasoning",
						text: props.delta,
						time: { start: Date.now() },
					} as Part;
				}
				if (cached) ctx.partCache.set(props.partID, cached);
			} else {
				// Append delta to the cached Part's text field
				if (
					(cached.type === "text" || cached.type === "reasoning") &&
					(props.field === "text" || props.field === "reasoning")
				) {
					cached.text += props.delta;
				}
			}

			// Accumulate text delta (flushed to Postgres every ~300ms by timer)
			if (cached && (cached.type === "text" || cached.type === "reasoning")) {
				dbWriter.accumulateTextDelta(
					props.partID,
					props.messageID,
					props.sessionID,
					cached.type,
					props.delta,
				);
			}
		}

		// ── Message updates (tokens, cost, timing) ──
		if (event.type === "message.updated") {
			await dbWriter.writeMessageUpdate(event.properties.info);
		}

		// ── Permission auto-approve ──
		if (event.type === "permission.asked") {
			logger.warn("Permission request, auto-approving", {
				permission: event.properties,
			});
			await client.permission.reply({
				requestID: event.properties.id,
				reply: "always",
			});
		}

		// ── Question handling ──
		if (
			event.type === "question.asked" &&
			// biome-ignore lint/suspicious/noExplicitAny: OpenCode event typing
			(event.properties as any).sessionID === sessionId
		) {
			const outcome = await handleQuestion(
				client,
				sessionId,
				// biome-ignore lint/suspicious/noExplicitAny: OpenCode event typing
				event.properties as any,
				dbWriter,
				meta,
			);
			if (outcome === "cancelled") return "cancelled";
			return "resubscribe";
		}

		// ── Session title updates ──
		if (
			event.type === "session.updated" &&
			// biome-ignore lint/suspicious/noExplicitAny: OpenCode event typing
			(event.properties as any).info?.id === sessionId
		) {
			// biome-ignore lint/suspicious/noExplicitAny: OpenCode event typing
			const newTitle = (event.properties as any).info?.title;
			if (newTitle) {
				try {
					await db
						.update(sessions)
						.set({ title: newTitle })
						.where(eq(sessions.id, ctx.dbSessionId));
				} catch {
					// Best-effort — don't interrupt the stream
				}
			}
		}

		// ── Session idle ──
		if (
			event.type === "session.idle" &&
			event.properties.sessionID === sessionId
		) {
			logger.info("Session idle");
			return "idle";
		}

		// ── Session error ──
		if (
			event.type === "session.error" &&
			event.properties.sessionID === sessionId
		) {
			// biome-ignore lint/suspicious/noExplicitAny: OpenCode event typing
			const error = (event.properties as any).error;
			if (error?.name === "MessageAbortedError") {
				logger.info("Session aborted (MessageAbortedError)");
				return "idle";
			}
			throw new Error(`Agent error: ${JSON.stringify(error)}`);
		}

		// ── Cancel check (throttled) ──
		if (await checkCancel(ctx.runId)) {
			logger.info("Cancel requested");
			await dbWriter.writeAborted();
			await client.session.abort({ sessionID: sessionId });
			return "cancelled";
		}
	}

	return "idle";
}
