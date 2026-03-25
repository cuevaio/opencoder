import type { DisplayItem, ToolState } from "./display-items";

function computeToolStatus(tool: ToolState): string {
	switch (tool.tool) {
		case "task":
			return "Delegating to agent...";
		case "todowrite":
		case "todoread":
			return "Planning...";
		case "read":
			return "Gathering context...";
		case "list":
		case "grep":
		case "glob":
			return "Searching codebase...";
		case "webfetch":
			return "Searching the web...";
		case "edit":
		case "write":
			return "Making edits...";
		case "bash":
			return "Running commands...";
		default:
			return `Running ${tool.tool}...`;
	}
}

/**
 * Compute a human-readable status string from the last active display item.
 */
export function computeStatus(items: DisplayItem[]): string | undefined {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (!item) continue;

		if (item.type === "question-asked") {
			return "Waiting for your answer...";
		}

		if (item.type === "round-complete") {
			return undefined;
		}

		if (item.type === "question-answered") {
			return "Processing your answer...";
		}

		if (item.type === "tool-call") {
			const { tool } = item;
			if (tool.status !== "running") continue;

			if (tool.tool === "task" && tool.childTools && tool.childTools.size > 0) {
				const childToolsArr = Array.from(tool.childTools.values());
				const runningChild = childToolsArr
					.reverse()
					.find((t) => t.status === "running");
				if (runningChild) {
					return `Subagent: ${computeToolStatus(runningChild)}`;
				}
				if (tool.childText) {
					return "Subagent: Writing response...";
				}
				return "Delegating to agent...";
			}

			return computeToolStatus(tool);
		}

		if (item.type === "reasoning-block") {
			const text = item.text.trimStart();
			const match = text.match(/^\*\*(.+?)\*\*/);
			if (match) return `Thinking about ${match[1]?.trim()}...`;
			return "Thinking...";
		}

		if (item.type === "text-block") {
			return "Gathering thoughts...";
		}
	}

	return undefined;
}
