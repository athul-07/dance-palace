import "./env.js";
import { readFileSync } from "node:fs";
export function readConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const databaseUrl = env.DATABASE_URL || "";
  const publicOrigin = env.APP_ORIGIN || env.PUBLIC_ORIGIN || "";
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabasePublishableKey = env.SUPABASE_PUBLISHABLE_KEY || "";
  const supabaseSecretKey =
    env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  const supabaseJwksUrl =
    env.SUPABASE_JWKS_URL ||
    (supabaseUrl ? `${supabaseUrl}/auth/v1/.well-known/jwks.json` : "");
  const bootstrapAdminUsername = env.BOOTSTRAP_ADMIN_USERNAME || "";
  const bootstrapAdminPassword = env.BOOTSTRAP_ADMIN_PASSWORD || "";
  if (production) {
    if (!databaseUrl)
      throw new Error(
        "Production requires DATABASE_URL: use the PostgreSQL connection string from Supabase Database > Connect, not SUPABASE_URL or an API key.",
      );
    let url;
    try {
      url = new URL(publicOrigin);
    } catch {
      throw new Error("APP_ORIGIN must be your HTTPS origin.");
    }
    if (
      url.protocol !== "https:" ||
      url.origin !== publicOrigin ||
      url.username ||
      url.password
    )
      throw new Error(
        "APP_ORIGIN must be an HTTPS origin without a trailing slash or path.",
      );
    if (env.SEED_DEMO === "true")
      throw new Error("Demo seeding is disabled in production.");
    if (
      !supabaseUrl ||
      !supabasePublishableKey ||
      !supabaseSecretKey ||
      !supabaseJwksUrl
    )
      throw new Error(
        "Production requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, and SUPABASE_JWKS_URL.",
      );
    const projectUrl = new URL(supabaseUrl);
    const jwksUrl = new URL(supabaseJwksUrl);
    if (projectUrl.protocol !== "https:" || jwksUrl.protocol !== "https:")
      throw new Error("Production Supabase URLs must use HTTPS.");
  }
  if (databaseUrl) {
    const u = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(u.protocol))
      throw new Error("DATABASE_URL must use PostgreSQL.");
    if (
      production &&
      ["disable", "no-verify", "prefer", "allow"].includes(
        u.searchParams.get("sslmode"),
      )
    )
      throw new Error(
        "Use DATABASE_SSL=disable only for a private database network; insecure URL SSL modes are not allowed.",
      );
  }
  const sslMode = env.DATABASE_SSL || "verify";
  if (!["verify", "disable"].includes(sslMode))
    throw new Error("DATABASE_SSL must be verify or disable.");
  const proxy = env.TRUST_PROXY || "0";
  if (!/^\d+$/.test(proxy) || Number(proxy) > 5)
    throw new Error("TRUST_PROXY must be an explicit hop count from 0 to 5.");
  return {
    production,
    databaseUrl,
    publicOrigin,
    supabaseUrl,
    supabasePublishableKey,
    supabaseSecretKey,
    supabaseJwksUrl,
    bootstrapAdminUsername,
    bootstrapAdminPassword,
    trustProxy: Number(proxy),
    seedDemo: !production && env.SEED_DEMO === "true",
    sslMode,
    sslCaFile: env.DATABASE_SSL_CA_FILE,
    port: Number(env.PORT) || 3001,
    host: env.HOST || "0.0.0.0",
  };
}
export function poolOptions(config) {
  const url = new URL(config.databaseUrl);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 120000,
    application_name: "dance-palace",
    ssl:
      config.sslMode === "disable"
        ? false
        : {
            rejectUnauthorized: true,
            ...(config.sslCaFile
              ? { ca: readFileSync(config.sslCaFile, "utf8") }
              : {}),
          },
  };
}
export const config = readConfig();
