import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftOpen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoScroll } from "#/hooks/use-auto-scroll";
import { useProviderKeyStatus } from "#/hooks/use-provider-keys.ts";
import { computeStatus } from "#/lib/agent-status";
import { defaultModel as defaultModelId } from "#/lib/ai/model-registry.ts";
import { createSessionEventsCollection } from "#/lib/collections.ts";
import {
	buildDisplayItems,
	buildToolMap,
	findPendingQuestion,
	hasRoundCompleteInCurrentTurn,
	splitIntoTurns,
} from "#/lib/display-items";
import {
	sessionEventsQueryOptions,
	sessionQueryOptions,
} from "#/lib/queries.ts";
import {
	dbRowsToStreamEvents,
	type SessionEventRow,
} from "#/lib/session-converter";
import { resolveSessionEventSource } from "#/lib/session-event-source.ts";
import { extractLatestTodoProgress } from "#/lib/todo-state.ts";
import { useChatLayoutContext } from "#/routes/_authed/chat.tsx";
import { Button } from "../ui/button.tsx";
import { ChatFooter } from "./ChatFooter";
import { ChatMobileMenu } from "./ChatMobileMenu";
import { DeleteSessionDialog } from "./DeleteSessionDialog.tsx";
import { SessionTodoDock } from "./SessionTodoDock";
import { SessionTurn } from "./SessionTurn";

const CREATE_PR_PROMPT = "create pr";
const UPDATE_PR_PROMPT = "update pr";

interface ChatViewProps {
	sessionId: number;
	onNewSession: () => void;
	onFollowup: (
		prompt: string,
		mode: "plan" | "build",
		model: string,
		variant: string,
		imageUrls: Array<{ url: string; mime: string; filename?: string }>,
	) => void;
	onDeleteSession: () => void;
	onRetrySync: () => void;
	isSubmitting: boolean;
	isDeleting?: boolean;
	error: string | null;
}

export function ChatView({
	sessionId,
	onNewSession,
	onFollowup,
	onDeleteSession,
	onRetrySync,
	isSubmitting,
	isDeleting = false,
	error,
}: ChatViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const { setSidebarOpen } = useChatLayoutContext();
	const { configuredKeys } = useProviderKeyStatus();
	const [showSlowLoadFallback, setShowSlowLoadFallback] = useState(false);
	const [electricSyncError, setElectricSyncError] = useState<string | null>(
		null,
	);
	const [electricEventRows, setElectricEventRows] = useState<SessionEventRow[]>(
		[],
	);
	const [modeOverride, setModeOverride] = useState<"plan" | "build" | null>(
		null,
	);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const {
		data: sessionDetail,
		isLoading: isSessionLoading,
		isFetched: hasSessionFetched,
		isFetchedAfterMount: hasSessionFetchedAfterMount,
	} = useQuery({
		...sessionQueryOptions(sessionId),
		refetchInterval: (query) =>
			query.state.data?.status === "running" ? 3_000 : 30_000,
		refetchOnMount: "always",
		refetchOnWindowFocus: true,
	});

	const effectiveSessionRow = sessionDetail ?? null;
	const sessionStatus = sessionDetail?.status;
	const { useElectricEvents, useNeonEvents } = resolveSessionEventSource({
		sessionStatus,
		electricSyncError,
		hasFreshSessionStatus: hasSessionFetchedAfterMount,
	});

	const { data: neonEventRows = [] } = useQuery({
		...sessionEventsQueryOptions(sessionId),
		enabled: useNeonEvents,
		refetchInterval: useElectricEvents ? 3_000 : false,
		refetchOnWindowFocus: true,
	});

	const eventRows = useMemo(
		() =>
			(useElectricEvents && !electricSyncError
				? electricEventRows
				: neonEventRows) as SessionEventRow[],
		[electricEventRows, electricSyncError, neonEventRows, useElectricEvents],
	);

	useEffect(() => {
		if (!useElectricEvents) {
			setElectricSyncError(null);
			setElectricEventRows([]);
		}
	}, [useElectricEvents]);

	useEffect(() => {
		if (useElectricEvents && electricEventRows.length > 0) {
			setElectricSyncError(null);
		}
	}, [electricEventRows, useElectricEvents]);

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
		() => dbRowsToStreamEvents(eventRows),
		[eventRows],
	);

	// ─── Live token/cost totals from stream events ──────────
	const liveUsage = useMemo(() => {
		let tokens = 0;
		let cost = 0;
		for (const evt of streamEvents) {
			if (evt.type === "message-update" && evt.message.role === "assistant") {
				const msg = evt.message;
				if (msg.tokens) {
					tokens +=
						(msg.tokens.input ?? 0) +
						(msg.tokens.output ?? 0) +
						(msg.tokens.reasoning ?? 0);
				}
				if (msg.cost != null) {
					cost += Math.round(msg.cost * 1_000_000);
				}
			}
		}
		return { tokens: tokens || null, cost: cost || null };
	}, [streamEvents]);

	// ─── Display pipeline ────────────────────────────────────
	const initialPrompt = (effectiveSessionRow?.initialPrompt as string) ?? "";
	const rootSessionId =
		typeof effectiveSessionRow?.opencodeSessionId === "string" &&
		effectiveSessionRow.opencodeSessionId.length > 0
			? effectiveSessionRow.opencodeSessionId
			: undefined;

	const toolMap = useMemo(
		() => buildToolMap(streamEvents, rootSessionId),
		[streamEvents, rootSessionId],
	);
	const displayItems = useMemo(
		() => buildDisplayItems(streamEvents, toolMap, rootSessionId),
		[streamEvents, toolMap, rootSessionId],
	);
	const initialPromptImages = useMemo(() => {
		const firstUserMessage = eventRows.find(
			(row) =>
				(row as unknown as Record<string, unknown>).event_type ===
					"user-message" &&
				Array.isArray(
					(row as unknown as Record<string, unknown>).user_message_images,
				),
		) as Record<string, unknown> | undefined;
		if (!firstUserMessage) {
			return undefined;
		}
		const rawImages = firstUserMessage.user_message_images;
		if (!Array.isArray(rawImages) || rawImages.length === 0) {
			return undefined;
		}
		return rawImages.filter(
			(image): image is { url: string; mime: string; filename?: string } =>
				typeof image === "object" &&
				image !== null &&
				typeof (image as { url?: unknown }).url === "string" &&
				typeof (image as { mime?: unknown }).mime === "string",
		);
	}, [eventRows]);
	const turns = useMemo(
		() => splitIntoTurns(initialPrompt, displayItems, initialPromptImages),
		[initialPrompt, displayItems, initialPromptImages],
	);
	const status = useMemo(() => computeStatus(displayItems), [displayItems]);
	const todoProgress = useMemo(
		() => extractLatestTodoProgress(displayItems),
		[displayItems],
	);
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
	const isWorking = sessionStatus === "running";
	const isIdle =
		sessionStatus === "idle" ||
		sessionStatus === "completed" ||
		sessionStatus === "failed";
	const hasCompletedCurrentTurn = useMemo(
		() => hasRoundCompleteInCurrentTurn(streamEvents),
		[streamEvents],
	);
	const lastTurnHasAssistantMessage = useMemo(() => {
		const lastTurn = turns.at(-1);
		if (!lastTurn) return false;
		return lastTurn.items.some((item) => item.type === "text-block");
	}, [turns]);
	const shouldShowPrAction =
		hasFileChanges &&
		(isIdle || hasCompletedCurrentTurn) &&
		lastTurnHasAssistantMessage &&
		!pendingQuestion;

	// ─── Callbacks ────────────────────────────────────────────
	const handleAnswer = useCallback(
		async (tokenId: string, answers: string[][]) => {
			// Optimistically switch to build mode before the fetch so there is no
			// race condition with Electric SQL delivering events and remounting
			// ChatFooter before the HTTP response arrives.
			if (effectiveSessionRow?.mode === "plan") {
				setModeOverride("build");
			}
			const response = await fetch("/api/agent/answer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tokenId, answers, action: "answer" }),
			});
			if (response.ok) {
				completedTokens.add(tokenId);
			}
		},
		[completedTokens, effectiveSessionRow],
	);

	const handleCancel = useCallback(async () => {
		const triggerRunId = effectiveSessionRow?.triggerRunId as
			| string
			| undefined;
		if (!triggerRunId) return;
		await fetch("/api/agent/cancel", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ runId: triggerRunId }),
		});
	}, [effectiveSessionRow]);

	const handleElectricError = useCallback((error: unknown) => {
		setElectricSyncError(
			error instanceof Error
				? error.message
				: "Failed to sync live session events",
		);
	}, []);

	// ─── Loading state ────────────────────────────────────────
	if (!effectiveSessionRow && !hasSessionFetched) {
		const shouldShowError = showSlowLoadFallback;
		const loadingMessage = "Session is taking longer than expected.";

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

	if (!effectiveSessionRow && hasSessionFetched && !isSessionLoading) {
		return (
			<div className="flex h-full min-h-0 items-center justify-center px-4">
				<div className="w-full max-w-sm space-y-3 rounded-xl border border-border/80 bg-surface-1 p-4 text-center">
					<div className="text-sm font-medium text-foreground">
						Session not found
					</div>
					<button
						type="button"
						onClick={onNewSession}
						className="rounded border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted press-scale"
					>
						Start a new session
					</button>
				</div>
			</div>
		);
	}

	if (!effectiveSessionRow) {
		return null;
	}

	// ─── Render ───────────────────────────────────────────────
	const repoDisplay = (effectiveSessionRow.repoFullName as string) ?? "";
	const defaultMode =
		modeOverride ?? ((effectiveSessionRow.mode as "plan" | "build") || "build");
	const defaultModel =
		(effectiveSessionRow.selectedModel as string | undefined) || defaultModelId;
	const defaultVariant =
		(effectiveSessionRow.selectedVariant as string | undefined) || undefined;
	const handleCreateOrUpdatePr = () => {
		onFollowup(
			hasExistingPr ? UPDATE_PR_PROMPT : CREATE_PR_PROMPT,
			defaultMode,
			defaultModel,
			defaultVariant ?? "max",
			[],
		);
	};
	const totalTokens =
		liveUsage.tokens ??
		(effectiveSessionRow.totalTokens as number | null | undefined);
	const totalCost =
		liveUsage.cost ??
		(effectiveSessionRow.totalCost as number | null | undefined);
	const compactTokenCount =
		totalTokens != null
			? new Intl.NumberFormat("en-US", {
					notation: "compact",
					maximumFractionDigits: 1,
				}).format(totalTokens)
			: null;
	const shouldShowReconnectNotice =
		useElectricEvents && (Boolean(electricSyncError) || useNeonEvents);
	const shouldShowInlineError =
		shouldShowReconnectNotice && Boolean(electricSyncError);

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			{useElectricEvents && (
				<RunningSessionEvents
					sessionId={sessionId}
					onRows={setElectricEventRows}
					onError={handleElectricError}
				/>
			)}

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
					{totalTokens != null && (
						<span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground">
							<span className="sm:hidden">{compactTokenCount} tok</span>
							<span className="hidden sm:inline">
								{totalTokens.toLocaleString()} tokens
							</span>
						</span>
					)}
					{totalCost != null && totalCost > 0 && (
						<span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground">
							${(totalCost / 1_000_000).toFixed(4)}
						</span>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<button
						type="button"
						onClick={() => setDeleteDialogOpen(true)}
						className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
						aria-label="Delete session"
					>
						<Trash2 className="h-4 w-4" />
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
								i === turns.length - 1 && shouldShowPrAction ? (
									<Button
										type="button"
										onClick={handleCreateOrUpdatePr}
										disabled={isSubmitting}
										variant="default"
										size="default"
										className="w-full"
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

			{/* Todo progress dock */}
			{todoProgress && todoProgress.total > 0 && isWorking && (
				<div className="border-t border-border/80 bg-background px-[var(--page-gutter)] py-2">
					<div className="chat-container">
						<SessionTodoDock progress={todoProgress} />
					</div>
				</div>
			)}

			{/* Footer */}
			<div className="border-t border-border/80 bg-background px-[var(--page-gutter)] py-2 pb-safe">
				<div className="chat-container">
					{shouldShowReconnectNotice && (
						<div className="mb-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
							{shouldShowInlineError
								? `Session sync issue: ${electricSyncError ?? "temporary sync interruption"}`
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

			<DeleteSessionDialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
				onConfirm={onDeleteSession}
				isDeleting={isDeleting}
			/>
		</div>
	);
}

interface RunningSessionEventsProps {
	sessionId: number;
	onRows: (rows: SessionEventRow[]) => void;
	onError: (error: unknown) => void;
}

function RunningSessionEvents({
	sessionId,
	onRows,
	onError,
}: RunningSessionEventsProps) {
	const eventsCollection = useMemo(
		() =>
			createSessionEventsCollection(sessionId, {
				onError,
			}),
		[onError, sessionId],
	);

	const { data: eventRows } = useLiveQuery(
		(q) =>
			q
				.from({ evt: eventsCollection })
				.orderBy(({ evt }) => evt.seq as number, "asc"),
		[eventsCollection],
	);

	useEffect(() => {
		onRows((eventRows ?? []) as unknown as SessionEventRow[]);
	}, [eventRows, onRows]);

	useEffect(() => {
		return () => {
			void eventsCollection.cleanup();
		};
	}, [eventsCollection]);

	return null;
}
