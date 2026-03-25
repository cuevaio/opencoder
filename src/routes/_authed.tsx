import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAuthSession } from "#/lib/auth-helpers.ts";

/**
 * Server function called ONCE at initial route load.
 * Returns null if not authenticated (no session cookie).
 */
const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const request = getRequest();
	return getAuthSession(request);
});

export const Route = createFileRoute("/_authed")({
	// beforeLoad runs on the server at SSR time and once on initial client navigation.
	// We redirect to /sign-in if no session is found.
	// We do NOT use a loader here — loaders re-run on every route transition,
	// which would cause a server round-trip (and visible "reload") every time
	// Electric delivers data changes that trigger a router re-evaluation.
	beforeLoad: async () => {
		const session = await getSessionFn();
		if (!session) {
			throw redirect({ to: "/sign-in" });
		}
		return { session };
	},
	// staleTime: Infinity means the beforeLoad result is never considered stale,
	// so it will NOT re-run when the router re-evaluates due to data changes.
	staleTime: Infinity,
	component: AuthedLayout,
});

function AuthedLayout() {
	return <Outlet />;
}
