import { logger } from "@trigger.dev/sdk/v3";

export interface GitHubIdentity {
	login: string;
	id: number;
	name: string | null;
}

/**
 * Fetch the authenticated GitHub user's identity via the API.
 *
 * Returns `login`, `id`, and `name` so callers can construct the canonical
 * noreply email (`<id>+<login>@users.noreply.github.com`) that GitHub uses
 * to attribute commits to a user account.
 */
export async function fetchGitHubIdentity(
	token: string,
): Promise<GitHubIdentity> {
	const res = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		logger.error("GitHub /user API request failed", {
			status: res.status,
			body,
		});
		throw new Error(
			`Failed to fetch GitHub user identity (HTTP ${res.status})`,
		);
	}

	const data = (await res.json()) as {
		login: string;
		id: number;
		name: string | null;
	};

	return { login: data.login, id: data.id, name: data.name };
}
