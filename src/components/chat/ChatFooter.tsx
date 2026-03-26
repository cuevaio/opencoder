import {
	Check,
	ChevronDown,
	Paperclip,
	SendHorizontal,
	Square,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

interface ChatFooterProps {
	onSubmit: (
		text: string,
		mode: "plan" | "build",
		model: string,
		variant: string,
		imageUrls: Array<{ url: string; mime: string; filename?: string }>,
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

type PendingImage = {
	id: string;
	url?: string;
	mime: string;
	filename: string;
	localPreviewUrl: string;
	status: "uploading" | "ready" | "error";
	errorMessage?: string;
};

const MAX_IMAGE_SIZE = 4.5 * 1024 * 1024;
const MAX_IMAGES = 10;
const ALLOWED_IMAGE_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
]);

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
	const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [draggingImages, setDraggingImages] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

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
		if (pendingImages.some((img) => img.status === "uploading")) return;
		const imageUrls = pendingImages
			.filter((img) => img.status === "ready" && img.url)
			.map((img) => ({
				url: img.url as string,
				mime: img.mime,
				filename: img.filename,
			}));
		onSubmit(text.trim(), mode, model, variant, imageUrls);
		for (const img of pendingImages) {
			URL.revokeObjectURL(img.localPreviewUrl);
		}
		setText("");
		setPendingImages([]);
		setUploadError(null);
	}, [
		text,
		mode,
		model,
		variant,
		isSubmitting,
		disabled,
		isWorking,
		onSubmit,
		pendingImages,
	]);

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

	const uploadImage = useCallback(async (file: File) => {
		if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
			setUploadError("Unsupported image type. Allowed: PNG, JPEG, GIF, WebP.");
			return;
		}
		if (file.size > MAX_IMAGE_SIZE) {
			setUploadError("File too large. Maximum image size is 4.5MB.");
			return;
		}

		const localPreviewUrl = URL.createObjectURL(file);
		const imageId = globalThis.crypto.randomUUID();
		setPendingImages((prev) => [
			...prev,
			{
				id: imageId,
				mime: file.type,
				filename: file.name,
				localPreviewUrl,
				status: "uploading",
			},
		]);

		try {
			const formData = new FormData();
			formData.append("file", file);
			const resp = await fetch("/api/upload/image", {
				method: "POST",
				body: formData,
			});
			const data = (await resp.json()) as {
				url?: string;
				error?: string;
			};

			if (!resp.ok || !data.url) {
				throw new Error(data.error || "Upload failed");
			}

			setPendingImages((prev) =>
				prev.map((img) =>
					img.id === imageId
						? {
								...img,
								url: data.url,
								status: "ready",
								errorMessage: undefined,
							}
						: img,
				),
			);
			setUploadError(null);
		} catch (error) {
			setPendingImages((prev) =>
				prev.map((img) =>
					img.id === imageId
						? {
								...img,
								status: "error",
								errorMessage:
									error instanceof Error ? error.message : "Upload failed",
							}
						: img,
				),
			);
		}
	}, []);

	const handleFiles = useCallback(
		async (files: FileList | File[]) => {
			const currentCount = pendingImages.length;
			const fileArray = Array.from(files).filter((file) =>
				file.type.startsWith("image/"),
			);
			const available = Math.max(0, MAX_IMAGES - currentCount);
			if (available <= 0) {
				setUploadError(
					`You can attach up to ${MAX_IMAGES} images per message.`,
				);
				return;
			}
			for (const file of fileArray.slice(0, available)) {
				await uploadImage(file);
			}
			if (fileArray.length > available) {
				setUploadError(`Only ${MAX_IMAGES} images are allowed per message.`);
			}
		},
		[pendingImages.length, uploadImage],
	);

	const removePendingImage = useCallback((id: string) => {
		setPendingImages((prev) => {
			const target = prev.find((img) => img.id === id);
			if (target) {
				URL.revokeObjectURL(target.localPreviewUrl);
			}
			return prev.filter((img) => img.id !== id);
		});
	}, []);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
			const imageFiles = Array.from(e.clipboardData.items)
				.filter((item) => item.type.startsWith("image/"))
				.map((item) => item.getAsFile())
				.filter((f): f is File => f instanceof File);
			if (imageFiles.length === 0) return;
			e.preventDefault();
			handleFiles(imageFiles);
		},
		[handleFiles],
	);

	const handleFileInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (!e.target.files?.length) return;
			handleFiles(e.target.files);
			e.target.value = "";
		},
		[handleFiles],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLTextAreaElement>) => {
			e.preventDefault();
			setDraggingImages(false);
			if (!e.dataTransfer.files?.length) return;
			handleFiles(e.dataTransfer.files);
		},
		[handleFiles],
	);

	useEffect(() => {
		return () => {
			for (const img of pendingImages) {
				URL.revokeObjectURL(img.localPreviewUrl);
			}
		};
	}, [pendingImages]);

	const currentModelOption = getModelOption(model);
	const availableVariants = currentModelOption?.variants ?? [];

	// Keys are being loaded — treat as unknown
	const keysKnown = configuredKeys.size > 0;

	return (
		<div className="space-y-2">
			<div
				className={cn(
					"relative rounded-md transition-colors",
					draggingImages && "ring-2 ring-ring",
				)}
			>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/gif,image/webp"
					multiple
					onChange={handleFileInputChange}
					className="hidden"
				/>
				{pendingImages.length > 0 ? (
					<div className="mb-2 flex flex-wrap gap-2 rounded-md border border-border/80 bg-surface-1 p-2">
						{pendingImages.map((img) => (
							<div
								key={img.id}
								className="relative h-16 w-16 overflow-hidden rounded-md border border-border"
							>
								<img
									src={img.localPreviewUrl}
									alt={img.filename}
									className={cn(
										"h-full w-full object-cover",
										img.status !== "ready" && "opacity-70",
									)}
								/>
								<button
									type="button"
									onClick={() => removePendingImage(img.id)}
									className="absolute top-1 right-1 rounded bg-black/70 p-0.5 text-white"
									aria-label={`Remove ${img.filename}`}
								>
									<X className="size-3" />
								</button>
								{img.status === "uploading" ? (
									<div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[10px] text-white">
										uploading
									</div>
								) : img.status === "error" ? (
									<div className="absolute inset-x-0 bottom-0 bg-red-600 px-1 py-0.5 text-center text-[10px] text-white">
										error
									</div>
								) : null}
							</div>
						))}
					</div>
				) : null}
				<Textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					onDragOver={(e) => {
						e.preventDefault();
						if (e.dataTransfer.types.includes("Files")) {
							setDraggingImages(true);
						}
					}}
					onDragLeave={() => setDraggingImages(false)}
					onDrop={handleDrop}
					placeholder={placeholder}
					rows={2}
					disabled={isSubmitting || disabled || isWorking}
					className="min-h-[92px] resize-none px-3 pb-12 text-sm"
				/>
				{uploadError ? (
					<div className="mt-2 text-xs text-red-500">{uploadError}</div>
				) : null}
				{draggingImages ? (
					<div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-md border-2 border-dashed border-ring bg-background/70 text-xs font-medium text-foreground">
						Drop images to attach
					</div>
				) : null}
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

						{/* Advanced options popover (thinking, mode) */}
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
							</PopoverContent>
						</Popover>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={isSubmitting || disabled || isWorking}
							onClick={() => fileInputRef.current?.click()}
							className="h-8 min-h-8 w-8 min-w-8 rounded-md text-muted-foreground"
							aria-label="Attach images"
						>
							<Paperclip className="size-3.5" />
						</Button>
					</div>

					{/* Right side: send / stop */}
					<Button
						type="button"
						onClick={isWorking ? handleCancel : handleSubmit}
						disabled={
							isWorking
								? isSubmitting || disabled || !onCancel
								: !text.trim() ||
									isSubmitting ||
									disabled ||
									pendingImages.some((img) => img.status === "uploading")
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
