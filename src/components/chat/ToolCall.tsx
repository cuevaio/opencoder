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

	return (
		<div className="rounded border border-border bg-muted/30 text-xs">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted press-scale sm:py-2"
			>
				<StatusIndicator status={tool.status} />
				<span className="font-medium">{info.title}</span>
				{info.subtitle && (
					<span className="min-w-0 truncate text-muted-foreground">
						{info.subtitle}
					</span>
				)}
				{tool.title && (
					<span className="min-w-0 truncate text-muted-foreground">
						{tool.title}
					</span>
				)}
				<ChevronRight
					className={cn(
						"ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
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
					<div className="space-y-2 border-t border-border px-3 py-2">
						{tool.input && Object.keys(tool.input).length > 0 && (
							<div>
								<div className="mb-1 font-medium text-muted-foreground">
									Input
								</div>
								<pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs sm:max-h-40 sm:text-[11px]">
									{JSON.stringify(tool.input, null, 2)}
								</pre>
							</div>
						)}

						{hasOutput && (
							<div>
								<div className="mb-1 font-medium text-muted-foreground">
									Output
								</div>
								<pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-xs sm:max-h-40 sm:text-[11px]">
									{tool.output}
								</pre>
							</div>
						)}

						{tool.error && (
							<div>
								<div className="mb-1 font-medium text-red-600 dark:text-red-400">
									Error
								</div>
								<pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 font-mono text-xs dark:bg-red-950 sm:max-h-40 sm:text-[11px]">
									{tool.error}
								</pre>
							</div>
						)}

						{hasChildText && (
							<div>
								<div className="mb-1 font-medium text-muted-foreground">
									Subagent response
								</div>
								<div className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs sm:max-h-40 sm:text-[11px]">
									{tool.childText}
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
