import { useCallback, useEffect, useState } from "react";
import { modelOptions } from "#/lib/ai/model-registry.ts";
import { Button } from "../ui/button.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select.tsx";
import { Textarea } from "../ui/textarea.tsx";

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
		<div className="space-y-2">
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
				<div className="space-y-1">
					<span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
						Model
					</span>
					<Select value={model} onValueChange={setModel}>
						<SelectTrigger
							size="sm"
							className="h-9 w-full min-w-0 text-xs"
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

				<div className="space-y-1">
					<span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
						Mode
					</span>
					<div className="inline-flex h-9 rounded-lg border border-border bg-surface-1 p-0.5">
						<button
							type="button"
							onClick={() => setMode("plan")}
							disabled={isSubmitting || disabled}
							className={`rounded-md px-2.5 py-1 text-xs font-semibold press-scale disabled:opacity-50 ${
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
							disabled={isSubmitting || disabled}
							className={`rounded-md px-2.5 py-1 text-xs font-semibold press-scale disabled:opacity-50 ${
								mode === "build"
									? "bg-foreground text-background"
									: "text-muted-foreground hover:bg-muted"
							}`}
						>
							Build
						</button>
					</div>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				<Textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					rows={2}
					disabled={isSubmitting || disabled}
					className="min-h-[72px] resize-none px-3 py-2 text-sm"
				/>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						onClick={handleGitSubmit}
						disabled={isSubmitting || disabled}
						variant="outline"
						className="h-9 w-full px-2 text-[11px]"
					>
						Git: Branch + Commit + Push
					</Button>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={!text.trim() || isSubmitting || disabled}
						className="h-9 w-full"
					>
						{isSubmitting ? "..." : "Send"}
					</Button>
				</div>
			</div>
		</div>
	);
}
