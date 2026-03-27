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
			preferredSource: "electric",
			requireNeonCatchupToSeq: undefined,
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
				preferredSource: "neon",
				requireNeonCatchupToSeq: undefined,
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
			preferredSource: "neon",
			requireNeonCatchupToSeq: undefined,
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
			preferredSource: "neon",
			requireNeonCatchupToSeq: undefined,
		});
	});

	it("requires Neon catch-up when Electric has newer seqs", () => {
		expect(
			resolveSessionEventSource({
				sessionStatus: "running",
				hasFreshSessionStatus: true,
				electricSyncError: "sync failed",
				latestElectricSeq: 320,
				latestNeonSeq: 300,
			}),
		).toEqual({
			useElectricEvents: true,
			useNeonEvents: true,
			preferredSource: "neon",
			requireNeonCatchupToSeq: 320,
		});
	});
});
