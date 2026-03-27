import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { DeleteSessionDialog } from "#/components/chat/DeleteSessionDialog.tsx";
import { Wordmark } from "#/components/logo.tsx";
import { sessionsQueryOptions } from "#/lib/queries.ts";

interface SessionSidebarProps {
	onSelectSession: (id: number) => void;
	onNewSession: () => void;
}

export function SessionSidebar({
	onSelectSession,
	onNewSession,
}: SessionSidebarProps) {
	// Derive active session from URL params
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const params = useParams({ strict: false }) as { sessionId?: string };
	const activeSessionId = params?.sessionId ? Number(params.sessionId) : null;
	const { data: sessions, isLoading } = useQuery({
		...sessionsQueryOptions(),
		refetchInterval: (query) => {
			const rows = query.state.data;
			if (!rows || rows.length === 0) {
				return 60_000;
			}

			const hasRunning = rows.some((session) => session.status === "running");
			return hasRunning ? 3_000 : 60_000;
		},
		refetchOnWindowFocus: true,
	});

	const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDeleteClick = (id: number, e: React.MouseEvent) => {
		e.stopPropagation();
		setPendingDeleteId(id);
	};

	const handleDeleteConfirm = async () => {
		if (pendingDeleteId === null) return;
		setIsDeleting(true);

		try {
			const response = await fetch(`/api/agent/sessions/${pendingDeleteId}`, {
				method: "DELETE",
			});

			const data = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(data.error || "Failed to delete session");
			}

			await queryClient.invalidateQueries({ queryKey: ["sessions"] });

			// Navigate away if deleting the currently viewed session
			if (pendingDeleteId === activeSessionId) {
				navigate({ to: "/chat" });
			}
		} catch {
			// Best-effort: errors are silent in the sidebar context
		} finally {
			setIsDeleting(false);
			setPendingDeleteId(null);
		}
	};

	return (
		<div className="flex h-full min-h-0 flex-col border-r border-border/70 bg-surface-1">
			{/* Sidebar header */}
			<div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
				<Link to="/" aria-label="opencoder home" className="press-scale">
					<Wordmark size={14} />
				</Link>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => navigate({ to: "/dashboard" })}
						className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground hover:bg-muted hover:text-foreground press-scale"
						title="Dashboard"
						aria-label="Dashboard"
					>
						<LayoutDashboard className="h-4 w-4" />
					</button>
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
					const { id, status, createdAt, toolCallCount } = session;
					const title = session.title || "Untitled";
					const repoFullName = session.repoFullName;
					const isActive = activeSessionId === id;

					return (
						<div
							key={id}
							className={`group flex w-full items-stretch border-b border-border/50 transition-colors hover:bg-surface-2 animate-in fade-in-0 duration-200 ${
								isActive ? "bg-surface-2" : ""
							}`}
							style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
						>
							{/* Main navigation area */}
							<button
								type="button"
								onClick={() => onSelectSession(id)}
								className="min-w-0 flex-1 px-4 py-3.5 text-left press-scale"
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

							{/* Delete button — visible on hover */}
							<div className="flex shrink-0 items-center pr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
								<button
									type="button"
									onClick={(e) => handleDeleteClick(id, e)}
									className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive press-scale"
									aria-label="Delete session"
									title="Delete session"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					);
				})}
			</div>

			<DeleteSessionDialog
				open={pendingDeleteId !== null}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteId(null);
				}}
				onConfirm={handleDeleteConfirm}
				isDeleting={isDeleting}
			/>
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
