import type { FormEvent as ReactFormEvent, ReactNode } from "react";
import { memo, useCallback, useState } from "react";
import type { DisplayItem, Turn } from "#/lib/display-items";
import { Dialog, DialogContent } from "../ui/dialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { QuestionForm } from "./QuestionForm";
import { ToolCall } from "./ToolCall";

interface SessionTurnProps {
	sessionId: number;
	turn: Turn;
	pendingQuestion: (DisplayItem & { type: "question-asked" }) | null;
	completedTokens: Set<string>;
	onAnswer: (tokenId: string, answers: string[][]) => void;
	bottomAction?: ReactNode;
}

export const SessionTurn = memo(function SessionTurn({
	sessionId,
	turn,
	pendingQuestion,
	completedTokens,
	onAnswer,
	bottomAction,
}: SessionTurnProps) {
	const handleSubmitCapture = useCallback(
		(event: ReactFormEvent<HTMLDivElement>) => {
			const target = event.target;
			if (!(target instanceof HTMLFormElement)) return;

			event.preventDefault();
		},
		[],
	);

	return (
		<div className="space-y-4" onSubmitCapture={handleSubmitCapture}>
			{/* User prompt */}
			<div className="flex justify-end">
				<div className="max-w-[95%] rounded-xl bg-foreground px-3.5 py-3 text-sm leading-relaxed text-background shadow-xs [overflow-wrap:anywhere] sm:max-w-[82%]">
					{turn.images && turn.images.length > 0 ? (
						<div className="mb-2 flex flex-wrap gap-2">
							{turn.images.map((image, i) => (
								<ImageThumbnail
									key={`${image.url}-${i.toString()}`}
									image={image}
								/>
							))}
						</div>
					) : null}
					{turn.prompt}
				</div>
			</div>

			{/* Agent response items */}
			{turn.items.map((item, i) => (
				<TurnItem
					key={`item-${i.toString()}`}
					sessionId={sessionId}
					item={item}
					pendingQuestion={pendingQuestion}
					completedTokens={completedTokens}
					onAnswer={onAnswer}
				/>
			))}

			{bottomAction ? <div className="pt-1">{bottomAction}</div> : null}
		</div>
	);
});

function TurnItem({
	sessionId,
	item,
	pendingQuestion,
	completedTokens,
	onAnswer,
}: {
	sessionId: number;
	item: DisplayItem;
	pendingQuestion: (DisplayItem & { type: "question-asked" }) | null;
	completedTokens: Set<string>;
	onAnswer: (tokenId: string, answers: string[][]) => void;
}) {
	switch (item.type) {
		case "text-block":
			return (
				<div className="markdown-safe text-sm">
					<MarkdownRenderer content={item.text} />
				</div>
			);

		case "reasoning-block":
			if (!item.text.trim()) return null;
			return (
				<details className="rounded-lg border border-border/70 bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
					<summary className="cursor-pointer font-medium hover:text-foreground">
						Thinking...
					</summary>
					<div className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-3 leading-relaxed">
						{item.text}
					</div>
				</details>
			);

		case "tool-call":
			return <ToolCall tool={item.tool} sessionId={sessionId} />;

		case "status":
			return <div className="text-xs text-muted-foreground">{item.status}</div>;

		case "question-asked": {
			const isPending =
				pendingQuestion?.requestId === item.requestId &&
				!completedTokens.has(item.tokenId);
			return (
				<QuestionForm
					questions={item.questions}
					tokenId={item.tokenId}
					isPending={isPending}
					onAnswer={(answers) => onAnswer(item.tokenId, answers)}
				/>
			);
		}

		case "question-answered":
			return (
				<div className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
					Answered: {item.answers.map((a) => a.join(", ")).join("; ")}
				</div>
			);

		case "round-complete":
			return null;

		case "user-message":
			return null;

		case "aborted":
			return (
				<div className="text-xs font-medium text-red-600 dark:text-red-400">
					Session aborted
				</div>
			);

		case "session-error":
			return (
				<div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-800 dark:bg-amber-950">
					<p className="font-medium text-amber-800 dark:text-amber-300">
						Session stopped
					</p>
					<p className="mt-0.5 text-amber-700 dark:text-amber-400">
						{item.message}
					</p>
				</div>
			);

		default:
			return null;
	}
}

function ImageThumbnail({
	image,
}: {
	image: { url: string; mime: string; filename?: string };
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="overflow-hidden rounded-md border border-background/30"
			>
				<img
					src={image.url}
					alt={image.filename ?? "Uploaded image"}
					className="h-20 w-20 object-cover transition-opacity hover:opacity-85"
				/>
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
					<img
						src={image.url}
						alt={image.filename ?? "Uploaded image"}
						className="max-h-[80vh] w-full rounded-md object-contain"
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
