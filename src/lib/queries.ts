import { queryOptions } from "@tanstack/react-query";

// ─── Sessions list ────────────────────────────────────────

export interface SessionSummary {
	id: number;
	title: string;
	repoFullName: string;
	repoUrl: string;
	status: string;
	mode: string;
	selectedModel: string;
	totalTokens: number | null;
	totalCost: number | null;
	messageCount: number | null;
	toolCallCount: number | null;
	initialPrompt: string;
	createdAt: string;
	completedAt: string | null;
}

export const sessionsQueryOptions = () =>
	queryOptions({
		queryKey: ["sessions"],
		queryFn: async (): Promise<SessionSummary[]> => {
			const res = await fetch("/api/agent/sessions");
			if (!res.ok) throw new Error("Failed to fetch sessions");
			const data = (await res.json()) as { sessions: SessionSummary[] };
			return data.sessions ?? [];
		},
		staleTime: 15_000,
		gcTime: 5 * 60_000, // 5 min cache
	});

// ─── Single session ───────────────────────────────────────

export interface SessionDetail extends SessionSummary {
	opencodeSessionId: string | null;
	triggerRunId: string;
	lastPrompt: string | null;
	selectedVariant: string | null;
	eventSeq: number;
}

export const sessionQueryOptions = (id: number) =>
	queryOptions({
		queryKey: ["sessions", id],
		queryFn: async (): Promise<SessionDetail | null> => {
			const res = await fetch(`/api/agent/sessions/${id}`);
			if (res.status === 404) return null;
			if (!res.ok) throw new Error("Failed to fetch session");
			const data = (await res.json()) as { session: SessionDetail };
			return data.session ?? null;
		},
		staleTime: 15_000,
		gcTime: 5 * 60_000,
	});

// ─── Session events ───────────────────────────────────────

export interface SessionEventRowApi {
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
	created_at?: string;
	updated_at?: string;
}

interface SessionEventsQueryInput {
	afterSeq?: number;
	limit?: number;
}

export const sessionEventsQueryOptions = (
	id: number,
	input?: SessionEventsQueryInput,
) =>
	queryOptions({
		queryKey: [
			"sessions",
			id,
			"events",
			input?.afterSeq ?? null,
			input?.limit ?? null,
		],
		queryFn: async (): Promise<SessionEventRowApi[]> => {
			const params = new URLSearchParams();
			if (typeof input?.afterSeq === "number") {
				params.set("after_seq", String(input.afterSeq));
			}
			if (typeof input?.limit === "number") {
				params.set("limit", String(input.limit));
			}

			const query = params.toString();
			const res = await fetch(
				`/api/agent/sessions/${id}/events${query ? `?${query}` : ""}`,
			);
			if (res.status === 404) return [];
			if (!res.ok) throw new Error("Failed to fetch session events");
			const data = (await res.json()) as { events: SessionEventRowApi[] };
			return data.events ?? [];
		},
		staleTime: 5_000,
		gcTime: 5 * 60_000,
	});
