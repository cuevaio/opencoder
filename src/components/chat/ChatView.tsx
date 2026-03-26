import type { Collection } from "@tanstack/react-db";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { PanelLeftOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoScroll } from "#/hooks/use-auto-scroll";
import { useProviderKeyStatus } from "#/hooks/use-provider-keys.ts";
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
import { Button } from "../ui/button.tsx";
import { ChatFooter } from "./ChatFooter";
import { ChatMobileMenu } from "./ChatMobileMenu";
import { SessionTurn } from "./SessionTurn";

const CREATE_PR_PROMPT = "create pr";
const UPDATE_PR_PROMPT = "update pr";

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
	onFollowup: (
		prompt: string,
		mode: "plan" | "build",
		model: string,
		variant: string,
	) => void;
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
	const { configuredKeys } = useProviderKeyStatus();
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
		}
	}, [sessionRow]);

	useEffect(() => {
		if (effectiveSessionRow) {
			setShowSlowLoadFallback(false);
			return;
		}

		setShowSlowLoadFallback(false);
		const timeoutId = window.setTimeout(() => {
			setShowSlowLoadFallback(true);
		}, 10_000);

		return () => window.clearTimeout(timeoutId);
	}, [effectiveSessionRow]);

	// ─── Build StreamEvent[] from DB rows ─────────────────────
	const streamEvents = useMemo(
		() =>
			dbRowsToStreamEvents((eventRows ?? []) as unknown as SessionEventRow[]),
		[eventRows],
	);

	// ─── Display pipeline ────────────────────────────────────
	const initialPrompt = (effectiveSessionRow?.initial_prompt as string) ?? "";
	const rootSessionId =
		typeof effectiveSessionRow?.opencode_session_id === "string" &&
		effectiveSessionRow.opencode_session_id.length > 0
			? effectiveSessionRow.opencode_session_id
			: undefined;

	const toolMap = useMemo(
		() => buildToolMap(streamEvents, rootSessionId),
		[streamEvents, rootSessionId],
	);
	const displayItems = useMemo(
		() => buildDisplayItems(streamEvents, toolMap, rootSessionId),
		[streamEvents, toolMap, rootSessionId],
	);
	const turns = useMemo(
		() => splitIntoTurns(initialPrompt, displayItems),
		[initialPrompt, displayItems],
	);
	const status = useMemo(() => computeStatus(displayItems), [displayItems]);
	const hasFileChanges = useMemo(
		() =>
			streamEvents.some(
				(evt) => evt.type === "part-update" && evt.part.type === "file",
			),
		[streamEvents],
	);
	const hasExistingPr = useMemo(
		() =>
			streamEvents.some((evt) => {
				if (evt.type !== "part-update" || evt.part.type !== "tool") {
					return false;
				}

				const toolState = evt.part.state;
				if (toolState.status !== "completed") {
					return false;
				}

				if (evt.part.tool === "bash") {
					const command =
						typeof toolState.input?.command === "string"
							? toolState.input.command
							: "";
					if (/\bgh\s+pr\s+(create|edit)\b/.test(command)) {
						return true;
					}
				}

				return /\/pull\/\d+/.test(toolState.output ?? "");
			}),
		[streamEvents],
	);

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
			<div className="flex h-full min-h-0 flex-col">
				<div className="flex items-center justify-between border-b border-border px-3 py-3 sm:px-4">
					<div className="flex items-center gap-2">
						{/* Sidebar toggle placeholder */}
						<div className="h-5 w-5 md:hidden" />
						<div className="h-4 w-32 animate-pulse rounded bg-muted" />
					</div>
					<div className="h-6 w-20 animate-pulse rounded bg-muted" />
				</div>
				<div className="flex flex-1 items-center justify-center px-4">
					{shouldShowError ? (
						<div className="w-full max-w-sm space-y-3 rounded-xl border border-border/80 bg-surface-1 p-4 text-center">
							<div className="text-sm font-medium text-foreground">
								Session sync interrupted
							</div>
							<p className="text-xs text-muted-foreground">{loadingMessage}</p>
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
	const defaultVariant =
		(effectiveSessionRow.selected_variant as string | undefined) || undefined;
	const handleCreateOrUpdatePr = () => {
		onFollowup(
			hasExistingPr ? UPDATE_PR_PROMPT : CREATE_PR_PROMPT,
			defaultMode,
			defaultModel,
			defaultVariant ?? "max",
		);
	};
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
		<div className="flex h-full min-h-0 flex-col bg-background">
			{/* Header bar */}
			<div className="flex min-h-12 items-center justify-between border-b border-border/80 bg-background px-[var(--page-gutter)] py-2 pt-safe">
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

					<span className="max-w-[45vw] truncate font-mono text-xs leading-none text-muted-foreground sm:max-w-[30rem]">
						{repoDisplay}
					</span>
					{status && isWorking && (
						<span className="hidden truncate rounded-full bg-accent px-2 py-1 text-[11px] font-medium text-accent-foreground sm:inline">
							{status}
						</span>
					)}
					{isIdle && totalTokens != null && (
						<span className="hidden rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground sm:inline">
							{totalTokens.toLocaleString()} tokens
						</span>
					)}
					{isIdle && totalCost != null && totalCost > 0 && (
						<span className="hidden rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground sm:inline">
							${(totalCost / 1_000_000).toFixed(4)}
						</span>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={onNewSession}
						className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background/70 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
					>
						New session
					</button>
					<ChatMobileMenu />
				</div>
			</div>

			{/* Scrollable chat area */}
			<div
				ref={scrollRef}
				className="scroll-region flex-1 px-[var(--page-gutter)] py-5 sm:py-6"
			>
				<div className="chat-container space-y-6 sm:space-y-7">
					{turns.map((turn, i) => (
						<SessionTurn
							key={`turn-${turn.prompt.slice(0, 20)}-${i.toString()}`}
							turn={turn}
							pendingQuestion={pendingQuestion}
							completedTokens={completedTokens}
							onAnswer={handleAnswer}
							bottomAction={
								i === turns.length - 1 && hasFileChanges ? (
									<Button
										type="button"
										onClick={handleCreateOrUpdatePr}
										disabled={isWorking || isSubmitting}
										variant="outline"
										size="sm"
										className="h-8"
									>
										{hasExistingPr ? "Update PR" : "Create PR"}
									</Button>
								) : null
							}
						/>
					))}
				</div>
				<div ref={bottomRef} />
			</div>

			{/* Footer */}
			<div className="border-t border-border/80 bg-background px-[var(--page-gutter)] py-2 pb-safe">
				<div className="chat-container">
					{shouldShowReconnectNotice && (
						<div className="mb-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
							{shouldShowInlineError
								? `Session sync issue: ${sessionsSyncError ?? "temporary sync interruption"}`
								: "Reconnecting session updates..."}
						</div>
					)}
					{!pendingQuestion && (
						<div className="space-y-1.5">
							{isIdle && error && (
								<div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
									{error}
								</div>
							)}
							<ChatFooter
								onSubmit={onFollowup}
								onCancel={handleCancel}
								onEndSession={onNewSession}
								isWorking={isWorking}
								isSubmitting={isSubmitting}
								disabled={false}
								defaultMode={defaultMode}
								defaultModel={defaultModel}
								defaultVariant={defaultVariant}
								placeholder="Send a follow-up message..."
								configuredKeys={configuredKeys}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
