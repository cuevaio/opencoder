import type { DisplayItem } from "#/lib/display-items.ts";

// ─── Types ───────────────────────────────────────────────

export type TodoItem = {
	content: string;
	status: "pending" | "in_progress" | "completed" | "cancelled";
	priority: "high" | "medium" | "low";
};

export type TodoProgress = {
	todos: TodoItem[];
	completed: number;
	total: number;
	active: TodoItem | null;
};

// ─── Helpers ─────────────────────────────────────────────

const VALID_STATUSES = new Set([
	"pending",
	"in_progress",
	"completed",
	"cancelled",
]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

function isTodoItem(raw: unknown): raw is TodoItem {
	if (typeof raw !== "object" || raw === null) return false;
	const obj = raw as Record<string, unknown>;
	return (
		typeof obj.content === "string" &&
		typeof obj.status === "string" &&
		VALID_STATUSES.has(obj.status) &&
		typeof obj.priority === "string" &&
		VALID_PRIORITIES.has(obj.priority)
	);
}

export function parseTodoProgress(raw: unknown[]): TodoProgress {
	const todos = raw.filter(isTodoItem);
	const completed = todos.filter(
		(t) => t.status === "completed" || t.status === "cancelled",
	).length;
	const active =
		todos.find((t) => t.status === "in_progress") ??
		todos.find((t) => t.status === "pending") ??
		todos.findLast((t) => t.status === "completed") ??
		null;
	return { todos, completed, total: todos.length, active };
}

/**
 * Scan display items backward for the latest todowrite tool call
 * and return its parsed progress state.
 */
export function extractLatestTodoProgress(
	items: DisplayItem[],
): TodoProgress | null {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (
			item?.type === "tool-call" &&
			item.tool.tool === "todowrite" &&
			Array.isArray(item.tool.input?.todos)
		) {
			return parseTodoProgress(item.tool.input.todos as unknown[]);
		}
	}
	return null;
}
