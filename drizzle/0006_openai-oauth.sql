CREATE TABLE "agent_provider_oauth_credentials" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_provider_oauth_credentials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_auth" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"account_id" text,
	"token_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_provider_oauth_pending" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_data" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_provider_oauth_credentials_user_provider_idx" ON "agent_provider_oauth_credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "agent_provider_oauth_credentials_user_id_idx" ON "agent_provider_oauth_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_provider_oauth_pending_user_id_idx" ON "agent_provider_oauth_pending" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_provider_oauth_pending_expires_at_idx" ON "agent_provider_oauth_pending" USING btree ("expires_at");