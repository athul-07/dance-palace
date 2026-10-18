import "../server/env.js";
import { httpDb } from "../server/http-db.js";
import { supabaseCredentials } from "../server/env.js";
try {
  supabaseCredentials(process.env, { admin: true });
  if (!(await httpDb.getSchoolSetup()))
    throw new Error("School setup record is missing.");
  await httpDb.listUsers();
  console.log("Database availability check passed.");
} catch (error) {
  console.error("Database check failed:", error.message);
  process.exitCode = 1;
}
