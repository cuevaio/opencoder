import { useCallback, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import type { QuestionInfo } from "#/lib/session-types";

interface QuestionFormProps {
	questions: QuestionInfo[];
	tokenId: string;
	isPending: boolean;
	onAnswer: (answers: string[][]) => void;
}

export function QuestionForm({
	questions,
	tokenId,
	isPending,
	onAnswer,
}: QuestionFormProps) {
	const [answers, setAnswers] = useState<string[][]>(() =>
		questions.map(() => []),
	);
	const [customInputs, setCustomInputs] = useState<string[]>(() =>
		questions.map(() => ""),
	);
	const [submitted, setSubmitted] = useState(false);

	const handleOptionToggle = useCallback(
		(qIndex: number, label: string, multiple: boolean) => {
			setAnswers((prev) => {
				const next = [...prev];
				const current = next[qIndex] || [];
				if (multiple) {
					next[qIndex] = current.includes(label)
						? current.filter((a) => a !== label)
						: [...current, label];
				} else {
					next[qIndex] = [label];
				}
				return next;
			});
		},
		[],
	);

	const handleCustomInput = useCallback((qIndex: number, value: string) => {
		setCustomInputs((prev) => {
			const next = [...prev];
			next[qIndex] = value;
			return next;
		});
	}, []);

	const handleSubmit = useCallback(() => {
		// Merge custom inputs into answers
		const finalAnswers = answers.map((ans, i) => {
			const custom = customInputs[i]?.trim();
			if (custom && !ans.includes(custom)) {
				return [...ans, custom];
			}
			return ans;
		});
		setSubmitted(true);
		onAnswer(finalAnswers);
	}, [answers, customInputs, onAnswer]);

	if (submitted || !isPending) {
		return (
			<div className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
				{submitted ? "Answer submitted" : "Question answered"}
			</div>
		);
	}

	return (
		<div
			className="space-y-4 rounded-xl border border-border/80 bg-surface-1 px-4 py-3"
			data-token-id={tokenId}
		>
			{questions.map((q, qIndex) => (
				<div key={q.header || q.question} className="space-y-2">
					{q.header && <div className="text-xs font-semibold">{q.header}</div>}
					<div className="text-sm">{q.question}</div>

					{q.options && q.options.length > 0 && (
						<div className="space-y-1.5">
							{q.options.map((opt: { label: string; description?: string }) => {
								const isSelected = (answers[qIndex] || []).includes(opt.label);
								return (
									<button
										key={opt.label}
										type="button"
										onClick={() =>
											handleOptionToggle(qIndex, opt.label, q.multiple ?? false)
										}
										className={`block min-h-[44px] w-full rounded-lg border px-3 py-2.5 text-left text-xs press-scale sm:min-h-0 sm:py-2 ${
											isSelected
												? "border-foreground bg-foreground/10 text-foreground"
												: "border-border text-muted-foreground hover:border-muted-foreground"
										}`}
									>
										<span className="font-medium">{opt.label}</span>
										{opt.description && (
											<span className="ml-1 text-muted-foreground">
												— {opt.description}
											</span>
										)}
									</button>
								);
							})}
						</div>
					)}

					{(q.custom !== false || !q.options?.length) && (
						<Input
							type="text"
							value={customInputs[qIndex] || ""}
							onChange={(e) => handleCustomInput(qIndex, e.target.value)}
							placeholder="Type your own answer..."
							className="h-11 sm:h-10 sm:text-xs"
						/>
					)}
				</div>
			))}

			<Button type="button" onClick={handleSubmit} className="w-full sm:w-auto">
				Submit answer
			</Button>
		</div>
	);
}
