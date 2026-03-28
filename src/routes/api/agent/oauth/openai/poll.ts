import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4";
import { pollOpenAIOAuth } from "#/lib/ai/provider-oauth.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

const pollSchema = z.object({
	pendingId: z.string().min(1),
});

export const Route = createFileRoute("/api/agent/oauth/openai/poll")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await requireAuth(request);
				const parsed = pollSchema.safeParse(await request.json());
				if (!parsed.success) {
					return Response.json({ error: "Invalid payload" }, { status: 400 });
				}

				try {
					const result = await pollOpenAIOAuth(
						session.user.id,
						parsed.data.pendingId,
					);
					if (result.status === "failed" || result.status === "expired") {
						return Response.json(result, { status: 400 });
					}
					return Response.json(result);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to complete OpenAI authorization";
					return Response.json(
						{ status: "failed", error: message },
						{ status: 500 },
					);
				}
			},
		},
	},
});
