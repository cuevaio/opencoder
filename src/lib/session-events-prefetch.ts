import { createSessionEventsCollection } from "#/lib/collections.ts";

interface SessionEventsPrefetchEntry {
	sessionId: number;
	collection: ReturnType<typeof createSessionEventsCollection>;
	lastTouchedAt: number;
	timeoutId: ReturnType<typeof setTimeout> | null;
	preloadPromise: Promise<void> | null;
}

interface SessionEventsPrefetchManagerOptions {
	maxPrefetchedSessions?: number;
	ttlMs?: number;
}

interface SessionEventsPrefetchManager {
	prefetch: (
		sessionId: number,
		activeSessionId?: number | null,
	) => Promise<void>;
	setActiveSession: (sessionId: number | null) => void;
	destroy: () => Promise<void>;
}

function logPrefetch(event: string, details: Record<string, unknown>) {
	if (!import.meta.env.DEV) return;
	console.info(`[session-prefetch] ${event}`, details);
}

export function createSessionEventsPrefetchManager(
	options?: SessionEventsPrefetchManagerOptions,
): SessionEventsPrefetchManager {
	const maxPrefetchedSessions = Math.max(
		1,
		options?.maxPrefetchedSessions ?? 1,
	);
	const ttlMs = Math.max(5_000, options?.ttlMs ?? 45_000);
	const entries = new Map<number, SessionEventsPrefetchEntry>();
	let activeSessionId: number | null = null;
	let isDestroyed = false;

	function scheduleExpiry(entry: SessionEventsPrefetchEntry): void {
		if (entry.timeoutId) {
			clearTimeout(entry.timeoutId);
		}

		entry.timeoutId = setTimeout(() => {
			void cleanupEntry(entry.sessionId, "ttl-expired");
		}, ttlMs);
	}

	async function cleanupEntry(
		sessionId: number,
		reason: string,
	): Promise<void> {
		const entry = entries.get(sessionId);
		if (!entry) return;

		if (entry.timeoutId) {
			clearTimeout(entry.timeoutId);
		}

		entries.delete(sessionId);
		await entry.collection.cleanup();
		logPrefetch("cleanup", { sessionId, reason });
	}

	function getOldestPrefetchedSession(): number | null {
		let oldest: SessionEventsPrefetchEntry | null = null;

		for (const entry of entries.values()) {
			if (!oldest || entry.lastTouchedAt < oldest.lastTouchedAt) {
				oldest = entry;
			}
		}

		return oldest?.sessionId ?? null;
	}

	async function enforceCap(keepSessionId: number): Promise<void> {
		while (entries.size >= maxPrefetchedSessions) {
			const oldestSessionId = getOldestPrefetchedSession();
			if (oldestSessionId == null) break;

			if (oldestSessionId === keepSessionId) break;

			await cleanupEntry(oldestSessionId, "cap-eviction");
		}
	}

	return {
		prefetch: async (sessionId: number, activeOverride?: number | null) => {
			if (isDestroyed) return;

			const effectiveActiveSessionId =
				typeof activeOverride === "number" ? activeOverride : activeSessionId;
			if (sessionId === effectiveActiveSessionId) {
				logPrefetch("skip-active", { sessionId });
				return;
			}

			const existing = entries.get(sessionId);
			if (existing) {
				existing.lastTouchedAt = Date.now();
				scheduleExpiry(existing);
				logPrefetch("hit", { sessionId });
				await existing.preloadPromise;
				return;
			}

			await enforceCap(sessionId);

			const collection = createSessionEventsCollection(sessionId);
			const entry: SessionEventsPrefetchEntry = {
				sessionId,
				collection,
				lastTouchedAt: Date.now(),
				timeoutId: null,
				preloadPromise: null,
			};

			entry.preloadPromise = collection.preload().catch((error: unknown) => {
				logPrefetch("error", {
					sessionId,
					error: error instanceof Error ? error.message : String(error),
				});
			});

			entries.set(sessionId, entry);
			scheduleExpiry(entry);
			logPrefetch("start", { sessionId });
			await entry.preloadPromise;
		},
		setActiveSession: (sessionId: number | null) => {
			if (isDestroyed) return;
			activeSessionId = sessionId;

			if (sessionId == null) return;

			if (entries.has(sessionId)) {
				void cleanupEntry(sessionId, "became-active");
			}
		},
		destroy: async () => {
			if (isDestroyed) return;
			isDestroyed = true;

			const sessionIds = [...entries.keys()];
			for (const sessionId of sessionIds) {
				await cleanupEntry(sessionId, "manager-destroy");
			}
		},
	};
}
