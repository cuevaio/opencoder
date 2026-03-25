import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { pool } from "#/db/index.ts";

export const auth = betterAuth({
	database: pool,
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
			scope: ["repo", "read:user", "user:email"],
		},
	},
	plugins: [tanstackStartCookies()],
});
