import { test } from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage } from "../shared/api-errors.js";

test("nested platform error objects become renderable text", () => {
  assert.equal(
    apiErrorMessage({
      response: {
        status: 503,
        data: {
          error: { code: "UNAVAILABLE", message: "Service unavailable" },
        },
      },
    }),
    "Service unavailable",
  );
  assert.equal(
    apiErrorMessage({
      response: {
        status: 401,
        data: { error: "Invalid username or password" },
      },
    }),
    "Invalid username or password",
  );
  assert.match(
    apiErrorMessage({
      response: {
        status: 404,
        data: { error: { code: "NOT_FOUND", message: "Not found" } },
      },
    }),
    /backend API was not found/,
  );
  assert.match(
    apiErrorMessage({
      response: { status: 502, data: "<html>Bad gateway</html>" },
    }),
    /backend is unavailable/,
  );
  assert.equal(
    typeof apiErrorMessage({
      response: { data: { error: { code: "UNKNOWN" } } },
    }),
    "string",
  );
});
