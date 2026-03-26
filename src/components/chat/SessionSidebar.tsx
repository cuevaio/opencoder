import type { Collection } from "@tanstack/react-db";
import { useLiveQuery } from "@tanstack/react-db";
import { useParams } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { ThemeToggle } from "#/components/theme-toggle.tsx";

interface SessionSidebarProps {
	// Collection passed from the parent layout so it's shared and not re-created
	sessionsCollection: Collection<
		Record<string, unknown>,
		string | number,
		// biome-ignore lint/suspicious/noExplicitAny: Electric collection utils type is opaque
		any
	>;
	onSelectSession: (id: number) => void;
	onNewSession: () => void;
	onPrefetchSessionEvents?: (id: number) => void;
}

export function SessionSidebar({
	sessionsCollection,
	onSelectSession,
	onNewSession,
	onPrefetchSessionEvents,
}: SessionSidebarProps) {
	// Derive active session from URL params
	// biome-ignore lint/suspicious/noExplicitAny: params type resolves after routeTree regen
	const params = useParams({ strict: false }) as any;
	const activeSessionId = params?.sessionId ? Number(params.sessionId) : null;
	const { data: sessions, isLoading } = useLiveQuery(
		(q) =>
			q
				.from({ s: sessionsCollection })
				.orderBy(({ s }) => s.created_at as string, "desc")
				.limit(50),
		[sessionsCollection],
	);

	return (
		<div className="flex h-full min-h-0 flex-col border-r border-border/70 bg-surface-1">
			{/* Sidebar header */}
			<div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
				<span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					Sessions
				</span>
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<button
						type="button"
						onClick={onNewSession}
						className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
						title="New session"
						aria-label="New session"
					>
						<Plus className="h-4 w-4" />
					</button>
				</div>
			</div>

			{/* Session list */}
			<div className="scroll-region flex-1">
				{isLoading && (
					<div className="px-4 py-4 text-xs text-muted-foreground">
						Loading...
					</div>
				)}

				{!isLoading && (!sessions || sessions.length === 0) && (
					<div className="px-4 py-4 text-xs text-muted-foreground">
						No sessions yet
					</div>
				)}

				{sessions?.map((session, i) => {
					const id = session.id as number;
					const status = session.status as string;
					const title = (session.title as string) || "Untitled";
					const repoFullName = session.repo_full_name as string;
					const createdAt = session.created_at as string;
					const toolCallCount = session.tool_call_count as number | null;

					return (
						<button
							type="button"
							key={id}
							onClick={() => onSelectSession(id)}
							onPointerEnter={(event) => {
								if (event.pointerType !== "mouse") return;
								if (activeSessionId === id) return;
								onPrefetchSessionEvents?.(id);
							}}
							onFocus={() => {
								if (activeSessionId === id) return;
								onPrefetchSessionEvents?.(id);
							}}
							className={`w-full border-b border-border/50 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 press-scale animate-in fade-in-0 duration-200 ${
								activeSessionId === id ? "bg-surface-2" : ""
							}`}
							style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
						>
							<div className="flex items-center gap-2">
								{status === "running" && (
									<span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />
								)}
								<span className="truncate text-xs font-semibold text-foreground">
									{title}
								</span>
							</div>
							<div className="mt-1 truncate text-[11px] text-muted-foreground">
								{repoFullName}
							</div>
							<div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
								<span>{formatRelativeTime(createdAt)}</span>
								{toolCallCount != null && <span>{toolCallCount} tools</span>}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function formatRelativeTime(dateStr: string): string {
	if (!dateStr) return "";
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60_000);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;

	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours}h ago`;

	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString();
}
