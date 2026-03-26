import { execSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
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

	// Install a prepare-commit-msg hook that appends the co-author trailer to
	// every commit message, regardless of how the commit is made. Using a hook
	// instead of commit.template because `git commit -m "..."` bypasses
	// commit.template entirely, but hooks always run.
	const hookPath = path.join(cloneDir, ".git", "hooks", "prepare-commit-msg");
	const hookScript = [
		"#!/bin/sh",
		`TRAILER="${COAUTHOR_TRAILER}"`,
		// Only append if the trailer isn't already present (idempotent).
		`grep -qF "$TRAILER" "$1" || printf '\\n\\n%s\\n' "$TRAILER" >> "$1"`,
	].join("\n");
	writeFileSync(hookPath, hookScript);
	chmodSync(hookPath, 0o755);

	return { cloneDir, tmpDir, repoName, owner };
}
