import { createFileRoute } from "@tanstack/react-router";
import {
	disconnectOpenAIOAuth,
	getOpenAIOAuthStatus,
} from "#/lib/ai/provider-oauth.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

export const Route = createFileRoute("/api/agent/oauth/openai/disconnect")({
	server: {
		handlers: {
			DELETE: async ({ request }) => {
				const session = await requireAuth(request);
				await disconnectOpenAIOAuth(session.user.id);
				const status = await getOpenAIOAuthStatus(session.user.id);
				return Response.json(status);
			},
		},
	},
});
