import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { pool } from "#/db/index.ts";

function getRequiredEnv(name: "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET") {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

if (!process.env.VERCEL_URL) {
	throw new Error("Missing required environment variable: VERCEL_URL");
}

export const auth = betterAuth({
  baseURL: process.env.VERCEL_URL?.includes("localhost") ? `http://${process.env.VERCEL_URL}` : `https://${process.env.VERCEL_URL}`,
	database: pool,
	socialProviders: {
		github: {
			clientId: getRequiredEnv("GITHUB_CLIENT_ID"),
			clientSecret: getRequiredEnv("GITHUB_CLIENT_SECRET"),
			scope: ["repo", "read:user", "user:email"],
		},
	},
	plugins: [tanstackStartCookies()],
});
