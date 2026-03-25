import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PanelLeftOpen } from "lucide-react";
import { useCallback, useState } from "react";
import { ChatFooter } from "#/components/chat/ChatFooter.tsx";
import { ChatMobileMenu } from "#/components/chat/ChatMobileMenu.tsx";
import { RepoSelector } from "#/components/chat/RepoSelector.tsx";
import { defaultModel } from "#/lib/ai/model-registry.ts";
import { useChatLayoutContext } from "#/routes/_authed/chat.tsx";

export const Route = createFileRoute("/_authed/chat/")({
	// Prevent router re-evaluation on Electric data changes
	staleTime: Infinity,
	component: NewSessionPage,
});

function NewSessionPage() {
	const navigate = useNavigate();
	const [repoUrl, setRepoUrl] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { setSidebarOpen } = useChatLayoutContext();

	const handleSubmit = useCallback(
		async (prompt: string, mode: "plan" | "build", model: string) => {
			if (!repoUrl.trim() || !prompt.trim()) return;

			setIsSubmitting(true);
			setError(null);

			try {
				const response = await fetch("/api/agent/run", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						repoUrl: repoUrl.trim(),
						prompt: prompt.trim(),
						mode,
						model,
					}),
				});

				const data = (await response.json()) as {
					sessionId?: number;
					error?: string;
				};

				if (!response.ok || !data.sessionId) {
					throw new Error(data.error || "Failed to start agent session");
				}

				// Navigate to the new session URL — URL now owns the state
				await navigate({
					to: "/chat/$sessionId",
					params: { sessionId: String(data.sessionId) },
					replace: false,
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong");
			} finally {
				setIsSubmitting(false);
			}
		},
		[repoUrl, navigate],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/* Mobile header bar with sidebar toggle */}
			<div className="flex min-h-12 items-center justify-between border-b border-border/80 bg-background/90 px-[var(--page-gutter)] py-2 pt-safe backdrop-blur-sm md:hidden">
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setSidebarOpen(true)}
						className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-foreground hover:bg-muted press-scale"
						aria-label="Open sessions sidebar"
					>
						<PanelLeftOpen className="h-5 w-5" />
					</button>
					<span className="text-sm leading-none font-semibold tracking-tight text-foreground">
						New Session
					</span>
				</div>
				<ChatMobileMenu />
			</div>

			<main className="app-container flex w-full min-h-0 flex-1 flex-col justify-center py-6 sm:py-10">
				<div className="surface-panel mx-auto w-full max-w-3xl p-4 sm:p-6">
					<h1 className="mb-2 text-2xl font-bold tracking-tight">
						New Session
					</h1>
					<p className="mb-8 text-sm text-muted-foreground">
						Select a GitHub repository and describe what you want the agent to
						do.
					</p>

					<div className="mb-6">
						<RepoSelector
							value={repoUrl}
							onChange={setRepoUrl}
							disabled={isSubmitting}
						/>
					</div>

					{error && (
						<div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
							{error}
						</div>
					)}

					<ChatFooter
						onSubmit={handleSubmit}
						isSubmitting={isSubmitting}
						disabled={!repoUrl.trim()}
						defaultModel={defaultModel}
					/>
				</div>
			</main>
		</div>
	);
}
