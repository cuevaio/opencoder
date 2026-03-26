import { describe, expect, it } from "vitest";
import {
	buildDisplayItems,
	buildToolMap,
	hasRoundCompleteInCurrentTurn,
} from "#/lib/display-items";
import type { StreamEvent } from "#/lib/session-types";

describe("buildDisplayItems", () => {
	it("does not emit empty reasoning blocks", () => {
		const events: StreamEvent[] = [
			{
				type: "part-update",
				messageId: "m1",
				part: {
					id: "p1",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "",
					time: { start: 1 },
				},
			},
		];

		const items = buildDisplayItems(events, new Map());
		expect(items).toEqual([]);
	});

	it("emits reasoning block once text becomes non-empty", () => {
		const events: StreamEvent[] = [
			{
				type: "part-update",
				messageId: "m1",
				part: {
					id: "p1",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "",
					time: { start: 1 },
				},
			},
			{
				type: "part-update",
				messageId: "m1",
				part: {
					id: "p1",
					sessionID: "s1",
					messageID: "m1",
					type: "reasoning",
					text: "thinking details",
					time: { start: 1 },
				},
			},
		];

		const items = buildDisplayItems(events, new Map());
		expect(items).toEqual([
			{
				type: "reasoning-block",
				text: "thinking details",
				partId: "p1",
			},
		]);
	});

	it("keeps root reasoning visible when first part-update is from a child session", () => {
		const events: StreamEvent[] = [
			{
				type: "part-update",
				messageId: "m-child",
				part: {
					id: "child-reasoning",
					sessionID: "child-s1",
					messageID: "m-child",
					type: "reasoning",
					text: "child reasoning",
					time: { start: 1 },
				},
			},
			{
				type: "part-update",
				messageId: "m-root-tool",
				part: {
					id: "root-task-part",
					sessionID: "root-s1",
					messageID: "m-root-tool",
					type: "tool",
					tool: "task",
					callID: "task-call-1",
					state: {
						status: "completed",
						input: {},
						output: "",
						time: { start: 1, end: 2 },
					},
				},
			},
			{
				type: "part-update",
				messageId: "m-root-reasoning",
				part: {
					id: "root-reasoning",
					sessionID: "root-s1",
					messageID: "m-root-reasoning",
					type: "reasoning",
					text: "root reasoning",
					time: { start: 3 },
				},
			},
		];

		const toolMap = buildToolMap(events);
		const items = buildDisplayItems(events, toolMap);

		expect(items).toContainEqual({
			type: "reasoning-block",
			text: "root reasoning",
			partId: "root-reasoning",
		});
		expect(items).not.toContainEqual(
			expect.objectContaining({
				type: "reasoning-block",
				partId: "child-reasoning",
			}),
		);
	});

	it("filters child reasoning when explicit root session ID is provided", () => {
		const events: StreamEvent[] = [
			{
				type: "part-update",
				messageId: "m-child",
				part: {
					id: "child-r",
					sessionID: "child-s1",
					messageID: "m-child",
					type: "reasoning",
					text: "child reasoning",
					time: { start: 1 },
				},
			},
			{
				type: "part-update",
				messageId: "m-root",
				part: {
					id: "root-r",
					sessionID: "root-s1",
					messageID: "m-root",
					type: "reasoning",
					text: "root reasoning",
					time: { start: 2 },
				},
			},
		];

		const toolMap = buildToolMap(events, "root-s1");
		const items = buildDisplayItems(events, toolMap, "root-s1");

		expect(items).toEqual([
			{
				type: "reasoning-block",
				text: "root reasoning",
				partId: "root-r",
			},
		]);
	});

	it("attaches child reasoning to parent tool in tool map", () => {
		const events: StreamEvent[] = [
			{
				type: "part-update",
				messageId: "m-root-tool",
				part: {
					id: "root-task-part",
					sessionID: "root-s1",
					messageID: "m-root-tool",
					type: "tool",
					tool: "task",
					callID: "task-call-1",
					state: {
						status: "completed",
						input: {},
						output: "",
						time: { start: 1, end: 2 },
					},
				},
			},
			{
				type: "part-update",
				messageId: "m-child-reasoning",
				part: {
					id: "child-r",
					sessionID: "child-s1",
					messageID: "m-child-reasoning",
					type: "reasoning",
					text: "child thinks",
					time: { start: 3 },
				},
			},
		];

		const toolMap = buildToolMap(events, "root-s1");
		expect(toolMap.get("task-call-1")?.childReasoning).toBe("child thinks");
	});
});

describe("hasRoundCompleteInCurrentTurn", () => {
	it("returns true when current turn has round-complete", () => {
		const events: StreamEvent[] = [
			{ type: "user-message", text: "please update" },
			{
				type: "part-update",
				messageId: "m1",
				part: {
					id: "p1",
					sessionID: "s1",
					messageID: "m1",
					type: "text",
					text: "done",
				},
			},
			{ type: "round-complete" },
		];

		expect(hasRoundCompleteInCurrentTurn(events)).toBe(true);
	});

	it("returns false when only an older turn has round-complete", () => {
		const events: StreamEvent[] = [
			{ type: "user-message", text: "first" },
			{ type: "round-complete" },
			{ type: "user-message", text: "second" },
			{
				type: "part-update",
				messageId: "m2",
				part: {
					id: "p2",
					sessionID: "s1",
					messageID: "m2",
					type: "text",
					text: "working",
				},
			},
		];

		expect(hasRoundCompleteInCurrentTurn(events)).toBe(false);
	});

	it("returns false when current turn is still running", () => {
		const events: StreamEvent[] = [
			{ type: "user-message", text: "please continue" },
			{
				type: "status",
				status: "Running commands...",
			},
		];

		expect(hasRoundCompleteInCurrentTurn(events)).toBe(false);
	});
});
