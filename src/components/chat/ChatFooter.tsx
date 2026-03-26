import { Check, ChevronDown, SendHorizontal, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { KeyProviderId } from "#/lib/ai/model-registry.ts";
import {
	familyLabels,
	getDefaultVariant,
	getModelOption,
	getModelsByFamily,
} from "#/lib/ai/model-registry.ts";
import { cn } from "#/lib/utils.ts";
import { Button } from "../ui/button.tsx";
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "../ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { Textarea } from "../ui/textarea.tsx";

const CREATE_PR_PROMPT = "create pr";

interface ChatFooterProps {
	onSubmit: (
		text: string,
		mode: "plan" | "build",
		model: string,
		variant: string,
	) => void;
	onCancel?: () => void;
	/** Called whenever model, variant, or mode changes so the parent can persist it. */
	onSettingsChange?: (settings: {
		model: string;
		variant: string;
		mode: "plan" | "build";
	}) => void;
	isWorking?: boolean;
	isSubmitting?: boolean;
	disabled?: boolean;
	defaultMode?: "plan" | "build";
	defaultModel?: string;
	defaultVariant?: string;
	placeholder?: string;
	configuredKeys?: Set<KeyProviderId>;
}

function getRoutingInfo(
	family: string,
	configuredKeys: Set<KeyProviderId>,
): { label: string; available: boolean; kind: "direct" | "gateway" | "none" } {
	if (configuredKeys.has(family as KeyProviderId)) {
		return { label: "direct", available: true, kind: "direct" };
	}
	if (configuredKeys.has("vercel")) {
		return { label: "via gateway", available: true, kind: "gateway" };
	}
	return { label: "no key", available: false, kind: "none" };
}

export function ChatFooter({
	onSubmit,
	onCancel,
	onSettingsChange,
	isWorking = false,
	isSubmitting = false,
	disabled = false,
	defaultMode = "build",
	defaultModel,
	defaultVariant,
	placeholder = "Describe what you want to do...",
	configuredKeys = new Set<KeyProviderId>(),
}: ChatFooterProps) {
	const modelsByFamily = getModelsByFamily();

	const [text, setText] = useState("");
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [mode, setMode] = useState<"plan" | "build">(defaultMode);
	const [model, setModel] = useState(
		defaultModel ?? Object.values(modelsByFamily)[0]?.[0]?.id ?? "",
	);
	const [variant, setVariant] = useState(
		defaultVariant ?? getDefaultVariant(model),
	);

	useEffect(() => {
		if (defaultModel) {
			setModel(defaultModel);
		}
	}, [defaultModel]);

	useEffect(() => {
		if (defaultVariant) {
			setVariant(defaultVariant);
		}
	}, [defaultVariant]);

	// Notify parent whenever settings change so it can persist them
	// biome-ignore lint/correctness/useExhaustiveDependencies: onSettingsChange is intentionally excluded to avoid infinite loops when parent re-renders
	useEffect(() => {
		onSettingsChange?.({ model, variant, mode });
	}, [model, variant, mode]);

	// When model changes, reset variant to the new model's default
	// (unless the current variant is still valid for the new model)
	const handleModelChange = useCallback(
		(newModel: string) => {
			setModel(newModel);
			const option = getModelOption(newModel);
			if (option && !option.variants.includes(variant)) {
				setVariant(option.defaultVariant);
			}
			setModelPickerOpen(false);
		},
		[variant],
	);

	const handleSubmit = useCallback(() => {
		if (!text.trim() || isSubmitting || disabled || isWorking) return;
		onSubmit(text.trim(), mode, model, variant);
		setText("");
	}, [text, mode, model, variant, isSubmitting, disabled, isWorking, onSubmit]);

	const handleCreatePrSubmit = useCallback(() => {
		if (isSubmitting || disabled || isWorking) return;
		onSubmit(CREATE_PR_PROMPT, mode, model, variant);
		setAdvancedOpen(false);
	}, [mode, model, variant, isSubmitting, disabled, isWorking, onSubmit]);

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

	const currentModelOption = getModelOption(model);
	const availableVariants = currentModelOption?.variants ?? [];

	// Keys are being loaded — treat as unknown
	const keysKnown = configuredKeys.size > 0;

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
					{/* Left side: model picker + advanced options */}
					<div className="pointer-events-auto flex items-center gap-1">
						{/* Inline model label / picker trigger */}
						<Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
							<PopoverTrigger asChild>
								<button
									type="button"
									disabled={isSubmitting || disabled}
									className="flex h-8 min-h-8 items-center gap-1 rounded-md border border-border bg-background/70 px-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
									aria-label="Select model"
									aria-haspopup="listbox"
									aria-expanded={modelPickerOpen}
								>
									{currentModelOption?.label ?? model}
									<ChevronDown className="size-3 opacity-60" />
								</button>
							</PopoverTrigger>
							<PopoverContent align="start" className="w-[min(92vw,20rem)] p-0">
								<Command>
									<CommandList>
										{Object.entries(modelsByFamily).map(
											([family, familyModels]) => (
												<CommandGroup
													key={family}
													heading={familyLabels[family] ?? family}
												>
													{familyModels.map((option) => {
														const routing = keysKnown
															? getRoutingInfo(family, configuredKeys)
															: null;
														const isSelected = model === option.id;
														const isDisabled =
															routing !== null && !routing.available;

														return (
															<CommandItem
																key={option.id}
																value={option.id}
																onSelect={() =>
																	!isDisabled && handleModelChange(option.id)
																}
																disabled={isDisabled}
																className="flex items-center justify-between"
															>
																<div className="flex items-center gap-2">
																	{isSelected ? (
																		<Check className="size-3.5 shrink-0" />
																	) : (
																		<span className="size-3.5 shrink-0" />
																	)}
																	<span>{option.label}</span>
																</div>
																{routing !== null && (
																	<span
																		className={cn(
																			"ml-2 shrink-0 text-[10px]",
																			routing.kind === "direct" &&
																				"text-green-600 dark:text-green-400",
																			routing.kind === "gateway" &&
																				"text-muted-foreground",
																			routing.kind === "none" &&
																				"text-red-500/70",
																		)}
																	>
																		{routing.label}
																	</span>
																)}
															</CommandItem>
														);
													})}
												</CommandGroup>
											),
										)}
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>

						{/* Advanced options popover (thinking, mode, create PR, end session) */}
						<Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									disabled={isSubmitting || disabled}
									className="h-8 min-h-8 w-8 min-w-8 rounded-md text-muted-foreground"
									aria-label="Open advanced composer options"
									aria-haspopup="dialog"
									aria-expanded={advancedOpen}
								>
									{/* three dots */}
									<span className="flex items-center gap-[3px]">
										<span className="size-1 rounded-full bg-current" />
										<span className="size-1 rounded-full bg-current" />
										<span className="size-1 rounded-full bg-current" />
									</span>
								</Button>
							</PopoverTrigger>
							<PopoverContent
								align="start"
								className="overlay-content w-[min(92vw,22rem)] space-y-3"
							>
								{availableVariants.length > 0 && (
									<div className="space-y-1">
										<span className="text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
											Thinking
										</span>
										<div className="flex flex-wrap gap-1">
											{availableVariants.map((v) => (
												<button
													key={v}
													type="button"
													onClick={() => setVariant(v)}
													disabled={isSubmitting || disabled || isWorking}
													className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium press-scale disabled:opacity-50 ${
														variant === v
															? "bg-foreground text-background"
															: "bg-surface-1 text-muted-foreground hover:bg-muted"
													}`}
												>
													{v}
												</button>
											))}
										</div>
									</div>
								)}

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
							</PopoverContent>
						</Popover>
					</div>

					{/* Right side: send / stop */}
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
