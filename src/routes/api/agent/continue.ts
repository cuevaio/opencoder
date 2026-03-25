import { createFileRoute } from "@tanstack/react-router";
import { tasks } from "@trigger.dev/sdk/v3";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema.ts";
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

				const { userId, githubToken } = authResult;

				const body = (await request.json()) as {
					sessionId?: number;
					prompt?: string;
					mode?: "plan" | "build";
					model?: string;
					variant?: string;
				};

				const { sessionId, prompt, mode } = body;

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
					// Set status to "running" BEFORE triggering the task to avoid the
					// race where the task starts inserting events while the client still
					// sees "idle" (which causes a visible flash in the UI).
					await db
						.update(sessions)
						.set({
							status: "running",
							lastPrompt: prompt,
							mode: mode || (session.mode as "plan" | "build") || "build",
							selectedModel: model,
							selectedVariant: variant,
						})
						.where(
							and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
						);

					// Trigger the task with the existing session's dbSessionId
					const handle = await tasks.trigger<typeof runSession>("run-session", {
						repoUrl: session.repoUrl,
						prompt,
						mode: mode || (session.mode as "plan" | "build") || "build",
						model,
						variant,
						githubToken,
						userId,
						dbSessionId: sessionId,
						continueSessionId: sessionId,
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
					// Revert status if the trigger failed after we set "running"
					try {
						await db
							.update(sessions)
							.set({ status: session.status })
							.where(
								and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
							);
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
