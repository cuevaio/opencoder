import { createFileRoute } from "@tanstack/react-router";
import { put } from "@vercel/blob";
import { requireAuth } from "#/lib/auth-helpers.ts";

const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5 MB
const ALLOWED_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
]);

export const Route = createFileRoute("/api/upload/image")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const authSession = await requireAuth(request);
				const userId = authSession.user.id;

				let formData: FormData;
				try {
					formData = await request.formData();
				} catch {
					return Response.json(
						{ error: "Invalid request body" },
						{ status: 400 },
					);
				}

				const file = formData.get("file");
				if (!(file instanceof File)) {
					return Response.json({ error: "No file provided" }, { status: 400 });
				}

				if (!ALLOWED_MIME_TYPES.has(file.type)) {
					return Response.json(
						{
							error: "Unsupported file type. Allowed: PNG, JPEG, GIF, WebP",
						},
						{ status: 400 },
					);
				}

				if (file.size > MAX_FILE_SIZE) {
					return Response.json(
						{ error: "File too large. Maximum size is 4.5MB." },
						{ status: 413 },
					);
				}

				const ext = file.type.split("/")[1] ?? "png";
				const timestamp = Date.now();
				const randomId = globalThis.crypto.randomUUID().slice(0, 8);
				const pathname = `uploads/${userId}/${timestamp}-${randomId}.${ext}`;

				try {
					const blob = await put(pathname, file, {
						access: "public",
						contentType: file.type,
					});

					return Response.json({
						url: blob.url,
						mime: file.type,
						filename: file.name,
						size: file.size,
					});
				} catch (error) {
					console.error("Blob upload failed:", error);
					const message =
						error instanceof Error ? error.message : "Upload failed";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
