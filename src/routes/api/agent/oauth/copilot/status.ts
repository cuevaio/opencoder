import { createFileRoute } from "@tanstack/react-router";
import { getGitHubCopilotOAuthStatus } from "#/lib/ai/provider-oauth.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

export const Route = createFileRoute("/api/agent/oauth/copilot/status")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await requireAuth(request);
				try {
					const status = await getGitHubCopilotOAuthStatus(session.user.id);
					return Response.json(status);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to load GitHub Copilot status";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
