import { createFileRoute } from "@tanstack/react-router";
import { startOpenAIOAuth } from "#/lib/ai/provider-oauth.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

export const Route = createFileRoute("/api/agent/oauth/openai/start")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await requireAuth(request);
				try {
					const result = await startOpenAIOAuth(session.user.id);
					return Response.json(result);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to start OpenAI authorization";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
