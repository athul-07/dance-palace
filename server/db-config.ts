import { readFileSync } from "node:fs";
import type { PoolConfig } from "pg";

export function databaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  let connectionString = env.DATABASE_URL;
  let local = false;
  if (connectionString) {
    const url = new URL(connectionString);
    local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    // pg's URL SSL settings can replace the explicit ssl object, discarding its
    // CA. Keep TLS configuration in one place and always verify hosted servers.
    for (const key of [
      "ssl",
      "sslmode",
      "sslrootcert",
      "sslcert",
      "sslkey",
      "uselibpqcompat",
    ])
      url.searchParams.delete(key);
    connectionString = url.toString();
  }
  const ca = env.DATABASE_CA_CERT?.trim()
    ? env.DATABASE_CA_CERT.replace(/\\n/g, "\n").trim()
    : env.DATABASE_CA_PATH?.trim()
      ? readFileSync(env.DATABASE_CA_PATH, "utf8")
      : undefined;
  return {
    connectionString,
    options: "-c search_path=dance_palace,public",
    max: env.VERCEL === "1" ? 2 : 10,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: env.VERCEL === "1",
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}

export function databaseTlsError(error: {
  code?: string;
  message?: string;
}): string | undefined {
  const certificateError =
    [
      "SELF_SIGNED_CERT_IN_CHAIN",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
      "CERT_HAS_EXPIRED",
    ].includes(error.code || "") ||
    /self[- ]signed certificate|unable to verify.*certificate/i.test(
      error.message || "",
    );
  if (certificateError)
    return "Database TLS certificate verification failed. Set DATABASE_CA_CERT to the full Supabase root CA certificate in Vercel Production environment variables, then redeploy.";
}
