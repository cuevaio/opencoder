import { describe, expect, it } from "vitest";
import {
	getCompatibleProviderIds,
	getCompatibleProviders,
	getDefaultProvider,
	providerSupportsModel,
} from "./model-registry.ts";

describe("model registry provider matrix", () => {
	it("excludes openai-oauth for gpt-5-mini", () => {
		expect(getCompatibleProviderIds("gpt-5-mini")).toEqual([
			"github-copilot",
			"openai-key",
			"vercel",
		]);
	});

	it("uses configured provider availability per model", () => {
		const rows = getCompatibleProviders("gpt-5-mini", new Set(["openai"]), {
			openai: true,
			copilot: false,
		});

		expect(rows.map((row) => [row.info.id, row.available])).toEqual([
			["github-copilot", false],
			["openai-key", true],
			["vercel", false],
		]);
	});

	it("picks first configured provider in priority order", () => {
		expect(
			getDefaultProvider("gpt-5-mini", new Set(["openai", "vercel"]), {
				openai: true,
				copilot: false,
			}),
		).toBe("openai-key");

		expect(
			getDefaultProvider("gpt-5-mini", new Set(["openai", "vercel"]), {
				openai: true,
				copilot: true,
			}),
		).toBe("github-copilot");
	});

	it("checks provider support matrix", () => {
		expect(providerSupportsModel("openai-oauth", "gpt-5-mini")).toBe(false);
		expect(providerSupportsModel("openai-oauth", "gpt-5.4")).toBe(true);
		expect(providerSupportsModel("openai-oauth", "gpt-5.4-mini")).toBe(true);
		expect(providerSupportsModel("openai-oauth", "gpt-5.3-codex")).toBe(true);
		expect(providerSupportsModel("openai-oauth", "gpt-5.3-codex-spark")).toBe(
			true,
		);
		expect(providerSupportsModel("openai-oauth", "gpt-5.2")).toBe(false);
		expect(providerSupportsModel("github-copilot", "gpt-5.3-codex")).toBe(
			false,
		);
		expect(providerSupportsModel("github-copilot", "gpt-4.1")).toBe(true);
		expect(providerSupportsModel("github-copilot", "gpt-4o")).toBe(true);
		expect(providerSupportsModel("github-copilot", "claude-haiku-4.5")).toBe(
			true,
		);
		expect(providerSupportsModel("anthropic-key", "claude-opus-4.6")).toBe(
			true,
		);
		expect(providerSupportsModel("anthropic-key", "gpt-5.2")).toBe(false);
	});

	it("keeps copilot and codex model lists to known supported sets", () => {
		expect(getCompatibleProviderIds("gpt-4.1")).toEqual([
			"github-copilot",
			"openai-key",
			"vercel",
		]);
		expect(getCompatibleProviderIds("gpt-4o")).toEqual([
			"github-copilot",
			"openai-key",
			"vercel",
		]);
		expect(getCompatibleProviderIds("claude-haiku-4.5")).toEqual([
			"github-copilot",
			"anthropic-key",
			"vercel",
		]);
		expect(getCompatibleProviderIds("gpt-5.4")).toEqual([
			"openai-oauth",
			"openai-key",
			"vercel",
		]);
		expect(getCompatibleProviderIds("gpt-5.4-mini")).toEqual([
			"openai-oauth",
			"openai-key",
			"vercel",
		]);
		expect(getCompatibleProviderIds("gpt-5.3-codex-spark")).toEqual([
			"openai-oauth",
			"openai-key",
			"vercel",
		]);
		expect(getCompatibleProviderIds("gpt-5.2")).toEqual([
			"openai-key",
			"vercel",
		]);
	});
});
