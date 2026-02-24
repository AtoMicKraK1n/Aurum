import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
  statement_timeout: 10000,
  idleTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Database error:", err);
  process.exit(-1);
});
