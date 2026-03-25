import type { Collection } from "@tanstack/react-db";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoScroll } from "#/hooks/use-auto-scroll";
import { computeStatus } from "#/lib/agent-status";
import { defaultModel as defaultModelId } from "#/lib/ai/model-registry.ts";
import { createSessionEventsCollection } from "#/lib/collections";
import {
	buildDisplayItems,
	buildToolMap,
	findPendingQuestion,
	splitIntoTurns,
} from "#/lib/display-items";
import {
	dbRowsToStreamEvents,
	type SessionEventRow,
} from "#/lib/session-converter";
import { useChatLayoutContext } from "#/routes/_authed/chat.tsx";
import { ChatFooter } from "./ChatFooter";
import { ChatMobileMenu } from "./ChatMobileMenu";
import { SessionTurn } from "./SessionTurn";

interface ChatViewProps {
	sessionId: number;
	// Shared collection from the chat layout — avoids duplicate Electric subscriptions
	sessionsCollection: Collection<
		Record<string, unknown>,
		string | number,
		// biome-ignore lint/suspicious/noExplicitAny: Electric collection utils type is opaque
		any
	>;
	onNewSession: () => void;
	onFollowup: (prompt: string, mode: "plan" | "build", model: string) => void;
	onRetrySync: () => void;
	isSubmitting: boolean;
	error: string | null;
}

export function ChatView({
	sessionId,
	sessionsCollection,
	onNewSession,
	onFollowup,
	onRetrySync,
	isSubmitting,
	error,
}: ChatViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const { setSidebarOpen, sessionsSyncError } = useChatLayoutContext();
	const [showSlowLoadFallback, setShowSlowLoadFallback] = useState(false);
	const [hasHydratedSession, setHasHydratedSession] = useState(false);

	// Events collection is scoped to this session.
	const eventsCollection = useMemo(
		() => createSessionEventsCollection(sessionId),
		[sessionId],
	);

	// ─── Live queries ─────────────────────────────────────────
	const { data: eventRows } = useLiveQuery(
		(q) =>
			q
				.from({ evt: eventsCollection })
				.orderBy(({ evt }) => evt.seq as number, "asc"),
		[eventsCollection],
	);

	const { data: allSessions } = useLiveQuery(
		(q) =>
			q.from({ s: sessionsCollection }).where(({ s }) => eq(s.id, sessionId)),
		[sessionsCollection, sessionId],
	);

	const sessionRow = allSessions?.[0] ?? null;
	const sessionRowCacheRef = useRef(new Map<number, Record<string, unknown>>());
	if (sessionRow) {
		sessionRowCacheRef.current.set(sessionId, sessionRow);
	}
	const effectiveSessionRow =
		sessionRow ?? sessionRowCacheRef.current.get(sessionId) ?? null;

	useEffect(() => {
		if (sessionRow) {
			setHasHydratedSession(true);
			if (import.meta.env.DEV) {
				console.info("[chat-sync] session hydrated", { sessionId });
			}
		}
	}, [sessionId, sessionRow]);

	useEffect(() => {
		if (effectiveSessionRow) {
			setShowSlowLoadFallback(false);
			return;
		}

		setShowSlowLoadFallback(false);
		const timeoutId = window.setTimeout(() => {
			setShowSlowLoadFallback(true);
			if (import.meta.env.DEV) {
				console.info("[chat-sync] slow-load fallback shown", { sessionId });
			}
		}, 10_000);

		return () => window.clearTimeout(timeoutId);
	}, [effectiveSessionRow, sessionId]);

	// ─── Build StreamEvent[] from DB rows ─────────────────────
	const streamEvents = useMemo(
		() =>
			dbRowsToStreamEvents((eventRows ?? []) as unknown as SessionEventRow[]),
		[eventRows],
	);

	// ─── Display pipeline ────────────────────────────────────
	const initialPrompt = (effectiveSessionRow?.initial_prompt as string) ?? "";

	const toolMap = useMemo(() => buildToolMap(streamEvents), [streamEvents]);
	const displayItems = useMemo(
		() => buildDisplayItems(streamEvents, toolMap),
		[streamEvents, toolMap],
	);
	const turns = useMemo(
		() => splitIntoTurns(initialPrompt, displayItems),
		[initialPrompt, displayItems],
	);
	const status = useMemo(() => computeStatus(displayItems), [displayItems]);

	const completedTokens = useMemo(() => new Set<string>(), []);
	const pendingQuestion = useMemo(
		() => findPendingQuestion(displayItems, completedTokens),
		[displayItems, completedTokens],
	);

	useAutoScroll(scrollRef, bottomRef, streamEvents);

	// ─── Session status ───────────────────────────────────────
	const sessionStatus = (effectiveSessionRow?.status as string) ?? "running";
	const isWorking = sessionStatus === "running";
	const isIdle = sessionStatus === "idle" || sessionStatus === "completed";

	// ─── Callbacks ────────────────────────────────────────────
	const handleAnswer = useCallback(
		async (tokenId: string, answers: string[][]) => {
			const response = await fetch("/api/agent/answer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tokenId, answers, action: "answer" }),
			});
			if (response.ok) {
				completedTokens.add(tokenId);
			}
		},
		[completedTokens],
	);

	const handleCancel = useCallback(async () => {
		const triggerRunId = effectiveSessionRow?.trigger_run_id as
			| string
			| undefined;
		if (!triggerRunId) return;
		await fetch("/api/agent/cancel", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ runId: triggerRunId }),
		});
	}, [effectiveSessionRow]);

	// ─── Loading state while Electric syncs ───────────────────
	// When ChatView first mounts the Electric subscription hasn't delivered
	// data yet. Show a lightweight skeleton instead of flashing empty content.
	// (Placed after all hooks to satisfy React's rules of hooks.)
	if (!effectiveSessionRow && !hasHydratedSession) {
		const shouldShowError = showSlowLoadFallback || Boolean(sessionsSyncError);
		const loadingMessage = sessionsSyncError
			? `Session sync failed: ${sessionsSyncError}`
			: "Session sync is taking longer than expected.";

		return (
			<div className="flex h-full flex-col">
				<div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4">
					<div className="flex items-center gap-2">
						{/* Sidebar toggle placeholder */}
						<div className="h-5 w-5 md:hidden" />
						<div className="h-4 w-32 animate-pulse rounded bg-muted" />
					</div>
					<div className="h-6 w-20 animate-pulse rounded bg-muted" />
				</div>
				<div className="flex flex-1 items-center justify-center px-4">
					{shouldShowError ? (
						<div className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-card p-4 text-center">
							<div className="text-sm font-medium text-foreground">
								Session sync interrupted
							</div>
							<p className="text-xs text-muted-foreground">{loadingMessage}</p>
							{import.meta.env.DEV && (
								<p className="text-[11px] text-muted-foreground">
									Check `/api/shapes/sessions` headers and status in DevTools.
								</p>
							)}
							<div className="flex items-center justify-center gap-2">
								<button
									type="button"
									onClick={onRetrySync}
									className="rounded border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted press-scale"
								>
									Retry sync
								</button>
								<button
									type="button"
									onClick={onNewSession}
									className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
								>
									New session
								</button>
							</div>
						</div>
					) : (
						<div className="flex flex-col items-center gap-2">
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
							<span className="text-xs text-muted-foreground">
								Loading session...
							</span>
						</div>
					)}
				</div>
			</div>
		);
	}

	// ─── Render ───────────────────────────────────────────────
	const repoDisplay = (effectiveSessionRow.repo_full_name as string) ?? "";
	const defaultMode = (effectiveSessionRow.mode as "plan" | "build") || "build";
	const defaultModel =
		(effectiveSessionRow.selected_model as string | undefined) ||
		defaultModelId;
	const totalTokens = effectiveSessionRow.total_tokens as
		| number
		| null
		| undefined;
	const totalCost = effectiveSessionRow.total_cost as number | null | undefined;
	const shouldShowReconnectNotice =
		hasHydratedSession && !sessionRow && Boolean(effectiveSessionRow);
	const shouldShowInlineError =
		shouldShowReconnectNotice &&
		(showSlowLoadFallback || Boolean(sessionsSyncError));

	return (
		<div className="flex h-full flex-col">
			{/* Header bar */}
			<div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4">
				<div className="flex min-w-0 items-center gap-2">
					{/* Mobile sidebar toggle */}
					<button
						type="button"
						onClick={() => setSidebarOpen(true)}
						className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted press-scale md:hidden"
						aria-label="Open sessions sidebar"
					>
						<PanelLeftOpen className="h-5 w-5" />
					</button>

					<span className="max-w-[150px] truncate font-mono text-xs text-muted-foreground sm:max-w-none">
						{repoDisplay}
					</span>
					{status && isWorking && (
						<span className="hidden truncate text-xs text-blue-600 dark:text-blue-400 sm:inline">
							{status}
						</span>
					)}
					{isIdle && totalTokens != null && (
						<span className="hidden text-xs text-muted-foreground sm:inline">
							{totalTokens.toLocaleString()} tokens
						</span>
					)}
					{isIdle && totalCost != null && totalCost > 0 && (
						<span className="hidden text-xs text-muted-foreground sm:inline">
							${(totalCost / 1_000_000).toFixed(4)}
						</span>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={onNewSession}
						className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
					>
						New session
					</button>
					<ChatMobileMenu />
				</div>
			</div>

			{/* Scrollable chat area */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-6"
			>
				<div className="mx-auto max-w-3xl space-y-6">
					{turns.map((turn, i) => (
						<SessionTurn
							key={`turn-${turn.prompt.slice(0, 20)}-${i.toString()}`}
							turn={turn}
							pendingQuestion={pendingQuestion}
							completedTokens={completedTokens}
							onAnswer={handleAnswer}
						/>
					))}
				</div>
				<div ref={bottomRef} />
			</div>

			{/* Footer */}
			<div className="border-t border-border px-3 py-3 pb-safe sm:px-4">
				<div className="mx-auto max-w-3xl">
					{shouldShowReconnectNotice && (
						<div className="mb-2 rounded border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
							{shouldShowInlineError
								? `Session sync issue: ${sessionsSyncError ?? "temporary sync interruption"}`
								: "Reconnecting session updates..."}
						</div>
					)}
					{isWorking && !pendingQuestion && (
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Agent is working...
							</span>
							<button
								type="button"
								onClick={handleCancel}
								className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 press-scale dark:text-red-400 dark:hover:bg-red-950"
							>
								Cancel
							</button>
						</div>
					)}

					{!pendingQuestion && (
						<div className="space-y-2">
							{isIdle && error && (
								<div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
									{error}
								</div>
							)}
							<ChatFooter
								onSubmit={onFollowup}
								isSubmitting={isSubmitting}
								disabled={!isIdle}
								defaultMode={defaultMode}
								defaultModel={defaultModel}
								placeholder="Send a follow-up message..."
							/>
							<div className="flex justify-end">
								<button
									type="button"
									onClick={onNewSession}
									className="rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
								>
									End session
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
