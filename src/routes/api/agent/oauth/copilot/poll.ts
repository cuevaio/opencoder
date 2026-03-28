import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pollGitHubCopilotOAuth } from "#/lib/ai/provider-oauth.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

const PollBodySchema = z.object({
	pendingId: z.string().min(1),
});

export const Route = createFileRoute("/api/agent/oauth/copilot/poll")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await requireAuth(request);

				let payload: z.infer<typeof PollBodySchema>;
				try {
					const json = await request.json();
					payload = PollBodySchema.parse(json);
				} catch {
					return Response.json(
						{ error: "Invalid request payload" },
						{ status: 400 },
					);
				}

				try {
					const result = await pollGitHubCopilotOAuth(
						session.user.id,
						payload.pendingId,
					);

					if (result.status === "failed" || result.status === "expired") {
						return Response.json(result, { status: 400 });
					}

					return Response.json(result);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to poll GitHub Copilot authorization";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
