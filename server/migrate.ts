import { readFile } from "node:fs/promises";
import { pool } from "./db.js";
await pool.query(
  await readFile(new URL("../database/supabase.sql", import.meta.url), "utf8"),
);
console.log("Dance Palace schema and seed are ready.");
await pool.end();
