import { createFileRoute } from "@tanstack/react-router";
import {
	disconnectGitHubCopilotOAuth,
	getGitHubCopilotOAuthStatus,
} from "#/lib/ai/provider-oauth.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

export const Route = createFileRoute("/api/agent/oauth/copilot/disconnect")({
	server: {
		handlers: {
			DELETE: async ({ request }) => {
				const session = await requireAuth(request);
				try {
					await disconnectGitHubCopilotOAuth(session.user.id);
					const status = await getGitHubCopilotOAuthStatus(session.user.id);
					return Response.json(status);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to disconnect GitHub Copilot";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
