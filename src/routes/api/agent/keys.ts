import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod/v4";
import { keyProviderSchema } from "#/lib/ai/model-types.ts";
import {
	deleteProviderKey,
	listProviderKeyStatus,
	upsertProviderKey,
} from "#/lib/ai/provider-keys.ts";
import { requireAuth } from "#/lib/auth-helpers.ts";

const upsertSchema = z.object({
	provider: keyProviderSchema,
	apiKey: z.string().min(1),
});

const deleteSchema = z.object({
	provider: keyProviderSchema,
});

export const Route = createFileRoute("/api/agent/keys")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await requireAuth(request);
				const keys = await listProviderKeyStatus(session.user.id);
				return Response.json({ keys });
			},

			POST: async ({ request }) => {
				const session = await requireAuth(request);

				const parsed = upsertSchema.safeParse(await request.json());
				if (!parsed.success) {
					return Response.json({ error: "Invalid payload" }, { status: 400 });
				}

				await upsertProviderKey(
					session.user.id,
					parsed.data.provider,
					parsed.data.apiKey.trim(),
				);

				const keys = await listProviderKeyStatus(session.user.id);
				return Response.json({ keys });
			},

			DELETE: async ({ request }) => {
				const session = await requireAuth(request);

				const parsed = deleteSchema.safeParse(await request.json());
				if (!parsed.success) {
					return Response.json({ error: "Invalid payload" }, { status: 400 });
				}

				await deleteProviderKey(session.user.id, parsed.data.provider);
				const keys = await listProviderKeyStatus(session.user.id);
				return Response.json({ keys });
			},
		},
	},
});
