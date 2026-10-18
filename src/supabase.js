import { createBrowserClient } from "@supabase/ssr";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey)
  throw new Error("Supabase Auth frontend environment is not configured.");

export const supabase = createBrowserClient(url, publishableKey, {
  cookieOptions: {
    path: "/",
    sameSite: "lax",
    secure: window.location.protocol === "https:",
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
