import { queryOptions } from "@tanstack/react-query";

// ─── Sessions list ────────────────────────────────────────

interface SessionSummary {
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
		staleTime: 30_000, // 30s — Electric keeps it live anyway
		gcTime: 5 * 60_000, // 5 min cache
	});

// ─── Single session ───────────────────────────────────────

interface SessionDetail extends SessionSummary {
	opencodeSessionId: string | null;
	triggerRunId: string;
	lastPrompt: string | null;
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
		staleTime: 30_000,
		gcTime: 5 * 60_000,
	});
