import { createFileRoute } from "@tanstack/react-router";
import { getOpenAIOAuthStatus } from "#/lib/ai/provider-oauth.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

export const Route = createFileRoute("/api/agent/oauth/openai/status")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await requireAuth(request);
				const status = await getOpenAIOAuthStatus(session.user.id);
				return Response.json(status);
			},
		},
	},
});
