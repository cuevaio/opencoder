import { Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import type {
	KeyProviderId,
	OAuthProviderStatus,
	SelectedProvider,
} from "#/lib/ai/model-registry.ts";
import {
	familyLabels,
	getCompatibleProviders,
	getDefaultProvider,
	getModelOption,
	getModelsByFamily,
	providerInfoMap,
} from "#/lib/ai/model-registry.ts";
import { cn } from "#/lib/utils.ts";
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "../ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";

interface ModelProviderPickerProps {
	model: string;
	provider: SelectedProvider | undefined;
	configuredKeys: Set<KeyProviderId>;
	oauthStatus: OAuthProviderStatus;
	disabled?: boolean;
	onModelChange: (
		model: string,
		provider: SelectedProvider | undefined,
	) => void;
	onProviderChange: (provider: SelectedProvider | undefined) => void;
}

type PickerStep = "model" | "provider";

export function ModelProviderPicker({
	model,
	provider,
	configuredKeys,
	oauthStatus,
	disabled = false,
	onModelChange,
	onProviderChange,
}: ModelProviderPickerProps) {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<PickerStep>("model");
	const modelsByFamily = getModelsByFamily();
	const currentModelOption = getModelOption(model);

	// Resolve the effective provider for display: use the explicit choice only if
	// it is currently available, otherwise fall back to the computed default.
	const effectiveProvider = (() => {
		if (!currentModelOption) return provider;
		const compatible = getCompatibleProviders(
			currentModelOption.id,
			configuredKeys,
			oauthStatus,
		);
		if (
			provider !== undefined &&
			compatible.some((c) => c.info.id === provider && c.available)
		) {
			return provider;
		}
		return compatible.find((c) => c.available)?.info.id;
	})();

	const providerLabel = effectiveProvider
		? providerInfoMap[effectiveProvider]?.label
		: undefined;

	// Button label: "Model · Provider" or just "Model" if no provider resolved
	const buttonLabel = currentModelOption?.label ?? model;
	const buttonSuffix = providerLabel ? ` · ${providerLabel}` : "";

	const handleOpenChange = useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			// Reset to model step when closing
			setStep("model");
		}
	}, []);

	const handleSelectModel = useCallback(
		(newModelId: string) => {
			const newModel = getModelOption(newModelId);
			if (!newModel) return;

			const compatible = getCompatibleProviders(
				newModel.id,
				configuredKeys,
				oauthStatus,
			);
			const availableProviders = compatible.filter((c) => c.available);

			// Check if current provider is still valid for the new model
			const currentStillValid =
				provider !== undefined &&
				compatible.some((c) => c.info.id === provider && c.available);

			if (currentStillValid) {
				// Same provider works — just change model
				onModelChange(newModelId, provider);
				setOpen(false);
				setStep("model");
			} else if (availableProviders.length === 1) {
				// Only one option — auto-select it
				onModelChange(newModelId, availableProviders[0].info.id);
				setOpen(false);
				setStep("model");
			} else if (availableProviders.length === 0) {
				// No providers configured — still allow selection, provider = undefined
				onModelChange(newModelId, undefined);
				setOpen(false);
				setStep("model");
			} else {
				// Multiple available — go to provider step
				onModelChange(newModelId, undefined);
				setStep("provider");
			}
		},
		[provider, configuredKeys, oauthStatus, onModelChange],
	);

	const handleSelectProvider = useCallback(
		(newProvider: SelectedProvider) => {
			onProviderChange(newProvider);
			setOpen(false);
			setStep("model");
		},
		[onProviderChange],
	);

	const handleChangeProviderForCurrentModel = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setOpen(true);
			setStep("provider");
		},
		[],
	);

	const providerCandidates = currentModelOption
		? getCompatibleProviders(currentModelOption.id, configuredKeys, oauthStatus)
		: [];

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					className="flex h-10 min-h-10 items-center gap-1 rounded-md border border-border bg-background/70 px-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 sm:h-9 sm:min-h-9 sm:text-xs md:h-8 md:min-h-8 md:text-xs"
					aria-label="Select model and provider"
					aria-haspopup="listbox"
					aria-expanded={open}
				>
					<span>
						{buttonLabel}
						{buttonSuffix && (
							<span className="text-muted-foreground/60">{buttonSuffix}</span>
						)}
					</span>
					<ChevronDown className="size-4 opacity-60 md:size-3" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(92vw,22rem)] p-0">
				{step === "model" ? (
					<ModelStep
						currentModel={model}
						currentProvider={effectiveProvider}
						modelsByFamily={modelsByFamily}
						configuredKeys={configuredKeys}
						oauthStatus={oauthStatus}
						onSelectModel={handleSelectModel}
						onChangeProvider={handleChangeProviderForCurrentModel}
					/>
				) : (
					<ProviderStep
						model={model}
						currentProvider={effectiveProvider}
						providerCandidates={providerCandidates}
						onSelectProvider={handleSelectProvider}
						onBack={() => setStep("model")}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}

// ─── Model Step ───────────────────────────────────────────

interface ModelStepProps {
	currentModel: string;
	currentProvider: SelectedProvider | undefined;
	modelsByFamily: ReturnType<typeof getModelsByFamily>;
	configuredKeys: Set<KeyProviderId>;
	oauthStatus: OAuthProviderStatus;
	onSelectModel: (modelId: string) => void;
	onChangeProvider: (e: React.MouseEvent) => void;
}

function ModelStep({
	currentModel,
	currentProvider,
	modelsByFamily,
	configuredKeys,
	oauthStatus,
	onSelectModel,
	onChangeProvider,
}: ModelStepProps) {
	const keysKnown =
		configuredKeys.size > 0 || oauthStatus.openai || oauthStatus.copilot;

	return (
		<Command>
			<CommandList>
				{Object.entries(modelsByFamily).map(([family, familyModels]) => (
					<CommandGroup key={family} heading={familyLabels[family] ?? family}>
						{familyModels.map((option) => {
							const isSelected = currentModel === option.id;

							// Compute routing badge.
							// For the selected model, show the effective provider (explicit
							// choice if available, else default). For other models, show
							// their computed default.
							const defaultProv = keysKnown
								? getDefaultProvider(option.id, configuredKeys, oauthStatus)
								: undefined;
							const compatible = keysKnown
								? getCompatibleProviders(option.id, configuredKeys, oauthStatus)
								: [];
							const badgeProv =
								isSelected &&
								currentProvider !== undefined &&
								compatible.some(
									(c) => c.info.id === currentProvider && c.available,
								)
									? currentProvider
									: defaultProv;
							const hasAny = badgeProv !== undefined;

							return (
								<CommandItem
									key={option.id}
									value={option.id}
									onSelect={() => onSelectModel(option.id)}
									disabled={keysKnown && !hasAny}
									className="flex items-center justify-between gap-2"
								>
									<div className="flex min-w-0 items-center gap-2">
										{/* Checkmark placeholder to keep alignment */}
										<span className="w-3.5 shrink-0">
											{isSelected && <Check className="size-3.5" />}
										</span>
										<span className="truncate">{option.label}</span>
									</div>
									<div className="flex shrink-0 items-center gap-1">
										{/* Routing badge when keys are known */}
										{keysKnown && (
											<span
												className={cn(
													"text-[10px]",
													hasAny ? "text-muted-foreground" : "text-red-500/70",
												)}
											>
												{hasAny && badgeProv
													? (providerInfoMap[badgeProv]?.badge ?? "")
													: "no key"}
											</span>
										)}
										{/* Arrow to change provider for the currently-selected model */}
										{isSelected &&
											currentProvider !== undefined &&
											keysKnown && (
												<button
													type="button"
													onClick={onChangeProvider}
													className="rounded p-0.5 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
													aria-label="Change provider"
												>
													<ChevronRight className="size-3" />
												</button>
											)}
									</div>
								</CommandItem>
							);
						})}
					</CommandGroup>
				))}
			</CommandList>
		</Command>
	);
}

// ─── Provider Step ────────────────────────────────────────

interface ProviderStepProps {
	model: string;
	currentProvider: SelectedProvider | undefined;
	providerCandidates: ReturnType<typeof getCompatibleProviders>;
	onSelectProvider: (provider: SelectedProvider) => void;
	onBack: () => void;
}

function ProviderStep({
	model,
	currentProvider,
	providerCandidates,
	onSelectProvider,
	onBack,
}: ProviderStepProps) {
	const modelOption = getModelOption(model);

	return (
		<div className="flex flex-col">
			{/* Header */}
			<div className="flex items-center gap-1 border-b border-border px-2 py-2">
				<button
					type="button"
					onClick={onBack}
					className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Back to model selection"
				>
					<ChevronLeft className="size-3.5" />
					Back
				</button>
				<span className="ml-1 text-xs font-medium text-foreground/80">
					{modelOption?.label ?? model}
				</span>
			</div>

			{/* Provider list */}
			<div className="py-1">
				{providerCandidates.map(({ info, available }) => {
					const isSelected = currentProvider === info.id;
					return (
						<button
							key={info.id}
							type="button"
							disabled={!available}
							onClick={() => available && onSelectProvider(info.id)}
							className={cn(
								"flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
								available
									? "cursor-pointer hover:bg-muted"
									: "cursor-default opacity-40",
								isSelected && "bg-muted/60",
							)}
						>
							<div className="flex items-center gap-2">
								<span className="w-3.5 shrink-0">
									{isSelected && <Check className="size-3.5" />}
								</span>
								<span
									className={cn(
										"text-sm",
										available ? "text-foreground" : "text-muted-foreground",
									)}
								>
									{info.label}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"text-[10px]",
										available &&
											info.badge === "direct" &&
											"text-green-600 dark:text-green-400",
										available &&
											info.badge === "oauth" &&
											"text-blue-600 dark:text-blue-400",
										available &&
											info.badge === "gateway" &&
											"text-muted-foreground",
										!available && "text-muted-foreground/50",
									)}
								>
									{available ? info.badge : "not configured"}
								</span>
							</div>
						</button>
					);
				})}
				{providerCandidates.every((c) => !c.available) && (
					<p className="px-3 py-2 text-xs text-muted-foreground">
						No providers configured.{" "}
						<a href="/dashboard" className="underline hover:text-foreground">
							Add one in Dashboard
						</a>
						.
					</p>
				)}
			</div>
		</div>
	);
}
