import type { Message, Part } from "@opencode-ai/sdk/v2";
import { logger } from "@trigger.dev/sdk/v3";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions, sessionEvents } from "#/db/schema";
import type { QuestionInfo } from "#/lib/session-types";

/**
 * Manages writing session events to Postgres in near-real-time.
 *
 * - Part snapshots and tool state changes: written immediately
 * - Text/reasoning deltas: buffered in memory, flushed every ~300ms
 * - All other events (status, questions, etc.): written immediately
 * - All writes are best-effort (try/catch, never interrupt the agent)
 */
export class SessionDbWriter {
	private seq = 0;
	private readonly sessionId: number;
	private readonly userId: string;

	/** Map part_id → seq (reuse seq on upserts for existing parts) */
	private readonly partSeqMap = new Map<string, number>();

	/**
	 * Text delta accumulator. Tokens are buffered here and flushed
	 * to Postgres every 300ms by the flush timer. This gives smooth
	 * ~3 updates/sec text streaming without per-token DB writes.
	 */
	private readonly textAccumulator = new Map<
		string,
		{
			partId: string;
			messageId: string;
			opencodeSessionId: string;
			partType: "text" | "reasoning";
			text: string;
			dirty: boolean;
		}
	>();

	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private closed = false;

	constructor(sessionId: number, userId: string) {
		this.sessionId = sessionId;
		this.userId = userId;
		this.flushTimer = setInterval(() => {
			this.flushDirtyText().catch(() => {
				// Best-effort — never throw from timer
			});
		}, 300);
	}

	/**
	 * Seed the seq counter from the DB so that continued sessions
	 * append after existing events instead of colliding with them.
	 * Safe to call on new sessions — if eventSeq is 0, seq stays 0.
	 */
	async init(): Promise<void> {
		try {
			const [row] = await db
				.select({ eventSeq: agentSessions.eventSeq })
				.from(agentSessions)
				.where(eq(agentSessions.id, this.sessionId))
				.limit(1);
			if (row?.eventSeq) {
				this.seq = row.eventSeq;
			}
		} catch (error) {
			logger.warn(
				"Failed to read eventSeq for session continuation — starting from 0",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}
	}

	// ─── Public API ──────────────────────────────────────────

	/**
	 * Write a part snapshot (full Part object) to Postgres.
	 * Called on `message.part.updated` SSE events — fires at part start,
	 * part end, and tool state transitions.
	 */
	async writePartSnapshot(part: Part, messageId: string): Promise<void> {
		try {
			// Clear any accumulated text for this part (snapshot is authoritative)
			const accumulated = this.textAccumulator.get(part.id);
			if (accumulated) {
				this.textAccumulator.delete(part.id);
			}

			const existingSeq = this.partSeqMap.get(part.id);

			if (existingSeq !== undefined) {
				// UPDATE existing row (same seq, new content)
				await db
					.update(sessionEvents)
					.set({
						...this.partToColumns(part, messageId),
						partData: part as unknown as Record<string, unknown>,
					})
					.where(
						and(
							eq(sessionEvents.sessionId, this.sessionId),
							eq(sessionEvents.seq, existingSeq),
						),
					);
			} else {
				// INSERT new row
				const seq = this.nextSeq();
				this.partSeqMap.set(part.id, seq);
				await db.insert(sessionEvents).values({
					sessionId: this.sessionId,
					userId: this.userId,
					seq,
					eventType: "part-update",
					...this.partToColumns(part, messageId),
					partData: part as unknown as Record<string, unknown>,
				});
			}
		} catch (error) {
			logger.error("Failed to write part snapshot", {
				partId: part.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Accumulate a text/reasoning delta in memory.
	 * Called on `message.part.delta` SSE events (every token).
	 * The 300ms flush timer writes the accumulated text to Postgres.
	 */
	accumulateTextDelta(
		partId: string,
		messageId: string,
		opencodeSessionId: string,
		partType: "text" | "reasoning",
		delta: string,
	): void {
		const existing = this.textAccumulator.get(partId);
		if (existing) {
			existing.text += delta;
			existing.dirty = true;
		} else {
			this.textAccumulator.set(partId, {
				partId,
				messageId,
				opencodeSessionId,
				partType,
				text: delta,
				dirty: true,
			});
		}
	}

	/**
	 * Write a message-update event (tokens, cost, timing).
	 * Called on `message.updated` SSE events.
	 */
	async writeMessageUpdate(message: Message): Promise<void> {
		try {
			// Flush pending text so ordering is preserved
			await this.flushDirtyText();

			const seq = this.nextSeq();
			const tokens = message.role === "assistant" ? message.tokens : undefined;
			const cost = message.role === "assistant" ? message.cost : undefined;

			await db.insert(sessionEvents).values({
				sessionId: this.sessionId,
				userId: this.userId,
				seq,
				eventType: "message-update",
				messageId: message.id,
				messageRole: message.role,
				messageTokensInput: tokens?.input ?? null,
				messageTokensOutput: tokens?.output ?? null,
				messageTokensReasoning: tokens?.reasoning ?? null,
				messageCost: cost != null ? Math.round(cost * 1_000_000) : null,
			});
		} catch (error) {
			logger.error("Failed to write message update", {
				messageId: message.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/** Write a status event. */
	async writeStatus(status: string): Promise<void> {
		try {
			await this.flushDirtyText();
			const seq = this.nextSeq();
			await db.insert(sessionEvents).values({
				sessionId: this.sessionId,
				userId: this.userId,
				seq,
				eventType: "status",
				statusText: status,
			});
		} catch (error) {
			logger.error("Failed to write status", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/** Write a question-asked event. */
	async writeQuestionAsked(
		requestId: string,
		tokenId: string,
		questions: QuestionInfo[],
	): Promise<void> {
		try {
			await this.flushDirtyText();
			const seq = this.nextSeq();
			await db.insert(sessionEvents).values({
				sessionId: this.sessionId,
				userId: this.userId,
				seq,
				eventType: "question-asked",
				questionRequestId: requestId,
				questionTokenId: tokenId,
				questionData: questions as unknown as Record<string, unknown>,
			});
		} catch (error) {
			logger.error("Failed to write question-asked", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/** Write a question-answered event. */
	async writeQuestionAnswered(
		requestId: string,
		answers: string[][],
	): Promise<void> {
		try {
			await this.flushDirtyText();
			const seq = this.nextSeq();
			await db.insert(sessionEvents).values({
				sessionId: this.sessionId,
				userId: this.userId,
				seq,
				eventType: "question-answered",
				questionRequestId: requestId,
				questionData: answers as unknown as Record<string, unknown>,
			});
		} catch (error) {
			logger.error("Failed to write question-answered", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/** Write a round-complete event. */
	async writeRoundComplete(): Promise<void> {
		try {
			await this.flushDirtyText();
			const seq = this.nextSeq();
			await db.insert(sessionEvents).values({
				sessionId: this.sessionId,
				userId: this.userId,
				seq,
				eventType: "round-complete",
			});
		} catch (error) {
			logger.error("Failed to write round-complete", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/** Write a user-message event. */
	async writeUserMessage(text: string): Promise<void> {
		try {
			await this.flushDirtyText();
			const seq = this.nextSeq();
			await db.insert(sessionEvents).values({
				sessionId: this.sessionId,
				userId: this.userId,
				seq,
				eventType: "user-message",
				userMessageText: text,
			});
		} catch (error) {
			logger.error("Failed to write user-message", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/** Write an aborted event. */
	async writeAborted(): Promise<void> {
		try {
			await this.flushDirtyText();
			const seq = this.nextSeq();
			await db.insert(sessionEvents).values({
				sessionId: this.sessionId,
				userId: this.userId,
				seq,
				eventType: "aborted",
			});
		} catch (error) {
			logger.error("Failed to write aborted", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Returns the current sequence counter.
	 * Call this after close() to get the final value to pass to exportAndPersistSession,
	 * so that event_seq can be written in the same UPDATE as status/session_data (one WAL entry).
	 */
	getFinalSeq(): number {
		return this.seq;
	}

	/**
	 * Final cleanup: stop the flush timer and flush remaining text.
	 * Does NOT update event_seq on agent_sessions — that is done atomically
	 * inside exportAndPersistSession() to avoid a second Electric WAL change.
	 */
	async close(): Promise<void> {
		if (this.closed) return; // Idempotent — safe to call multiple times
		this.closed = true;

		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}

		try {
			await this.flushDirtyText();
		} catch {
			// Best-effort
		}
	}

	// ─── Internal helpers ────────────────────────────────────

	private nextSeq(): number {
		return ++this.seq;
	}

	/**
	 * Flush all dirty text accumulators to Postgres.
	 * For each dirty entry, UPSERT the accumulated text into the
	 * session_events row (using the partial unique index on part_id).
	 */
	private async flushDirtyText(): Promise<void> {
		for (const [partId, entry] of this.textAccumulator) {
			if (!entry.dirty) continue;
			entry.dirty = false;

			try {
				const existingSeq = this.partSeqMap.get(partId);

				if (existingSeq !== undefined) {
					// Row already exists — just update the text
					await db
						.update(sessionEvents)
						.set({ text: entry.text })
						.where(
							and(
								eq(sessionEvents.sessionId, this.sessionId),
								eq(sessionEvents.seq, existingSeq),
							),
						);
				} else {
					// No row yet — insert a new part-update row
					const seq = this.nextSeq();
					this.partSeqMap.set(partId, seq);
					await db.insert(sessionEvents).values({
						sessionId: this.sessionId,
						userId: this.userId,
						seq,
						eventType: "part-update",
						partId: entry.partId,
						messageId: entry.messageId,
						opencodeSessionId: entry.opencodeSessionId,
						partType: entry.partType,
						text: entry.text,
					});
				}
			} catch (error) {
				logger.error("Failed to flush text delta", {
					partId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	/**
	 * Extract flat columns from a Part object for the session_events row.
	 */
	private partToColumns(
		part: Part,
		messageId: string,
	): Record<string, unknown> {
		const base = {
			partId: part.id,
			messageId,
			opencodeSessionId: part.sessionID,
			partType: part.type,
		};

		if (part.type === "text") {
			return { ...base, text: part.text };
		}

		if (part.type === "reasoning") {
			return { ...base, text: part.text };
		}

		if (part.type === "tool") {
			const { state } = part;
			const cols: Record<string, unknown> = {
				...base,
				toolName: part.tool,
				callId: part.callID,
				toolStatus: state.status,
			};

			if (state.status === "pending") {
				// No additional fields
			} else if (state.status === "running") {
				cols.toolInput = state.input ?? null;
				cols.toolTitle = state.title ?? null;
				cols.toolMetadata = state.metadata ?? null;
				cols.toolTimeStart = state.time.start;
			} else if (state.status === "completed") {
				cols.toolInput = state.input ?? null;
				cols.toolOutput = state.output ?? null;
				cols.toolTitle = state.title ?? null;
				cols.toolMetadata = state.metadata ?? null;
				cols.toolTimeStart = state.time.start;
				cols.toolTimeEnd = state.time.end;
			} else if (state.status === "error") {
				cols.toolInput = state.input ?? null;
				cols.toolError = state.error ?? null;
				cols.toolMetadata = state.metadata ?? null;
				cols.toolTimeStart = state.time.start;
				cols.toolTimeEnd = state.time.end;
			}

			return cols;
		}

		// For all other part types (step-start, step-finish, snapshot, etc.),
		// store the type and rely on part_data (jsonb) for reconstruction.
		return base;
	}
}
