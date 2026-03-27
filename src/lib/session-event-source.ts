interface ResolveSessionEventSourceInput {
	sessionStatus?: string | null;
	electricSyncError?: string | null;
	hasFreshSessionStatus?: boolean;
}

interface SessionEventSourceSelection {
	useElectricEvents: boolean;
	useNeonEvents: boolean;
}

export function resolveSessionEventSource({
	sessionStatus,
	electricSyncError,
	hasFreshSessionStatus = true,
}: ResolveSessionEventSourceInput): SessionEventSourceSelection {
	const useElectricEvents =
		hasFreshSessionStatus && sessionStatus === "running";
	const useNeonEvents = !useElectricEvents || Boolean(electricSyncError);

	return {
		useElectricEvents,
		useNeonEvents,
	};
}
