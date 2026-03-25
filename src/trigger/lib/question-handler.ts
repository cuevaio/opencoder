import { logger, wait } from "@trigger.dev/sdk/v3";
import type { SessionDbWriter } from "./db-writer";
import type { MetadataHandle } from "./types";

interface QuestionEvent {
	id: string;
	questions: Array<{
		question: string;
		header?: string;
		options?: Array<{ label: string; description?: string }>;
		multiple?: boolean;
		custom?: boolean;
	}>;
}

export async function handleQuestion(
	client: {
		question: {
			reply: (args: {
				requestID: string;
				answers: string[][];
			}) => Promise<unknown>;
			reject: (args: { requestID: string }) => Promise<unknown>;
		};
		session: { abort: (args: { sessionID: string }) => Promise<unknown> };
	},
	sessionId: string,
	questionEvent: QuestionEvent,
	dbWriter: SessionDbWriter,
	meta: MetadataHandle,
): Promise<"answered" | "cancelled"> {
	const requestId = questionEvent.id;
	logger.info("Question asked, waiting for user answer", { requestId });

	const questionToken = await wait.createToken({
		idempotencyKey: `question-${requestId}`,
		timeout: "24h",
	});
	meta.set("questionTokenId", questionToken.id);

	await dbWriter.writeQuestionAsked(
		requestId,
		questionToken.id,
		questionEvent.questions,
	);

	const result = await wait.forToken<
		| { type: "answer"; answers: string[][] }
		| { type: "reject" }
		| { type: "cancel" }
	>(questionToken);

	meta.del("questionTokenId");

	if (result.ok && result.output?.type === "cancel") {
		logger.info("Cancel during question");
		await dbWriter.writeAborted();
		await client.session.abort({ sessionID: sessionId });
		await client.question.reject({ requestID: requestId });
		return "cancelled";
	}

	if (result.ok && result.output?.type === "answer") {
		logger.info("Question answered", { requestId });
		await client.question.reply({
			requestID: requestId,
			answers: result.output.answers,
		});
		await dbWriter.writeQuestionAnswered(requestId, result.output.answers);
		return "answered";
	}

	// Timeout or reject
	logger.info("Question rejected or timed out", { requestId });
	await client.question.reject({ requestID: requestId });
	return "answered";
}
