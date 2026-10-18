/** Turn API/proxy errors into text safe for rendering in React. */
export function apiErrorMessage(error: unknown): string {
  const e = error as
    | { response?: { status?: number; data?: unknown }; message?: unknown }
    | undefined;
  if (e?.response?.status === 404) {
    return "The backend API was not found. Redeploy the complete project with api/index.ts and vercel.json so /api requests reach Express.";
  }
  const data = e?.response?.data;
  const payload =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const nested = payload.error;
  if (typeof nested === "string" && nested.trim()) return nested;
  if (nested && typeof nested === "object") {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof payload.message === "string" && payload.message.trim())
    return payload.message;
  if (e?.response?.status && e.response.status >= 500) {
    return "The backend is unavailable. Check the Vercel function logs and the DATABASE_URL and JWT_SECRET environment variables.";
  }
  if (typeof e?.message === "string" && e.message.trim()) return e.message;
  return "Unable to connect to the server. Please try again.";
}
