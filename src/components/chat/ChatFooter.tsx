import { useCallback, useEffect, useState } from "react";
import { modelOptions } from "#/lib/ai/model-registry.ts";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select.tsx";

const GIT_BRANCH_COMMIT_PUSH_PROMPT =
	"Create a new branch for the current changes, commit with a clear conventional message, and push to origin with upstream tracking. Check git status/diff/log first, do not force push, and do not include secrets.";

interface ChatFooterProps {
	onSubmit: (text: string, mode: "plan" | "build", model: string) => void;
	isSubmitting?: boolean;
	disabled?: boolean;
	defaultMode?: "plan" | "build";
	defaultModel?: string;
	placeholder?: string;
}

export function ChatFooter({
	onSubmit,
	isSubmitting = false,
	disabled = false,
	defaultMode = "build",
	defaultModel,
	placeholder = "Describe what you want to do...",
}: ChatFooterProps) {
	const [text, setText] = useState("");
	const [mode, setMode] = useState<"plan" | "build">(defaultMode);
	const [model, setModel] = useState(defaultModel ?? modelOptions[0]?.id ?? "");

	useEffect(() => {
		if (defaultModel) {
			setModel(defaultModel);
		}
	}, [defaultModel]);

	const handleSubmit = useCallback(() => {
		if (!text.trim() || isSubmitting || disabled) return;
		onSubmit(text.trim(), mode, model);
		setText("");
	}, [text, mode, model, isSubmitting, disabled, onSubmit]);

	const handleGitSubmit = useCallback(() => {
		if (isSubmitting || disabled) return;
		onSubmit(GIT_BRANCH_COMMIT_PUSH_PROMPT, mode, model);
	}, [mode, model, isSubmitting, disabled, onSubmit]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-xs text-muted-foreground">Model:</span>
				<Select value={model} onValueChange={setModel}>
					<SelectTrigger
						size="sm"
						className="h-8 min-w-[220px] text-xs"
						disabled={isSubmitting || disabled}
					>
						<SelectValue placeholder="Select model" />
					</SelectTrigger>
					<SelectContent align="start">
						{modelOptions.map((option) => (
							<SelectItem key={option.id} value={option.id}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-end gap-2">
				<textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					rows={2}
					disabled={isSubmitting || disabled}
					className="min-h-[44px] flex-1 resize-none rounded border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none disabled:opacity-50 md:text-sm"
				/>
				<button
					type="button"
					onClick={handleGitSubmit}
					disabled={isSubmitting || disabled}
					className="min-h-[44px] rounded border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted press-scale disabled:opacity-50"
				>
					Git: Branch + Commit + Push
				</button>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!text.trim() || isSubmitting || disabled}
					className="min-h-[44px] rounded bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-80 press-scale disabled:opacity-50"
				>
					{isSubmitting ? "..." : "Send"}
				</button>
			</div>

			<div className="flex items-center gap-2">
				<span className="text-xs text-muted-foreground">Mode:</span>
				<button
					type="button"
					onClick={() => setMode("plan")}
					className={`rounded px-3 py-1.5 text-xs font-medium press-scale sm:px-2 sm:py-0.5 ${
						mode === "plan"
							? "bg-foreground text-background"
							: "text-muted-foreground hover:bg-muted"
					}`}
				>
					Plan
				</button>
				<button
					type="button"
					onClick={() => setMode("build")}
					className={`rounded px-3 py-1.5 text-xs font-medium press-scale sm:px-2 sm:py-0.5 ${
						mode === "build"
							? "bg-foreground text-background"
							: "text-muted-foreground hover:bg-muted"
					}`}
				>
					Build
				</button>
			</div>
		</div>
	);
}
