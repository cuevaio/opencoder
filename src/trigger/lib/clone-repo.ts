import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface CloneResult {
	cloneDir: string;
	tmpDir: string;
	repoName: string;
	owner: string;
}

export interface UserIdentity {
	name: string;
	email: string;
}

const COAUTHOR_TRAILER =
	"Co-authored-by: opencode-agent[bot] <opencode-agent[bot]@users.noreply.github.com>";

export function cloneRepo(
	repoUrl: string,
	githubToken: string,
	user: UserIdentity,
): CloneResult {
	const match = repoUrl.match(
		/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/,
	);
	if (!match?.[1] || !match?.[2]) {
		throw new Error("Invalid GitHub repository URL");
	}
	const owner = match[1];
	const repoName = match[2];

	const tmpDir = mkdtempSync(path.join(tmpdir(), "coder-"));
	const cloneDir = path.join(tmpDir, repoName);

	const cloneUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repoName}.git`;

	execSync(`git clone --depth 50 "${cloneUrl}" "${cloneDir}"`, {
		stdio: "pipe",
		timeout: 120_000,
	});

	// Set the commit author to the authenticated user so commits appear under
	// their GitHub account, with opencode-agent[bot] as co-author.
	execSync(`git config user.name "${user.name}"`, {
		cwd: cloneDir,
		stdio: "pipe",
	});
	execSync(`git config user.email "${user.email}"`, {
		cwd: cloneDir,
		stdio: "pipe",
	});

	// Write a commit message template that appends the co-author trailer to
	// every commit made by the agent in this clone.
	const templatePath = path.join(tmpDir, ".gitmessage");
	writeFileSync(templatePath, `\n\n${COAUTHOR_TRAILER}\n`);
	execSync(`git config commit.template "${templatePath}"`, {
		cwd: cloneDir,
		stdio: "pipe",
	});

	return { cloneDir, tmpDir, repoName, owner };
}
