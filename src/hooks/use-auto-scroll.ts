"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Auto-scroll to bottom when new content arrives,
 * but only if the user is already near the bottom.
 *
 * The `trigger` value is intentionally used to re-run the scroll
 * effect whenever the caller's data changes.
 */
export function useAutoScroll(
	scrollRef: RefObject<HTMLDivElement | null>,
	bottomRef: RefObject<HTMLDivElement | null>,
	trigger: unknown,
): void {
	const isNearBottom = useRef(true);
	const triggerRef = useRef(trigger);
	triggerRef.current = trigger;

	useEffect(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) return;

		function handleScroll() {
			if (!scrollEl) return;
			const { scrollTop, scrollHeight, clientHeight } = scrollEl;
			isNearBottom.current = scrollHeight - scrollTop - clientHeight < 100;
		}

		scrollEl.addEventListener("scroll", handleScroll, {
			passive: true,
		});
		return () => scrollEl.removeEventListener("scroll", handleScroll);
	}, [scrollRef]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger is intentionally used to re-run scroll on data changes
	useEffect(() => {
		if (isNearBottom.current && bottomRef.current) {
			bottomRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [bottomRef, trigger]);
}
