export const keyProviderIds = ["openai", "anthropic", "vercel"] as const;
export type KeyProviderId = (typeof keyProviderIds)[number];

/**
 * A specific access path the user can explicitly select for running a model.
 * - "openai-oauth"   → ChatGPT Subscription (device-flow OAuth)
 * - "openai-key"     → OpenAI direct API key
 * - "anthropic-key"  → Anthropic direct API key
 * - "vercel"         → Vercel AI Gateway (works for both model families)
 */
export type SelectedProvider =
	| "openai-oauth"
	| "openai-key"
	| "anthropic-key"
	| "vercel";

export const selectedProviderIds: SelectedProvider[] = [
	"openai-oauth",
	"openai-key",
	"anthropic-key",
	"vercel",
];

export function isValidSelectedProvider(v: unknown): v is SelectedProvider {
	return typeof v === "string" && (selectedProviderIds as string[]).includes(v);
}

export interface ProviderInfo {
	id: SelectedProvider;
	label: string;
	/** Short badge shown in the picker ("oauth" | "direct" | "gateway"). */
	badge: string;
	/** Which model families this provider can serve. */
	families: Array<"openai" | "anthropic">;
}

export const providerInfoMap: Record<SelectedProvider, ProviderInfo> = {
	"openai-oauth": {
		id: "openai-oauth",
		label: "ChatGPT Subscription",
		badge: "oauth",
		families: ["openai"],
	},
	"openai-key": {
		id: "openai-key",
		label: "OpenAI API key",
		badge: "direct",
		families: ["openai"],
	},
	"anthropic-key": {
		id: "anthropic-key",
		label: "Anthropic API key",
		badge: "direct",
		families: ["anthropic"],
	},
	vercel: {
		id: "vercel",
		label: "AI Gateway",
		badge: "gateway",
		families: ["openai", "anthropic"],
	},
};

/**
 * Returns the list of providers compatible with a model family,
 * annotated with whether the user has that provider configured.
 */
export function getCompatibleProviders(
	family: "openai" | "anthropic",
	configuredKeys: Set<KeyProviderId>,
	oauthConnected: boolean,
): Array<{ info: ProviderInfo; available: boolean }> {
	const candidates: SelectedProvider[] =
		family === "openai"
			? ["openai-oauth", "openai-key", "vercel"]
			: ["anthropic-key", "vercel"];

	return candidates.map((id) => {
		let available = false;
		if (id === "openai-oauth") available = oauthConnected;
		else if (id === "openai-key") available = configuredKeys.has("openai");
		else if (id === "anthropic-key")
			available = configuredKeys.has("anthropic");
		else if (id === "vercel") available = configuredKeys.has("vercel");
		return { info: providerInfoMap[id], available };
	});
}

/**
 * Returns the first available (configured) provider for a given model family,
 * following the same priority as the server's auto-resolve logic.
 */
export function getDefaultProvider(
	family: "openai" | "anthropic",
	configuredKeys: Set<KeyProviderId>,
	oauthConnected: boolean,
): SelectedProvider | undefined {
	const candidates = getCompatibleProviders(
		family,
		configuredKeys,
		oauthConnected,
	);
	return candidates.find((c) => c.available)?.info.id;
}

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
		variants: ["none", "low", "medium", "high", "max"],
		defaultVariant: "max",
	},
	{
		id: "claude-opus-4.6",
		label: "Claude Opus 4.6",
		family: "anthropic",
		variants: ["none", "low", "medium", "high", "max"],
		defaultVariant: "max",
	},
	{
		id: "claude-haiku-3.5",
		label: "Claude Haiku 3.5",
		family: "anthropic",
		variants: ["none", "high", "max"],
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
