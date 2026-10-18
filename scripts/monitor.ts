import "dotenv/config";
const origin = process.env.MONITOR_URL || process.env.APP_ORIGIN;
if (!origin || !process.env.MONITOR_SECRET)
  throw new Error("Set MONITOR_URL and MONITOR_SECRET.");
const response = await fetch(
  `${origin.replace(/\/$/, "")}/api/health/database`,
  {
    headers: { Authorization: `Bearer ${process.env.MONITOR_SECRET}` },
    signal: AbortSignal.timeout(20000),
  },
);
if (!response.ok)
  throw new Error(
    `Database monitoring failed (${response.status}). Check deployment logs and the Supabase dashboard for paused status.`,
  );
console.log("Dance Palace database health check passed.");
