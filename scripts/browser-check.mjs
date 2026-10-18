import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const executablePath =
  process.env.BROWSER_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.APP_URL || "http://localhost:3001");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel(/^Password/).fill("admin123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("heading", { name: "A clear view of every step." })
    .waitFor();
  await page.getByText("DP-01", { exact: true }).waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Add Transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date", { exact: false }).fill("2026-09-01");
  await dialog.getByLabel("Category").selectOption("6 Month Fees");
  await dialog.getByLabel("Batch / Department").selectOption("Adult Ladies");
  await dialog.getByLabel("Student name").fill("Ananya S");
  await dialog.getByLabel("Payment mode").selectOption("GPay");
  await page.waitForTimeout(300);
  await dialog.getByRole("button", { name: "Sep", exact: true }).click();
  await dialog
    .getByText("Sep, Oct, Nov, Dec, Jan '27, Feb '27", { exact: true })
    .waitFor();
  assert.equal(
    await dialog.getByRole("button", { name: "Save transaction" }).isEnabled(),
    true,
  );
  await page.screenshot({
    path: "artifacts/transaction-form.png",
    fullPage: true,
  });
  await dialog.getByLabel("Transaction ID").fill("DP-UI-CHECK");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/transactions") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  assert.equal((await saved).status(), 200);
  await page.getByRole("link", { name: "Batches & Fees", exact: true }).click();
  await page.getByLabel("Year", { exact: true }).selectOption("2027");
  await page
    .getByRole("row")
    .filter({ hasText: "Ananya S" })
    .getByRole("button", { name: /PAID/ })
    .first()
    .waitFor();
  const response = await page.request.delete(
    (process.env.APP_URL || "http://localhost:3001") +
      "/api/transactions/DP-UI-CHECK",
  );
  assert.equal(response.status(), 200);
  await page.reload();
  for (const [link, heading] of [
    ["Batches & Fees", "Every dancer. Every month."],
    ["Manager", "Good work starts here."],
    ["Attendance", "Showing up is the first step."],
    ["Progress Report", "Watch their confidence grow."],
    ["Users", "Your team, in step."],
  ]) {
    await page.getByRole("link", { name: link, exact: true }).click();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  await page.getByRole("link", { name: "Fees Tracking", exact: true }).click();
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await page.screenshot({
    path: "artifacts/dashboard-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile page must not overflow horizontally",
  );
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Attendance", exact: true }).click();
  await page
    .getByRole("heading", { name: "Showing up is the first step." })
    .waitFor();
  await page.screenshot({
    path: "artifacts/attendance-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: login, dashboard, fee window, all sections, dark theme, mobile layout.",
  );
} finally {
  await page.request
    .delete(
      (process.env.APP_URL || "http://localhost:3001") +
        "/api/transactions/DP-UI-CHECK",
    )
    .catch(() => {});
  await browser.close();
}
