import type { FormEvent as ReactFormEvent } from "react";
import { useCallback } from "react";
import type { DisplayItem, Turn } from "#/lib/display-items";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { QuestionForm } from "./QuestionForm";
import { ToolCall } from "./ToolCall";

interface SessionTurnProps {
	turn: Turn;
	pendingQuestion: (DisplayItem & { type: "question-asked" }) | null;
	completedTokens: Set<string>;
	onAnswer: (tokenId: string, answers: string[][]) => void;
}

export function SessionTurn({
	turn,
	pendingQuestion,
	completedTokens,
	onAnswer,
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
				<div className="max-w-[90%] rounded-lg bg-foreground px-3 py-2.5 text-sm text-background sm:max-w-[80%]">
					{turn.prompt}
				</div>
			</div>

			{/* Agent response items */}
			{turn.items.map((item, i) => (
				<TurnItem
					key={`item-${i.toString()}`}
					item={item}
					pendingQuestion={pendingQuestion}
					completedTokens={completedTokens}
					onAnswer={onAnswer}
				/>
			))}
		</div>
	);
}

function TurnItem({
	item,
	pendingQuestion,
	completedTokens,
	onAnswer,
}: {
	item: DisplayItem;
	pendingQuestion: (DisplayItem & { type: "question-asked" }) | null;
	completedTokens: Set<string>;
	onAnswer: (tokenId: string, answers: string[][]) => void;
}) {
	switch (item.type) {
		case "text-block":
			return (
				<div className="text-sm">
					<MarkdownRenderer content={item.text} />
				</div>
			);

		case "reasoning-block":
			return (
				<details className="text-xs text-muted-foreground">
					<summary className="cursor-pointer font-medium hover:text-foreground">
						Thinking...
					</summary>
					<div className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-3">
						{item.text}
					</div>
				</details>
			);

		case "tool-call":
			return <ToolCall tool={item.tool} />;

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
				<div className="rounded border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
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

		default:
			return null;
	}
}
