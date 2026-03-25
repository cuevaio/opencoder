import { useEffect, useState } from "react";

export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/**
 * SSR-safe hook that tracks whether a CSS media query matches.
 * Defaults to `false` on the server and during the first client render.
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState<boolean>(false);

	useEffect(() => {
		const mediaQueryList = window.matchMedia(query);
		// Set initial value
		setMatches(mediaQueryList.matches);

		const handler = (event: MediaQueryListEvent) => {
			setMatches(event.matches);
		};

		mediaQueryList.addEventListener("change", handler);
		return () => mediaQueryList.removeEventListener("change", handler);
	}, [query]);

	return matches;
}

/**
 * Returns `true` when the viewport is narrower than the `md` breakpoint (768px).
 * Use for toggling mobile-specific layout decisions.
 */
export function useIsMobile(): boolean {
	return useMediaQuery(MOBILE_MEDIA_QUERY);
}
