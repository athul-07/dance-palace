import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL || "";
  const publishableKey =
    env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "";
  if (!supabaseUrl || !publishableKey)
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for the frontend build.",
    );
  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY":
        JSON.stringify(publishableKey),
    },
    server: { proxy: { "/api": "http://127.0.0.1:3001" } },
    build: { outDir: "dist" },
  };
});
