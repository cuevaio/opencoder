import { SendHorizontal, SlidersHorizontal, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { modelOptions } from "#/lib/ai/model-registry.ts";
import { Button } from "../ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select.tsx";
import { Textarea } from "../ui/textarea.tsx";

const CREATE_PR_PROMPT = "create pr";

interface ChatFooterProps {
	onSubmit: (text: string, mode: "plan" | "build", model: string) => void;
	onCancel?: () => void;
	onEndSession?: () => void;
	isWorking?: boolean;
	isSubmitting?: boolean;
	disabled?: boolean;
	defaultMode?: "plan" | "build";
	defaultModel?: string;
	placeholder?: string;
}

export function ChatFooter({
	onSubmit,
	onCancel,
	onEndSession,
	isWorking = false,
	isSubmitting = false,
	disabled = false,
	defaultMode = "build",
	defaultModel,
	placeholder = "Describe what you want to do...",
}: ChatFooterProps) {
	const [text, setText] = useState("");
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [mode, setMode] = useState<"plan" | "build">(defaultMode);
	const [model, setModel] = useState(defaultModel ?? modelOptions[0]?.id ?? "");

	useEffect(() => {
		if (defaultModel) {
			setModel(defaultModel);
		}
	}, [defaultModel]);

	const handleSubmit = useCallback(() => {
		if (!text.trim() || isSubmitting || disabled || isWorking) return;
		onSubmit(text.trim(), mode, model);
		setText("");
	}, [text, mode, model, isSubmitting, disabled, isWorking, onSubmit]);

	const handleCreatePrSubmit = useCallback(() => {
		if (isSubmitting || disabled || isWorking) return;
		onSubmit(CREATE_PR_PROMPT, mode, model);
		setAdvancedOpen(false);
	}, [mode, model, isSubmitting, disabled, isWorking, onSubmit]);

	const handleCancel = useCallback(() => {
		if (!isWorking || !onCancel || disabled || isSubmitting) return;
		onCancel();
	}, [isWorking, onCancel, disabled, isSubmitting]);

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
			<div className="relative">
				<Textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					rows={2}
					disabled={isSubmitting || disabled || isWorking}
					className="min-h-[92px] resize-none px-3 pb-12 text-sm"
				/>
				<div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between">
					<Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								disabled={isSubmitting || disabled}
								className="pointer-events-auto h-8 min-h-8 w-8 min-w-8 rounded-md"
								aria-label="Open advanced composer options"
								aria-haspopup="dialog"
								aria-expanded={advancedOpen}
							>
								<SlidersHorizontal className="size-4" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							className="overlay-content w-[min(92vw,24rem)] space-y-3"
						>
							<div className="space-y-1">
								<span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
									Model
								</span>
								<Select value={model} onValueChange={setModel}>
									<SelectTrigger
										size="sm"
										className="h-9 w-full min-w-0 text-xs"
										disabled={isSubmitting || disabled || isWorking}
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
								<div className="inline-flex h-9 w-full rounded-lg border border-border bg-surface-1 p-0.5">
									<button
										type="button"
										onClick={() => setMode("plan")}
										disabled={isSubmitting || disabled || isWorking}
										aria-pressed={mode === "plan"}
										className={`flex-1 rounded-md px-2.5 py-1 text-xs font-semibold press-scale disabled:opacity-50 ${
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
										disabled={isSubmitting || disabled || isWorking}
										aria-pressed={mode === "build"}
										className={`flex-1 rounded-md px-2.5 py-1 text-xs font-semibold press-scale disabled:opacity-50 ${
											mode === "build"
												? "bg-foreground text-background"
												: "text-muted-foreground hover:bg-muted"
										}`}
									>
										Build
									</button>
								</div>
							</div>

							<Button
								type="button"
								onClick={handleCreatePrSubmit}
								disabled={isSubmitting || disabled || isWorking}
								variant="outline"
								className="h-10 w-full px-2 text-[11px]"
							>
								Create PR
							</Button>

							{onEndSession && (
								<Button
									type="button"
									onClick={() => {
										onEndSession();
										setAdvancedOpen(false);
									}}
									variant="ghost"
									className="h-10 w-full justify-start px-2 text-[11px] text-muted-foreground"
								>
									End session
								</Button>
							)}
						</PopoverContent>
					</Popover>

					<Button
						type="button"
						onClick={isWorking ? handleCancel : handleSubmit}
						disabled={
							isWorking
								? isSubmitting || disabled || !onCancel
								: !text.trim() || isSubmitting || disabled
						}
						className="pointer-events-auto h-8 min-h-8 w-8 min-w-8 rounded-md p-0"
						aria-label={isWorking ? "Stop current run" : "Send message"}
					>
						{isWorking ? (
							<Square className="size-3.5 fill-current" />
						) : isSubmitting ? (
							<span className="text-[10px]">...</span>
						) : (
							<SendHorizontal className="size-3.5" />
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
