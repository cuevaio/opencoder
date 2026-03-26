import { Check, Circle } from "lucide-react";
import type { TodoItem } from "#/lib/todo-state.ts";
import { cn } from "#/lib/utils.ts";

interface TodoListProps {
	todos: TodoItem[];
	compact?: boolean;
}

function StatusIcon({ status }: { status: TodoItem["status"] }) {
	if (status === "completed") {
		return (
			<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:bg-green-500/20 dark:text-green-400">
				<Check className="h-2.5 w-2.5" strokeWidth={3} />
			</span>
		);
	}
	if (status === "in_progress") {
		return (
			<span className="todo-pulse flex h-4 w-4 shrink-0 items-center justify-center">
				<span className="h-2 w-2 rounded-full bg-blue-500" />
			</span>
		);
	}
	if (status === "cancelled") {
		return (
			<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<Check className="h-2.5 w-2.5" strokeWidth={3} />
			</span>
		);
	}
	// pending
	return (
		<Circle
			className="h-4 w-4 shrink-0 text-muted-foreground/50"
			strokeWidth={2}
		/>
	);
}

export function TodoList({ todos, compact }: TodoListProps) {
	return (
		<ul className={cn("flex flex-col", compact ? "gap-1" : "gap-1.5")}>
			{todos.map((todo, i) => (
				<li
					key={`${todo.content.slice(0, 30)}-${i.toString()}`}
					className="flex items-start gap-2"
					data-status={todo.status}
					data-in-progress={todo.status === "in_progress" ? "" : undefined}
				>
					<span className="mt-0.5">
						<StatusIcon status={todo.status} />
					</span>
					<span
						className={cn(
							"min-w-0 break-words [overflow-wrap:anywhere]",
							compact ? "text-xs" : "text-sm",
							todo.status === "completed" &&
								"text-muted-foreground line-through",
							todo.status === "cancelled" &&
								"text-muted-foreground/60 line-through",
							todo.status === "in_progress" && "font-medium text-foreground",
							todo.status === "pending" && "text-muted-foreground opacity-80",
						)}
					>
						{todo.content}
					</span>
				</li>
			))}
		</ul>
	);
}
