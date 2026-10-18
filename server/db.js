import "./env.js";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { config, poolOptions } from './config.js';
let database;
if (config.databaseUrl) {
  database = new pg.Pool(poolOptions(config));
  database.on('error', () => console.error(JSON.stringify({event:'database_pool_error'})));
}
else {
  const storage = path.resolve(process.env.PGLITE_PATH || "./data/postgres");
  mkdirSync(storage, { recursive: true });
  database = new PGlite(storage);
}
let queue = Promise.resolve();
const enqueue = (fn) => {
  const result = queue.then(fn, fn);
  queue = result.catch(() => {});
  return result;
};
export const query = (sql, params = []) =>
  enqueue(() => database.query(sql, params));
export const rows = async (sql, params = []) => (await query(sql, params)).rows;
export const one = async (sql, params = []) => (await rows(sql, params))[0];
// Serialize embedded transactions; use a dedicated connection for external PostgreSQL.
export function atomic(fn) {
  const run = async () => {
    const client = config.databaseUrl
      ? await database.connect()
      : database;
    const q = (s, p = []) => client.query(s, p);
    try {
      await q("BEGIN");
      const result = await fn(q);
      await q("COMMIT");
      return result;
    } catch (e) {
      await q("ROLLBACK");
      throw e;
    } finally {
      client.release?.();
    }
  };
  return enqueue(run);
}
export const close = () => (database.close ? database.close() : database.end());
