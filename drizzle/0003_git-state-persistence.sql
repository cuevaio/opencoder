CREATE TABLE "agent_session_git_state" (
	"session_id" integer PRIMARY KEY NOT NULL,
	"format" text NOT NULL,
	"archive" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"head_oid" text NOT NULL,
	"head_ref" text,
	"branch" text,
	"stash_count" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "git_state_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "git_state_error" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "git_state_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "git_state_bytes" integer;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "git_state_head" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "git_state_branch" text;--> statement-breakpoint
ALTER TABLE "agent_session_git_state" ADD CONSTRAINT "agent_session_git_state_session_id_agent_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_session_git_state_captured_idx" ON "agent_session_git_state" USING btree ("captured_at");