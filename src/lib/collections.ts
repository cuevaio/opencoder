import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";

/**
 * The Electric client requires absolute URLs.
 * In the browser, derive the base from window.location.origin.
 * On the server (SSR), fall back to NEXT_PUBLIC_APP_URL.
 */
function absoluteUrl(path: string): string {
	const base =
		typeof window !== "undefined"
			? window.location.origin
			: (process.env.VITE_APP_URL ?? "http://localhost:3000");
	return `${base}${path}`;
}

interface ElectricCollectionContext {
	collectionId: string;
	shapeUrl: string;
	sessionId?: number;
}

interface ElectricCollectionOptions {
	onError?: (error: unknown) => void;
}

/** Handle Electric client errors and optionally notify caller. */
function onElectricError(
	error: unknown,
	context: ElectricCollectionContext,
	handler?: (error: unknown) => void,
) {
	void error;
	void context;
	handler?.(error);
}

/**
 * Create a TanStack DB collection for session events, synced via Electric.
 * Each event is a row in the `session_events` table, ordered by `seq`.
 */
export function createSessionEventsCollection(
	sessionId: number,
	options?: ElectricCollectionOptions,
) {
	const id = `session-events-${sessionId}`;
	const shapeUrl = absoluteUrl(
		`/api/shapes/session-events?session_id=${sessionId}`,
	);

	return createCollection(
		electricCollectionOptions({
			id,
			getKey: (row) => String(row.id),
			shapeOptions: {
				url: shapeUrl,
				onError: (error) =>
					onElectricError(
						error,
						{ collectionId: id, shapeUrl, sessionId },
						options?.onError,
					),
			},
		}),
	);
}

/**
 * Create a TanStack DB collection for the sessions list (sidebar).
 * Syncs summary columns from the `agent_sessions` table for the current user.
 */
export function createSessionsCollection(options?: ElectricCollectionOptions) {
	const id = "sessions";
	const shapeUrl = absoluteUrl("/api/shapes/sessions");

	return createCollection(
		electricCollectionOptions({
			id,
			getKey: (row) => String(row.id),
			shapeOptions: {
				url: shapeUrl,
				onError: (error) =>
					onElectricError(
						error,
						{ collectionId: id, shapeUrl },
						options?.onError,
					),
			},
		}),
	);
}
