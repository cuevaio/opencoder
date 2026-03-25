import { relations, sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Better Auth Core Tables ─────────────────────────────
// Drizzle owns Better Auth core tables in this repo so `drizzle-kit push`
// does not treat them as drift and drop them.
export const authUsers = pgTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull(),
		emailVerified: boolean("emailVerified").notNull().default(false),
		image: text("image"),
		createdAt: timestamp("createdAt", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updatedAt", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [uniqueIndex("auth_user_email_idx").on(t.email)],
);

export const authSessions = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
		token: text("token").notNull(),
		createdAt: timestamp("createdAt", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updatedAt", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		userId: text("userId")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("auth_session_token_idx").on(t.token),
		index("auth_session_user_id_idx").on(t.userId),
	],
);

export const authAccounts = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("accountId").notNull(),
		providerId: text("providerId").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		accessToken: text("accessToken"),
		refreshToken: text("refreshToken"),
		idToken: text("idToken"),
		accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("createdAt", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updatedAt", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("auth_account_provider_account_idx").on(
			t.providerId,
			t.accountId,
		),
		index("auth_account_user_id_idx").on(t.userId),
	],
);

export const authVerifications = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
		createdAt: timestamp("createdAt", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updatedAt", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);

// ─── User Profiles ───────────────────────────────────────
// Extends Better Auth's `user` table with app-specific data.
// Drizzle manages Better Auth's `user` table for identity — this stores GitHub info.
export const userProfiles = pgTable(
	"user_profiles",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		userId: text("user_id").notNull().unique(), // Better Auth user.id
		githubUsername: text("github_username").notNull(),
		githubId: integer("github_id").notNull().unique(),
		avatarUrl: text("avatar_url"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("user_profiles_user_id_idx").on(t.userId),
		uniqueIndex("user_profiles_github_id_idx").on(t.githubId),
	],
);

// ─── Repositories ────────────────────────────────────────
export const repositories = pgTable(
	"repositories",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		githubId: integer("github_id").notNull().unique(),
		name: text("name").notNull(),
		fullName: text("full_name").notNull(),
		htmlUrl: text("html_url").notNull(),
		description: text("description"),
		language: text("language"),
		isPrivate: boolean("is_private").notNull().default(false),
		isArchived: boolean("is_archived").notNull().default(false),
		defaultBranch: text("default_branch").notNull().default("main"),
		githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("repositories_github_id_idx").on(t.githubId),
		index("repositories_full_name_idx").on(t.fullName),
	],
);

// ─── User ↔ Repository junction ─────────────────────────
export const userRepositories = pgTable(
	"user_repositories",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		profileId: integer("profile_id")
			.notNull()
			.references(() => userProfiles.id, { onDelete: "cascade" }),
		repositoryId: integer("repository_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		role: text("role").notNull().default("member"),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		usageCount: integer("usage_count").notNull().default(0),
		syncedAt: timestamp("synced_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("user_repo_unique_idx").on(t.profileId, t.repositoryId),
		index("user_repo_profile_id_idx").on(t.profileId),
		index("user_repo_last_used_idx").on(t.profileId, t.lastUsedAt),
	],
);

// ─── Agent Sessions ──────────────────────────────────────
// Renamed from "sessions" to avoid collision with Better Auth's session table.
export const agentSessions = pgTable(
	"agent_sessions",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		userId: text("user_id").notNull(), // Better Auth user.id
		repoUrl: text("repo_url").notNull(),
		repoFullName: text("repo_full_name").notNull(),
		opencodeSessionId: text("opencode_session_id"),
		triggerRunId: text("trigger_run_id").notNull(),
		title: text("title").notNull(),
		initialPrompt: text("initial_prompt").notNull(),
		lastPrompt: text("last_prompt"),
		mode: text("mode").notNull().default("build"),
		selectedModel: text("selected_model").notNull().default("gpt-5.3-codex"),
		selectedVariant: text("selected_variant"),
		status: text("status").notNull().default("running"),
		sessionData: jsonb("session_data"),
		totalTokens: integer("total_tokens"),
		totalCost: integer("total_cost"),
		messageCount: integer("message_count"),
		toolCallCount: integer("tool_call_count"),
		eventSeq: integer("event_seq").notNull().default(0),
		gitStateStatus: text("git_state_status").notNull().default("none"),
		gitStateError: text("git_state_error"),
		gitStateCapturedAt: timestamp("git_state_captured_at", {
			withTimezone: true,
		}),
		gitStateBytes: integer("git_state_bytes"),
		gitStateHead: text("git_state_head"),
		gitStateBranch: text("git_state_branch"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(t) => [
		index("agent_sessions_user_id_idx").on(t.userId),
		index("agent_sessions_user_created_idx").on(t.userId, t.createdAt),
		index("agent_sessions_trigger_run_id_idx").on(t.triggerRunId),
	],
);

export const agentSessionGitState = pgTable(
	"agent_session_git_state",
	{
		sessionId: integer("session_id")
			.primaryKey()
			.references(() => agentSessions.id, { onDelete: "cascade" }),
		format: text("format").notNull(),
		archive: text("archive").notNull(),
		sha256: text("sha256").notNull(),
		bytes: integer("bytes").notNull(),
		headOid: text("head_oid").notNull(),
		headRef: text("head_ref"),
		branch: text("branch"),
		stashCount: integer("stash_count").notNull().default(0),
		capturedAt: timestamp("captured_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [index("agent_session_git_state_captured_idx").on(t.capturedAt)],
);

export const agentProviderKeys = pgTable(
	"agent_provider_keys",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		userId: text("user_id").notNull(),
		provider: text("provider").notNull(),
		encryptedKey: text("encrypted_key").notNull(),
		iv: text("iv").notNull(),
		authTag: text("auth_tag").notNull(),
		keyVersion: integer("key_version").notNull().default(1),
		last4: text("last4").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("agent_provider_keys_user_provider_idx").on(
			t.userId,
			t.provider,
		),
		index("agent_provider_keys_user_id_idx").on(t.userId),
	],
);

// ─── Session Events ──────────────────────────────────────
// One row per renderable event in the agent session, ordered by `seq`.
// Electric syncs this table to the client via TanStack DB.
export const sessionEvents = pgTable(
	"session_events",
	{
		id: integer().primaryKey().generatedAlwaysAsIdentity(),
		sessionId: integer("session_id")
			.notNull()
			.references(() => agentSessions.id, { onDelete: "cascade" }),
		userId: text("user_id").notNull(), // Better Auth user.id
		seq: integer("seq").notNull(),
		eventType: text("event_type").notNull(),

		// ── Part fields ──
		partId: text("part_id"),
		messageId: text("message_id"),
		opencodeSessionId: text("opencode_session_id"),
		partType: text("part_type"),
		text: text("text"),

		// ── Tool fields ──
		toolName: text("tool_name"),
		callId: text("call_id"),
		toolStatus: text("tool_status"),
		toolInput: jsonb("tool_input"),
		toolOutput: text("tool_output"),
		toolError: text("tool_error"),
		toolTitle: text("tool_title"),
		toolMetadata: jsonb("tool_metadata"),
		toolTimeStart: bigint("tool_time_start", { mode: "number" }),
		toolTimeEnd: bigint("tool_time_end", { mode: "number" }),

		// ── Status event fields ──
		statusText: text("status_text"),

		// ── Question event fields ──
		questionRequestId: text("question_request_id"),
		questionTokenId: text("question_token_id"),
		questionData: jsonb("question_data"),

		// ── Message-update fields ──
		messageRole: text("message_role"),
		messageTokensInput: integer("message_tokens_input"),
		messageTokensOutput: integer("message_tokens_output"),
		messageTokensReasoning: integer("message_tokens_reasoning"),
		messageCost: integer("message_cost"),

		// ── User-message fields ──
		userMessageText: text("user_message_text"),

		// ── Full Part JSON for lossless round-trip ──
		partData: jsonb("part_data"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		uniqueIndex("session_events_session_seq_idx").on(t.sessionId, t.seq),
		index("session_events_user_session_idx").on(t.userId, t.sessionId),
		uniqueIndex("session_events_session_part_idx")
			.on(t.sessionId, t.partId)
			.where(sql`part_id IS NOT NULL`),
	],
);

// ─── Relations ───────────────────────────────────────────

export const userProfilesRelations = relations(userProfiles, ({ many }) => ({
	userRepositories: many(userRepositories),
}));

export const repositoriesRelations = relations(repositories, ({ many }) => ({
	userRepositories: many(userRepositories),
}));

export const agentSessionsRelations = relations(
	agentSessions,
	({ many, one }) => ({
		events: many(sessionEvents),
		gitState: one(agentSessionGitState, {
			fields: [agentSessions.id],
			references: [agentSessionGitState.sessionId],
		}),
	}),
);

export const agentSessionGitStateRelations = relations(
	agentSessionGitState,
	({ one }) => ({
		session: one(agentSessions, {
			fields: [agentSessionGitState.sessionId],
			references: [agentSessions.id],
		}),
	}),
);

export const sessionEventsRelations = relations(sessionEvents, ({ one }) => ({
	session: one(agentSessions, {
		fields: [sessionEvents.sessionId],
		references: [agentSessions.id],
	}),
}));

export const userRepositoriesRelations = relations(
	userRepositories,
	({ one }) => ({
		profile: one(userProfiles, {
			fields: [userRepositories.profileId],
			references: [userProfiles.id],
		}),
		repository: one(repositories, {
			fields: [userRepositories.repositoryId],
			references: [repositories.id],
		}),
	}),
);
