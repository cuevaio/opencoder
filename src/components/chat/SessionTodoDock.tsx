import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TodoProgress } from "#/lib/todo-state.ts";
import { cn } from "#/lib/utils.ts";
import { TodoList } from "./TodoList";

interface SessionTodoDockProps {
	progress: TodoProgress;
}

export function SessionTodoDock({ progress }: SessionTodoDockProps) {
	const [collapsed, setCollapsed] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);

	const toggle = useCallback(() => setCollapsed((v) => !v), []);

	// Auto-scroll to in-progress item when expanding
	useEffect(() => {
		if (collapsed) return;
		const el = listRef.current?.querySelector("[data-in-progress]");
		if (!(el instanceof HTMLElement)) return;
		requestAnimationFrame(() => {
			el.scrollIntoView({ block: "nearest", behavior: "smooth" });
		});
	}, [collapsed]);

	return (
		<div className="rounded-xl border border-border/80 bg-surface-1 text-sm">
			{/* Toggle bar */}
			<button
				type="button"
				onClick={toggle}
				className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 press-scale"
			>
				<span className="shrink-0 tabular-nums text-xs font-medium text-foreground">
					{progress.completed} of {progress.total} completed
				</span>

				{/* Active todo preview — only visible when collapsed */}
				{collapsed && progress.active && (
					<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
						{progress.active.content}
					</span>
				)}

				<ChevronDown
					className={cn(
						"ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
						collapsed && "rotate-180",
					)}
				/>
			</button>

			{/* Expandable list */}
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-200 ease-out",
					collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
				)}
			>
				<div className="overflow-hidden">
					<div
						ref={listRef}
						className="max-h-[40vh] overflow-y-auto border-t border-border/80 px-3 py-2.5"
					>
						<TodoList todos={progress.todos} />
					</div>
				</div>
			</div>
		</div>
	);
}
