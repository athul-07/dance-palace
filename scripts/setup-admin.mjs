import "../server/env.js";
import { config } from "../server/config.js";
import { migrate } from "../server/migrate.js";
import { one, query, close } from "../server/db.js";
import { authEmailForUsername, getSupabaseAdmin } from "../server/supabase.js";

// Explicit provisioning command. Normal startup never resets an existing password.
try {
  const username = config.bootstrapAdminUsername.trim().toLowerCase();
  const password = config.bootstrapAdminPassword;
  if (!/^[a-z0-9_.-]{3,64}$/.test(username) || password.length < 6)
    throw new Error("Configure a valid BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD (6+ characters).");
  await migrate();
  const existing = await one("SELECT * FROM users WHERE lower(username)=$1", [username]);
  const admin = getSupabaseAdmin().auth.admin;
  let authId = existing?.supabase_user_id;
  const email = authEmailForUsername(username);
  if (!authId) {
    for (let page = 1; ; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 100 });
      if (error) throw error;
      authId = data.users.find((user) => user.email === email)?.id;
      if (authId || data.users.length < 100) break;
    }
  }
  const { data, error } = authId
    ? await admin.updateUserById(authId, { password, email_confirm: true })
    : await admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  authId = data.user.id;
  if (existing) {
    await query("UPDATE users SET username=$1,role='admin',supabase_user_id=$2 WHERE id=$3", [username, authId, existing.id]);
  } else {
    await query("INSERT INTO users(username,role,supabase_user_id) VALUES($1,'admin',$2)", [username, authId]);
  }
  console.log(`Administrator ${username} configured successfully.`);
} catch (error) {
  console.error("Administrator setup failed:", error.code || error.message);
  process.exitCode = 1;
} finally {
  await close();
}
