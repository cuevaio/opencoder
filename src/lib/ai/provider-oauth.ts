import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "#/db/index.ts";
import {
	agentProviderOauthCredentials,
	agentProviderOauthPending,
} from "#/db/schema.ts";
import { decryptSecret, encryptSecret } from "#/lib/server/encryption.ts";

const OPENAI_PROVIDER = "openai";
const OPENAI_ISSUER = "https://auth.openai.com";
const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const COPILOT_PROVIDER = "github-copilot";
const GITHUB_OAUTH_CLIENT_ID = "Ov23li8tweQw6odWQebz";
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_COPILOT_MODELS_URL = "https://api.githubcopilot.com/models";

export type OpenAIOAuthAuth = {
	type: "oauth";
	refresh: string;
	access: string;
	expires: number;
	accountId?: string;
	enterpriseUrl?: string;
};

type OpenAIUserCodeResponse = {
	device_auth_id: string;
	user_code: string;
	interval?: string | number;
	verification_uri?: string;
	verification_uri_complete?: string;
};

type OpenAIDeviceTokenResponse = {
	authorization_code: string;
	code_verifier: string;
};

type OpenAITokenResponse = {
	id_token?: string;
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
};

type PendingPayload = {
	deviceAuthId: string;
	userCode: string;
	intervalMs: number;
};

type CopilotPendingPayload = {
	deviceCode: string;
	userCode: string;
	intervalMs: number;
};

type GitHubDeviceCodeResponse = {
	device_code?: string;
	user_code?: string;
	verification_uri?: string;
	expires_in?: number;
	interval?: number;
};

type GitHubTokenResponse = {
	access_token?: string;
	token_type?: string;
	scope?: string;
	error?: string;
	error_description?: string;
	interval?: number;
};

type OpenAIOAuthStatusBase = {
	connected: boolean;
	accountId: string | null;
	updatedAt: string | null;
	expiresAt: string | null;
};

export type OpenAIOAuthStatus = OpenAIOAuthStatusBase & {
	lastError: string | null;
};

export type GitHubCopilotOAuthStatus = {
	connected: boolean;
	updatedAt: string | null;
	lastError: string | null;
};

export type OpenAIStartResult = {
	pendingId: string;
	verificationUrl: string;
	userCode: string;
	intervalMs: number;
};

export type OpenAIPollResult =
	| { status: "pending"; intervalMs: number }
	| {
			status: "connected";
			auth: OpenAIOAuthAuth;
			connection: OpenAIOAuthStatusBase;
	  }
	| { status: "expired"; error: string }
	| { status: "failed"; error: string };

export type GitHubCopilotOAuthAuth = {
	type: "oauth";
	refresh: string;
	access: string;
	expires: number;
	accountId?: string;
	enterpriseUrl?: string;
};

export type GitHubCopilotStartResult = {
	pendingId: string;
	verificationUrl: string;
	userCode: string;
	intervalMs: number;
};

export type GitHubCopilotPollResult =
	| { status: "pending"; intervalMs: number }
	| {
			status: "connected";
			auth: GitHubCopilotOAuthAuth;
			connection: GitHubCopilotOAuthStatus;
	  }
	| { status: "expired"; error: string }
	| { status: "failed"; error: string };

type IdTokenClaims = {
	chatgpt_account_id?: string;
	organizations?: Array<{ id: string }>;
	"https://api.openai.com/auth"?: { chatgpt_account_id?: string };
};

function parseJwtClaims(token: string): IdTokenClaims | undefined {
	const parts = token.split(".");
	if (parts.length !== 3) return undefined;
	try {
		return JSON.parse(
			Buffer.from(parts[1], "base64url").toString(),
		) as IdTokenClaims;
	} catch {
		return undefined;
	}
}

function extractAccountId(tokens: OpenAITokenResponse): string | undefined {
	const fromToken = (token?: string) => {
		if (!token) return undefined;
		const claims = parseJwtClaims(token);
		if (!claims) return undefined;
		return (
			claims.chatgpt_account_id ||
			claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
			claims.organizations?.[0]?.id
		);
	};
	return fromToken(tokens.id_token) || fromToken(tokens.access_token);
}

function parsePending(raw: string): PendingPayload {
	const parsed = JSON.parse(raw) as Partial<PendingPayload>;
	if (
		typeof parsed.deviceAuthId !== "string" ||
		typeof parsed.userCode !== "string" ||
		typeof parsed.intervalMs !== "number"
	) {
		throw new Error("Invalid pending OAuth payload");
	}
	return {
		deviceAuthId: parsed.deviceAuthId,
		userCode: parsed.userCode,
		intervalMs: parsed.intervalMs,
	};
}

function parseCopilotPending(raw: string): CopilotPendingPayload {
	const parsed = JSON.parse(raw) as Partial<CopilotPendingPayload>;
	if (
		typeof parsed.deviceCode !== "string" ||
		typeof parsed.userCode !== "string" ||
		typeof parsed.intervalMs !== "number"
	) {
		throw new Error("Invalid pending Copilot OAuth payload");
	}
	return {
		deviceCode: parsed.deviceCode,
		userCode: parsed.userCode,
		intervalMs: parsed.intervalMs,
	};
}

function parseAuth(raw: string): OpenAIOAuthAuth {
	const parsed = JSON.parse(raw) as Partial<OpenAIOAuthAuth>;
	if (
		parsed.type !== "oauth" ||
		typeof parsed.refresh !== "string" ||
		typeof parsed.access !== "string" ||
		typeof parsed.expires !== "number"
	) {
		throw new Error("Invalid stored OAuth credential");
	}
	return {
		type: "oauth",
		refresh: parsed.refresh,
		access: parsed.access,
		expires: parsed.expires,
		accountId: parsed.accountId,
		enterpriseUrl: parsed.enterpriseUrl,
	};
}

function parseCopilotAuth(raw: string): GitHubCopilotOAuthAuth {
	const parsed = JSON.parse(raw) as Partial<GitHubCopilotOAuthAuth>;
	if (
		parsed.type !== "oauth" ||
		typeof parsed.refresh !== "string" ||
		typeof parsed.access !== "string" ||
		typeof parsed.expires !== "number"
	) {
		throw new Error("Invalid stored Copilot OAuth credential");
	}
	return {
		type: "oauth",
		refresh: parsed.refresh,
		access: parsed.access,
		expires: parsed.expires,
		accountId: parsed.accountId,
		enterpriseUrl: parsed.enterpriseUrl,
	};
}

async function cleanupPending(userId: string, provider: string): Promise<void> {
	await db
		.delete(agentProviderOauthPending)
		.where(
			and(
				eq(agentProviderOauthPending.userId, userId),
				eq(agentProviderOauthPending.provider, provider),
				lt(agentProviderOauthPending.expiresAt, new Date()),
			),
		);
}

export async function checkGitHubCopilotEntitlement(token: string): Promise<{
	ok: boolean;
	error?: string;
}> {
	try {
		const response = await fetch(GITHUB_COPILOT_MODELS_URL, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
				"User-Agent": "opencoder",
			},
		});

		if (response.ok) return { ok: true };

		if (response.status === 401) {
			return {
				ok: false,
				error: "GitHub Copilot token is invalid or expired. Please reconnect.",
			};
		}

		if (response.status === 403) {
			return {
				ok: false,
				error:
					"This GitHub account is not licensed for Copilot. Assign a Copilot seat and try again.",
			};
		}

		if (response.status === 429 || response.status >= 500) {
			return {
				ok: false,
				error:
					"GitHub Copilot is temporarily unavailable. Please try again in a moment.",
			};
		}

		return {
			ok: false,
			error: "Could not verify GitHub Copilot entitlement.",
		};
	} catch {
		return {
			ok: false,
			error: "Could not reach GitHub Copilot to verify entitlement.",
		};
	}
}

export async function startOpenAIOAuth(
	userId: string,
): Promise<OpenAIStartResult> {
	await cleanupPending(userId, OPENAI_PROVIDER);

	const response = await fetch(
		`${OPENAI_ISSUER}/api/accounts/deviceauth/usercode`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "opencoder",
			},
			body: JSON.stringify({ client_id: OPENAI_CLIENT_ID }),
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to start OpenAI device auth (${response.status})`);
	}

	const data = (await response.json()) as OpenAIUserCodeResponse;
	if (!data.device_auth_id || !data.user_code) {
		throw new Error("OpenAI device auth response missing fields");
	}

	const intervalMs = Math.max(Number(data.interval ?? 5) * 1000, 1000);
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
	const pendingId = globalThis.crypto.randomUUID();
	const payload = encryptSecret(
		JSON.stringify({
			deviceAuthId: data.device_auth_id,
			userCode: data.user_code,
			intervalMs,
		}),
	);

	await db.insert(agentProviderOauthPending).values({
		id: pendingId,
		userId,
		provider: OPENAI_PROVIDER,
		encryptedData: payload.ciphertext,
		iv: payload.iv,
		authTag: payload.authTag,
		keyVersion: payload.keyVersion,
		expiresAt,
	});

	return {
		pendingId,
		verificationUrl:
			data.verification_uri_complete ||
			data.verification_uri ||
			`${OPENAI_ISSUER}/codex/device`,
		userCode: data.user_code,
		intervalMs,
	};
}

export async function pollOpenAIOAuth(
	userId: string,
	pendingId: string,
): Promise<OpenAIPollResult> {
	await cleanupPending(userId, OPENAI_PROVIDER);

	const [row] = await db
		.select()
		.from(agentProviderOauthPending)
		.where(
			and(
				eq(agentProviderOauthPending.id, pendingId),
				eq(agentProviderOauthPending.userId, userId),
				eq(agentProviderOauthPending.provider, OPENAI_PROVIDER),
				isNull(agentProviderOauthPending.consumedAt),
				gt(agentProviderOauthPending.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!row) {
		return {
			status: "expired",
			error: "OpenAI authorization expired. Please start again.",
		};
	}

	const pending = parsePending(
		decryptSecret({
			ciphertext: row.encryptedData,
			iv: row.iv,
			authTag: row.authTag,
		}),
	);

	const deviceResponse = await fetch(
		`${OPENAI_ISSUER}/api/accounts/deviceauth/token`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "opencoder",
			},
			body: JSON.stringify({
				device_auth_id: pending.deviceAuthId,
				user_code: pending.userCode,
			}),
		},
	);

	if (deviceResponse.status === 403 || deviceResponse.status === 404) {
		return { status: "pending", intervalMs: pending.intervalMs };
	}

	if (!deviceResponse.ok) {
		const error = `OpenAI device polling failed (${deviceResponse.status})`;
		await db
			.update(agentProviderOauthCredentials)
			.set({ lastError: error, updatedAt: new Date() })
			.where(
				and(
					eq(agentProviderOauthCredentials.userId, userId),
					eq(agentProviderOauthCredentials.provider, OPENAI_PROVIDER),
				),
			);
		return { status: "failed", error };
	}

	const deviceData = (await deviceResponse.json()) as OpenAIDeviceTokenResponse;
	if (!deviceData.authorization_code || !deviceData.code_verifier) {
		return {
			status: "failed",
			error: "OpenAI device polling response invalid",
		};
	}

	const tokenResponse = await fetch(`${OPENAI_ISSUER}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: deviceData.authorization_code,
			redirect_uri: `${OPENAI_ISSUER}/deviceauth/callback`,
			client_id: OPENAI_CLIENT_ID,
			code_verifier: deviceData.code_verifier,
		}).toString(),
	});

	if (!tokenResponse.ok) {
		return {
			status: "failed",
			error: `OpenAI token exchange failed (${tokenResponse.status})`,
		};
	}

	const tokens = (await tokenResponse.json()) as OpenAITokenResponse;
	if (!tokens.refresh_token || !tokens.access_token) {
		return {
			status: "failed",
			error: "OpenAI token exchange response invalid",
		};
	}

	const expires = Date.now() + (tokens.expires_in ?? 3600) * 1000;
	const accountId = extractAccountId(tokens);
	const auth: OpenAIOAuthAuth = {
		type: "oauth",
		refresh: tokens.refresh_token,
		access: tokens.access_token,
		expires,
		...(accountId ? { accountId } : {}),
	};
	const encrypted = encryptSecret(JSON.stringify(auth));

	await db
		.insert(agentProviderOauthCredentials)
		.values({
			userId,
			provider: OPENAI_PROVIDER,
			encryptedAuth: encrypted.ciphertext,
			iv: encrypted.iv,
			authTag: encrypted.authTag,
			keyVersion: encrypted.keyVersion,
			accountId: accountId ?? null,
			tokenExpiresAt: new Date(expires),
			lastError: null,
		})
		.onConflictDoUpdate({
			target: [
				agentProviderOauthCredentials.userId,
				agentProviderOauthCredentials.provider,
			],
			set: {
				encryptedAuth: encrypted.ciphertext,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				keyVersion: encrypted.keyVersion,
				accountId: accountId ?? null,
				tokenExpiresAt: new Date(expires),
				lastError: null,
				updatedAt: new Date(),
			},
		});

	await db
		.update(agentProviderOauthPending)
		.set({ consumedAt: new Date(), updatedAt: new Date() })
		.where(eq(agentProviderOauthPending.id, pendingId));

	return {
		status: "connected",
		auth,
		connection: {
			connected: true,
			accountId: accountId ?? null,
			updatedAt: new Date().toISOString(),
			expiresAt: new Date(expires).toISOString(),
		},
	};
}

export async function getOpenAIOAuthAuth(
	userId: string,
): Promise<OpenAIOAuthAuth | null> {
	const [row] = await db
		.select({
			encryptedAuth: agentProviderOauthCredentials.encryptedAuth,
			iv: agentProviderOauthCredentials.iv,
			authTag: agentProviderOauthCredentials.authTag,
		})
		.from(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, OPENAI_PROVIDER),
			),
		)
		.limit(1);

	if (!row) return null;

	const raw = decryptSecret({
		ciphertext: row.encryptedAuth,
		iv: row.iv,
		authTag: row.authTag,
	});

	return parseAuth(raw);
}

export async function hasOpenAIOAuth(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: agentProviderOauthCredentials.id })
		.from(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, OPENAI_PROVIDER),
			),
		)
		.limit(1);

	return !!row;
}

export async function getOpenAIOAuthStatus(
	userId: string,
): Promise<OpenAIOAuthStatus> {
	const [row] = await db
		.select({
			accountId: agentProviderOauthCredentials.accountId,
			tokenExpiresAt: agentProviderOauthCredentials.tokenExpiresAt,
			updatedAt: agentProviderOauthCredentials.updatedAt,
			lastError: agentProviderOauthCredentials.lastError,
		})
		.from(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, OPENAI_PROVIDER),
			),
		)
		.limit(1);

	if (!row) {
		return {
			connected: false,
			accountId: null,
			updatedAt: null,
			expiresAt: null,
			lastError: null,
		};
	}

	return {
		connected: true,
		accountId: row.accountId,
		updatedAt: row.updatedAt.toISOString(),
		expiresAt: row.tokenExpiresAt?.toISOString() ?? null,
		lastError: row.lastError,
	};
}

export async function disconnectOpenAIOAuth(userId: string): Promise<void> {
	await db
		.delete(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, OPENAI_PROVIDER),
			),
		);

	await db
		.delete(agentProviderOauthPending)
		.where(
			and(
				eq(agentProviderOauthPending.userId, userId),
				eq(agentProviderOauthPending.provider, OPENAI_PROVIDER),
			),
		);
}

export async function startGitHubCopilotOAuth(
	userId: string,
): Promise<GitHubCopilotStartResult> {
	await cleanupPending(userId, COPILOT_PROVIDER);

	const response = await fetch(GITHUB_DEVICE_CODE_URL, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": "opencoder",
		},
		body: new URLSearchParams({
			client_id: GITHUB_OAUTH_CLIENT_ID,
			scope: "read:user",
		}).toString(),
	});

	if (!response.ok) {
		throw new Error(
			`Failed to start GitHub Copilot authorization (${response.status})`,
		);
	}

	const data = (await response.json()) as GitHubDeviceCodeResponse;
	if (!data.device_code || !data.user_code || !data.verification_uri) {
		throw new Error("GitHub device authorization response missing fields");
	}

	const intervalMs = Math.max((data.interval ?? 5) * 1000, 1000);
	const expiresAt = new Date(
		Date.now() + Math.max(data.expires_in ?? 900, 120) * 1000,
	);
	const pendingId = globalThis.crypto.randomUUID();
	const payload = encryptSecret(
		JSON.stringify({
			deviceCode: data.device_code,
			userCode: data.user_code,
			intervalMs,
		}),
	);

	await db.insert(agentProviderOauthPending).values({
		id: pendingId,
		userId,
		provider: COPILOT_PROVIDER,
		encryptedData: payload.ciphertext,
		iv: payload.iv,
		authTag: payload.authTag,
		keyVersion: payload.keyVersion,
		expiresAt,
	});

	return {
		pendingId,
		verificationUrl: data.verification_uri,
		userCode: data.user_code,
		intervalMs,
	};
}

export async function pollGitHubCopilotOAuth(
	userId: string,
	pendingId: string,
): Promise<GitHubCopilotPollResult> {
	await cleanupPending(userId, COPILOT_PROVIDER);

	const [row] = await db
		.select()
		.from(agentProviderOauthPending)
		.where(
			and(
				eq(agentProviderOauthPending.id, pendingId),
				eq(agentProviderOauthPending.userId, userId),
				eq(agentProviderOauthPending.provider, COPILOT_PROVIDER),
				isNull(agentProviderOauthPending.consumedAt),
				gt(agentProviderOauthPending.expiresAt, new Date()),
			),
		)
		.limit(1);

	if (!row) {
		return {
			status: "expired",
			error: "GitHub Copilot authorization expired. Please start again.",
		};
	}

	const pending = parseCopilotPending(
		decryptSecret({
			ciphertext: row.encryptedData,
			iv: row.iv,
			authTag: row.authTag,
		}),
	);

	const tokenResponse = await fetch(GITHUB_ACCESS_TOKEN_URL, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": "opencoder",
		},
		body: new URLSearchParams({
			client_id: GITHUB_OAUTH_CLIENT_ID,
			device_code: pending.deviceCode,
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
		}).toString(),
	});

	if (!tokenResponse.ok) {
		const error = `GitHub token exchange failed (${tokenResponse.status})`;
		await db
			.update(agentProviderOauthCredentials)
			.set({ lastError: error, updatedAt: new Date() })
			.where(
				and(
					eq(agentProviderOauthCredentials.userId, userId),
					eq(agentProviderOauthCredentials.provider, COPILOT_PROVIDER),
				),
			);
		return { status: "failed", error };
	}

	const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

	if (tokenData.error === "authorization_pending") {
		const nextIntervalMs = Math.max(
			tokenData.interval ? tokenData.interval * 1000 : pending.intervalMs,
			1000,
		);
		return { status: "pending", intervalMs: nextIntervalMs };
	}

	if (tokenData.error === "slow_down") {
		const nextIntervalMs = Math.max(
			tokenData.interval
				? tokenData.interval * 1000
				: pending.intervalMs + 5000,
			1000,
		);
		return { status: "pending", intervalMs: nextIntervalMs };
	}

	if (tokenData.error === "access_denied") {
		return {
			status: "failed",
			error:
				"Authorization was denied. Retry and approve the request in GitHub.",
		};
	}

	if (tokenData.error === "expired_token") {
		return {
			status: "expired",
			error: "GitHub device code expired. Please start again.",
		};
	}

	if (!tokenData.access_token) {
		return {
			status: "failed",
			error: tokenData.error_description || "GitHub token response invalid.",
		};
	}

	const entitlement = await checkGitHubCopilotEntitlement(
		tokenData.access_token,
	);
	if (!entitlement.ok) {
		const error =
			entitlement.error || "GitHub Copilot entitlement check failed.";
		await db
			.update(agentProviderOauthCredentials)
			.set({ lastError: error, updatedAt: new Date() })
			.where(
				and(
					eq(agentProviderOauthCredentials.userId, userId),
					eq(agentProviderOauthCredentials.provider, COPILOT_PROVIDER),
				),
			);
		return {
			status: "failed",
			error,
		};
	}

	const auth: GitHubCopilotOAuthAuth = {
		type: "oauth",
		refresh: tokenData.access_token,
		access: tokenData.access_token,
		expires: 0,
	};
	const encrypted = encryptSecret(JSON.stringify(auth));

	await db
		.insert(agentProviderOauthCredentials)
		.values({
			userId,
			provider: COPILOT_PROVIDER,
			encryptedAuth: encrypted.ciphertext,
			iv: encrypted.iv,
			authTag: encrypted.authTag,
			keyVersion: encrypted.keyVersion,
			accountId: null,
			tokenExpiresAt: null,
			lastError: null,
		})
		.onConflictDoUpdate({
			target: [
				agentProviderOauthCredentials.userId,
				agentProviderOauthCredentials.provider,
			],
			set: {
				encryptedAuth: encrypted.ciphertext,
				iv: encrypted.iv,
				authTag: encrypted.authTag,
				keyVersion: encrypted.keyVersion,
				accountId: null,
				tokenExpiresAt: null,
				lastError: null,
				updatedAt: new Date(),
			},
		});

	await db
		.update(agentProviderOauthPending)
		.set({ consumedAt: new Date(), updatedAt: new Date() })
		.where(eq(agentProviderOauthPending.id, pendingId));

	return {
		status: "connected",
		auth,
		connection: {
			connected: true,
			updatedAt: new Date().toISOString(),
			lastError: null,
		},
	};
}

export async function getGitHubCopilotOAuthAuth(
	userId: string,
): Promise<GitHubCopilotOAuthAuth | null> {
	const [row] = await db
		.select({
			encryptedAuth: agentProviderOauthCredentials.encryptedAuth,
			iv: agentProviderOauthCredentials.iv,
			authTag: agentProviderOauthCredentials.authTag,
		})
		.from(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, COPILOT_PROVIDER),
			),
		)
		.limit(1);

	if (!row) return null;

	const raw = decryptSecret({
		ciphertext: row.encryptedAuth,
		iv: row.iv,
		authTag: row.authTag,
	});

	return parseCopilotAuth(raw);
}

export async function hasGitHubCopilotOAuth(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: agentProviderOauthCredentials.id })
		.from(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, COPILOT_PROVIDER),
			),
		)
		.limit(1);

	return !!row;
}

export async function getGitHubCopilotOAuthStatus(
	userId: string,
): Promise<GitHubCopilotOAuthStatus> {
	const [row] = await db
		.select({
			updatedAt: agentProviderOauthCredentials.updatedAt,
			lastError: agentProviderOauthCredentials.lastError,
		})
		.from(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, COPILOT_PROVIDER),
			),
		)
		.limit(1);

	if (!row) {
		return {
			connected: false,
			updatedAt: null,
			lastError: null,
		};
	}

	return {
		connected: true,
		updatedAt: row.updatedAt.toISOString(),
		lastError: row.lastError,
	};
}

export async function disconnectGitHubCopilotOAuth(
	userId: string,
): Promise<void> {
	await db
		.delete(agentProviderOauthCredentials)
		.where(
			and(
				eq(agentProviderOauthCredentials.userId, userId),
				eq(agentProviderOauthCredentials.provider, COPILOT_PROVIDER),
			),
		);

	await db
		.delete(agentProviderOauthPending)
		.where(
			and(
				eq(agentProviderOauthPending.userId, userId),
				eq(agentProviderOauthPending.provider, COPILOT_PROVIDER),
			),
		);
}
