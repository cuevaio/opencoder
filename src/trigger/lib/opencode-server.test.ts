import { createOpencode } from "@opencode-ai/sdk/v2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startOpenCodeServer } from "./opencode-server";

vi.mock("@opencode-ai/sdk/v2", () => ({
	createOpencode: vi.fn(),
}));

describe("startOpenCodeServer", () => {
	const originalPath = process.env.PATH;
	const originalPlanMode = process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE;

	afterEach(() => {
		vi.clearAllMocks();

		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}

		if (originalPlanMode === undefined) {
			delete process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE;
		} else {
			process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE = originalPlanMode;
		}
	});

	it("sets OPENCODE_EXPERIMENTAL_PLAN_MODE=1 before launching OpenCode", async () => {
		process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE = "0";

		const createOpencodeMock = vi.mocked(createOpencode);
		createOpencodeMock.mockImplementation(async () => {
			expect(process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE).toBe("1");
			return {
				client: {},
				server: { close: vi.fn() },
			} as unknown as Awaited<ReturnType<typeof createOpencode>>;
		});

		await startOpenCodeServer(
			process.cwd(),
			new AbortController().signal,
			"openai/gpt-5.3-codex",
		);

		expect(createOpencodeMock).toHaveBeenCalledTimes(1);
		expect(process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE).toBe("1");
	});
});
