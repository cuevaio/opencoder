import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface CloneResult {
	cloneDir: string;
	tmpDir: string;
	repoName: string;
	owner: string;
}

export function cloneRepo(repoUrl: string, githubToken: string): CloneResult {
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

	execSync(
		`git config user.email "coder-agent[bot]@users.noreply.github.com"`,
		{ cwd: cloneDir, stdio: "pipe" },
	);
	execSync(`git config user.name "coder-agent[bot]"`, {
		cwd: cloneDir,
		stdio: "pipe",
	});

	return { cloneDir, tmpDir, repoName, owner };
}
