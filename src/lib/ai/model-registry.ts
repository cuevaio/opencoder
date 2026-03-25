export const keyProviderIds = ["openai", "anthropic", "vercel"] as const;
export type KeyProviderId = (typeof keyProviderIds)[number];

export interface ModelOption {
	id: string;
	label: string;
	family: "openai" | "anthropic";
}

export const modelOptions: ModelOption[] = [
	{
		id: "gpt-5.3-codex",
		label: "GPT-5.3 Codex",
		family: "openai",
	},
	{
		id: "gpt-5.2",
		label: "GPT-5.2",
		family: "openai",
	},
	{
		id: "claude-sonnet-4.5",
		label: "Claude Sonnet 4.5",
		family: "anthropic",
	},
	{
		id: "claude-opus-4.5",
		label: "Claude Opus 4.5",
		family: "anthropic",
	},
];

export const defaultModel = "gpt-5.3-codex";

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
