import { timingSafeEqual } from "node:crypto";
import { httpDb } from "./http-db.js";

function authorized(header, secret) {
  if (
    typeof secret !== "string" ||
    secret.length < 16 ||
    typeof header !== "string"
  )
    return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(header);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export function createMonitoringHandlers({
  db = httpDb,
  env = process.env,
  log = console,
} = {}) {
  return {
    async keepalive(req, res) {
      // Authenticate before creating a database client or making any query.
      if (!authorized(req.headers.authorization, env.CRON_SECRET))
        return send(res, 401, { error: "Unauthorized" });
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return send(res, 405, { error: "Method not allowed" });
      }
      try {
        if (!(await db.getSchoolSetup())) {
          log.error("keepalive: school setup missing");
          return send(res, 503, { error: "Database not ready" });
        }
        await db.listUsers();
        log.info("keepalive: database reads succeeded");
        return send(res, 200, { ok: true });
      } catch {
        log.error("keepalive: database read failed");
        return send(res, 503, { error: "Database unavailable" });
      }
    },
    async health(req, res) {
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return send(res, 405, { error: "Method not allowed" });
      }
      try {
        if (!(await db.getSchoolSetup()))
          return send(res, 503, { error: "Database not ready" });
        return send(res, 200, { ok: true });
      } catch {
        log.error("health: database read failed");
        return send(res, 503, { error: "Database unavailable" });
      }
    },
  };
}

export const { keepalive, health } = createMonitoringHandlers();
