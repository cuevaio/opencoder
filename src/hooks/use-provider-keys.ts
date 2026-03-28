import { useEffect, useState } from "react";
import type {
	KeyProviderId,
	OAuthProviderStatus,
} from "#/lib/ai/model-registry.ts";

interface ProviderKeyStatus {
	provider: KeyProviderId;
	configured: boolean;
}

interface OpenAIOAuthStatus {
	connected: boolean;
}

interface CopilotStatus {
	connected: boolean;
}

export function useProviderKeyStatus(): {
	configuredKeys: Set<KeyProviderId>;
	oauthStatus: OAuthProviderStatus;
	loading: boolean;
} {
	const [configuredKeys, setConfiguredKeys] = useState<Set<KeyProviderId>>(
		new Set(),
	);
	const [oauthStatus, setOauthStatus] = useState<OAuthProviderStatus>({
		openai: false,
		copilot: false,
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		Promise.all([
			fetch("/api/agent/keys").then((res) => res.json()),
			fetch("/api/agent/oauth/openai/status").then((res) =>
				res.ok ? res.json() : ({ connected: false } as OpenAIOAuthStatus),
			),
			fetch("/api/agent/oauth/copilot/status").then((res) =>
				res.ok ? res.json() : ({ connected: false } as CopilotStatus),
			),
		])
			.then(
				([keysData, oauthData, copilotData]: [
					{ keys?: ProviderKeyStatus[] },
					OpenAIOAuthStatus,
					CopilotStatus,
				]) => {
					if (cancelled) return;
					const set = new Set<KeyProviderId>();
					for (const k of keysData.keys ?? []) {
						if (k.configured) set.add(k.provider);
					}
					const openaiConnected = oauthData.connected ?? false;
					const copilotConnected = copilotData.connected ?? false;
					// Note: OAuth status is tracked separately — do NOT add
					// "openai" to configuredKeys here, or "openai-key" would appear
					// available even when no API key is stored.
					setConfiguredKeys(set);
					setOauthStatus({
						openai: openaiConnected,
						copilot: copilotConnected,
					});
				},
			)
			.catch(() => {
				// silently fail — caller can still select models
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	return { configuredKeys, oauthStatus, loading };
}
