import { getSupabaseAdmin } from "./supabase.js";

// Server-only PostgREST repository. No PostgreSQL socket or connection URL.
export function createHttpDb(getClient = getSupabaseAdmin) {
  return {
    async getSchoolSetup() {
      const { data, error } = await getClient()
        .from("setup")
        .select("key")
        .eq("key", "categories")
        .limit(1)
        .maybeSingle()
        .abortSignal(AbortSignal.timeout(10000));
      if (error)
        throw new Error("Supabase setup query failed", { cause: error });
      return data;
    },
    async listUsers() {
      // Only an ID is needed to prove the real table can be read.
      const { data, error } = await getClient()
        .from("users")
        .select("id")
        .limit(1)
        .abortSignal(AbortSignal.timeout(10000));
      if (error)
        throw new Error("Supabase users query failed", { cause: error });
      return data;
    },
  };
}

export const httpDb = createHttpDb();
