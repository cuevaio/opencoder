interface GitHubRepoPayload {
	id: number;
	name: string;
	full_name: string;
	html_url: string;
	description: string | null;
	language: string | null;
	private: boolean;
	archived?: boolean;
	default_branch: string;
	updated_at: string;
	owner?: {
		id: number;
		login: string;
	};
}

/**
 * Fetches all repos the authenticated user has access to,
 * paginating through the GitHub API.
 */
export async function fetchAllGitHubRepos(
	token: string,
): Promise<GitHubRepoPayload[]> {
	const repos: GitHubRepoPayload[] = [];
	let page = 1;

	while (true) {
		const response = await fetch(
			`https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/vnd.github.v3+json",
				},
			},
		);

		if (!response.ok) {
			throw new Error(
				`[github-sync] Failed to fetch repos page ${page}: ${response.status}`,
			);
		}

		const batch: GitHubRepoPayload[] = await response.json();
		if (!Array.isArray(batch) || batch.length === 0) break;

		repos.push(...batch);
		if (batch.length < 100) break;
		page++;
	}

	return repos;
}
