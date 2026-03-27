import type { Part } from "@opencode-ai/sdk/v2";
import type { QuestionInfo, StreamEvent } from "#/lib/session-types";

// ─── Tool display state ──────────────────────────────────

export type ToolState = {
	id: string;
	callID: string;
	partId: string;
	tool: string;
	status: "pending" | "running" | "completed" | "error";
	input?: Record<string, unknown>;
	output?: string;
	title?: string;
	metadata?: Record<string, unknown>;
	error?: string;
	time?: { start?: number; end?: number };
	childTools?: Map<string, ToolState>;
	childText?: string;
	childReasoning?: string;
};

// ─── Display items ───────────────────────────────────────

export type DisplayItem =
	| { type: "text-block"; text: string; partId?: string }
	| { type: "reasoning-block"; text: string; partId?: string }
	| { type: "tool-call"; tool: ToolState }
	| { type: "status"; status: string }
	| {
			type: "question-asked";
			requestId: string;
			tokenId: string;
			questions: QuestionInfo[];
	  }
	| {
			type: "question-answered";
			requestId: string;
			answers: string[][];
	  }
	| { type: "round-complete" }
	| {
			type: "user-message";
			text: string;
			images?: Array<{ url: string; mime: string; filename?: string }>;
	  }
	| { type: "aborted" };

export type Turn = {
	prompt: string;
	images?: Array<{ url: string; mime: string; filename?: string }>;
	items: DisplayItem[];
};

type RootSessionDiscovery = {
	rootSessionId?: string;
	confident: boolean;
};

// ─── Build tool map from StreamEvent[] ───────────────────

/**
 * Build a map of tool call ID → ToolState from StreamEvent parts.
 * Each `part-update` with a `ToolPart` is a full snapshot — we just
 * overwrite. Child-session parts (text/reasoning/tool where sessionID
 * differs from the parent tool's sessionID) are grouped under the
 * parent tool.
 */
export function buildToolMap(
	events: StreamEvent[] | undefined,
	rootSessionId?: string,
): Map<string, ToolState> {
	const map = new Map<string, ToolState>();
	if (!events) return map;

	const discovery = rootSessionId
		? { rootSessionId, confident: true }
		: discoverRootSessionId(events);
	const effectiveRootSessionId = discovery.rootSessionId;
	const shouldFilterChildSessions =
		discovery.confident && !!effectiveRootSessionId;

	// ── Pass 1: Build sessionID → parent callID mapping ─────
	// Find all "task" tools in the root session (ordered by appearance).
	// Then find all unique child session IDs (ordered by first appearance).
	// Correlate them: the Nth unique child session belongs to the Nth task tool.
	const sessionToParentCallId = new Map<string, string>();

	if (shouldFilterChildSessions) {
		const taskToolCallIds: string[] = [];
		const seenTaskToolCallIds = new Set<string>();
		const childSessionIds: string[] = [];
		const seenChildSessions = new Set<string>();

		for (const evt of events) {
			if (evt.type !== "part-update") continue;
			const { part } = evt;

			// Collect root-session task tools in order
			if (
				part.type === "tool" &&
				part.tool === "task" &&
				part.sessionID === effectiveRootSessionId
			) {
				if (!seenTaskToolCallIds.has(part.callID)) {
					seenTaskToolCallIds.add(part.callID);
					taskToolCallIds.push(part.callID);
				}
			}

			// Collect unique child session IDs in order of first appearance
			if (
				part.sessionID !== effectiveRootSessionId &&
				!seenChildSessions.has(part.sessionID)
			) {
				seenChildSessions.add(part.sessionID);
				childSessionIds.push(part.sessionID);
			}
		}

		// Correlate: Nth child session → Nth task tool
		for (let i = 0; i < childSessionIds.length; i++) {
			const childSid = childSessionIds[i];
			const parentCallId = taskToolCallIds[i];
			if (childSid && parentCallId) {
				sessionToParentCallId.set(childSid, parentCallId);
			}
		}
	}

	// ── Pass 2: Place tools into the map, attach child text/reasoning ──
	for (const evt of events) {
		if (evt.type !== "part-update") continue;
		const { part, delta } = evt;

		const isChildSession =
			shouldFilterChildSessions &&
			effectiveRootSessionId !== undefined &&
			part.sessionID !== effectiveRootSessionId;
		const parentCallId = isChildSession
			? sessionToParentCallId.get(part.sessionID)
			: undefined;

		if (part.type === "tool" && part.state.status !== "pending") {
			const toolState = partToToolState(part);

			if (parentCallId) {
				// Child session tool — nest under parent
				const parent = map.get(parentCallId);
				if (parent) {
					if (!parent.childTools) parent.childTools = new Map();
					parent.childTools.set(part.callID, toolState);
					continue;
				}
			}

			// Root-level tool (or unmapped child — fallback to root)
			map.set(part.callID, toolState);
		} else if (isChildSession && parentCallId) {
			// Attach child text/reasoning to parent tool
			const parent = map.get(parentCallId);
			if (!parent) continue;

			if (part.type === "text") {
				if (delta) {
					parent.childText = (parent.childText || "") + delta;
				} else {
					parent.childText = part.text;
				}
			} else if (part.type === "reasoning") {
				if (delta) {
					parent.childReasoning = (parent.childReasoning || "") + delta;
				} else {
					parent.childReasoning = part.text;
				}
			}
		}
	}

	return map;
}

// ─── Build display items from StreamEvent[] ──────────────

export function buildDisplayItems(
	events: StreamEvent[] | undefined,
	toolMap: Map<string, ToolState>,
	rootSessionId?: string,
): DisplayItem[] {
	if (!events) return [];

	const items: DisplayItem[] = [];
	const seenToolCallIds = new Set<string>();
	const partIdToDisplayIndex = new Map<string, number>();

	const discovery = rootSessionId
		? { rootSessionId, confident: true }
		: discoverRootSessionId(events);
	const effectiveRootSessionId = discovery.rootSessionId;
	const shouldFilterChildSessions =
		discovery.confident && !!effectiveRootSessionId;

	for (const evt of events) {
		switch (evt.type) {
			case "part-update": {
				const { part, delta } = evt;

				// Skip child-session parts (handled via toolMap)
				if (
					shouldFilterChildSessions &&
					effectiveRootSessionId !== undefined &&
					part.sessionID !== effectiveRootSessionId
				) {
					continue;
				}

				if (part.type === "text") {
					const existingIndex = partIdToDisplayIndex.get(part.id);
					if (typeof existingIndex === "number") {
						const existing = items[existingIndex];
						if (existing && existing.type === "text-block") {
							existing.text = delta ? existing.text + delta : part.text;
						}
					} else {
						items.push({
							type: "text-block",
							text: delta || part.text,
							partId: part.id,
						});
						partIdToDisplayIndex.set(part.id, items.length - 1);
					}
				} else if (part.type === "reasoning") {
					const existingIndex = partIdToDisplayIndex.get(part.id);
					if (typeof existingIndex === "number") {
						const existing = items[existingIndex];
						if (existing && existing.type === "reasoning-block") {
							existing.text = delta ? existing.text + delta : part.text;
						}
					} else {
						const text = delta || part.text;
						if (!text.trim()) {
							break;
						}

						items.push({
							type: "reasoning-block",
							text,
							partId: part.id,
						});
						partIdToDisplayIndex.set(part.id, items.length - 1);
					}
				} else if (part.type === "tool" && part.state.status !== "pending") {
					if (!seenToolCallIds.has(part.callID)) {
						seenToolCallIds.add(part.callID);
						const tool = toolMap.get(part.callID);
						if (tool) {
							items.push({ type: "tool-call", tool });
						}
					}
					// If already seen, the toolMap reference is already updated
				}
				// step-start, step-finish, subtask, file, snapshot, patch, agent,
				// retry, compaction — not rendered as display items
				break;
			}

			case "status":
				items.push({ type: "status", status: evt.status });
				break;

			case "question-asked":
				items.push({
					type: "question-asked",
					requestId: evt.requestId,
					tokenId: evt.tokenId,
					questions: evt.questions,
				});
				break;

			case "question-answered":
				items.push({
					type: "question-answered",
					requestId: evt.requestId,
					answers: evt.answers,
				});
				break;

			case "round-complete":
				items.push({ type: "round-complete" });
				break;

			case "user-message":
				items.push({
					type: "user-message",
					text: evt.text,
					images: evt.images,
				});
				break;

			case "aborted":
				items.push({ type: "aborted" });
				break;

			case "message-update":
				// Not rendered directly — used for token/cost tracking
				break;
		}
	}

	return items;
}

// ─── Turn splitting ──────────────────────────────────────

/**
 * Split display items into turns at user-message boundaries.
 */
export function splitIntoTurns(
	initialPrompt: string,
	items: DisplayItem[],
	initialImages?: Array<{ url: string; mime: string; filename?: string }>,
): Turn[] {
	const turns: Turn[] = [];
	let currentPrompt = initialPrompt;
	let currentImages:
		| Array<{ url: string; mime: string; filename?: string }>
		| undefined = initialImages;
	let currentItems: DisplayItem[] = [];

	for (const item of items) {
		if (item.type === "user-message") {
			turns.push({
				prompt: currentPrompt,
				images: currentImages,
				items: currentItems,
			});
			currentPrompt = item.text;
			currentImages = item.images;
			currentItems = [];
		} else {
			currentItems.push(item);
		}
	}
	turns.push({
		prompt: currentPrompt,
		images: currentImages,
		items: currentItems,
	});
	return turns;
}

// ─── Query helpers ───────────────────────────────────────

/**
 * Extract the last text block as the response.
 */
export function extractResponse(items: DisplayItem[]): string | undefined {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item && item.type === "text-block") return item.text;
	}
	return undefined;
}

/**
 * Find a pending question (not yet answered).
 */
export function findPendingQuestion(
	items: DisplayItem[],
	completedTokens: Set<string>,
): (DisplayItem & { type: "question-asked" }) | null {
	const answeredIds = new Set(
		items
			.filter(
				(i): i is DisplayItem & { type: "question-answered" } =>
					i.type === "question-answered",
			)
			.map((i) => i.requestId),
	);
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (
			item?.type === "question-asked" &&
			!answeredIds.has(item.requestId) &&
			!completedTokens.has(item.tokenId)
		) {
			return item;
		}
	}
	return null;
}

/**
 * Returns true when the latest turn (events since the most recent user-message)
 * has reached round completion.
 */
export function hasRoundCompleteInCurrentTurn(events: StreamEvent[]): boolean {
	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (!event) continue;

		if (event.type === "round-complete") {
			return true;
		}

		if (event.type === "user-message") {
			return false;
		}
	}

	return false;
}

// ─── Internal helpers ────────────────────────────────────

function partToToolState(part: Part & { type: "tool" }): ToolState {
	const { state } = part;
	const ts: ToolState = {
		id: part.callID,
		callID: part.callID,
		partId: part.id,
		tool: part.tool,
		status: state.status,
		input: state.input,
	};

	if (state.status === "running") {
		ts.title = state.title;
		ts.metadata = state.metadata;
		ts.time = { start: state.time.start };
	} else if (state.status === "completed") {
		ts.output = state.output;
		ts.title = state.title;
		ts.metadata = state.metadata;
		ts.time = { start: state.time.start, end: state.time.end };
	} else if (state.status === "error") {
		ts.error = state.error;
		ts.metadata = state.metadata;
		ts.time = { start: state.time.start, end: state.time.end };
	}

	return ts;
}

/**
 * Discover root session ID.
 *
 * Preferred: a `task` tool part session (high confidence).
 * Fallback: first part-update session (low confidence).
 */
function discoverRootSessionId(events: StreamEvent[]): RootSessionDiscovery {
	for (const evt of events) {
		if (
			evt.type === "part-update" &&
			evt.part.type === "tool" &&
			evt.part.tool === "task"
		) {
			return {
				rootSessionId: evt.part.sessionID,
				confident: true,
			};
		}
	}

	for (const evt of events) {
		if (evt.type === "part-update") {
			return {
				rootSessionId: evt.part.sessionID,
				confident: false,
			};
		}
	}

	return { confident: false };
}
