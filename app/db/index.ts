import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

// Create the database connection
const sqlite = new Database("prisma/dev.sqlite");

// Create the Drizzle instance with schema for relational queries
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export * from "./schema";

