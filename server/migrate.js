import { readFile } from "node:fs/promises";
import { query, close } from "./db.js";
export async function migrate() {
  const sql = await readFile(
    new URL("./migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await query(statement);
}
if (process.argv[1]?.endsWith("migrate.js")) {
  await migrate();
  await close();
  console.log("Database migration complete.");
}
