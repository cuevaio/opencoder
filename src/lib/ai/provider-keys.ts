import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentProviderKeys } from "#/db/schema.ts";
import {
	decryptSecret,
	encryptSecret,
	maskSecret,
} from "#/lib/server/encryption.ts";
import type { KeyProviderId, SelectedProvider } from "./model-registry.ts";
import { getModelOption, providerSupportsModel } from "./model-registry.ts";
import {
	getGitHubCopilotOAuthAuth,
	getOpenAIOAuthAuth,
	hasGitHubCopilotOAuth,
	hasOpenAIOAuth,
} from "./provider-oauth.ts";

interface ProviderKeyRow {
	provider: KeyProviderId;
	encryptedKey: string;
	iv: string;
	authTag: string;
	last4: string;
	updatedAt: Date;
}

type ProviderKeyMap = Partial<Record<KeyProviderId, ProviderKeyRow>>;

export interface ProviderKeyStatus {
	provider: KeyProviderId;
	configured: boolean;
	last4: string | null;
	updatedAt: string | null;
}

export interface ResolvedModelExecution {
	providerID: KeyProviderId | "github-copilot";
	modelID: string;
	fullModel: string;
	auth:
		| { type: "api"; key: string }
		| {
				type: "oauth";
				refresh: string;
				access: string;
				expires: number;
				accountId?: string;
				enterpriseUrl?: string;
		  };
}

export async function getProviderKeyMapForUser(
	userId: string,
): Promise<ProviderKeyMap> {
	const rows = await db
		.select({
			provider: agentProviderKeys.provider,
			encryptedKey: agentProviderKeys.encryptedKey,
			iv: agentProviderKeys.iv,
			authTag: agentProviderKeys.authTag,
			last4: agentProviderKeys.last4,
			updatedAt: agentProviderKeys.updatedAt,
		})
		.from(agentProviderKeys)
		.where(eq(agentProviderKeys.userId, userId));

	const map: ProviderKeyMap = {};
	for (const row of rows) {
		map[row.provider as KeyProviderId] = {
			provider: row.provider as KeyProviderId,
			encryptedKey: row.encryptedKey,
			iv: row.iv,
			authTag: row.authTag,
			last4: row.last4,
			updatedAt: row.updatedAt,
		};
	}

	return map;
}

export async function listProviderKeyStatus(
	userId: string,
): Promise<ProviderKeyStatus[]> {
	const map = await getProviderKeyMapForUser(userId);
	const providers: KeyProviderId[] = ["openai", "anthropic", "vercel"];

	return providers.map((provider) => {
		const entry = map[provider];
		return {
			provider,
			configured: !!entry,
			last4: entry?.last4 ?? null,
			updatedAt: entry?.updatedAt?.toISOString() ?? null,
		};
	});
}

export async function upsertProviderKey(
	userId: string,
	provider: KeyProviderId,
	apiKey: string,
): Promise<void> {
	const encrypted = encryptSecret(apiKey);

	await db
		.insert(agentProviderKeys)
		.values({
			userId,
			provider,
			encryptedKey: encrypted.ciphertext,
			iv: encrypted.iv,
			authTag: encrypted.authTag,
			keyVersion: encrypted.keyVersion,
			last4: maskSecret(apiKey),
		})
		.onConflictDoUpdate({
			target: [agentProviderKeys.userId, agentProviderKeys.provider],
			set: {
				encryptedKey: encrypted.ciphertext,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				keyVersion: encrypted.keyVersion,
				last4: maskSecret(apiKey),
				updatedAt: new Date(),
			},
		});
}

export async function deleteProviderKey(
	userId: string,
	provider: KeyProviderId,
): Promise<void> {
	await db
		.delete(agentProviderKeys)
		.where(
			and(
				eq(agentProviderKeys.userId, userId),
				eq(agentProviderKeys.provider, provider),
			),
		);
}

export async function canExecuteModel(
	userId: string,
	modelId: string,
	selectedProvider?: SelectedProvider,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const model = getModelOption(modelId);
	if (!model) {
		return { ok: false, message: "Unsupported model selected" };
	}

	const keyMap = await getProviderKeyMapForUser(userId);
	const hasOpenAIOauth = await hasOpenAIOAuth(userId);
	const hasCopilotOauth = await hasGitHubCopilotOAuth(userId);

	if (selectedProvider && !providerSupportsModel(selectedProvider, model.id)) {
		return {
			ok: false,
			message: `Provider ${selectedProvider} does not support model ${model.id}.`,
		};
	}

	if (selectedProvider === "github-copilot") {
		if (hasCopilotOauth) return { ok: true };
		return {
			ok: false,
			message:
				"GitHub Copilot is not connected. Connect it in Dashboard and complete GitHub device login.",
		};
	}

	if (selectedProvider === "openai-oauth") {
		if (hasOpenAIOauth) return { ok: true };
		return {
			ok: false,
			message:
				"ChatGPT subscription is not connected. Connect it in Dashboard.",
		};
	}

	if (selectedProvider === "openai-key") {
		if (keyMap.openai) return { ok: true };
		return {
			ok: false,
			message: "OpenAI API key is not configured. Add one in Dashboard.",
		};
	}

	if (selectedProvider === "anthropic-key") {
		if (keyMap.anthropic) return { ok: true };
		return {
			ok: false,
			message: "Anthropic API key is not configured. Add one in Dashboard.",
		};
	}

	if (selectedProvider === "vercel") {
		if (keyMap.vercel) return { ok: true };
		return {
			ok: false,
			message: "AI Gateway key is not configured. Add one in Dashboard.",
		};
	}

	if (model.family === "openai") {
		if (
			(providerSupportsModel("openai-oauth", model.id) && hasOpenAIOauth) ||
			(providerSupportsModel("github-copilot", model.id) && hasCopilotOauth) ||
			(providerSupportsModel("openai-key", model.id) && !!keyMap.openai) ||
			(providerSupportsModel("vercel", model.id) && !!keyMap.vercel)
		)
			return { ok: true };
		return {
			ok: false,
			message:
				"This model needs ChatGPT subscription, GitHub Copilot connection, OpenAI API key, or AI Gateway API key.",
		};
	}

	if (
		(providerSupportsModel("github-copilot", model.id) && hasCopilotOauth) ||
		(providerSupportsModel("anthropic-key", model.id) && !!keyMap.anthropic) ||
		(providerSupportsModel("vercel", model.id) && !!keyMap.vercel)
	)
		return { ok: true };

	return {
		ok: false,
		message: providerSupportsModel("github-copilot", model.id)
			? "This model needs GitHub Copilot connection, Anthropic API key, or AI Gateway API key."
			: "This model needs an Anthropic API key or an AI Gateway API key.",
	};
}

export async function resolveModelExecution(
	userId: string,
	modelId: string,
	selectedProvider?: SelectedProvider,
): Promise<ResolvedModelExecution> {
	const model = getModelOption(modelId);
	if (!model) {
		throw new Error("Unsupported model selected");
	}

	const keyMap = await getProviderKeyMapForUser(userId);

	if (selectedProvider && !providerSupportsModel(selectedProvider, model.id)) {
		throw new Error(
			`Provider ${selectedProvider} does not support model ${model.id}.`,
		);
	}

	// ─── Explicit provider selection ───────────────────────────────────────────
	// When the user has explicitly chosen a provider, honour it strictly.
	// Throw a clear error if the chosen credential is not configured — never
	// silently fall through to a different provider (e.g. OAuth instead of key).
	if (selectedProvider) {
		if (selectedProvider === "github-copilot") {
			const copilotAuth = await getGitHubCopilotOAuthAuth(userId);
			if (!copilotAuth) {
				throw new Error(
					"GitHub Copilot is not connected. Connect it in Dashboard and complete GitHub device login.",
				);
			}

			return {
				providerID: "github-copilot",
				modelID: model.id,
				fullModel: `github-copilot/${model.id}`,
				auth: copilotAuth,
			};
		}

		if (selectedProvider === "openai-oauth" && model.family === "openai") {
			const oauth = await getOpenAIOAuthAuth(userId);
			if (!oauth) {
				throw new Error(
					"ChatGPT subscription is not connected. Connect it in Dashboard.",
				);
			}
			return {
				providerID: "openai",
				modelID: model.id,
				fullModel: `openai/${model.id}`,
				auth: oauth,
			};
		}

		if (selectedProvider === "openai-key" && model.family === "openai") {
			if (!keyMap.openai) {
				throw new Error(
					"OpenAI API key is not configured. Add one in Dashboard or switch to the subscription.",
				);
			}
			return {
				providerID: "openai",
				modelID: model.id,
				fullModel: `openai/${model.id}`,
				auth: {
					type: "api",
					key: decryptSecret({
						ciphertext: keyMap.openai.encryptedKey,
						iv: keyMap.openai.iv,
						authTag: keyMap.openai.authTag,
					}),
				},
			};
		}

		if (selectedProvider === "anthropic-key" && model.family === "anthropic") {
			if (!keyMap.anthropic) {
				throw new Error(
					"Anthropic API key is not configured. Add one in Dashboard.",
				);
			}
			return {
				providerID: "anthropic",
				modelID: model.id,
				fullModel: `anthropic/${model.id}`,
				auth: {
					type: "api",
					key: decryptSecret({
						ciphertext: keyMap.anthropic.encryptedKey,
						iv: keyMap.anthropic.iv,
						authTag: keyMap.anthropic.authTag,
					}),
				},
			};
		}

		if (selectedProvider === "vercel") {
			if (!keyMap.vercel) {
				throw new Error(
					"AI Gateway key is not configured. Add one in Dashboard.",
				);
			}
			const familyPrefix = model.family;
			return {
				providerID: "vercel",
				modelID: `${familyPrefix}/${model.id}`,
				fullModel: `vercel/${familyPrefix}/${model.id}`,
				auth: {
					type: "api",
					key: decryptSecret({
						ciphertext: keyMap.vercel.encryptedKey,
						iv: keyMap.vercel.iv,
						authTag: keyMap.vercel.authTag,
					}),
				},
			};
		}
		// selectedProvider doesn't match this model's family — fall through to auto-resolve
	}

	// ─── Auto-resolve (priority-based) ─────────────────────────────────────────

	if (model.family === "openai") {
		const oauth = await getOpenAIOAuthAuth(userId);
		if (oauth && providerSupportsModel("openai-oauth", model.id)) {
			return {
				providerID: "openai",
				modelID: model.id,
				fullModel: `openai/${model.id}`,
				auth: oauth,
			};
		}

		const copilot = await getGitHubCopilotOAuthAuth(userId);
		if (copilot && providerSupportsModel("github-copilot", model.id)) {
			return {
				providerID: "github-copilot",
				modelID: model.id,
				fullModel: `github-copilot/${model.id}`,
				auth: copilot,
			};
		}

		if (keyMap.openai && providerSupportsModel("openai-key", model.id)) {
			return {
				providerID: "openai",
				modelID: model.id,
				fullModel: `openai/${model.id}`,
				auth: {
					type: "api",
					key: decryptSecret({
						ciphertext: keyMap.openai.encryptedKey,
						iv: keyMap.openai.iv,
						authTag: keyMap.openai.authTag,
					}),
				},
			};
		}

		if (keyMap.vercel && providerSupportsModel("vercel", model.id)) {
			return {
				providerID: "vercel",
				modelID: `openai/${model.id}`,
				fullModel: `vercel/openai/${model.id}`,
				auth: {
					type: "api",
					key: decryptSecret({
						ciphertext: keyMap.vercel.encryptedKey,
						iv: keyMap.vercel.iv,
						authTag: keyMap.vercel.authTag,
					}),
				},
			};
		}

		throw new Error(
			"No compatible credential found. Connect OpenAI subscription or add an OpenAI/AI Gateway key in Dashboard.",
		);
	}

	const copilot = await getGitHubCopilotOAuthAuth(userId);
	if (copilot && providerSupportsModel("github-copilot", model.id)) {
		return {
			providerID: "github-copilot",
			modelID: model.id,
			fullModel: `github-copilot/${model.id}`,
			auth: copilot,
		};
	}

	if (keyMap.anthropic && providerSupportsModel("anthropic-key", model.id)) {
		return {
			providerID: "anthropic",
			modelID: model.id,
			fullModel: `anthropic/${model.id}`,
			auth: {
				type: "api",
				key: decryptSecret({
					ciphertext: keyMap.anthropic.encryptedKey,
					iv: keyMap.anthropic.iv,
					authTag: keyMap.anthropic.authTag,
				}),
			},
		};
	}

	if (keyMap.vercel && providerSupportsModel("vercel", model.id)) {
		return {
			providerID: "vercel",
			modelID: `anthropic/${model.id}`,
			fullModel: `vercel/anthropic/${model.id}`,
			auth: {
				type: "api",
				key: decryptSecret({
					ciphertext: keyMap.vercel.encryptedKey,
					iv: keyMap.vercel.iv,
					authTag: keyMap.vercel.authTag,
				}),
			},
		};
	}

	throw new Error(
		providerSupportsModel("github-copilot", model.id)
			? "No compatible credential found. Connect GitHub Copilot or add an Anthropic/AI Gateway key in Dashboard."
			: "No compatible API key found. Add an Anthropic or AI Gateway key in Dashboard.",
	);
}
