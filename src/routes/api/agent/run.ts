import { createFileRoute } from "@tanstack/react-router";
import { tasks } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema.ts";
import { isAllowedModel, normalizeModelId } from "#/lib/ai/model-registry.ts";
import { canExecuteModel } from "#/lib/ai/provider-keys.ts";
import { validateAgentAuth } from "#/lib/auth-helpers.ts";
import type { runSession } from "#/trigger/run-session.ts";

const transientDbErrorCodes = new Set([
	"ETIMEDOUT",
	"ECONNRESET",
	"ECONNREFUSED",
	"ENETUNREACH",
	"EHOSTUNREACH",
	"57P01",
	"53300",
]);

function getNestedErrors(error: unknown): Array<{ code?: unknown }> {
	if (!error || typeof error !== "object") {
		return [];
	}

	const nested: Array<{ code?: unknown }> = [error as { code?: unknown }];
	if ("cause" in error) {
		nested.push(...getNestedErrors((error as { cause?: unknown }).cause));
	}
	if ("errors" in error) {
		const maybeErrors = (error as { errors?: unknown }).errors;
		if (Array.isArray(maybeErrors)) {
			for (const nestedError of maybeErrors) {
				nested.push(...getNestedErrors(nestedError));
			}
		}
	}

	return nested;
}

function isTransientDbError(error: unknown): boolean {
	return getNestedErrors(error).some((entry) => {
		return (
			typeof entry.code === "string" && transientDbErrorCodes.has(entry.code)
		);
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function withTransientDbRetry<T>(
	operation: () => Promise<T>,
	attempts = 3,
): Promise<T> {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (!isTransientDbError(error) || attempt === attempts) {
				throw error;
			}

			const jitterMs = Math.floor(Math.random() * 40);
			await sleep(attempt * 150 + jitterMs);
		}
	}

	throw new Error("Unexpected retry failure");
}

export const Route = createFileRoute("/api/agent/run")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const authResult = await validateAgentAuth(request);
				if (authResult instanceof Response) {
					return authResult;
				}

				const { userId, githubToken } = authResult;

				const body = (await request.json()) as {
					repoUrl?: string;
					prompt?: string;
					mode?: "plan" | "build";
					model?: string;
				};
				const { repoUrl, prompt, mode } = body;
				if (body.model && !isAllowedModel(body.model)) {
					return Response.json(
						{ error: "Unsupported model selected" },
						{ status: 400 },
					);
				}
				const model = normalizeModelId(body.model);

				if (!repoUrl || !prompt) {
					return Response.json(
						{ error: "repoUrl and prompt are required" },
						{ status: 400 },
					);
				}

				// Basic GitHub URL validation
				const githubUrlPattern =
					/^https?:\/\/(www\.)?github\.com\/[\w-]+\/[\w.-]+/;
				if (!githubUrlPattern.test(repoUrl)) {
					return Response.json(
						{ error: "Invalid GitHub URL format" },
						{ status: 400 },
					);
				}

				const modelCheck = await canExecuteModel(userId, model);
				if (!modelCheck.ok) {
					return Response.json({ error: modelCheck.message }, { status: 400 });
				}

				let dbSessionId: number | undefined;
				let taskTriggered = false;

				try {
					const repoMatch = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
					const repoFullName = repoMatch
						? repoMatch[1].replace(/\.git$/, "")
						: repoUrl;

					// Create the DB row first with a placeholder triggerRunId
					const [dbRow] = await withTransientDbRetry(() => {
						return db
							.insert(sessions)
							.values({
								userId,
								repoUrl,
								repoFullName,
								triggerRunId: "pending",
								title: prompt.slice(0, 100),
								initialPrompt: prompt,
								mode: mode || "build",
								selectedModel: model,
								status: "running",
							})
							.returning({ id: sessions.id });
					});

					dbSessionId = dbRow.id;
					if (typeof dbSessionId !== "number") {
						throw new Error("Failed to create session record");
					}
					const createdSessionId = dbSessionId;

					// Trigger the task with the real dbSessionId
					const handle = await tasks.trigger<typeof runSession>("run-session", {
						repoUrl,
						prompt,
						mode: mode || "build",
						model,
						githubToken,
						userId,
						dbSessionId: createdSessionId,
					});
					taskTriggered = true;

					// Update the DB row with the real triggerRunId
					await withTransientDbRetry(() => {
						return db
							.update(sessions)
							.set({ triggerRunId: handle.id })
							.where(eq(sessions.id, createdSessionId));
					});

					return Response.json({ sessionId: createdSessionId });
				} catch (error: unknown) {
					if (typeof dbSessionId === "number" && !taskTriggered) {
						try {
							await db
								.update(sessions)
								.set({ status: "failed", completedAt: new Date() })
								.where(eq(sessions.id, dbSessionId));
						} catch {
							// Best-effort
						}
					}

					console.error("Failed to trigger run-session task:", error);
					if (isTransientDbError(error)) {
						return Response.json(
							{ error: "Database temporarily unavailable. Please try again." },
							{ status: 503 },
						);
					}

					const message =
						error instanceof Error
							? error.message
							: "Failed to start agent session";
					return Response.json({ error: message }, { status: 500 });
				}
			},
		},
	},
});
