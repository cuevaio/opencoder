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
	| "github-copilot"
	| "openai-key"
	| "anthropic-key"
	| "vercel";

export const selectedProviderIds: SelectedProvider[] = [
	"openai-oauth",
	"github-copilot",
	"openai-key",
	"anthropic-key",
	"vercel",
];

export interface OAuthProviderStatus {
	openai: boolean;
	copilot: boolean;
}

export function isValidSelectedProvider(v: unknown): v is SelectedProvider {
	return typeof v === "string" && (selectedProviderIds as string[]).includes(v);
}

export interface ProviderInfo {
	id: SelectedProvider;
	label: string;
	/** Short badge shown in the picker ("oauth" | "direct" | "gateway"). */
	badge: string;
}

export const providerInfoMap: Record<SelectedProvider, ProviderInfo> = {
	"openai-oauth": {
		id: "openai-oauth",
		label: "ChatGPT Subscription",
		badge: "oauth",
	},
	"openai-key": {
		id: "openai-key",
		label: "OpenAI API key",
		badge: "direct",
	},
	"github-copilot": {
		id: "github-copilot",
		label: "GitHub Copilot",
		badge: "oauth",
	},
	"anthropic-key": {
		id: "anthropic-key",
		label: "Anthropic API key",
		badge: "direct",
	},
	vercel: {
		id: "vercel",
		label: "AI Gateway",
		badge: "gateway",
	},
};

/**
 * Returns providers compatible with a specific model,
 * annotated with whether each provider is currently configured.
 */
export function getCompatibleProviders(
	modelId: string,
	configuredKeys: Set<KeyProviderId>,
	oauthStatus: OAuthProviderStatus,
): Array<{ info: ProviderInfo; available: boolean }> {
	const candidates = getCompatibleProviderIds(modelId);

	return candidates.map((id) => {
		let available = false;
		if (id === "openai-oauth") available = oauthStatus.openai;
		else if (id === "github-copilot") available = oauthStatus.copilot;
		else if (id === "openai-key") available = configuredKeys.has("openai");
		else if (id === "anthropic-key")
			available = configuredKeys.has("anthropic");
		else if (id === "vercel") available = configuredKeys.has("vercel");
		return { info: providerInfoMap[id], available };
	});
}

/**
 * Returns the first available (configured) provider for a given model,
 * following the same priority as the server's auto-resolve logic.
 */
export function getDefaultProvider(
	modelId: string,
	configuredKeys: Set<KeyProviderId>,
	oauthStatus: OAuthProviderStatus,
): SelectedProvider | undefined {
	const candidates = getCompatibleProviders(
		modelId,
		configuredKeys,
		oauthStatus,
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
		id: "gpt-5.4",
		label: "GPT-5.4",
		family: "openai",
		variants: ["none", "low", "medium", "high", "xhigh"],
		defaultVariant: "high",
	},
	{
		id: "gpt-5.4-mini",
		label: "GPT-5.4 Mini",
		family: "openai",
		variants: ["none", "low", "medium", "high", "xhigh"],
		defaultVariant: "high",
	},
	{
		id: "gpt-5.3-codex",
		label: "GPT-5.3 Codex",
		family: "openai",
		variants: ["none", "low", "medium", "high", "xhigh"],
		defaultVariant: "high",
	},
	{
		id: "gpt-5.3-codex-spark",
		label: "GPT-5.3 Codex Spark",
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
		id: "gpt-5-mini",
		label: "GPT-5 Mini",
		family: "openai",
		variants: ["none", "low", "medium", "high", "xhigh"],
		defaultVariant: "high",
	},
	{
		id: "gpt-4.1",
		label: "GPT-4.1",
		family: "openai",
		variants: ["none"],
		defaultVariant: "none",
	},
	{
		id: "gpt-4o",
		label: "GPT-4o",
		family: "openai",
		variants: ["none"],
		defaultVariant: "none",
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
		id: "claude-haiku-4.5",
		label: "Claude Haiku 4.5",
		family: "anthropic",
		variants: ["none", "high", "max"],
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

const modelById: Record<string, ModelOption> = Object.fromEntries(
	modelOptions.map((model) => [model.id, model]),
);

/**
 * Per-provider model availability.
 *
 * `openai-oauth` follows the Codex OAuth allowlist in opencode's
 * `plugin/codex.ts` (intersected with models exposed in this app).
 *
 * `github-copilot` follows the dedicated Copilot provider path in
 * opencode's `provider/provider.ts`.
 */
const providerModelIds: Record<SelectedProvider, string[]> = {
	"openai-oauth": [
		"gpt-5.4",
		"gpt-5.4-mini",
		"gpt-5.3-codex",
		"gpt-5.3-codex-spark",
	],
	"github-copilot": ["gpt-5-mini", "claude-haiku-4.5", "gpt-4.1", "gpt-4o"],
	"openai-key": [
		"gpt-5.4",
		"gpt-5.4-mini",
		"gpt-5.3-codex",
		"gpt-5.3-codex-spark",
		"gpt-5-mini",
		"gpt-5.2",
		"gpt-4.1",
		"gpt-4o",
	],
	"anthropic-key": [
		"claude-haiku-4.5",
		"claude-haiku-3.5",
		"claude-sonnet-4.6",
		"claude-opus-4.6",
	],
	vercel: modelOptions.map((model) => model.id),
};

export function getModelsForProvider(
	provider: SelectedProvider,
): ModelOption[] {
	return providerModelIds[provider]
		.map((id) => modelById[id])
		.filter((model): model is ModelOption => !!model);
}

export function getCompatibleProviderIds(modelId: string): SelectedProvider[] {
	return selectedProviderIds.filter((provider) =>
		providerModelIds[provider].includes(modelId),
	);
}

export function providerSupportsModel(
	provider: SelectedProvider,
	modelId: string,
): boolean {
	return providerModelIds[provider].includes(modelId);
}

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
	return modelById[modelId];
}

export function isAllowedModel(modelId: string): boolean {
	return !!modelById[modelId];
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
