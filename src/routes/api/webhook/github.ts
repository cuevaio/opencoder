import crypto from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

const WEBHOOK_SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET ?? "";

// ─── Signature verification ─────────────────────────────

function verifySignature(payload: string, signature: string | null): boolean {
	if (!signature || !WEBHOOK_SECRET) return false;
	const expected = `sha256=${crypto
		.createHmac("sha256", WEBHOOK_SECRET)
		.update(payload)
		.digest("hex")}`;
	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ─── Route handler ──────────────────────────────────────

export const Route = createFileRoute("/api/webhook/github")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = await request.text();
				const signature = request.headers.get("x-hub-signature-256");

				if (!verifySignature(body, signature)) {
					return Response.json({ error: "Invalid signature" }, { status: 401 });
				}

				const event = request.headers.get("x-github-event") ?? "unknown";

				try {
					JSON.parse(body);
				} catch (err) {
					console.error(`[github-webhook] Invalid payload for ${event}:`, err);
					return Response.json(
						{ error: "Invalid webhook payload" },
						{ status: 400 },
					);
				}

				// Verified no-op: signature is valid and payload is parseable.
				return Response.json({ ok: true });
			},
		},
	},
});
