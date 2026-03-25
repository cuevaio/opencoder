import { createFileRoute } from "@tanstack/react-router";
import { runs } from "@trigger.dev/sdk/v3";
import { requireAuth } from "#/lib/auth-helpers.ts";

export const Route = createFileRoute("/api/agent/cancel")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const session = await requireAuth(request);
				const userId = session.user.id;

				const { runId } = (await request.json()) as { runId?: string };
				if (!runId) {
					return Response.json({ error: "runId is required" }, { status: 400 });
				}

				try {
					// Verify the run belongs to this user via metadata
					const run = await runs.retrieve(runId);
					const currentMeta = (run.metadata as Record<string, unknown>) || {};
					if (currentMeta.userId !== userId) {
						return Response.json({ error: "Forbidden" }, { status: 403 });
					}

					// Set cancelRequested flag — the task polls for this and aborts
					const triggerApiUrl =
						process.env.TRIGGER_API_URL || "https://api.trigger.dev";
					const triggerSecretKey = process.env.TRIGGER_SECRET_KEY;

					if (!triggerSecretKey) {
						throw new Error(
							"TRIGGER_SECRET_KEY is required for metadata updates",
						);
					}

					const metaResponse = await fetch(
						`${triggerApiUrl}/api/v1/runs/${runId}/metadata`,
						{
							method: "PUT",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${triggerSecretKey}`,
							},
							body: JSON.stringify({
								metadata: { ...currentMeta, cancelRequested: true },
							}),
						},
					);

					if (!metaResponse.ok) {
						const errorText = await metaResponse.text();
						throw new Error(
							`Metadata update failed: ${metaResponse.status} ${errorText}`,
						);
					}

					return Response.json({ ok: true });
				} catch (error: unknown) {
					console.error("Failed to cancel run:", error);
					const message =
						error instanceof Error ? error.message : "Failed to cancel run";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
