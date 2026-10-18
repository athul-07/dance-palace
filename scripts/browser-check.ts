import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createApp } from "../server/app.js";

// Isolated PostgreSQL test database. Never reads or mutates the hosted database.
process.env.NODE_ENV = "development";
process.env.JWT_SECRET = "browser-test-secret-not-for-production-use";
process.env.APP_ORIGIN = "http://127.0.0.1:5175";
const db = new PGlite();
await db.exec(
  await readFile(new URL("../database/supabase.sql", import.meta.url), "utf8"),
);
await db.query("SET search_path TO dance_palace,public");
const server = createApp(db).listen(3001, "127.0.0.1");
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5175",
    "--strictPort",
  ],
  { stdio: "ignore", windowsHide: true },
);
const executablePath =
  process.env.BROWSER_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5175")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir(".local", { recursive: true });
  await page.goto("http://127.0.0.1:5175");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/login.png", fullPage: true });
  await page.getByLabel("Username").fill("admin");
  await page
    .getByLabel("Password", { exact: false })
    .filter({ visible: true })
    .first()
    .fill("admin123");
  // Reproduce the hosting error payload that previously crashed React (#31).
  for (const status of [404, 503]) {
    await page.route(
      "**/api/auth/login",
      (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "PLATFORM_ERROR", message: "Service unavailable" },
          }),
        }),
      { times: 1 },
    );
    await page.getByRole("button", { name: "Sign in to workspace" }).click();
    await expect(page.getByRole("alert")).toContainText(
      status === 404 ? "backend API was not found" : "Service unavailable",
    );
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "A clear view of your studio." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Transaction" }).click();
  await page.getByLabel("Batch / Department").selectOption("Adult Ladies");
  await page.getByLabel("Student name").fill("Browser Student");
  await page
    .getByRole("dialog")
    .getByLabel("Category", { exact: true })
    .selectOption("6 Month Fees");
  await page.getByLabel("Payment Mode").selectOption("GPay");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sep", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByText(/Jan '27/)).toBeVisible();
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Browser Student", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".local/dashboard.png", fullPage: true });
  await page.getByRole("link", { name: "Batches & Fees", exact: true }).click();
  await page.getByLabel("Year", { exact: true }).selectOption("2027");
  await expect(
    page.getByRole("columnheader", { name: "Jan 2027" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /PAID/ })).toHaveCount(2);
  await page.getByRole("link", { name: "Manager", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Time well spent." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Student Register", exact: true })
    .click();
  await page.getByRole("button", { name: "Add record" }).click();
  await page.getByLabel("NAME", { exact: true }).fill("Register Student");
  await page
    .getByLabel("BATCHES", { exact: true })
    .selectOption("Kids Beginners");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Attendance", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "April attendance" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Kids Beginners", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Register Student", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Register Student, day 1: absent",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Register Student, day 1: present",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Progress Report", exact: true })
    .click();
  await page.getByRole("link", { name: "Reviews", exact: true }).click();
  await page.getByRole("button", { name: "Add Review" }).click();
  await page.getByLabel("Batch", { exact: false }).last().selectOption("1");
  await page
    .getByLabel("Student", { exact: false })
    .last()
    .selectOption({ label: "Browser Student" });
  await page.getByLabel("Rhythm / Musicality").selectOption("3");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Report Card", exact: true }).click();
  await page
    .getByLabel("Student", { exact: true })
    .selectOption({ label: "Browser Student · Adult Ladies" });
  await page.getByLabel("Month", { exact: true }).selectOption("2026-04");
  await expect(page.locator(".report-card")).toBeVisible();
  await page.screenshot({ path: ".local/report-card.png", fullPage: true });
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () =>
      page
        .locator(".sidebar")
        .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: ".local/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Fees Tracking", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clear view of your studio." }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBe(0);
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser checks passed: login, fee rollover, register sync, attendance toggle, review/report card, dark mode and mobile navigation.",
  );
} finally {
  await browser?.close();
  vite.kill();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
}
