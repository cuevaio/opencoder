import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "#/components/app-header.tsx";
import type { KeyProviderId } from "#/lib/ai/model-registry.ts";
import { authClient } from "#/lib/auth-client.ts";
import { getAuthSession, getGitHubToken } from "#/lib/auth-helpers.ts";

const getDashboardData = createServerFn({ method: "GET" }).handler(async () => {
	const request = getRequest();
	const session = await getAuthSession(request);
	if (!session) return null;

	const githubToken = await getGitHubToken(session.user.id);

	return {
		user: {
			name: session.user.name,
			email: session.user.email,
			image: session.user.image,
		},
		hasGitHubToken: !!githubToken,
	};
});

interface ProviderKeyStatus {
	provider: KeyProviderId;
	configured: boolean;
	last4: string | null;
	updatedAt: string | null;
}

interface OpenAIOAuthStatus {
	connected: boolean;
	accountId: string | null;
	updatedAt: string | null;
	expiresAt: string | null;
	lastError: string | null;
}

interface CopilotStatus {
	connected: boolean;
	updatedAt: string | null;
	lastError: string | null;
}

const providerLabels: Record<KeyProviderId, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
	vercel: "AI Gateway",
};

export const Route = createFileRoute("/_authed/dashboard")({
	loader: async () => getDashboardData(),
	component: DashboardPage,
});

function DashboardPage() {
	const data = Route.useLoaderData();

	const [keys, setKeys] = useState<ProviderKeyStatus[]>([]);
	const [loadingKeys, setLoadingKeys] = useState(true);
	const [keyError, setKeyError] = useState<string | null>(null);
	const [drafts, setDrafts] = useState<Record<KeyProviderId, string>>({
		openai: "",
		anthropic: "",
		vercel: "",
	});
	const [savingProvider, setSavingProvider] = useState<KeyProviderId | null>(
		null,
	);
	const [editingProvider, setEditingProvider] = useState<KeyProviderId | null>(
		null,
	);
	const [oauthStatus, setOauthStatus] = useState<OpenAIOAuthStatus | null>(
		null,
	);
	const [oauthBusy, setOauthBusy] = useState(false);
	const [oauthError, setOauthError] = useState<string | null>(null);
	const [oauthNotice, setOauthNotice] = useState<string | null>(null);
	const [copilotStatus, setCopilotStatus] = useState<CopilotStatus | null>(
		null,
	);
	const [copilotBusy, setCopilotBusy] = useState(false);
	const [copilotError, setCopilotError] = useState<string | null>(null);
	const [copilotNotice, setCopilotNotice] = useState<string | null>(null);

	const loadKeys = useCallback(async () => {
		setLoadingKeys(true);
		setKeyError(null);
		try {
			const response = await fetch("/api/agent/keys");
			const payload = (await response.json()) as {
				keys?: ProviderKeyStatus[];
				error?: string;
			};
			if (!response.ok) {
				throw new Error(payload.error || "Failed to load provider keys");
			}
			setKeys(payload.keys ?? []);
		} catch (error) {
			setKeyError(
				error instanceof Error ? error.message : "Failed to load provider keys",
			);
		} finally {
			setLoadingKeys(false);
		}
	}, []);

	const loadOauthStatus = useCallback(async () => {
		setOauthError(null);
		try {
			const response = await fetch("/api/agent/oauth/openai/status");
			const payload = (await response.json()) as OpenAIOAuthStatus & {
				error?: string;
			};
			if (!response.ok) {
				throw new Error(payload.error || "Failed to load OpenAI subscription");
			}
			setOauthStatus(payload);
		} catch (error) {
			setOauthError(
				error instanceof Error
					? error.message
					: "Failed to load OpenAI subscription",
			);
		}
	}, []);

	const loadCopilotStatus = useCallback(async () => {
		setCopilotError(null);
		try {
			const response = await fetch("/api/agent/oauth/copilot/status");
			const payload = (await response.json()) as CopilotStatus & {
				error?: string;
			};
			if (!response.ok) {
				throw new Error(
					payload.error || "Failed to load GitHub Copilot status",
				);
			}
			setCopilotStatus(payload);
		} catch (error) {
			setCopilotError(
				error instanceof Error
					? error.message
					: "Failed to load GitHub Copilot status",
			);
		}
	}, []);

	useEffect(() => {
		loadKeys();
		loadOauthStatus();
		loadCopilotStatus();
	}, [loadKeys, loadOauthStatus, loadCopilotStatus]);

	const handleConnectSubscription = useCallback(async () => {
		setOauthBusy(true);
		setOauthError(null);
		setOauthNotice(null);
		try {
			const startResponse = await fetch("/api/agent/oauth/openai/start", {
				method: "POST",
			});
			const startPayload = (await startResponse.json()) as {
				pendingId?: string;
				verificationUrl?: string;
				userCode?: string;
				intervalMs?: number;
				error?: string;
			};
			if (!startResponse.ok || !startPayload.pendingId) {
				throw new Error(
					startPayload.error || "Failed to start OpenAI authorization",
				);
			}

			if (startPayload.verificationUrl) {
				window.open(
					startPayload.verificationUrl,
					"_blank",
					"noopener,noreferrer",
				);
			}

			setOauthNotice(
				startPayload.userCode
					? `Enter code ${startPayload.userCode} in the OpenAI window to finish linking.`
					: "Complete the OpenAI authorization in the new window.",
			);

			const pollMs = Math.max(startPayload.intervalMs ?? 5000, 1000);
			const deadline = Date.now() + 10 * 60 * 1000;
			while (Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, pollMs));
				const pollResponse = await fetch("/api/agent/oauth/openai/poll", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ pendingId: startPayload.pendingId }),
				});
				const pollPayload = (await pollResponse.json()) as {
					status?: "pending" | "connected" | "failed" | "expired";
					error?: string;
				};

				if (!pollResponse.ok) {
					throw new Error(pollPayload.error || "OpenAI authorization failed");
				}

				if (pollPayload.status === "connected") {
					await loadOauthStatus();
					setOauthNotice("OpenAI subscription connected.");
					return;
				}

				if (
					pollPayload.status === "failed" ||
					pollPayload.status === "expired"
				) {
					throw new Error(pollPayload.error || "OpenAI authorization failed");
				}
			}

			throw new Error("OpenAI authorization timed out. Please try again.");
		} catch (error) {
			setOauthError(
				error instanceof Error
					? error.message
					: "Failed to connect OpenAI subscription",
			);
		} finally {
			setOauthBusy(false);
		}
	}, [loadOauthStatus]);

	const handleDisconnectSubscription = useCallback(async () => {
		setOauthBusy(true);
		setOauthError(null);
		setOauthNotice(null);
		try {
			const response = await fetch("/api/agent/oauth/openai/disconnect", {
				method: "DELETE",
			});
			const payload = (await response.json()) as OpenAIOAuthStatus & {
				error?: string;
			};
			if (!response.ok) {
				throw new Error(
					payload.error || "Failed to disconnect OpenAI subscription",
				);
			}
			setOauthStatus(payload);
			setOauthNotice("OpenAI subscription disconnected.");
		} catch (error) {
			setOauthError(
				error instanceof Error
					? error.message
					: "Failed to disconnect OpenAI subscription",
			);
		} finally {
			setOauthBusy(false);
		}
	}, []);

	const handleConnectCopilot = useCallback(async () => {
		setCopilotBusy(true);
		setCopilotError(null);
		setCopilotNotice(null);
		try {
			const startResponse = await fetch("/api/agent/oauth/copilot/start", {
				method: "POST",
			});
			const startPayload = (await startResponse.json()) as {
				pendingId?: string;
				verificationUrl?: string;
				userCode?: string;
				intervalMs?: number;
				error?: string;
			};

			if (!startResponse.ok || !startPayload.pendingId) {
				throw new Error(
					startPayload.error || "Failed to start GitHub Copilot authorization",
				);
			}

			if (startPayload.verificationUrl) {
				window.open(
					startPayload.verificationUrl,
					"_blank",
					"noopener,noreferrer",
				);
			}

			setCopilotNotice(
				startPayload.userCode
					? `Enter code ${startPayload.userCode} on GitHub to finish linking Copilot.`
					: "Complete GitHub Copilot authorization in the new window.",
			);

			const pollMs = Math.max(startPayload.intervalMs ?? 5000, 1000);
			const deadline = Date.now() + 10 * 60 * 1000;
			while (Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, pollMs));
				const pollResponse = await fetch("/api/agent/oauth/copilot/poll", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ pendingId: startPayload.pendingId }),
				});
				const pollPayload = (await pollResponse.json()) as {
					status?: "pending" | "connected" | "failed" | "expired";
					intervalMs?: number;
					error?: string;
				};

				if (!pollResponse.ok) {
					throw new Error(
						pollPayload.error || "GitHub Copilot authorization failed",
					);
				}

				if (pollPayload.status === "connected") {
					await loadCopilotStatus();
					setCopilotNotice("GitHub Copilot connected.");
					return;
				}

				if (
					pollPayload.status === "failed" ||
					pollPayload.status === "expired"
				) {
					throw new Error(
						pollPayload.error || "GitHub Copilot authorization failed",
					);
				}
			}

			throw new Error(
				"GitHub Copilot authorization timed out. Please try again.",
			);
		} catch (error) {
			setCopilotError(
				error instanceof Error
					? error.message
					: "Failed to connect GitHub Copilot",
			);
		} finally {
			setCopilotBusy(false);
		}
	}, [loadCopilotStatus]);

	const handleDisconnectCopilot = useCallback(async () => {
		setCopilotBusy(true);
		setCopilotError(null);
		setCopilotNotice(null);
		try {
			const response = await fetch("/api/agent/oauth/copilot/disconnect", {
				method: "DELETE",
			});
			const payload = (await response.json()) as CopilotStatus & {
				error?: string;
			};
			if (!response.ok) {
				throw new Error(payload.error || "Failed to disconnect GitHub Copilot");
			}
			setCopilotStatus(payload);
			setCopilotNotice("GitHub Copilot disconnected.");
		} catch (error) {
			setCopilotError(
				error instanceof Error
					? error.message
					: "Failed to disconnect GitHub Copilot",
			);
		} finally {
			setCopilotBusy(false);
		}
	}, []);

	const handleSaveKey = useCallback(
		async (provider: KeyProviderId) => {
			const value = drafts[provider].trim();
			if (!value) return;

			setSavingProvider(provider);
			setKeyError(null);
			try {
				const response = await fetch("/api/agent/keys", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ provider, apiKey: value }),
				});
				const payload = (await response.json()) as {
					keys?: ProviderKeyStatus[];
					error?: string;
				};
				if (!response.ok) {
					throw new Error(payload.error || "Failed to save provider key");
				}
				setKeys(payload.keys ?? []);
				setDrafts((current) => ({ ...current, [provider]: "" }));
				setEditingProvider(null);
			} catch (error) {
				setKeyError(
					error instanceof Error
						? error.message
						: "Failed to save provider key",
				);
			} finally {
				setSavingProvider(null);
			}
		},
		[drafts],
	);

	const handleDeleteKey = useCallback(async (provider: KeyProviderId) => {
		setSavingProvider(provider);
		setKeyError(null);
		try {
			const response = await fetch("/api/agent/keys", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ provider }),
			});
			const payload = (await response.json()) as {
				keys?: ProviderKeyStatus[];
				error?: string;
			};
			if (!response.ok) {
				throw new Error(payload.error || "Failed to remove provider key");
			}
			setKeys(payload.keys ?? []);
			setEditingProvider((current) => (current === provider ? null : current));
		} catch (error) {
			setKeyError(
				error instanceof Error
					? error.message
					: "Failed to remove provider key",
			);
		} finally {
			setSavingProvider(null);
		}
	}, []);

	const keyByProvider = useMemo(
		() => new Map(keys.map((key) => [key.provider, key])),
		[keys],
	);

	if (!data) return null;

	const { user, hasGitHubToken } = data;

	return (
		<div className="app-shell bg-background text-foreground">
			<AppHeader variant="authed" />

			<main className="app-container max-w-3xl py-8 sm:py-10">
				<h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

				<div className="mt-6 rounded-xl border border-border/80 bg-surface-1 p-5 sm:p-6">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
						{user.image ? (
							<img
								src={user.image}
								alt={user.name ?? "User"}
								className="h-14 w-14 rounded-full"
							/>
						) : (
							<div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-xl font-bold">
								{user.name?.[0] ?? "U"}
							</div>
						)}
						<div>
							<p className="font-semibold">{user.name}</p>
							<p className="text-sm text-muted-foreground">{user.email}</p>
						</div>
					</div>
				</div>

				<div className="mt-4 rounded-xl border border-border/80 bg-surface-1 p-5 sm:p-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="font-semibold">GitHub Connection</h2>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{hasGitHubToken
									? "Connected — your GitHub token is available for agent use."
									: "Not connected with repository access."}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span
								className={`inline-block h-2 w-2 rounded-full ${hasGitHubToken ? "bg-green-500" : "bg-yellow-500"}`}
							/>
							<span className="text-sm">
								{hasGitHubToken ? "Connected" : "Limited"}
							</span>
						</div>
					</div>
					{!hasGitHubToken && (
						<button
							type="button"
							onClick={() =>
								authClient.signIn.social({
									provider: "github",
									callbackURL: "/dashboard",
								})
							}
							className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background hover:opacity-90 press-scale sm:w-auto sm:justify-start"
						>
							<svg
								className="h-4 w-4"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
							</svg>
							Re-authorize with repo access
						</button>
					)}
				</div>

				<div className="mt-4 rounded-xl border border-border/80 bg-surface-1 p-5 sm:p-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="font-semibold">OpenAI Subscription</h2>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{oauthStatus?.connected
									? "Connected — OpenAI models can use your ChatGPT subscription."
									: "Not connected. Link ChatGPT Pro/Plus to run OpenAI models without an API key."}
							</p>
							{oauthStatus?.connected && oauthStatus.accountId && (
								<p className="mt-1 text-xs text-muted-foreground">
									Account: {oauthStatus.accountId}
								</p>
							)}
							{oauthStatus?.connected && oauthStatus.expiresAt && (
								<p className="mt-1 text-xs text-muted-foreground">
									Token expiry:{" "}
									{new Date(oauthStatus.expiresAt).toLocaleString()}
								</p>
							)}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span
								className={`inline-block h-2 w-2 rounded-full ${oauthStatus?.connected ? "bg-green-500" : "bg-muted-foreground/40"}`}
							/>
							<span className="text-sm">
								{oauthStatus?.connected ? "Connected" : "Not connected"}
							</span>
						</div>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						{oauthStatus?.connected ? (
							<button
								type="button"
								onClick={handleDisconnectSubscription}
								disabled={oauthBusy}
								className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
							>
								{oauthBusy ? "Disconnecting…" : "Disconnect"}
							</button>
						) : (
							<button
								type="button"
								onClick={handleConnectSubscription}
								disabled={oauthBusy}
								className="min-h-[44px] rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 press-scale disabled:opacity-50"
							>
								{oauthBusy ? "Connecting…" : "Connect ChatGPT Pro/Plus"}
							</button>
						)}
						<button
							type="button"
							onClick={loadOauthStatus}
							disabled={oauthBusy}
							className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
						>
							Refresh
						</button>
					</div>
					{oauthNotice && (
						<p className="mt-3 text-sm text-muted-foreground">{oauthNotice}</p>
					)}
					{oauthError && (
						<div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
							{oauthError}
						</div>
					)}
				</div>

				<div className="mt-4 rounded-xl border border-border/80 bg-surface-1 p-5 sm:p-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="font-semibold">GitHub Copilot</h2>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Connect your Copilot subscription via GitHub device login.
							</p>
							{copilotStatus?.updatedAt && (
								<p className="mt-1 text-xs text-muted-foreground">
									Last updated:{" "}
									{new Date(copilotStatus.updatedAt).toLocaleString()}
								</p>
							)}
							{copilotStatus?.lastError && (
								<p className="mt-1 text-xs text-muted-foreground">
									{copilotStatus.lastError}
								</p>
							)}
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span
								className={`inline-block h-2 w-2 rounded-full ${copilotStatus?.connected ? "bg-green-500" : "bg-muted-foreground/40"}`}
							/>
							<span className="text-sm">
								{copilotStatus?.connected ? "Connected" : "Not connected"}
							</span>
						</div>
					</div>
					<div className="mt-4 flex flex-wrap gap-2">
						{copilotStatus?.connected ? (
							<button
								type="button"
								onClick={handleDisconnectCopilot}
								disabled={copilotBusy}
								className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
							>
								{copilotBusy ? "Disconnecting…" : "Disconnect"}
							</button>
						) : (
							<button
								type="button"
								onClick={handleConnectCopilot}
								disabled={copilotBusy}
								className="min-h-[44px] rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 press-scale disabled:opacity-50"
							>
								{copilotBusy ? "Connecting…" : "Connect GitHub Copilot"}
							</button>
						)}
						<button
							type="button"
							onClick={loadCopilotStatus}
							disabled={copilotBusy}
							className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
						>
							Refresh
						</button>
					</div>
					{copilotNotice && (
						<p className="mt-3 text-sm text-muted-foreground">
							{copilotNotice}
						</p>
					)}
					{copilotError && (
						<div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
							{copilotError}
						</div>
					)}
				</div>

				<div className="mt-4 rounded-xl border border-border/80 bg-surface-1 p-5 sm:p-6">
					<h2 className="font-semibold">Quick Actions</h2>
					<div className="mt-4 flex flex-wrap gap-3">
						<Link
							to="/chat"
							className="min-h-[44px] w-full rounded-md bg-foreground px-4 py-3 text-center text-sm font-medium text-background hover:opacity-90 press-scale sm:w-auto"
						>
							Open Chat →
						</Link>
					</div>
				</div>

				<div className="mt-4 rounded-xl border border-border/80 bg-surface-1 p-5 sm:p-6">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="font-semibold">AI Provider Keys</h2>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Keys are encrypted at rest and only shown as masked tails.
							</p>
						</div>
						<button
							type="button"
							onClick={loadKeys}
							className="rounded-md border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
						>
							Refresh
						</button>
					</div>

					{keyError && (
						<div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
							{keyError}
						</div>
					)}

					{loadingKeys ? (
						<p className="mt-4 text-sm text-muted-foreground">
							Loading keys...
						</p>
					) : (
						<div className="mt-4 space-y-3">
							{(["openai", "anthropic", "vercel"] as KeyProviderId[]).map(
								(provider) => {
									const status = keyByProvider.get(provider);
									const isSaving = savingProvider === provider;
									const isConfigured = !!status?.configured;
									const isEditing = editingProvider === provider;
									const showInput = !isConfigured || isEditing;

									return (
										<div
											key={provider}
											className="rounded-lg border border-border/70 bg-background/50 p-4"
										>
											{/* Header row — always visible */}
											<div className="flex flex-wrap items-center justify-between gap-2">
												<div className="flex items-center gap-2">
													<span
														className={`inline-block h-2 w-2 shrink-0 rounded-full ${isConfigured ? "bg-green-500" : "bg-muted-foreground/40"}`}
													/>
													<span className="text-sm font-medium">
														{providerLabels[provider]}
													</span>
												</div>
												<div className="flex items-center gap-2">
													<span className="text-xs text-muted-foreground">
														{isConfigured
															? status?.last4
																? `Configured (••••${status.last4})`
																: "Configured"
															: "Not configured"}
													</span>
													{isConfigured && !isEditing && (
														<>
															<button
																type="button"
																onClick={() => setEditingProvider(provider)}
																disabled={isSaving}
																className="rounded border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
															>
																Update
															</button>
															<button
																type="button"
																onClick={() => handleDeleteKey(provider)}
																disabled={isSaving}
																className="rounded border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
															>
																{isSaving ? "Removing…" : "Remove"}
															</button>
														</>
													)}
												</div>
											</div>

											{/* Input row — only when unconfigured or editing */}
											{showInput && (
												<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
													<input
														type="password"
														placeholder={`Enter ${providerLabels[provider]} API key`}
														value={drafts[provider]}
														onChange={(event) =>
															setDrafts((current) => ({
																...current,
																[provider]: event.target.value,
															}))
														}
														className="h-11 flex-1 rounded-md border border-border bg-background/70 px-3 text-sm outline-none focus:border-ring"
														disabled={isSaving}
													/>
													<div className="flex flex-wrap gap-2 sm:flex-nowrap">
														<button
															type="button"
															onClick={() => handleSaveKey(provider)}
															disabled={!drafts[provider].trim() || isSaving}
															className="min-h-[44px] rounded-md bg-foreground px-3 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
														>
															{isSaving ? "Saving…" : "Save"}
														</button>
														{isEditing && (
															<button
																type="button"
																onClick={() => {
																	setEditingProvider(null);
																	setDrafts((current) => ({
																		...current,
																		[provider]: "",
																	}));
																}}
																disabled={isSaving}
																className="min-h-[44px] rounded-md border border-border bg-background/70 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
															>
																Cancel
															</button>
														)}
													</div>
												</div>
											)}
										</div>
									);
								},
							)}
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
