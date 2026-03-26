import { useEffect, useState } from "react";
import type { KeyProviderId } from "#/lib/ai/model-registry.ts";

interface ProviderKeyStatus {
	provider: KeyProviderId;
	configured: boolean;
}

export function useProviderKeyStatus(): {
	configuredKeys: Set<KeyProviderId>;
	loading: boolean;
} {
	const [configuredKeys, setConfiguredKeys] = useState<Set<KeyProviderId>>(
		new Set(),
	);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		fetch("/api/agent/keys")
			.then((res) => res.json())
			.then((data: { keys?: ProviderKeyStatus[] }) => {
				if (cancelled) return;
				const set = new Set<KeyProviderId>();
				for (const k of data.keys ?? []) {
					if (k.configured) set.add(k.provider);
				}
				setConfiguredKeys(set);
			})
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

	return { configuredKeys, loading };
}
