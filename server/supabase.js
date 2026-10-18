import { createAdminClient, verifyCredentials } from "@supabase/server/core";

let adminClient;

export function getSupabaseAdmin() {
  adminClient ??= createAdminClient();
  return adminClient;
}

export function verifySupabaseAccessToken(token) {
  return verifyCredentials(
    { token, apikey: null },
    { auth: "user" },
  );
}
