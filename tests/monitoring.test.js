import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

process.env.NODE_ENV = "test";
const { createMonitoringHandlers } = await import("../server/monitoring.js");
const { createHttpDb } = await import("../server/http-db.js");
const { supabaseCredentials } = await import("../server/env.js");
const secret = "a-test-cron-secret-longer-than-16";
const log = { info() {}, error() {} };

async function fixture(t, options = {}) {
  const calls = [];
  const db = {
    async getSchoolSetup() {
      calls.push("setup");
      return { key: "categories", private: "never-return" };
    },
    async listUsers() {
      calls.push("users");
      return [{ id: 1, private: "never-return" }];
    },
    ...options.db,
  };
  const handlers = createMonitoringHandlers({
    db,
    env: { CRON_SECRET: secret },
    log,
    ...options,
  });
  const server = createServer((req, res) => {
    void (req.url === "/api/health" ? handlers.health : handlers.keepalive)(
      req,
      res,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    calls,
    request: (headers = {}, path = "/api/cron/keepalive", method = "GET") =>
      fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        headers,
        method,
      }),
  };
}

test("cron rejects missing/wrong authorization before any database query", async (t) => {
  const { calls, request } = await fixture(t);
  for (const headers of [
    {},
    { authorization: "Bearer wrong" },
    { authorization: secret },
    { authorization: `Bearer ${secret}extra` },
  ]) {
    const response = await request(headers);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(calls, []);
});

test("unset or short cron secret fails closed", async (t) => {
  for (const CRON_SECRET of [undefined, "short"]) {
    const { calls, request } = await fixture(t, { env: { CRON_SECRET } });
    assert.equal(
      (await request({ authorization: `Bearer ${CRON_SECRET}` })).status,
      401,
    );
    assert.deepEqual(calls, []);
  }
});

test("cron returns only ok after both real reads and refuses other methods", async (t) => {
  const { calls, request } = await fixture(t);
  const response = await request({ authorization: `Bearer ${secret}` });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, ["setup", "users"]);
  calls.length = 0;
  assert.equal(
    (
      await request(
        { authorization: `Bearer ${secret}` },
        "/api/cron/keepalive",
        "POST",
      )
    ).status,
    405,
  );
  assert.deepEqual(calls, []);
});

test("missing required setup returns 503 without reading users", async (t) => {
  let usersRead = false;
  const { request } = await fixture(t, {
    db: {
      async getSchoolSetup() {
        return null;
      },
      async listUsers() {
        usersRead = true;
      },
    },
  });
  assert.equal(
    (await request({ authorization: `Bearer ${secret}` })).status,
    503,
  );
  assert.equal(usersRead, false);
  assert.equal((await request({}, "/api/health")).status, 503);
});

test("either failed database operation returns 503 without leaking errors", async (t) => {
  for (const failing of ["getSchoolSetup", "listUsers"]) {
    const { request } = await fixture(t, {
      db: {
        async getSchoolSetup() {
          return { key: "categories" };
        },
        async listUsers() {
          return [];
        },
        async [failing]() {
          throw new Error("private database details");
        },
      },
    });
    const response = await request({ authorization: `Bearer ${secret}` });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "Database unavailable" });
    if (failing === "getSchoolSetup") {
      assert.equal((await request({}, "/api/health")).status, 503);
    }
  }
});

test("health checks the database without returning records or requiring user auth", async (t) => {
  const { calls, request } = await fixture(t);
  const response = await request({}, "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls, ["setup"]);
});

test("HTTP repository makes minimal Supabase table reads and propagates PostgREST errors", async () => {
  const requests = [];
  let failure = false;
  const client = createClient(
    "https://test.supabase.co",
    "sb_secret_server_only",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (url, init) => {
          const parsed = new URL(url);
          requests.push({ url: parsed, headers: new Headers(init.headers) });
          return new Response(
            JSON.stringify(
              failure
                ? { message: "table unavailable", code: "42P01" }
                : parsed.pathname.endsWith("setup")
                  ? [{ key: "categories" }]
                  : [{ id: 1 }],
            ),
            {
              status: failure ? 503 : 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        },
      },
    },
  );
  const db = createHttpDb(() => client);
  assert.deepEqual(await db.getSchoolSetup(), { key: "categories" });
  assert.deepEqual(await db.listUsers(), [{ id: 1 }]);
  assert.equal(requests[0].url.pathname, "/rest/v1/setup");
  assert.equal(requests[0].url.searchParams.get("key"), "eq.categories");
  assert.equal(requests[0].url.searchParams.get("select"), "key");
  assert.equal(requests[1].url.pathname, "/rest/v1/users");
  assert.equal(requests[1].url.searchParams.get("select"), "id");
  for (const request of requests) {
    assert.equal(request.url.searchParams.get("limit"), "1");
    assert.equal(request.headers.get("apikey"), "sb_secret_server_only");
  }
  failure = true;
  await assert.rejects(db.getSchoolSetup(), /setup query failed/);
  await assert.rejects(db.listUsers(), /users query failed/);
});

test("HTTP credentials need no DATABASE_URL and secrets stay separate from public auth", () => {
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  assert.equal(
    supabaseCredentials(env, { admin: true }).key,
    env.SUPABASE_SECRET_KEY,
  );
  assert.equal(supabaseCredentials(env).key, env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(
    supabaseCredentials(
      {
        NEXT_PUBLIC_SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: "legacy-secret",
      },
      { admin: true },
    ).key,
    "legacy-secret",
  );
  assert.throws(
    () =>
      supabaseCredentials({ SUPABASE_URL: env.SUPABASE_URL }, { admin: true }),
    /SUPABASE_SECRET_KEY/,
  );
  assert.throws(
    () => supabaseCredentials({ ...env, SUPABASE_URL: "invalid" }),
    /valid HTTP/,
  );
  assert.throws(
    () =>
      supabaseCredentials({
        ...env,
        NODE_ENV: "production",
        SUPABASE_URL: "http://test.example",
      }),
    /HTTPS/,
  );
});

test("production does not load the local .env", () => {
  const childEnv = { ...process.env, NODE_ENV: "production" };
  delete childEnv.SUPABASE_URL;
  delete childEnv.CRON_SECRET;
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('./server/env.js'); console.log(Boolean(process.env.SUPABASE_URL || process.env.CRON_SECRET));",
    ],
    { env: childEnv, encoding: "utf8" },
  );
  assert.equal(output.trim(), "false");
});

test("Vercel uses standalone HTTP handlers and schedules the daily cron", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.ok(
    config.crons.some(
      (cron) =>
        cron.path === "/api/cron/keepalive" && cron.schedule === "0 6 * * *",
    ),
  );
  assert.equal(
    typeof (await import("../api/cron/keepalive.js")).default,
    "function",
  );
  assert.equal(typeof (await import("../api/health.js")).default, "function");
});
