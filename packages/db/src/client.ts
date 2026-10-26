import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString?: string) {
  const url =
    connectionString ??
    process.env.DATABASE_URL ??
    "postgresql://smartreach:smartreach@localhost:5432/smartreach";

  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}

let singleton: Database | null = null;

export function getDb(): Database {
  if (!singleton) {
    singleton = createDb();
  }
  return singleton;
}
