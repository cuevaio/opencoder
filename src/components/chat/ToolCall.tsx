import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ToolState } from "#/lib/display-items";
import { getToolInfo } from "#/lib/tool-info";
import { cn } from "#/lib/utils.ts";

interface ToolCallProps {
	tool: ToolState;
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

export function ToolCall({ tool }: ToolCallProps) {
	const [expanded, setExpanded] = useState(false);
	const info = getToolInfo(tool.tool, tool.input);

	const hasOutput = tool.output && tool.output.length > 0;
	const hasChildTools = tool.childTools && tool.childTools.size > 0;
	const hasChildText = tool.childText && tool.childText.length > 0;
	const hasChildReasoning = !!tool.childReasoning?.trim();

	return (
		<div className="rounded-xl border border-border/80 bg-surface-1 text-xs">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full flex-wrap items-center gap-2 px-3 py-3 text-left hover:bg-surface-2 press-scale sm:py-2.5"
			>
				<StatusIndicator status={tool.status} />
				<span className="font-medium [overflow-wrap:anywhere]">
					{info.title}
				</span>
				{info.subtitle && (
					<span className="min-w-0 truncate text-muted-foreground [overflow-wrap:anywhere]">
						{info.subtitle}
					</span>
				)}
				{tool.title && (
					<span className="min-w-0 truncate text-muted-foreground [overflow-wrap:anywhere]">
						{tool.title}
					</span>
				)}
				<ChevronRight
					className={cn(
						"ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
						expanded && "rotate-90",
					)}
				/>
			</button>

			{/* Smooth expand/collapse using CSS grid-rows trick */}
			<div
				className={cn(
					"grid transition-[grid-template-rows] duration-200 ease-out",
					expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="overflow-hidden">
					<div className="space-y-2 border-t border-border/80 px-3 py-2.5">
						{tool.input && Object.keys(tool.input).length > 0 && (
							<div>
								<div className="mb-1 font-medium text-muted-foreground">
									Input
								</div>
								<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 font-mono text-xs sm:max-h-40 sm:text-[11px]">
									{JSON.stringify(tool.input, null, 2)}
								</pre>
							</div>
						)}

						{hasOutput && (
							<div>
								<div className="mb-1 font-medium text-muted-foreground">
									Output
								</div>
								<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-2 font-mono text-xs sm:max-h-40 sm:text-[11px]">
									{tool.output}
								</pre>
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
								{Array.from(tool.childTools?.values() ?? []).map(
									(childTool) => (
										<ToolCall key={childTool.id} tool={childTool} />
									),
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
