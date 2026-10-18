import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import request from "supertest";

test("Vercel entry exports the API without starting a server or requiring a DB query for health", async () => {
  process.env.JWT_SECRET = "vercel-test-secret-with-at-least-32-characters";
  process.env.VERCEL = "1";
  const { default: app } = await import("../api/index.js");
  const health = await request(app).get("/api/health").expect(200);
  assert.deepEqual(health.body, { status: "ok" });
  await request(app).get("/api/auth/me").expect(401);
  await request(app).get("/api/nonexistent").set("Cookie", "").expect(401);
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(config.rewrites[0], {
    source: "/api/:path*",
    destination: "/api/index",
  });
  assert.equal(config.outputDirectory, "dist");
});
