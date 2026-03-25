import { metadata, runs } from "@trigger.dev/sdk/v3";

let lastCancelCheck = 0;

export async function checkCancel(runId: string): Promise<boolean> {
	const now = Date.now();
	if (now - lastCancelCheck < 2000) return false;
	lastCancelCheck = now;

	try {
		const run = await runs.retrieve(runId);
		const meta = run.metadata as Record<string, unknown> | undefined;
		if (meta?.cancelRequested) {
			metadata.del("cancelRequested");
			await metadata.flush();
			return true;
		}
	} catch {
		// API failure — skip this check
	}
	return false;
}

export function resetCancelChecker(): void {
	lastCancelCheck = 0;
}
