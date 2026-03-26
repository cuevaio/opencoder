import { rmSync } from "node:fs";
import { logger, metadata, schemaTask } from "@trigger.dev/sdk/v3";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "#/db/index.ts";
import { agentSessions as sessions } from "#/db/schema";
import { defaultModel } from "#/lib/ai/model-registry.ts";
import { modelIdSchema } from "#/lib/ai/model-types.ts";
import { resolveModelExecution } from "#/lib/ai/provider-keys.ts";
import type { SessionExportData } from "#/lib/session-types";
import { resetCancelChecker } from "./lib/cancel-checker";
import { cloneRepo } from "./lib/clone-repo";
import { SessionDbWriter } from "./lib/db-writer";
import {
	type EventHandlerContext,
	type EventLoopOutcome,
	processEventStream,
} from "./lib/event-handler";
import {
	captureGitState,
	loadGitState,
	markGitStateFailure,
	restoreGitState,
	saveGitState,
} from "./lib/git-state";
import {
	authenticateOpenCode,
	startOpenCodeServer,
} from "./lib/opencode-server";
import { exportAndPersistSession } from "./lib/session-export";
import { importSessionToSqlite } from "./lib/session-import";

const runSessionSchema = z.object({
	repoUrl: z.url(),
	prompt: z.string().min(1),
	mode: z.enum(["plan", "build"]).default("build"),
	model: modelIdSchema.default(defaultModel),
	/** Reasoning/thinking variant (e.g. "max", "high", "medium"). */
	variant: z.string().min(1).default("max"),
	githubToken: z.string().min(1),
	userId: z.string().min(1),
	/** Display name of the authenticated user — used as the git commit author. */
	userName: z.string().min(1),
	/** Email of the authenticated user — used as the git commit author. */
	userEmail: z.string().min(1),
	/** DB session ID — created by the API route before triggering the task */
	dbSessionId: z.number(),
	/** When set, continue an existing session instead of creating a new one */
	continueSessionId: z.number().optional(),
	/** Image attachments to pass to OpenCode alongside the text prompt */
	imageUrls: z
		.array(
			z.object({
				url: z.url(),
				mime: z.string(),
				filename: z.string().optional(),
			}),
		)
		.default([]),
});

export type RunSessionPayload = z.infer<typeof runSessionSchema>;

export const runSession = schemaTask({
	id: "run-session",
	schema: runSessionSchema,
	machine: "medium-2x",
	maxDuration: 3600,
	retry: {
		maxAttempts: 1,
		outOfMemory: {
			machine: "large-1x",
		},
	},
	run: async (payload, { ctx }) => {
		const runId = ctx.run.id;
		const abortController = new AbortController();
		resetCancelChecker();

		metadata.set("status", "cloning");
		metadata.set("userId", payload.userId);

		const dbSessionId = payload.dbSessionId;
		metadata.set("dbSessionId", dbSessionId);

		// ── Initialize the real-time DB writer ──
		const dbWriter = new SessionDbWriter(dbSessionId, payload.userId);
		// Seed seq from DB so continued sessions append after existing events
		await dbWriter.init();
		if (!payload.continueSessionId) {
			await dbWriter.writeStatus("Cloning repository...");
		}

		// If continuing, load session data from Postgres
		let continueData: SessionExportData | null = null;
		let continueGitState: Awaited<ReturnType<typeof loadGitState>> = null;
		if (payload.continueSessionId) {
			const [row, gitState] = await Promise.all([
				db
					.select({ sessionData: sessions.sessionData })
					.from(sessions)
					.where(eq(sessions.id, payload.continueSessionId))
					.limit(1)
					.then((rows) => rows[0]),
				loadGitState(payload.continueSessionId),
			]);

			if (row?.sessionData) {
				continueData = row.sessionData as SessionExportData;
			} else {
				logger.warn("Continue session: no session data found", {
					continueSessionId: payload.continueSessionId,
				});
			}

			continueGitState = gitState;
		}

		let tmpDir: string | undefined;
		try {
			// ── Step 1: Clone repo ──
			const clone = cloneRepo(payload.repoUrl, payload.githubToken, {
				name: payload.userName,
				email: payload.userEmail,
			});
			tmpDir = clone.tmpDir;
			metadata.set("repository", `${clone.owner}/${clone.repoName}`);

			if (payload.continueSessionId) {
				if (!continueGitState) {
					const message =
						"Git state is not available for this session. Start a new session to continue.";
					await markGitStateFailure(dbSessionId, "restore_failed", message);
					throw new Error(message);
				}

				try {
					restoreGitState({
						cloneDir: clone.cloneDir,
						owner: clone.owner,
						repoName: clone.repoName,
						githubToken: payload.githubToken,
						state: continueGitState,
					});
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to restore repository state";
					await markGitStateFailure(dbSessionId, "restore_failed", message);
					throw new Error(`Failed to restore repository state: ${message}`);
				}
			}

			// ── Step 2: Start OpenCode server ──
			metadata.set("status", "starting-agent");
			if (!payload.continueSessionId) {
				await dbWriter.writeStatus("Starting AI agent...");
			}

			const modelExecution = await resolveModelExecution(
				payload.userId,
				payload.model,
			);

			const { client, server } = await startOpenCodeServer(
				clone.cloneDir,
				abortController.signal,
				modelExecution.fullModel,
				payload.githubToken,
			);

			try {
				await authenticateOpenCode(
					client,
					modelExecution.providerID,
					modelExecution.apiKey,
				);
				metadata.set("status", "agent-ready");

				// ── Step 3: Create or import session ──
				let sessionId: string;

				if (continueData) {
					// Create a throwaway session to ensure SQLite schema is initialized.
					// OpenCode lazily creates its tables on the first session.create() call;
					// without this, the direct-SQLite import would fail with "no such table".
					await client.session.create({ title: "init" });

					// Import the past session into OpenCode's SQLite
					sessionId = await importSessionToSqlite(
						client,
						continueData,
						clone.cloneDir,
					);
					logger.info("Imported previous session", { sessionId });
				} else {
					// Create a fresh session
					const sessionResult = await client.session.create({
						title: `Coder: ${clone.repoName}`,
					});
					const newId = sessionResult.data?.id;
					if (!newId) {
						throw new Error("Failed to create OpenCode session");
					}
					sessionId = newId;
				}

				// opencodeSessionId is written in exportAndPersistSession() so that
				// it lands in the same atomic UPDATE as status/sessionData — avoiding
				// an extra Electric WAL entry (and client re-render) mid-execution.

				metadata.set("model", modelExecution.fullModel);

				const toolCalls: string[] = [];
				const seenToolCallIds = new Set<string>();

				// Mutable context shared with the event handler.
				const eventCtx: EventHandlerContext = {
					client,
					sessionId,
					runId,
					dbSessionId,
					dbWriter,
					toolCalls,
					seenToolCallIds,
					partCache: new Map(),
				};

				// ── Step 4: Single round — process agent output ──
				let outcome = "idle" as "idle" | "cancelled";

				metadata.set("status", "agent-working");

				// The user-message event is written by the API route
				// (run.ts / continue.ts) so the message bubble appears immediately.

				// Build prompt parts: text + any image attachments.
				const promptParts: Array<
					| { type: "text"; text: string }
					| { type: "file"; mime: string; url: string; filename?: string }
				> = [{ type: "text", text: payload.prompt }];
				for (const img of payload.imageUrls) {
					promptParts.push({
						type: "file",
						mime: img.mime,
						url: img.url,
						filename: img.filename,
					});
				}

				// Send the prompt with user-selected reasoning variant.
				// OpenCode ignores the variant for models without reasoning capability.
				await client.session.promptAsync({
					sessionID: sessionId,
					model: {
						providerID: modelExecution.providerID,
						modelID: modelExecution.modelID,
					},
					parts: promptParts,
					agent: payload.mode,
					variant: payload.variant,
				});

				// Process SSE events (inner loop handles resubscribe)
				while (true) {
					const loopOutcome: EventLoopOutcome = await processEventStream(
						eventCtx,
						metadata,
					);

					if (loopOutcome === "cancelled") {
						outcome = "cancelled";
						break;
					}
					if (loopOutcome === "resubscribe") continue;

					// outcome === "idle" → round complete
					break;
				}

				// Signal that the round is done
				await dbWriter.writeRoundComplete();

				const finalStatus = outcome === "cancelled" ? "completed" : "idle";
				metadata.set("status", finalStatus);

				let gitState:
					| {
							status: "ready" | "capture_failed";
							error: string | null;
							capturedAt: Date | null;
							bytes: number | null;
							head: string | null;
							branch: string | null;
					  }
					| undefined;

				try {
					const nextState = captureGitState({
						cloneDir: clone.cloneDir,
						owner: clone.owner,
						repoName: clone.repoName,
					});
					await saveGitState(dbSessionId, nextState);
					gitState = {
						status: "ready",
						error: null,
						capturedAt: nextState.capturedAt,
						bytes: nextState.bytes,
						head: nextState.headOid,
						branch: nextState.branch,
					};
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Failed to save repository state";
					gitState = {
						status: "capture_failed",
						error: message,
						capturedAt: null,
						bytes: null,
						head: null,
						branch: null,
					};
					await markGitStateFailure(dbSessionId, "capture_failed", message);
					await dbWriter.writeStatus(
						"Warning: failed to save repository state for next continue.",
					);
				}

				// ── Step 5: Flush DB writer, then export & persist in one atomic UPDATE ──
				// close() flushes pending text deltas and stops the timer, but does NOT
				// write event_seq to agent_sessions. Instead we pass getFinalSeq() to
				// exportAndPersistSession so everything lands in a single UPDATE →
				// one Electric WAL entry → one client re-render (not two).
				await dbWriter.close();
				const finalEventSeq = dbWriter.getFinalSeq();

				await exportAndPersistSession({
					client,
					sessionId,
					dbSessionId,
					initialPrompt: payload.prompt,
					toolCallCount: toolCalls.length,
					status: finalStatus,
					eventSeq: finalEventSeq,
					gitState,
				});

				logger.info("Session round completed", {
					outcome,
					toolCallCount: toolCalls.length,
					finalEventSeq,
				});

				return {
					status: finalStatus,
					toolCallCount: toolCalls.length,
				};
			} finally {
				abortController.abort();
				server.close();
				logger.info("OpenCode server closed");
			}
		} finally {
			// Ensure the DB writer is closed even if an error was thrown before the
			// normal close() call above. close() is idempotent (clears the timer).
			try {
				await dbWriter.close();
			} catch {
				// Best-effort
			}

			// Mark session as failed if it didn't complete normally
			try {
				const currentStatus = metadata.get("status");
				if (currentStatus !== "completed" && currentStatus !== "idle") {
					await db
						.update(sessions)
						.set({ status: "failed", completedAt: new Date() })
						.where(eq(sessions.id, dbSessionId));
				}
			} catch {
				// Best-effort
			}

			if (tmpDir) {
				try {
					rmSync(tmpDir, { recursive: true, force: true });
				} catch {
					logger.warn("Failed to cleanup temp directory");
				}
			}
		}
	},
});
