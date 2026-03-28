import type { Message, Part } from "@opencode-ai/sdk/v2";
import type {
	QuestionInfo,
	SessionExportData,
	StreamEvent,
} from "#/lib/session-types";

/**
 * Convert a persisted SessionExportData (OpenCode export format)
 * into StreamEvent[] that can be rendered by the display pipeline.
 *
 * The export format contains:
 *   - info: Session metadata
 *   - messages: Array of { info: Message, parts: Part[] }
 *
 * Messages are ordered chronologically. Each message has a role
 * (user/assistant) and parts. We convert:
 *   - User messages → "user-message" StreamEvent (using text parts)
 *   - Assistant message parts → "part-update" StreamEvent
 *   - Each message → "message-update" StreamEvent (for token/cost data)
 */
export function sessionExportToStreamEvents(
	data: SessionExportData,
): StreamEvent[] {
	const events: StreamEvent[] = [];
	let isFirstUserMessage = true;

	for (const msg of data.messages) {
		const { info, parts } = msg;

		// User messages become user-message events.
		// Skip the first user message — it's the initialPrompt which is
		// already supplied separately to splitIntoTurns(). Emitting it here
		// would duplicate the first turn.
		if (info.role === "user") {
			if (isFirstUserMessage) {
				isFirstUserMessage = false;
				continue;
			}
			const textParts = parts.filter((p) => p.type === "text");
			const fileParts = parts.filter((p) => p.type === "file");
			const text = textParts.map((p) => p.text).join("\n");
			const images =
				fileParts.length > 0
					? fileParts.map((p) => ({
							url: p.url,
							mime: p.mime,
							filename: p.filename,
						}))
					: undefined;
			if (text) {
				events.push({ type: "user-message", text, images });
			}
			continue;
		}

		// Assistant/tool messages: emit part-update events for each part
		for (const part of parts) {
			events.push({
				type: "part-update",
				part,
				messageId: info.id,
				// No delta for replayed sessions — use full snapshot
			});
		}

		// Emit message-update for token/cost tracking
		events.push({
			type: "message-update",
			message: info,
		});
	}

	return events;
}

// ─── DB rows → StreamEvent[] converter ───────────────────
// Used by the TanStack DB / Electric pipeline to convert
// session_events rows into the StreamEvent[] format that
// the existing display pipeline (buildToolMap, buildDisplayItems,
// splitIntoTurns) expects.

/**
 * Row shape from the session_events table (via Electric/TanStack DB).
 * Fields use snake_case (Postgres column names).
 */
export interface SessionEventRow {
	id: number;
	session_id: number;
	seq: number;
	event_type: string;
	part_id?: string | null;
	message_id?: string | null;
	opencode_session_id?: string | null;
	part_type?: string | null;
	text?: string | null;
	tool_name?: string | null;
	call_id?: string | null;
	tool_status?: string | null;
	tool_input?: unknown;
	tool_output?: string | null;
	tool_error?: string | null;
	tool_title?: string | null;
	tool_metadata?: unknown;
	tool_time_start?: number | null;
	tool_time_end?: number | null;
	status_text?: string | null;
	question_request_id?: string | null;
	question_token_id?: string | null;
	question_data?: unknown;
	message_role?: string | null;
	message_tokens_input?: number | null;
	message_tokens_output?: number | null;
	message_tokens_reasoning?: number | null;
	message_cost?: number | null;
	user_message_text?: string | null;
	user_message_images?: Array<{
		url: string;
		mime: string;
		filename?: string;
	}> | null;
	part_data?: unknown;
}

interface DbRowsToStreamEventsOptions {
	skipFirstUserMessage?: boolean;
}

/**
 * Convert session_events DB rows (from Electric/TanStack DB)
 * into StreamEvent[] for the display pipeline.
 */
export function dbRowsToStreamEvents(rows: SessionEventRow[]): StreamEvent[] {
	return dbRowsToStreamEventsWithOptions(rows, {
		skipFirstUserMessage: true,
	});
}

export function dbRowsToStreamEventsWithOptions(
	rows: SessionEventRow[],
	options?: DbRowsToStreamEventsOptions,
): StreamEvent[] {
	const events: StreamEvent[] = [];
	const skipFirstUserMessage = options?.skipFirstUserMessage ?? true;

	// Build a set of message IDs that belong to user messages.
	// User message parts (text) should NOT be rendered as agent text-blocks —
	// they're already represented by the "user-message" event.
	const userMessageIds = new Set<string>();
	for (const row of rows) {
		if (
			row.event_type === "message-update" &&
			row.message_role === "user" &&
			row.message_id
		) {
			userMessageIds.add(row.message_id);
		}
	}

	// Track how many "user-message" events we've emitted.
	// By default, the first one is skipped because initialPrompt is supplied
	// separately. Windowed/paged callers can disable that behavior.
	let userMessageCount = 0;

	for (const row of rows) {
		switch (row.event_type) {
			case "part-update": {
				// Skip parts belonging to user messages — they render via "user-message" events
				if (row.message_id && userMessageIds.has(row.message_id)) {
					break;
				}
				const part = reconstructPart(row);
				if (part && row.message_id) {
					events.push({
						type: "part-update",
						part,
						messageId: row.message_id,
					});
				}
				break;
			}

			case "message-update": {
				const message = reconstructMessage(row);
				if (message) {
					events.push({ type: "message-update", message });
				}
				break;
			}

			case "status":
				if (row.status_text) {
					events.push({ type: "status", status: row.status_text });
				}
				break;

			case "question-asked":
				if (row.question_request_id && row.question_token_id) {
					events.push({
						type: "question-asked",
						requestId: row.question_request_id,
						tokenId: row.question_token_id,
						questions: (row.question_data ?? []) as QuestionInfo[],
					});
				}
				break;

			case "question-answered":
				if (row.question_request_id) {
					events.push({
						type: "question-answered",
						requestId: row.question_request_id,
						answers: (row.question_data ?? []) as string[][],
					});
				}
				break;

			case "round-complete":
				events.push({ type: "round-complete" });
				break;

			case "user-message":
				if (row.user_message_text) {
					userMessageCount++;
					if (!skipFirstUserMessage || userMessageCount > 1) {
						events.push({
							type: "user-message",
							text: row.user_message_text,
							images: row.user_message_images ?? undefined,
						});
					}
				}
				break;

			case "aborted":
				events.push({ type: "aborted" });
				break;

			case "session-error":
				if (row.status_text) {
					// status_text is stored as "ErrorName: message" — extract the message part
					const colonIdx = row.status_text.indexOf(": ");
					const message =
						colonIdx !== -1
							? row.status_text.slice(colonIdx + 2)
							: row.status_text;
					events.push({ type: "session-error", message });
				}
				break;
		}
	}

	return events;
}

function extractText(value: unknown): string | null {
	if (!value || typeof value !== "object") return null;
	if (!("text" in value)) return null;
	if (typeof value.text !== "string") return null;
	return value.text;
}

function extractTimeStart(value: unknown): number | null {
	if (!value || typeof value !== "object") return null;
	if (!("time" in value)) return null;
	if (!value.time || typeof value.time !== "object") return null;
	if (!("start" in value.time)) return null;
	if (typeof value.time.start !== "number") return null;
	return value.time.start;
}

/**
 * Reconstruct a Part object from a session_events row.
 * For tool parts, builds the discriminated union state.
 * For unusual types, falls back to part_data (full JSON).
 */
function reconstructPart(row: SessionEventRow): Part | null {
	if (!row.part_id || !row.part_type) {
		// Try fallback to part_data
		if (row.part_data && typeof row.part_data === "object") {
			return row.part_data as Part;
		}
		return null;
	}

	const base = {
		id: row.part_id,
		sessionID: row.opencode_session_id ?? "",
		messageID: row.message_id ?? "",
	};

	switch (row.part_type) {
		case "text":
			return { ...base, type: "text", text: row.text ?? "" } as Part;

		case "reasoning": {
			const fallbackText = extractText(row.part_data);
			const text = row.text?.trim() ? row.text : (fallbackText ?? "");
			const start =
				extractTimeStart(row.part_data) ?? row.tool_time_start ?? Date.now();

			return {
				...base,
				type: "reasoning",
				text,
				time: { start },
			} as Part;
		}

		case "tool": {
			const status = row.tool_status ?? "pending";
			// biome-ignore lint/suspicious/noExplicitAny: Building discriminated union dynamically
			const state: any = { status };

			if (status === "pending") {
				// No additional fields
			} else if (status === "running") {
				state.input = row.tool_input ?? undefined;
				state.title = row.tool_title ?? undefined;
				state.metadata = row.tool_metadata ?? undefined;
				state.time = { start: row.tool_time_start ?? 0 };
			} else if (status === "completed") {
				state.input = row.tool_input ?? undefined;
				state.output = row.tool_output ?? "";
				state.title = row.tool_title ?? undefined;
				state.metadata = row.tool_metadata ?? undefined;
				state.time = {
					start: row.tool_time_start ?? 0,
					end: row.tool_time_end ?? 0,
				};
			} else if (status === "error") {
				state.input = row.tool_input ?? undefined;
				state.error = row.tool_error ?? "Unknown error";
				state.metadata = row.tool_metadata ?? undefined;
				state.time = {
					start: row.tool_time_start ?? 0,
					end: row.tool_time_end ?? 0,
				};
			}

			return {
				...base,
				type: "tool",
				tool: row.tool_name ?? "unknown",
				callID: row.call_id ?? "",
				state,
			} as Part;
		}

		default:
			// For non-standard types (step-start, step-finish, snapshot, etc.),
			// fall back to part_data which stores the full Part JSON.
			if (row.part_data && typeof row.part_data === "object") {
				return row.part_data as Part;
			}
			return null;
	}
}

/**
 * Reconstruct a Message object from a session_events row.
 * Only includes fields used by the display pipeline (token/cost tracking).
 */
function reconstructMessage(row: SessionEventRow): Message | null {
	if (!row.message_id) return null;

	const role = row.message_role ?? "assistant";

	if (role === "user") {
		return {
			id: row.message_id,
			sessionID: row.opencode_session_id ?? "",
			role: "user",
			time: { created: 0 },
		} as Message;
	}

	return {
		id: row.message_id,
		sessionID: row.opencode_session_id ?? "",
		role: "assistant",
		time: { created: 0 },
		tokens: {
			input: row.message_tokens_input ?? 0,
			output: row.message_tokens_output ?? 0,
			reasoning: row.message_tokens_reasoning ?? 0,
			cache: { read: 0, write: 0 },
		},
		cost: row.message_cost != null ? row.message_cost / 1_000_000 : 0,
	} as Message;
}
