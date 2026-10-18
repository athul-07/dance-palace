import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// Hosting environments supply production secrets; never load a deployed .env.
if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  try {
    loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export function supabaseCredentials(env = process.env, { admin = false } = {}) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = admin
    ? env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
    : env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || /replace_me|your_.*key|your_server|•/.test(key))
    throw new Error(
      admin
        ? "Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) for server database access."
        : "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for user authentication.",
    );
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL must be a valid HTTP(S) URL.");
  }
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (env.NODE_ENV === "production" && parsed.protocol !== "https:")
  )
    throw new Error(
      "SUPABASE_URL must use HTTPS in production and contain no credentials.",
    );
  return { url, key };
}
