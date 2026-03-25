/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	applyThemeToDocument,
	getSystemTheme,
	persistTheme,
	readStoredTheme,
	resolveInitialTheme,
	THEME_STORAGE_KEY,
} from "#/lib/theme.ts";

function mockMatchMedia(matches: boolean) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: vi.fn().mockImplementation(() => ({
			matches,
			media: "(prefers-color-scheme: dark)",
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
}

describe("theme utilities", () => {
	beforeEach(() => {
		window.localStorage.clear();
		mockMatchMedia(false);
	});

	it("reads only valid stored themes", () => {
		window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
		expect(readStoredTheme()).toBe("dark");

		window.localStorage.setItem(THEME_STORAGE_KEY, "invalid");
		expect(readStoredTheme()).toBeNull();
	});

	it("falls back to system theme when no stored value exists", () => {
		mockMatchMedia(true);
		expect(getSystemTheme()).toBe("dark");
		expect(resolveInitialTheme()).toBe("dark");

		mockMatchMedia(false);
		expect(resolveInitialTheme()).toBe("light");
	});

	it("prefers stored theme over system theme", () => {
		mockMatchMedia(false);
		window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

		expect(resolveInitialTheme()).toBe("dark");
	});

	it("applies theme class to the root document", () => {
		applyThemeToDocument("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		applyThemeToDocument("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("persists selected theme", () => {
		persistTheme("dark");
		expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
	});
});
