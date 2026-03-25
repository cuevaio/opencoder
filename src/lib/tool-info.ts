export type ToolInfo = {
	title: string;
	subtitle?: string;
};

function getFilename(filePath: string | undefined): string | undefined {
	if (!filePath) return undefined;
	return filePath.split("/").pop() || filePath;
}

export function getToolInfo(
	tool: string,
	input: Record<string, unknown> = {},
): ToolInfo {
	switch (tool) {
		case "read":
			return {
				title: "Read",
				subtitle: input.filePath
					? getFilename(input.filePath as string)
					: undefined,
			};
		case "glob":
			return {
				title: "Glob",
				subtitle: input.pattern as string | undefined,
			};
		case "grep":
			return {
				title: "Grep",
				subtitle: input.pattern as string | undefined,
			};
		case "webfetch":
			return {
				title: "Web Fetch",
				subtitle: input.url as string | undefined,
			};
		case "task":
			return {
				title: `Agent (${(input.subagent_type as string) || "task"})`,
				subtitle: input.description as string | undefined,
			};
		case "bash":
			return {
				title: "Shell",
				subtitle: input.description as string | undefined,
			};
		case "edit":
			return {
				title: "Edit",
				subtitle: input.filePath
					? getFilename(input.filePath as string)
					: undefined,
			};
		case "write":
			return {
				title: "Write",
				subtitle: input.filePath
					? getFilename(input.filePath as string)
					: undefined,
			};
		case "todowrite":
			return { title: "Todos" };
		case "todoread":
			return { title: "Todos (read)" };
		default:
			return { title: tool };
	}
}
