import path from "node:path";
import { createOpencode } from "@opencode-ai/sdk/v2";
import { logger } from "@trigger.dev/sdk/v3";
import type { UserIdentity } from "./clone-repo.ts";

type OpenCodeReturn = Awaited<ReturnType<typeof createOpencode>>;

export interface OpenCodeInstance {
	client: OpenCodeReturn["client"];
	server: OpenCodeReturn["server"];
}

export async function startOpenCodeServer(
	cloneDir: string,
	signal: AbortSignal,
	model: string,
	githubToken: string,
	gitUser: UserIdentity,
): Promise<OpenCodeInstance> {
	const binDir = path.join(process.cwd(), "bin");
	process.env.PATH = `/usr/local/bin:${binDir}:${process.env.PATH}`;

	// Remove server auth so the ephemeral OpenCode server doesn't enforce
	// HTTP Basic Auth (the SDK client doesn't send credentials).
	delete process.env.OPENCODE_SERVER_PASSWORD;
	delete process.env.OPENCODE_SERVER_USERNAME;
	process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE = "1";

	// Expose the user's GitHub token so the agent can use `gh` CLI commands
	// (e.g. `gh pr create`) without needing a separate `gh auth login`.
	process.env.GH_TOKEN = githubToken;

	// Force the git commit author/committer to the authenticated user.
	// Env vars override ALL other mechanisms (git config, --author flag,
	// OpenCode's own defaults), ensuring commits are attributed to the user.
	process.env.GIT_AUTHOR_NAME = gitUser.name;
	process.env.GIT_AUTHOR_EMAIL = gitUser.email;
	process.env.GIT_COMMITTER_NAME = gitUser.name;
	process.env.GIT_COMMITTER_EMAIL = gitUser.email;

	// Must chdir to clone dir so OpenCode operates on the repo
	const originalCwd = process.cwd();
	process.chdir(cloneDir);

	const { client, server } = await createOpencode({
		signal,
		timeout: 30_000,
		port: 0, // Ephemeral port — avoids conflicts when multiple sessions run concurrently
		config: {
			model,
			permission: {
				edit: "allow",
				bash: "allow",
				webfetch: "deny",
			},
			mcp: {},
			tools: {
				read: true,
				write: true,
				edit: true,
				bash: true,
				glob: true,
				grep: true,
			},
		},
	});

	// Restore cwd immediately — server retains its own working directory
	process.chdir(originalCwd);

	return { client, server };
}

export async function authenticateOpenCode(
	client: OpenCodeInstance["client"],
	providerID: "openai" | "anthropic" | "vercel",
	apiKey: string,
): Promise<void> {
	await client.auth.set({
		providerID,
		auth: { type: "api", key: apiKey },
	});
	logger.info("Authenticated OpenCode provider", { providerID });
}
