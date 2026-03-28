import { useEffect, useState } from "react";
import type { KeyProviderId } from "#/lib/ai/model-registry.ts";

interface ProviderKeyStatus {
	provider: KeyProviderId;
	configured: boolean;
}

interface OpenAIOAuthStatus {
	connected: boolean;
}

export function useProviderKeyStatus(): {
	configuredKeys: Set<KeyProviderId>;
	oauthConnected: boolean;
	loading: boolean;
} {
	const [configuredKeys, setConfiguredKeys] = useState<Set<KeyProviderId>>(
		new Set(),
	);
	const [oauthConnected, setOauthConnected] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		Promise.all([
			fetch("/api/agent/keys").then((res) => res.json()),
			fetch("/api/agent/oauth/openai/status").then((res) =>
				res.ok ? res.json() : ({ connected: false } as OpenAIOAuthStatus),
			),
		])
			.then(
				([keysData, oauthData]: [
					{ keys?: ProviderKeyStatus[] },
					OpenAIOAuthStatus,
				]) => {
					if (cancelled) return;
					const set = new Set<KeyProviderId>();
					for (const k of keysData.keys ?? []) {
						if (k.configured) set.add(k.provider);
					}
					const isOauthConnected = oauthData.connected ?? false;
					if (isOauthConnected) {
						// Keep "openai" in the set for backward compat with existing callers
						set.add("openai");
					}
					setConfiguredKeys(set);
					setOauthConnected(isOauthConnected);
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

	return { configuredKeys, oauthConnected, loading };
}
