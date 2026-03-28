import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkGitHubCopilotEntitlement } from "./provider-oauth.ts";

describe("provider-oauth copilot entitlement", () => {
	beforeEach(() => {
		global.fetch = vi.fn() as unknown as typeof fetch;
	});

	it("returns ok=true on 200", async () => {
		vi.mocked(global.fetch).mockResolvedValue(
			new Response("[]", { status: 200 }),
		);

		const result = await checkGitHubCopilotEntitlement("token");

		expect(result).toEqual({ ok: true });
	});

	it("returns licensing error on 403", async () => {
		vi.mocked(global.fetch).mockResolvedValue(
			new Response("unauthorized", { status: 403 }),
		);

		const result = await checkGitHubCopilotEntitlement("token");

		expect(result.ok).toBe(false);
		expect(result.error).toContain("not licensed");
	});

	it("returns network error on throw", async () => {
		vi.mocked(global.fetch).mockRejectedValue(new Error("boom"));

		const result = await checkGitHubCopilotEntitlement("token");

		expect(result.ok).toBe(false);
		expect(result.error).toContain("Could not reach GitHub Copilot");
	});
});
