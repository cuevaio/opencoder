export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "opencoder-theme";

export function readStoredTheme(): Theme | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const value = window.localStorage.getItem(THEME_STORAGE_KEY);
		if (value === "light" || value === "dark") {
			return value;
		}
	} catch {
		return null;
	}

	return null;
}

export function getSystemTheme(): Theme {
	if (
		typeof window === "undefined" ||
		typeof window.matchMedia !== "function"
	) {
		return "light";
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

export function resolveInitialTheme(): Theme {
	return readStoredTheme() ?? getSystemTheme();
}

export function applyThemeToDocument(theme: Theme): void {
	if (typeof document === "undefined") {
		return;
	}

	document.documentElement.classList.toggle("dark", theme === "dark");
}

export function persistTheme(theme: Theme): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// Ignore storage write failures.
	}
}

export const THEME_INIT_SCRIPT = `(() => {
	try {
		const key = "${THEME_STORAGE_KEY}";
		const saved = window.localStorage.getItem(key);
		const theme =
			saved === "light" || saved === "dark"
				? saved
				: window.matchMedia("(prefers-color-scheme: dark)").matches
					? "dark"
					: "light";
		document.documentElement.classList.toggle("dark", theme === "dark");
	} catch {
		const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
		document.documentElement.classList.toggle("dark", isDark);
	}
})();`;
