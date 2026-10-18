export function apiErrorMessage(error, fallback = "Request failed.") {
  if (typeof error === "string") return error;

  const data = error?.response?.data;
  for (const value of [data?.error, data?.message]) {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") {
      if (typeof value.message === "string" && value.message.trim())
        return value.message;
      if (typeof value.code === "string" && value.code.trim())
        return `Request failed (${value.code}).`;
    }
  }

  if (error?.response?.status === 404)
    return "API endpoint not found (404). Route /api to the Dance Palace server.";
  if (typeof error?.message === "string" && error.message.trim())
    return error.message;
  return fallback;
}
