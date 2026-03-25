CREATE TABLE "agent_provider_keys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_provider_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"last4" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "selected_model" text DEFAULT 'gpt-5.3-codex' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_provider_keys_user_provider_idx" ON "agent_provider_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "agent_provider_keys_user_id_idx" ON "agent_provider_keys" USING btree ("user_id");