import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ChatView } from "#/components/chat/ChatView.tsx";
import { useChatLayoutContext } from "#/routes/_authed/chat.tsx";

export const Route = createFileRoute("/_authed/chat/$sessionId")({
	// Prevent router re-evaluation on Electric data changes
	staleTime: Infinity,
	component: ChatSessionPage,
});

function ChatSessionPage() {
	const params = Route.useParams();
	const sessionId = Number(params.sessionId);
	const navigate = useNavigate();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [syncAttempt, setSyncAttempt] = useState(0);

	// Reuse the shared sessionsCollection from the chat layout
	const { sessionsCollection } = useChatLayoutContext();

	const handleNewSession = useCallback(() => {
		navigate({ to: "/chat" });
	}, [navigate]);

	const handleFollowup = useCallback(
		async (prompt: string, mode: "plan" | "build", model: string) => {
			setIsSubmitting(true);
			setError(null);

			try {
				const response = await fetch("/api/agent/continue", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId, prompt, mode, model }),
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

	const handleRetrySync = useCallback(() => {
		setSyncAttempt((attempt) => attempt + 1);
	}, []);

	if (!sessionId || Number.isNaN(sessionId)) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Invalid session ID
			</div>
		);
	}

	return (
		<ChatView
			key={`${sessionId.toString()}-${syncAttempt.toString()}`}
			sessionId={sessionId}
			sessionsCollection={sessionsCollection}
			onNewSession={handleNewSession}
			onFollowup={handleFollowup}
			onRetrySync={handleRetrySync}
			isSubmitting={isSubmitting}
			error={error}
		/>
	);
}
