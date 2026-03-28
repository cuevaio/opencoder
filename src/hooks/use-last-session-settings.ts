import { useCallback, useState } from "react";
import type { SelectedProvider } from "#/lib/ai/model-registry.ts";
import {
	defaultModel,
	getDefaultVariant,
	isAllowedModel,
	isValidSelectedProvider,
} from "#/lib/ai/model-registry.ts";

const STORAGE_KEY = "opencoder-last-session";

export interface LastSessionSettings {
	repoUrl: string;
	model: string;
	variant: string;
	mode: "plan" | "build";
	/** Explicitly chosen provider. Undefined = use server auto-resolve. */
	provider?: SelectedProvider;
}

function readFromStorage(): LastSessionSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return makeDefaults();
		const parsed = JSON.parse(raw) as Partial<LastSessionSettings>;

		const model =
			typeof parsed.model === "string" && isAllowedModel(parsed.model)
				? parsed.model
				: defaultModel;

		return {
			repoUrl: typeof parsed.repoUrl === "string" ? parsed.repoUrl : "",
			model,
			variant:
				typeof parsed.variant === "string"
					? parsed.variant
					: getDefaultVariant(model),
			mode:
				parsed.mode === "plan" || parsed.mode === "build"
					? parsed.mode
					: "build",
			provider: isValidSelectedProvider(parsed.provider)
				? parsed.provider
				: undefined,
		};
	} catch {
		return makeDefaults();
	}
}

function makeDefaults(): LastSessionSettings {
	return {
		repoUrl: "",
		model: defaultModel,
		variant: getDefaultVariant(defaultModel),
		mode: "build",
		provider: undefined,
	};
}

function writeToStorage(settings: LastSessionSettings): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// storage full or unavailable — silently ignore
	}
}

/**
 * Reads the last session settings from localStorage and provides a setter
 * that persists any partial update back to storage.
 */
export function useLastSessionSettings(): [
	LastSessionSettings,
	(update: Partial<LastSessionSettings>) => void,
] {
	const [settings, setSettings] =
		useState<LastSessionSettings>(readFromStorage);

	const update = useCallback((patch: Partial<LastSessionSettings>) => {
		setSettings((current) => {
			const next = { ...current, ...patch };
			writeToStorage(next);
			return next;
		});
	}, []);

	return [settings, update];
}
