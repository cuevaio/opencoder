import { createFileRoute } from "@tanstack/react-router";
import { getGitHubToken, requireAuth } from "#/lib/auth-helpers.ts";
import { fetchAllGitHubRepos } from "#/lib/github-sync.ts";

export const Route = createFileRoute("/api/github/repos")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const session = await requireAuth(request);
				const userId = session.user.id;

				// Get GitHub token from Better Auth account table
				const token = await getGitHubToken(userId);
				if (!token) {
					return Response.json(
						{
							error:
								"No GitHub token found. Please connect your GitHub account.",
						},
						{ status: 400 },
					);
				}

				try {
					const repos = await fetchAllGitHubRepos(token);
					return Response.json({
						repos: repos.map(formatRepoResponse),
						syncedAt: new Date().toISOString(),
						isStale: false,
					});
				} catch (error) {
					console.error("[github-repos] Failed to fetch repositories:", error);
					return Response.json(
						{ error: "Failed to fetch repositories from GitHub." },
						{ status: 502 },
					);
				}
			},
		},
	},
});

function formatRepoResponse(repo: {
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
}) {
	return {
		id: repo.id,
		name: repo.name,
		full_name: repo.full_name,
		html_url: repo.html_url,
		description: repo.description,
		language: repo.language,
		private: repo.private,
		archived: repo.archived ?? false,
		default_branch: repo.default_branch,
		updated_at: repo.updated_at,
	};
}
