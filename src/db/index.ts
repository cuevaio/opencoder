import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
	throw new Error(
		"Missing DATABASE_URL. Set DATABASE_URL in your environment before starting the app.",
	);
}

export const pool = new Pool({
	connectionString: databaseUrl,
	connectionTimeoutMillis: 8_000,
	idleTimeoutMillis: 30_000,
	max: 10,
});

export const db = drizzle(pool, { schema });
