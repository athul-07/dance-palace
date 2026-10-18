import { createClient } from "@supabase/supabase-js";
// Public client for future Supabase services. School records use the authenticated
// Express API; the private dance_palace schema is never exposed to the browser.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ||
    "https://zjycceqmgwfzoazelbtc.supabase.co",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_ZAGzjB40_sZcvQT3_te7ug_muY6VR7p",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
