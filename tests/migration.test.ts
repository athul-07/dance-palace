import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("SQL Editor setup is independent of search_path and preserves existing accounts on rerun", async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(
      new URL("../database/supabase.sql", import.meta.url),
      "utf8",
    );
    // A similarly named table in public must not intercept the admin seed.
    await db.exec(
      "CREATE TABLE public.users (unrelated text); SET search_path TO public;",
    );
    await db.exec(sql);
    const result = await db.query<{ username: string; role: string }>(
      "SELECT username,role FROM dance_palace.users",
    );
    assert.deepEqual(result.rows, [{ username: "admin", role: "admin" }]);
    assert.equal((await db.query("SELECT * FROM public.users")).rows.length, 0);
    await db.exec(
      "UPDATE dance_palace.users SET password_hash='changed-password-hash' WHERE username='admin'; SET search_path TO pg_catalog;",
    );
    await db.exec(sql);
    assert.equal(
      (
        await db.query<{ password_hash: string }>(
          "SELECT password_hash FROM dance_palace.users WHERE username='admin'",
        )
      ).rows[0].password_hash,
      "changed-password-hash",
    );
    assert.equal(
      Number(
        (
          await db.query<{ n: number }>(
            "SELECT count(*) n FROM dance_palace.batches",
          )
        ).rows[0].n,
      ),
      12,
    );
    assert.equal(
      Number(
        (
          await db.query<{ n: number }>(
            "SELECT count(*) n FROM dance_palace.attendance_sheets",
          )
        ).rows[0].n,
      ),
      80,
    );
  } finally {
    await db.close();
  }
});
