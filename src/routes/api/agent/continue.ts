import { createFileRoute } from "@tanstack/react-router";
import { tasks } from "@trigger.dev/sdk/v3";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { sessionEvents, agentSessions as sessions } from "#/db/schema.ts";
import {
	isAllowedModel,
	normalizeModelId,
	normalizeVariant,
} from "#/lib/ai/model-registry.ts";
import { canExecuteModel } from "#/lib/ai/provider-keys.ts";
import { validateAgentAuth } from "#/lib/auth-helpers.ts";
import type { runSession } from "#/trigger/run-session.ts";

/**
 * POST /api/agent/continue
 * Send a follow-up message to an idle session.
 * Triggers a fresh Trigger.dev task that imports the prior conversation
 * and processes the new prompt.
 */
export const Route = createFileRoute("/api/agent/continue")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const authResult = await validateAgentAuth(request);
				if (authResult instanceof Response) {
					return authResult;
				}

				const { userId, githubToken, userName, userEmail } = authResult;

				const body = (await request.json()) as {
					sessionId?: number;
					prompt?: string;
					mode?: "plan" | "build";
					model?: string;
					variant?: string;
					imageUrls?: Array<{ url: string; mime: string; filename?: string }>;
				};

				const { sessionId, prompt, mode } = body;

				// Validate imageUrls if provided
				const imageUrls = body.imageUrls ?? [];
				if (imageUrls.length > 10) {
					return Response.json(
						{ error: "Too many images. Maximum is 10 per message." },
						{ status: 400 },
					);
				}
				const allowedMimes = new Set([
					"image/png",
					"image/jpeg",
					"image/gif",
					"image/webp",
				]);
				const blobDomain = ".public.blob.vercel-storage.com";
				for (const img of imageUrls) {
					if (!allowedMimes.has(img.mime)) {
						return Response.json(
							{ error: `Unsupported image type: ${img.mime}` },
							{ status: 400 },
						);
					}
					try {
						const u = new URL(img.url);
						if (!u.hostname.endsWith(blobDomain)) {
							return Response.json(
								{ error: "Image URLs must be Vercel Blob URLs" },
								{ status: 400 },
							);
						}
					} catch {
						return Response.json(
							{ error: "Invalid image URL" },
							{ status: 400 },
						);
					}
				}

				if (!sessionId || !prompt) {
					return Response.json(
						{ error: "sessionId and prompt are required" },
						{ status: 400 },
					);
				}

				// Load the session and verify ownership
				const [session] = await db
					.select()
					.from(sessions)
					.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
					.limit(1);

				if (!session) {
					return Response.json({ error: "Session not found" }, { status: 404 });
				}

				if (session.status === "running") {
					return Response.json(
						{ error: "Session is currently running" },
						{ status: 409 },
					);
				}

				if (!session.sessionData) {
					return Response.json(
						{ error: "Session data not available — cannot continue" },
						{ status: 400 },
					);
				}

				if (session.gitStateStatus !== "ready") {
					const error =
						session.gitStateStatus === "none"
							? "This session was created before repository-state persistence. Start a new session to continue with full git state."
							: session.gitStateStatus === "capture_failed"
								? `Repository state was not saved in the previous run${session.gitStateError ? `: ${session.gitStateError}` : ""}`
								: session.gitStateStatus === "restore_failed"
									? `Repository state restore failed${session.gitStateError ? `: ${session.gitStateError}` : ""}`
									: "Repository state is not ready for continue";

					return Response.json({ error }, { status: 400 });
				}

				if (body.model && !isAllowedModel(body.model)) {
					return Response.json(
						{ error: "Unsupported model selected" },
						{ status: 400 },
					);
				}

				const model = normalizeModelId(body.model || session.selectedModel);
				const variant = normalizeVariant(
					model,
					body.variant || session.selectedVariant,
				);
				const modelCheck = await canExecuteModel(userId, model);
				if (!modelCheck.ok) {
					return Response.json({ error: modelCheck.message }, { status: 400 });
				}

				try {
					// Write the user-message event and update session status atomically.
					// The user-message is written here (not in the Trigger task) so that
					// the message bubble appears in the UI immediately via Electric sync,
					// instead of waiting for repo clone + agent startup.
					const nextSeq = (session.eventSeq ?? 0) + 1;

					await db.transaction(async (tx) => {
						await tx.insert(sessionEvents).values({
							sessionId,
							userId,
							seq: nextSeq,
							eventType: "user-message",
							userMessageText: prompt,
							userMessageImages: imageUrls.length > 0 ? imageUrls : null,
						});
						await tx
							.update(sessions)
							.set({
								status: "running",
								lastPrompt: prompt,
								eventSeq: nextSeq,
								mode: mode || (session.mode as "plan" | "build") || "build",
								selectedModel: model,
								selectedVariant: variant,
							})
							.where(
								and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
							);
					});

					// Trigger the task with the existing session's dbSessionId
					const handle = await tasks.trigger<typeof runSession>("run-session", {
						repoUrl: session.repoUrl,
						prompt,
						mode: mode || (session.mode as "plan" | "build") || "build",
						model,
						variant,
						githubToken,
						userId,
						userName,
						userEmail,
						dbSessionId: sessionId,
						continueSessionId: sessionId,
						imageUrls,
					});

					// Write the new triggerRunId separately. Status is already "running",
					// so this UPDATE only changes trigger_run_id — no visible UI impact.
					await db
						.update(sessions)
						.set({ triggerRunId: handle.id })
						.where(
							and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
						);

					return Response.json({ sessionId });
				} catch (error: unknown) {
					// Revert status and eventSeq, remove orphaned user-message event
					try {
						await db.transaction(async (tx) => {
							await tx
								.update(sessions)
								.set({
									status: session.status,
									eventSeq: session.eventSeq ?? 0,
								})
								.where(
									and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
								);
							const nextSeq = (session.eventSeq ?? 0) + 1;
							await tx
								.delete(sessionEvents)
								.where(
									and(
										eq(sessionEvents.sessionId, sessionId),
										eq(sessionEvents.seq, nextSeq),
									),
								);
						});
					} catch {
						// Best-effort revert
					}
					console.error("Failed to trigger continue-session task:", error);
					const message =
						error instanceof Error
							? error.message
							: "Failed to continue agent session";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
