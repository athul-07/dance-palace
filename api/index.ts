import { createApp } from "../server/app.js";
import { pool } from "../server/db.js";

// Vercel invokes this Express app as a Node function. Do not start a listener:
// server/index.ts remains the entry point for local and Docker deployments.
export default createApp(pool);
