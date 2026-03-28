import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentProviderKeys } from "#/db/schema.ts";
import {
	decryptSecret,
	encryptSecret,
	maskSecret,
} from "#/lib/server/encryption.ts";
import type { KeyProviderId, SelectedProvider } from "./model-registry.ts";
import { getModelOption } from "./model-registry.ts";
import { getOpenAIOAuthAuth, hasOpenAIOAuth } from "./provider-oauth.ts";

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
	providerID: KeyProviderId;
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
): Promise<{ ok: true } | { ok: false; message: string }> {
	const model = getModelOption(modelId);
	if (!model) {
		return { ok: false, message: "Unsupported model selected" };
	}

	const keyMap = await getProviderKeyMapForUser(userId);
	const hasOpenAIOauth = await hasOpenAIOAuth(userId);
	if (model.family === "openai") {
		if (hasOpenAIOauth || keyMap.openai || keyMap.vercel) return { ok: true };
		return {
			ok: false,
			message:
				"This model needs an OpenAI subscription connection, OpenAI API key, or AI Gateway API key.",
		};
	}

	if (keyMap.anthropic || keyMap.vercel) return { ok: true };
	return {
		ok: false,
		message: "This model needs an Anthropic API key or an AI Gateway API key.",
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

	// ─── Explicit provider selection ───────────────────────────────────────────
	// When the user has explicitly chosen a provider, try it first.
	// If the chosen provider is not configured, fall through to auto-resolve.
	if (selectedProvider) {
		if (selectedProvider === "openai-oauth" && model.family === "openai") {
			const oauth = await getOpenAIOAuthAuth(userId);
			if (oauth) {
				return {
					providerID: "openai",
					modelID: model.id,
					fullModel: `openai/${model.id}`,
					auth: oauth,
				};
			}
			// OAuth not actually connected — fall through
		}

		if (
			selectedProvider === "openai-key" &&
			model.family === "openai" &&
			keyMap.openai
		) {
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

		if (
			selectedProvider === "anthropic-key" &&
			model.family === "anthropic" &&
			keyMap.anthropic
		) {
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

		if (selectedProvider === "vercel" && keyMap.vercel) {
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
		// Selected provider not available — fall through to auto-resolve below
	}

	// ─── Auto-resolve (priority-based) ─────────────────────────────────────────

	if (model.family === "openai") {
		const oauth = await getOpenAIOAuthAuth(userId);
		if (oauth) {
			return {
				providerID: "openai",
				modelID: model.id,
				fullModel: `openai/${model.id}`,
				auth: oauth,
			};
		}

		if (keyMap.openai) {
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

		if (keyMap.vercel) {
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

	if (keyMap.anthropic) {
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

	if (keyMap.vercel) {
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
		"No compatible API key found. Add an Anthropic or AI Gateway key in Dashboard.",
	);
}
