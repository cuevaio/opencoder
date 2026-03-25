import { createFileRoute } from "@tanstack/react-router";
import { wait } from "@trigger.dev/sdk/v3";
import { requireAuth } from "#/lib/auth-helpers.ts";

export const Route = createFileRoute("/api/agent/answer")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				await requireAuth(request);

				const body = (await request.json()) as {
					tokenId?: string;
					answers?: string[][];
					action?: "answer" | "reject" | "cancel";
				};

				if (!body.tokenId) {
					return Response.json(
						{ error: "tokenId is required" },
						{ status: 400 },
					);
				}

				try {
					if (body.action === "cancel") {
						await wait.completeToken(body.tokenId, { type: "cancel" });
					} else if (body.action === "reject" || !body.answers) {
						await wait.completeToken(body.tokenId, { type: "reject" });
					} else {
						await wait.completeToken(body.tokenId, {
							type: "answer",
							answers: body.answers,
						});
					}

					return Response.json({ ok: true });
				} catch (error: unknown) {
					console.error("Failed to complete answer token:", error);
					const message =
						error instanceof Error ? error.message : "Failed to send answer";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
