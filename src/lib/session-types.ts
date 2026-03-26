import type { Message, Part, Session } from "@opencode-ai/sdk/v2";

// ─── Question types (shared with UI) ────────────────────
export type QuestionOptionInfo = {
	label: string;
	description?: string;
};

export type QuestionInfo = {
	question: string;
	header?: string;
	options?: QuestionOptionInfo[];
	multiple?: boolean;
	custom?: boolean;
};

// ─── Unified stream event ────────────────────────────────
// Used for BOTH live Trigger.dev streaming AND past session replay.
export type StreamEvent =
	| { type: "part-update"; part: Part; messageId: string; delta?: string }
	| { type: "message-update"; message: Message }
	| { type: "status"; status: string }
	| {
			type: "question-asked";
			requestId: string;
			tokenId: string;
			questions: QuestionInfo[];
	  }
	| {
			type: "question-answered";
			requestId: string;
			answers: string[][];
	  }
	| { type: "round-complete" }
	| {
			type: "user-message";
			text: string;
			images?: Array<{ url: string; mime: string; filename?: string }>;
	  }
	| { type: "aborted" };

// ─── Persisted session data (stored in Postgres jsonb) ───
// This is the OpenCode export format returned by
// client.session.get() + client.session.messages()
export type SessionExportData = {
	info: Session;
	messages: Array<{ info: Message; parts: Part[] }>;
};
