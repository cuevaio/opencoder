import { describe, expect, it } from "vitest";
import {
	dbRowsToStreamEvents,
	dbRowsToStreamEventsWithOptions,
	type SessionEventRow,
} from "#/lib/session-converter";

describe("dbRowsToStreamEvents", () => {
	it("reconstructs reasoning text from part_data when text column is empty", () => {
		const rows: SessionEventRow[] = [
			{
				id: 1,
				session_id: 123,
				seq: 1,
				event_type: "part-update",
				part_id: "p1",
				message_id: "m1",
				opencode_session_id: "s1",
				part_type: "reasoning",
				text: "",
				part_data: {
					type: "reasoning",
					text: "reasoning from part_data",
					time: { start: 42 },
				},
			},
		];

		const events = dbRowsToStreamEvents(rows);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "part-update",
			messageId: "m1",
			part: {
				type: "reasoning",
				text: "reasoning from part_data",
				time: { start: 42 },
			},
		});
	});

	it("prefers text column over part_data fallback", () => {
		const rows: SessionEventRow[] = [
			{
				id: 1,
				session_id: 123,
				seq: 1,
				event_type: "part-update",
				part_id: "p1",
				message_id: "m1",
				opencode_session_id: "s1",
				part_type: "reasoning",
				text: "from text column",
				part_data: {
					type: "reasoning",
					text: "from part_data",
					time: { start: 99 },
				},
			},
		];

		const events = dbRowsToStreamEvents(rows);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "part-update",
			part: {
				type: "reasoning",
				text: "from text column",
				time: { start: 99 },
			},
		});
	});

	it("can keep first user-message for windowed chunks", () => {
		const rows: SessionEventRow[] = [
			{
				id: 1,
				session_id: 123,
				seq: 1,
				event_type: "user-message",
				user_message_text: "windowed prompt",
			},
		];

		const events = dbRowsToStreamEventsWithOptions(rows, {
			skipFirstUserMessage: false,
		});
		expect(events).toEqual([
			{
				type: "user-message",
				text: "windowed prompt",
				images: undefined,
			},
		]);

		expect(dbRowsToStreamEvents(rows)).toEqual([]);
	});
});
