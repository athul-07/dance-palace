import { test } from "node:test";
import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import pg from "pg";
import request from "supertest";
import { databaseConfig, databaseTlsError } from "../server/db-config.js";
import { createApp } from "../server/app.js";

test("Vercel PEM CA survives connection-string SSL parameters", () => {
  const ca = rootCertificates[0];
  const config = databaseConfig({
    DATABASE_URL:
      "postgresql://postgres:example@pooler.example.com:5432/postgres?sslmode=require&sslrootcert=missing.pem",
    DATABASE_CA_CERT: ca.replaceAll("\n", "\\n"),
    VERCEL: "1",
  });
  const client = new pg.Client(config);
  const ssl = (client as any).connectionParameters.ssl;
  assert.equal(ssl.ca, ca.trim());
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(config.max, 2);
  assert.equal(
    new URL(config.connectionString!).searchParams.has("sslmode"),
    false,
  );
});
test("hosted TLS remains verified and only loopback hosts skip TLS", () => {
  assert.deepEqual(
    databaseConfig({
      DATABASE_URL: "postgresql://localhost:secret@pooler.example.com/postgres",
    }).ssl,
    { rejectUnauthorized: true },
  );
  assert.equal(
    databaseConfig({
      DATABASE_URL: "postgresql://postgres:example@127.0.0.1/postgres",
    }).ssl,
    false,
  );
  assert.match(
    databaseTlsError({ code: "SELF_SIGNED_CERT_IN_CHAIN" })!,
    /DATABASE_CA_CERT/,
  );
  assert.equal(databaseTlsError({ code: "28P01" }), undefined);
});
test("login certificate failure returns an actionable error without exposing connection secrets", async () => {
  process.env.JWT_SECRET = "tls-regression-test-secret-at-least-32-chars";
  const app = createApp({
    query: async () => {
      throw Object.assign(
        new Error("self-signed certificate in certificate chain"),
        { code: "SELF_SIGNED_CERT_IN_CHAIN" },
      );
    },
  });
  const response = await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "example-password" })
    .expect(503);
  assert.match(response.body.error, /DATABASE_CA_CERT/);
  assert.doesNotMatch(response.body.error, /example-password|postgresql:\/\//);
});
