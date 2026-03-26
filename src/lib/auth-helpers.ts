import { pool } from "#/db/index.ts";
import { auth } from "#/lib/auth.ts";

/**
 * Get the authenticated session from a request.
 * Returns null if not authenticated.
 */
export async function getAuthSession(request: Request) {
	return auth.api.getSession({ headers: request.headers });
}

/**
 * Require authentication. Returns the session or throws a 401 Response.
 */
export async function requireAuth(request: Request) {
	const session = await getAuthSession(request);
	if (!session) {
		throw new Response("Unauthorized", { status: 401 });
	}
	return session;
}

/**
 * Get the GitHub OAuth access token for a user from Better Auth's account table.
 * Better Auth stores OAuth tokens in its `account` table (managed by Drizzle schema).
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
	const result = await pool.query<{ access_token: string | null }>(
		`SELECT "accessToken" AS access_token FROM "account"
     WHERE "userId" = $1 AND "providerId" = 'github' LIMIT 1`,
		[userId],
	);
	return result.rows[0]?.access_token ?? null;
}

/**
 * Validate authentication for agent API routes.
 * Returns `{ userId, githubToken, userName, userEmail }` or a Response error.
 */
export async function validateAgentAuth(
	request: Request,
): Promise<
	| { userId: string; githubToken: string; userName: string; userEmail: string }
	| Response
> {
	const session = await getAuthSession(request);
	if (!session) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const githubToken = await getGitHubToken(session.user.id);
	if (!githubToken) {
		return Response.json(
			{ error: "GitHub not connected. Please sign in with GitHub." },
			{ status: 403 },
		);
	}

	return {
		userId: session.user.id,
		githubToken,
		userName: session.user.name,
		userEmail: session.user.email,
	};
}
