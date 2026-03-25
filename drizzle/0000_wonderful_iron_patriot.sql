CREATE TABLE "agent_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"repo_url" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"opencode_session_id" text,
	"trigger_run_id" text NOT NULL,
	"title" text NOT NULL,
	"initial_prompt" text NOT NULL,
	"last_prompt" text,
	"mode" text DEFAULT 'build' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"session_data" jsonb,
	"total_tokens" integer,
	"total_cost" integer,
	"message_count" integer,
	"tool_call_count" integer,
	"event_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "repositories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"github_id" integer NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"html_url" text NOT NULL,
	"description" text,
	"language" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"github_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "session_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"session_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"seq" integer NOT NULL,
	"event_type" text NOT NULL,
	"part_id" text,
	"message_id" text,
	"opencode_session_id" text,
	"part_type" text,
	"text" text,
	"tool_name" text,
	"call_id" text,
	"tool_status" text,
	"tool_input" jsonb,
	"tool_output" text,
	"tool_error" text,
	"tool_title" text,
	"tool_metadata" jsonb,
	"tool_time_start" bigint,
	"tool_time_end" bigint,
	"status_text" text,
	"question_request_id" text,
	"question_token_id" text,
	"question_data" jsonb,
	"message_role" text,
	"message_tokens_input" integer,
	"message_tokens_output" integer,
	"message_tokens_reasoning" integer,
	"message_cost" integer,
	"user_message_text" text,
	"part_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"github_username" text NOT NULL,
	"github_id" integer NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_profiles_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "user_repositories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_repositories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"profile_id" integer NOT NULL,
	"repository_id" integer NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_used_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_repositories" ADD CONSTRAINT "user_repositories_profile_id_user_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_repositories" ADD CONSTRAINT "user_repositories_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_user_id_idx" ON "agent_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_sessions_user_created_idx" ON "agent_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_sessions_trigger_run_id_idx" ON "agent_sessions" USING btree ("trigger_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_github_id_idx" ON "repositories" USING btree ("github_id");--> statement-breakpoint
CREATE INDEX "repositories_full_name_idx" ON "repositories" USING btree ("full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_session_seq_idx" ON "session_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "session_events_user_session_idx" ON "session_events" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_events_session_part_idx" ON "session_events" USING btree ("session_id","part_id") WHERE part_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_user_id_idx" ON "user_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_github_id_idx" ON "user_profiles" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_repo_unique_idx" ON "user_repositories" USING btree ("profile_id","repository_id");--> statement-breakpoint
CREATE INDEX "user_repo_profile_id_idx" ON "user_repositories" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "user_repo_last_used_idx" ON "user_repositories" USING btree ("profile_id","last_used_at");