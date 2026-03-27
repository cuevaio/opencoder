interface ResolveSessionEventSourceInput {
	sessionStatus?: string | null;
	electricSyncError?: string | null;
	hasFreshSessionStatus?: boolean;
	latestElectricSeq?: number | null;
	latestNeonSeq?: number | null;
}

export interface SessionEventSourceSelection {
	useElectricEvents: boolean;
	useNeonEvents: boolean;
	preferredSource: "electric" | "neon";
	requireNeonCatchupToSeq?: number;
}

export function resolveSessionEventSource({
	sessionStatus,
	electricSyncError,
	hasFreshSessionStatus = true,
	latestElectricSeq,
	latestNeonSeq,
}: ResolveSessionEventSourceInput): SessionEventSourceSelection {
	const useElectricEvents =
		hasFreshSessionStatus && sessionStatus === "running";
	const useNeonEvents = !useElectricEvents || Boolean(electricSyncError);
	const preferredSource =
		useElectricEvents && !electricSyncError ? "electric" : "neon";

	const requireNeonCatchupToSeq =
		useElectricEvents &&
		useNeonEvents &&
		typeof latestElectricSeq === "number" &&
		(typeof latestNeonSeq !== "number" || latestNeonSeq < latestElectricSeq)
			? latestElectricSeq
			: undefined;

	return {
		useElectricEvents,
		useNeonEvents,
		preferredSource,
		requireNeonCatchupToSeq,
	};
}
