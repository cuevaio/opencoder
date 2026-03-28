import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ToolState } from "#/lib/display-items";
import { sessionEventDetailQueryOptions } from "#/lib/queries.ts";
import { extractTodosFromTool, parseTodoProgress } from "#/lib/todo-state.ts";
import { getToolInfo } from "#/lib/tool-info";
import { cn } from "#/lib/utils.ts";
import { TodoList } from "./TodoList";

interface ToolCallProps {
	tool: ToolState;
	sessionId: number;
}

function StatusIndicator({ status }: { status: ToolState["status"] }) {
	if (status === "pending") {
		return (
			<span className="inline-block h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
		);
	}
	if (status === "running") {
		return (
			<span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
		);
	}
	if (status === "completed") {
		return (
			<span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
		);
	}
	return (
		<span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500" />
	);
}

function TodoWriteToolCall({ tool }: ToolCallProps) {
	const progress = parseTodoProgress(extractTodosFromTool(tool) ?? []);

	return (
		<div className="overflow-hidden rounded-xl border border-border/80 bg-surface-1 text-xs">
			<div className="flex items-center gap-2 px-3 py-2.5">
				<StatusIndicator status={tool.status} />
				<span className="font-medium">Todos</span>
				<span className="text-muted-foreground">
					{progress.completed} of {progress.total} completed
				</span>
			</div>
			{progress.total > 0 && (
				<div className="border-t border-border/80 px-3 py-2.5">
					<TodoList todos={progress.todos} compact />
				</div>
			)}
		</div>
	);
}

export const ToolCall = memo(function ToolCall({
	tool,
	sessionId,
}: ToolCallProps) {
	if (tool.tool === "todowrite" && extractTodosFromTool(tool)) {
		return <TodoWriteToolCall tool={tool} sessionId={sessionId} />;
	}
	return <GenericToolCall tool={tool} sessionId={sessionId} />;
});

function GenericToolCall({ tool, sessionId }: ToolCallProps) {
	const [expanded, setExpanded] = useState(false);
	const info = getToolInfo(tool.tool, tool.input);
	const { data: heavyEvent, isLoading: isHeavyLoading } = useQuery({
		...sessionEventDetailQueryOptions(sessionId, tool.partId),
		enabled: expanded,
	});
	const effectiveInput =
		heavyEvent?.tool_input && typeof heavyEvent.tool_input === "object"
			? (heavyEvent.tool_input as Record<string, unknown>)
			: tool.input;
	const effectiveOutput = heavyEvent?.tool_output ?? tool.output;
	const inputJson = useMemo(() => {
		if (
			!expanded ||
			!effectiveInput ||
			Object.keys(effectiveInput).length === 0
		) {
			return null;
		}
		return JSON.stringify(effectiveInput, null, 2);
	}, [expanded, effectiveInput]);

	const hasOutput = effectiveOutput && effectiveOutput.length > 0;
	const hasChildTools = tool.childTools && tool.childTools.size > 0;
	const hasChildText = tool.childText && tool.childText.length > 0;
	const hasChildReasoning = !!tool.childReasoning?.trim();

	return (
		<div className="overflow-hidden rounded-xl border border-border/80 bg-surface-1 text-xs">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full min-w-0 items-center gap-2 px-3 py-3 text-left hover:bg-surface-2 press-scale sm:py-2.5"
			>
				<StatusIndicator status={tool.status} />
				<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
					<span className="min-w-0 truncate font-medium">{info.title}</span>
					{info.subtitle && (
						<span className="min-w-0 flex-1 truncate text-muted-foreground">
							{info.subtitle}
						</span>
					)}
					{tool.title && (
						<span className="min-w-0 flex-1 truncate text-muted-foreground">
							{tool.title}
						</span>
					)}
				</div>
				<ChevronRight
					className={cn(
						"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
						expanded && "rotate-90",
					)}
				/>
			</button>

			{expanded && (
				<div className="space-y-2 border-t border-border/80 px-3 py-2.5">
					{inputJson && (
						<div>
							<div className="mb-1 font-medium text-muted-foreground">
								Input
							</div>
							<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 font-mono text-xs sm:max-h-40 sm:text-[11px]">
								{inputJson}
							</pre>
						</div>
					)}

					{hasOutput && (
						<div>
							<div className="mb-1 font-medium text-muted-foreground">
								Output
							</div>
							<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 font-mono text-xs sm:max-h-40 sm:text-[11px]">
								{effectiveOutput}
							</pre>
						</div>
					)}

					{isHeavyLoading && !inputJson && !hasOutput && (
						<div className="text-[11px] text-muted-foreground">
							Loading tool details...
						</div>
					)}

					{tool.error && (
						<div>
							<div className="mb-1 font-medium text-red-600 dark:text-red-400">
								Error
							</div>
							<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-red-50 p-2 font-mono text-xs dark:bg-red-950 sm:max-h-40 sm:text-[11px]">
								{tool.error}
							</pre>
						</div>
					)}

					{hasChildText && (
						<div>
							<div className="mb-1 font-medium text-muted-foreground">
								Subagent response
							</div>
							<div className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 text-xs sm:max-h-40 sm:text-[11px]">
								{tool.childText}
							</div>
						</div>
					)}

					{hasChildReasoning && (
						<div>
							<div className="mb-1 font-medium text-muted-foreground">
								Subagent thinking
							</div>
							<div className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-surface-2 p-2 text-xs text-muted-foreground sm:max-h-40 sm:text-[11px]">
								{tool.childReasoning}
							</div>
						</div>
					)}

					{hasChildTools && (
						<div className="space-y-1">
							<div className="font-medium text-muted-foreground">
								Subagent tools
							</div>
							{Array.from(tool.childTools?.values() ?? []).map((childTool) => (
								<ToolCall
									key={childTool.id}
									tool={childTool}
									sessionId={sessionId}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
