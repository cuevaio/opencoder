import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ChatView } from "#/components/chat/ChatView.tsx";
import type { SelectedProvider } from "#/lib/ai/model-registry.ts";

export const Route = createFileRoute("/_authed/chat/$sessionId")({
	// Prevent router re-evaluation on Electric data changes
	staleTime: Infinity,
	component: ChatSessionPage,
});

function ChatSessionPage() {
	const params = Route.useParams();
	const sessionId = Number(params.sessionId);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [syncAttempt, setSyncAttempt] = useState(0);

	const handleNewSession = useCallback(() => {
		navigate({ to: "/chat" });
	}, [navigate]);

	const handleFollowup = useCallback(
		async (
			prompt: string,
			mode: "plan" | "build",
			model: string,
			variant: string,
			imageUrls: Array<{ url: string; mime: string; filename?: string }>,
			provider?: SelectedProvider,
		) => {
			setIsSubmitting(true);
			setError(null);

			try {
				const response = await fetch("/api/agent/continue", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						sessionId,
						prompt,
						mode,
						model,
						variant,
						provider,
						imageUrls,
					}),
				});

				const data = (await response.json()) as { error?: string };
				if (!response.ok) {
					throw new Error(data.error || "Failed to send follow-up");
				}
				// Stay on current URL — Electric syncs new events automatically
			} catch (err) {
				setError(err instanceof Error ? err.message : "Something went wrong");
			} finally {
				setIsSubmitting(false);
			}
		},
		[sessionId],
	);

	const handleDeleteSession = useCallback(async () => {
		setIsDeleting(true);
		setError(null);

		try {
			const response = await fetch(`/api/agent/sessions/${sessionId}`, {
				method: "DELETE",
			});

			const data = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(data.error || "Failed to delete session");
			}

			// Refresh the sidebar session list
			await queryClient.invalidateQueries({ queryKey: ["sessions"] });

			// Navigate away from the deleted session
			navigate({ to: "/chat" });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete session");
		} finally {
			setIsDeleting(false);
		}
	}, [sessionId, queryClient, navigate]);

	const handleRetrySync = useCallback(() => {
		setSyncAttempt((attempt) => attempt + 1);
	}, []);

	if (!sessionId || Number.isNaN(sessionId)) {
		return (
			<div className="app-container flex h-full items-center justify-center py-8 text-sm text-muted-foreground">
				Invalid session ID
			</div>
		);
	}

	return (
		<ChatView
			key={`${sessionId.toString()}-${syncAttempt.toString()}`}
			sessionId={sessionId}
			onNewSession={handleNewSession}
			onFollowup={handleFollowup}
			onDeleteSession={handleDeleteSession}
			onRetrySync={handleRetrySync}
			isSubmitting={isSubmitting}
			isDeleting={isDeleting}
			error={error}
		/>
	);
}
