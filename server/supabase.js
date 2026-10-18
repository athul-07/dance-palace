import { verifyCredentials } from "@supabase/server/core";
import { createClient } from "@supabase/supabase-js";
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import { supabaseCredentials } from "./env.js";

let adminClient;

export function getSupabaseAdmin() {
  if (!adminClient) {
    const { url, key } = supabaseCredentials(process.env, { admin: true });
    adminClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}

export function getSupabaseAuthClient(req, res) {
  const { url, key } = supabaseCredentials();
  const cookies = new Map(
    parseCookieHeader(req.headers.cookie || "").map(({ name, value }) => [
      name,
      value,
    ]),
  );
  return createServerClient(url, key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (updates, headers) => {
        const existing = res.getHeader("Set-Cookie") || [];
        res.setHeader("Set-Cookie", [
          ...(Array.isArray(existing) ? existing : [existing]),
          ...updates.map(({ name, value, options }) => {
            cookies.set(name, value);
            return serializeCookieHeader(name, value, options);
          }),
        ]);
        for (const [name, value] of Object.entries(headers || {}))
          res.setHeader(name, value);
        res.setHeader("Cache-Control", "private, no-store");
      },
    },
  });
}

export function authEmailForUsername(username) {
  return `${username.toLowerCase()}@login.dance-palace.invalid`;
}

export function verifySupabaseAccessToken(token) {
  return verifyCredentials({ token, apikey: null }, { auth: "user" });
}
