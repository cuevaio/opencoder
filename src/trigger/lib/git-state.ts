import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "#/db/index.ts";
import { agentSessionGitState, agentSessions } from "#/db/schema.ts";

const FORMAT = "repo-tar-gzip-v1";

export type GitState = {
	format: string;
	archive: string;
	sha256: string;
	bytes: number;
	headOid: string;
	headRef: string | null;
	branch: string | null;
	stashCount: number;
	capturedAt: Date;
};

function git(cloneDir: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: cloneDir,
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	}).trim();
}

function gitRaw(cloneDir: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd: cloneDir,
		stdio: ["ignore", "pipe", "pipe"],
		encoding: "utf8",
	});
}

function maybeGit(cloneDir: string, args: string[]): string | null {
	try {
		const text = git(cloneDir, args);
		return text.length > 0 ? text : null;
	} catch {
		return null;
	}
}

function nonSecretRemote(owner: string, repoName: string): string {
	return `https://github.com/${owner}/${repoName}.git`;
}

function authRemote(
	owner: string,
	repoName: string,
	githubToken: string,
): string {
	return `https://x-access-token:${githubToken}@github.com/${owner}/${repoName}.git`;
}

function setOrigin(cloneDir: string, remote: string): void {
	try {
		git(cloneDir, ["remote", "set-url", "origin", remote]);
		return;
	} catch {
		git(cloneDir, ["remote", "add", "origin", remote]);
	}
}

function countStash(cloneDir: string): number {
	const list = maybeGit(cloneDir, ["stash", "list"]);
	if (!list) return 0;
	return list.split("\n").filter((line) => line.length > 0).length;
}

function parsePaths(input: string): string[] {
	return input.split("\0").filter((item) => item.length > 0);
}

function collectArchivePaths(cloneDir: string): string[] {
	const tracked = parsePaths(gitRaw(cloneDir, ["ls-files", "-z"]));
	const untracked = parsePaths(
		gitRaw(cloneDir, ["ls-files", "--others", "--exclude-standard", "-z"]),
	);
	const files = [...new Set([...tracked, ...untracked])].filter((item) =>
		existsSync(path.join(cloneDir, item)),
	);
	return [".git", ...files];
}

export function captureGitState(input: {
	cloneDir: string;
	owner: string;
	repoName: string;
}): GitState {
	setOrigin(input.cloneDir, nonSecretRemote(input.owner, input.repoName));

	const tempDir = mkdtempSync(path.join(tmpdir(), "opencoder-git-state-"));
	const archivePath = path.join(tempDir, "repo.tar.gz");
	const listPath = path.join(tempDir, "paths.txt");

	try {
		const paths = collectArchivePaths(input.cloneDir);
		writeFileSync(listPath, `${paths.join("\0")}\0`, "utf8");

		execFileSync(
			"tar",
			["-czf", archivePath, "-C", input.cloneDir, "--null", "-T", listPath],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		const archiveBuffer = readFileSync(archivePath);
		const hash = createHash("sha256").update(archiveBuffer).digest("hex");

		return {
			format: FORMAT,
			archive: archiveBuffer.toString("base64"),
			sha256: hash,
			bytes: archiveBuffer.byteLength,
			headOid: git(input.cloneDir, ["rev-parse", "HEAD"]),
			headRef: maybeGit(input.cloneDir, ["symbolic-ref", "-q", "HEAD"]),
			branch: maybeGit(input.cloneDir, ["branch", "--show-current"]),
			stashCount: countStash(input.cloneDir),
			capturedAt: new Date(),
		};
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

export function restoreGitState(input: {
	cloneDir: string;
	owner: string;
	repoName: string;
	githubToken: string;
	state: GitState;
}): void {
	if (input.state.format !== FORMAT) {
		throw new Error(`Unsupported git state format: ${input.state.format}`);
	}

	const tempDir = mkdtempSync(path.join(tmpdir(), "opencoder-git-restore-"));
	const archivePath = path.join(tempDir, "repo.tar.gz");

	try {
		const buffer = Buffer.from(input.state.archive, "base64");
		const hash = createHash("sha256").update(buffer).digest("hex");
		if (hash !== input.state.sha256) {
			throw new Error("Git state checksum mismatch");
		}

		writeFileSync(archivePath, buffer);
		rmSync(input.cloneDir, { recursive: true, force: true });
		mkdirSync(input.cloneDir, { recursive: true });

		execFileSync("tar", ["-xzf", archivePath, "-C", input.cloneDir], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		const inRepo = git(input.cloneDir, ["rev-parse", "--is-inside-work-tree"]);
		if (inRepo !== "true") {
			throw new Error("Restored archive is not a valid git repository");
		}

		const head = git(input.cloneDir, ["rev-parse", "HEAD"]);
		if (head !== input.state.headOid) {
			throw new Error("Restored HEAD does not match expected state");
		}

		setOrigin(
			input.cloneDir,
			authRemote(input.owner, input.repoName, input.githubToken),
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

export async function loadGitState(
	sessionId: number,
): Promise<GitState | null> {
	const [row] = await db
		.select()
		.from(agentSessionGitState)
		.where(eq(agentSessionGitState.sessionId, sessionId))
		.limit(1);

	if (!row) return null;

	return {
		format: row.format,
		archive: row.archive,
		sha256: row.sha256,
		bytes: row.bytes,
		headOid: row.headOid,
		headRef: row.headRef,
		branch: row.branch,
		stashCount: row.stashCount,
		capturedAt: row.capturedAt,
	};
}

export async function saveGitState(
	sessionId: number,
	state: GitState,
): Promise<void> {
	await db
		.insert(agentSessionGitState)
		.values({
			sessionId,
			format: state.format,
			archive: state.archive,
			sha256: state.sha256,
			bytes: state.bytes,
			headOid: state.headOid,
			headRef: state.headRef,
			branch: state.branch,
			stashCount: state.stashCount,
			capturedAt: state.capturedAt,
		})
		.onConflictDoUpdate({
			target: agentSessionGitState.sessionId,
			set: {
				format: state.format,
				archive: state.archive,
				sha256: state.sha256,
				bytes: state.bytes,
				headOid: state.headOid,
				headRef: state.headRef,
				branch: state.branch,
				stashCount: state.stashCount,
				capturedAt: state.capturedAt,
				updatedAt: new Date(),
			},
		});
}

export async function markGitStateFailure(
	sessionId: number,
	status: "restore_failed" | "capture_failed",
	error: string,
): Promise<void> {
	await db
		.update(agentSessions)
		.set({
			gitStateStatus: status,
			gitStateError: error,
		})
		.where(eq(agentSessions.id, sessionId));
}
