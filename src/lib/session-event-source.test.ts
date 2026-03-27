import { describe, expect, it } from "vitest";
import { resolveSessionEventSource } from "#/lib/session-event-source.ts";

describe("resolveSessionEventSource", () => {
	it("uses Electric only for running sessions with fresh status", () => {
		expect(
			resolveSessionEventSource({
				sessionStatus: "running",
				hasFreshSessionStatus: true,
			}),
		).toEqual({
			useElectricEvents: true,
			useNeonEvents: false,
		});
	});

	it("uses Neon for non-running statuses", () => {
		for (const sessionStatus of ["idle", "completed", "failed"]) {
			expect(
				resolveSessionEventSource({
					sessionStatus,
					hasFreshSessionStatus: true,
				}),
			).toEqual({
				useElectricEvents: false,
				useNeonEvents: true,
			});
		}
	});

	it("uses Neon before status has been freshly fetched", () => {
		expect(
			resolveSessionEventSource({
				sessionStatus: "running",
				hasFreshSessionStatus: false,
			}),
		).toEqual({
			useElectricEvents: false,
			useNeonEvents: true,
		});
	});

	it("keeps Neon fallback on when Electric has an error", () => {
		expect(
			resolveSessionEventSource({
				sessionStatus: "running",
				hasFreshSessionStatus: true,
				electricSyncError: "sync failed",
			}),
		).toEqual({
			useElectricEvents: true,
			useNeonEvents: true,
		});
	});
});
