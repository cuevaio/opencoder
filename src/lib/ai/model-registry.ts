export const keyProviderIds = ["openai", "anthropic", "vercel"] as const;
export type KeyProviderId = (typeof keyProviderIds)[number];

export interface ModelOption {
	id: string;
	label: string;
	family: "openai" | "anthropic";
	/** Available reasoning/thinking variant names (passed to OpenCode promptAsync). */
	variants: string[];
	/** Default variant when the user hasn't explicitly chosen one. */
	defaultVariant: string;
}

export const modelOptions: ModelOption[] = [
	{
		id: "gpt-5.3-codex",
		label: "GPT-5.3 Codex",
		family: "openai",
		variants: ["none", "low", "medium", "high", "xhigh"],
		defaultVariant: "high",
	},
	{
		id: "gpt-5.2",
		label: "GPT-5.2",
		family: "openai",
		variants: ["none", "low", "medium", "high", "xhigh"],
		defaultVariant: "high",
	},
	{
		id: "claude-sonnet-4.6",
		label: "Claude Sonnet 4.6",
		family: "anthropic",
		variants: ["low", "medium", "high", "max"],
		defaultVariant: "max",
	},
	{
		id: "claude-opus-4.6",
		label: "Claude Opus 4.6",
		family: "anthropic",
		variants: ["low", "medium", "high", "max"],
		defaultVariant: "max",
	},
	{
		id: "claude-haiku-3.5",
		label: "Claude Haiku 3.5",
		family: "anthropic",
		variants: ["high", "max"],
		defaultVariant: "max",
	},
];

export const defaultModel = "gpt-5.3-codex";

export const familyLabels: Record<string, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
};

export function getModelsByFamily(): Record<string, ModelOption[]> {
	const groups: Record<string, ModelOption[]> = {};
	for (const option of modelOptions) {
		if (!groups[option.family]) groups[option.family] = [];
		groups[option.family].push(option);
	}
	return groups;
}

const modelIds = modelOptions.map((model) => model.id);
export const allowedModelIds = modelIds;

export function getModelOption(modelId: string): ModelOption | undefined {
	return modelOptions.find((model) => model.id === modelId);
}

export function isAllowedModel(modelId: string): boolean {
	return modelOptions.some((model) => model.id === modelId);
}

export function normalizeModelId(modelId: string | undefined | null): string {
	if (!modelId) return defaultModel;
	return isAllowedModel(modelId) ? modelId : defaultModel;
}

/**
 * Get the default variant for a model. Falls back to "max" if unknown.
 */
export function getDefaultVariant(modelId: string): string {
	const model = getModelOption(modelId);
	return model?.defaultVariant ?? "max";
}

/**
 * Validate a variant against a model's allowed variants.
 * Returns the variant if valid, or the model's default variant.
 */
export function normalizeVariant(
	modelId: string,
	variant: string | undefined | null,
): string {
	const model = getModelOption(modelId);
	if (!model) return "max";
	if (variant && model.variants.includes(variant)) return variant;
	return model.defaultVariant;
}
