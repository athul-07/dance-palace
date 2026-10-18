import "dotenv/config";
import pg from "pg";
import { databaseConfig } from "./db-config.js";
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => Number(v));
export type DB = {
  query: (
    sql: string,
    params?: any[],
  ) => Promise<{ rows: any[]; rowCount?: number | null }>;
};
export const pool = new pg.Pool(databaseConfig());
export async function atomic<T>(
  db: any,
  fn: (q: DB) => Promise<T>,
): Promise<T> {
  const c = db.connect ? await db.connect() : db;
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(781235)");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    if (c.release) c.release();
  }
}
export const rows = async (q: DB, sql: string, p: any[] = []): Promise<any[]> =>
  (await q.query(sql, p)).rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date
          ? key === "date"
            ? value.toISOString().slice(0, 10)
            : value.toISOString()
          : value,
      ]),
    ),
  );
