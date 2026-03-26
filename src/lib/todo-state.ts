import type { DisplayItem, ToolState } from "#/lib/display-items.ts";

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
 * Extract the raw todos array from a todowrite ToolState.
 *
 * Tries `tool.input.todos` first (available when streaming live).
 * Falls back to parsing `tool.output` as JSON (the Electric SQL shape
 * proxy excludes `tool_input` to keep payloads light, but `tool_output`
 * for todowrite contains the todos array).
 */
export function extractTodosFromTool(tool: ToolState): unknown[] | null {
	if (Array.isArray(tool.input?.todos)) {
		return tool.input.todos as unknown[];
	}

	if (tool.output) {
		try {
			const parsed: unknown = JSON.parse(tool.output);
			if (Array.isArray(parsed)) {
				return parsed;
			}
		} catch {
			// output is not valid JSON — ignore
		}
	}

	return null;
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
		if (item?.type === "tool-call" && item.tool.tool === "todowrite") {
			const todos = extractTodosFromTool(item.tool);
			if (todos) {
				return parseTodoProgress(todos);
			}
		}
	}
	return null;
}
