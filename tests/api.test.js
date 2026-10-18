import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
let server, jwksServer, base, adminToken, staffToken, db, temp;
let tokenFor;
const adminAuthId = "00000000-0000-4000-8000-000000000001";
const staffAuthId = "00000000-0000-4000-8000-000000000002";
before(async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = "test-key";
  jwk.alg = "RS256";
  jwk.use = "sig";
  jwksServer = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
  const jwksAddress = jwksServer.address();
  const supabaseUrl = `http://127.0.0.1:${jwksAddress.port}`;
  temp = await mkdtemp(path.join(os.tmpdir(), "dance-test-"));
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "";
  process.env.PUBLIC_ORIGIN = "";
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test_key";
  process.env.SUPABASE_JWKS_URL = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  process.env.PGLITE_PATH = temp;
  process.env.SEED_DEMO = "false";
  tokenFor = (id, email) =>
    jwt.sign(
      {
        sub: id,
        email,
        role: "authenticated",
        aud: "authenticated",
        iss: `${supabaseUrl}/auth/v1`,
      },
      privateKey,
      { algorithm: "RS256", keyid: "test-key", expiresIn: "1h" },
    );
  adminToken = tokenFor(adminAuthId, "admin@test.example");
  staffToken = tokenFor(staffAuthId, "staff@test.example");
  db = await import("../server/db.js");
  const { migrate } = await import("../server/migrate.js");
  const { seed } = await import("../server/services.js");
  await migrate();
  await db.query(
    "INSERT INTO users(username,role,supabase_user_id) VALUES($1,'admin',$2),($3,'staff',$4)",
    ["admin@test.example", adminAuthId, "staff@test.example", staffAuthId],
  );
  await seed();
  const { default: app } = await import("../server/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server?.close(r));
  await new Promise((r) => jwksServer?.close(r));
  await db?.close();
  if (temp) await rm(temp, { recursive: true, force: true });
});
async function request(method, url, body, auth = adminToken) {
  const r = await fetch(base + "/api" + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const authHeaders = (token = adminToken) => ({
  Authorization: `Bearer ${token}`,
});
const tx = (id, changes = {}) => ({
  id,
  date: "2026-09-01",
  type: "Income",
  category: "6 Month Fees",
  batch_display: "Adult Ladies",
  student_name: "Test Dancer",
  actual_amount: 6540,
  discounts: 0,
  balance: 0,
  over_paid: 0,
  payment_mode: "GPay",
  amount: 6540,
  recorded_by: "admin",
  description: "Test",
  fee_months: [{ month: "September", year: 2026 }],
  ...changes,
});
test("API authentication, propagation, reversal, reconciliation and overlap", async () => {
  assert.equal((await request("GET", "/batches", undefined, "")).status, 401);
  assert.equal((await request("GET", "/auth/me")).data.role, "admin");
  const unlinkedToken = tokenFor(
    "00000000-0000-4000-8000-000000000099",
    "unknown@test.example",
  );
  assert.equal(
    (await request("GET", "/auth/me", undefined, unlinkedToken)).status,
    403,
  );
  assert.equal(
    (await request("POST", "/transactions", tx("DP-TEST"))).status,
    200,
  );
  let cells = (await request("GET", "/fees?year=2027")).data;
  assert.equal(cells.filter((c) => c.status === "PAID").length, 2);
  assert.equal(Number(cells[0].amount), 1090);
  assert.equal(
    (
      await request(
        "PUT",
        "/transactions/DP-TEST",
        tx("DP-TEST", {
          category: "Monthly Fees",
          actual_amount: 1360,
          amount: 1360,
          fee_months: [{ month: "July", year: 2026 }],
        }),
      )
    ).status,
    200,
  );
  cells = (await request("GET", "/fees?year=2027")).data;
  assert.equal(cells.filter((c) => c.status === "PAID").length, 0);
  await request(
    "POST",
    "/transactions",
    tx("DP-OTHER", {
      category: "Monthly Fees",
      fee_months: [{ month: "July", year: 2026 }],
    }),
  );
  await request("DELETE", "/transactions/DP-TEST");
  assert.equal(
    (await request("GET", "/fees?year=2026")).data.find(
      (c) => c.month === "July",
    ).status,
    "PAID",
  );
  await request("DELETE", "/transactions/DP-OTHER");
  assert.equal(
    (await request("GET", "/fees?year=2026")).data.find(
      (c) => c.month === "July",
    ).status,
    "DUE",
  );
  const student = (await request("GET", "/students")).data[0];
  await db.query(
    "INSERT INTO fee_cells(student_id,year,month,status,amount) VALUES($1,2026,'April','PAID',999)",
    [student.id],
  );
  assert.equal(
    (await request("GET", "/fees?year=2026")).data.find(
      (c) => c.month === "April",
    ).status,
    "DUE",
  );
  const attendance = (await request("GET", "/attendance?year=2026")).data
    .sheets;
  assert.ok(
    attendance
      .find((a) => a.sheet === "Adult Ladies")
      .grid.some((r) => r[1] === "Test Dancer"),
  );
});
test("server validation and staff restrictions cover sensitive operations", async () => {
  const staffAuth = staffToken;
  for (const [method, url, body] of [
    ["GET", "/users"],
    ["POST", "/students", { name: "Forbidden", batch: "Adult Ladies" }],
    ["DELETE", "/transactions/missing"],
    ["DELETE", "/people/1"],
    ["PUT", "/fees/1/2026/April", {}],
    ["POST", "/import/backup", {}],
  ])
    assert.equal(
      (await request(method, url, body, staffAuth)).status,
      403,
      method + " " + url,
    );
  assert.equal(
    (await request("GET", "/transactions", undefined, staffAuth)).data.stats,
    null,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/transactions",
        tx("DP-STAFF", { balance: 10 }),
        staffAuth,
      )
    ).data.status,
    "Pending",
  );
  assert.equal(
    (
      await request(
        "POST",
        "/transactions",
        tx("DP-BAD", { date: "2026-02-31" }),
      )
    ).status,
    400,
  );
  assert.equal((await request("DELETE", "/users/1")).status, 400);
  assert.equal(
    (await request("PUT", "/users/1", { username: "admin", role: "staff" }))
      .status,
    400,
  );
});
test("student register sync, new month generation, protected sheets and manual fee cells", async () => {
  assert.equal(
    (
      await request(
        "POST",
        "/manager/Student%20Register/rows",
        {
          NAME: "Register Dancer",
          BATCHES: "Kids Beginners",
          "BATCHES 2": "Indian Classical",
        },
        staffToken,
      )
    ).status,
    200,
  );
  const roster = (await request("GET", "/students?search=Register")).data;
  assert.equal(roster.length, 2);
  await request(
    "POST",
    "/attendance/month",
    { year: 2027, month: "January" },
    staffToken,
  );
  const sheets = (await request("GET", "/attendance?year=2027")).data.sheets;
  assert.equal(sheets.length, 10);
  assert.ok(
    sheets
      .find((s) => s.sheet === "Kids Beginners")
      .grid.some((r) => r[1] === "Register Dancer"),
  );
  const s = roster[0];
  assert.equal(
    (
      await request("PUT", `/fees/${s.id}/2027/March`, {
        status: "PAID",
        amount: 1360,
        plan: "Monthly Fees",
        cg: "C",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("GET", "/fees?year=2027")).data.find(
      (c) => c.student_id === s.id && c.month === "March",
    ).status,
    "PAID",
  );
});
test("manual allocations survive reconciliation without rewriting receipts", async () => {
  const dancer = (await request("GET", "/students?search=Test%20Dancer"))
    .data[0];
  const before = (await request("GET", "/transactions?search=DP-STAFF")).data
    .data[0];
  assert.equal(
    (
      await request("PUT", `/fees/${dancer.id}/2026/September`, {
        status: "PAID",
        amount: 777,
        plan: "Classical Fees",
        cg: "C",
      })
    ).status,
    200,
  );
  let cell = (await request("GET", "/fees?year=2026")).data.find(
    (c) => c.student_id === dancer.id && c.month === "September",
  );
  assert.equal(Number(cell.amount), 777);
  assert.equal(cell.plan, "Classical Fees");
  assert.equal(cell.cg, "C");
  const after = (await request("GET", "/transactions?search=DP-STAFF")).data
    .data[0];
  assert.equal(Number(after.amount), Number(before.amount));
  await request("PUT", `/fees/${dancer.id}/2026/September`, {
    status: "DUE",
    amount: 0,
    plan: "Monthly Fees",
    cg: "C",
  });
  cell = (await request("GET", "/fees?year=2026")).data.find(
    (c) => c.student_id === dancer.id && c.month === "September",
  );
  assert.equal(cell.status, "DUE");
  assert.equal(
    (
      await request(
        "POST",
        "/transactions",
        tx("DP-EMPTY", { actual_amount: "" }),
      )
    ).status,
    400,
  );
});
test("legacy workbook import preserves cached dates and normalizes fee windows", async () => {
  const { default: XLSX } = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Old school workbook"],
    [
      "Date",
      "ID",
      "Type",
      "Category",
      "Batch/Department",
      "Student Name",
      "Actual Amount",
      "Amount",
      "Month",
      "Month2",
      "Payment Mode",
      "Recorded By",
    ],
    [
      46310,
      "LEGACY-1",
      "Income",
      "Monthly Fees",
      "Adult Ladies",
      "Legacy Dancer",
      6540,
      6540,
      "September",
      "November",
      "Cash",
      "Admin",
    ],
  ]);
  // Cached formula value must be read without re-evaluating TODAY().
  sheet.A3.f = "TODAY()";
  XLSX.utils.book_append_sheet(wb, sheet, "Transactions");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Categories", "Payment Modes"],
      ["Monthly Fees", "Cash"],
    ]),
    "Setup",
  );
  let form = new FormData();
  form.append(
    "file",
    new Blob([XLSX.write(wb, { type: "buffer", bookType: "xlsx" })]),
    "legacy.xlsx",
  );
  form.append("mode", "fees");
  let r = await fetch(base + "/api/import/excel", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  assert.equal(r.status, 200, await r.text());
  const t = (await request("GET", "/transactions?search=LEGACY-1")).data
    .data[0];
  assert.equal(t.category, "6 Month Fees");
  assert.equal(t.fee_months.length, 6);
  assert.equal(t.fee_months[4].year, Number(t.date.slice(0, 4)) + 1);
  assert.equal(t.legacy_months[1], "November");
  assert.notEqual(t.date, new Date().toISOString().slice(0, 10));
  const manager = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    manager,
    XLSX.utils.aoa_to_sheet([
      ["NAME", "BATCHES", "BATCHES"],
      ["Two Batches", "Kids Beginners", "Indian Classical"],
    ]),
    "Student Register",
  );
  form = new FormData();
  form.append(
    "file",
    new Blob([XLSX.write(manager, { type: "buffer", bookType: "xlsx" })]),
    "manager.xlsx",
  );
  form.append("mode", "manager");
  r = await fetch(base + "/api/import/excel", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  assert.equal(r.status, 200, await r.text());
  assert.equal(
    (await request("GET", "/students?search=Two%20Batches")).data.length,
    2,
  );
});
test("manager manual stamps rejected, faculty hours and review calculations", async () => {
  const p = (
    await request("POST", "/people", { name: "Manager Test", role: "manager" })
  ).data;
  assert.equal(
    (
      await request("POST", "/worklog", {
        person_id: p.id,
        date: "2026-01-01",
        action: "login",
      })
    ).status,
    400,
  );
  const { today, SKILLS } = await import("../shared/domain.js");
  assert.equal(
    (
      await request("POST", "/worklog", {
        person_id: p.id,
        date: today(),
        action: "login",
        login: "08:00",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("POST", "/worklog", {
        person_id: p.id,
        date: today(),
        action: "login",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("POST", "/worklog", {
        person_id: p.id,
        date: today(),
        action: "login",
      })
    ).status,
    400,
  );
  const f = (
    await request("POST", "/people", { name: "Faculty Test", role: "faculty" })
  ).data;
  await request("POST", "/worklog", {
    person_id: f.id,
    date: "2026-10-05",
    action: "save",
    batch: "Adult Ladies",
    login: "10:00",
    logout: "11:30",
  });
  assert.equal(
    (await request("GET", `/worklog?person=${f.id}&month=2026-10`)).data.summary
      .work,
    90,
  );
  const s = (await request("GET", "/students")).data[0];
  const review = await request("POST", "/reviews", {
    student_id: s.id,
    month: "2026-10",
    attendance: 80,
    ratings: Object.fromEntries(SKILLS.map((k) => [k, 2.54])),
  });
  assert.equal(review.status, 200);
  assert.equal(review.data.grade, "C");
  assert.equal(review.data.status, "Improving");
});
test("JSON backup and Excel export can be restored", async () => {
  const backup = await request("GET", "/export/backup");
  assert.equal(backup.data.format, "dance-palace");
  let form = new FormData();
  form.append(
    "file",
    new Blob([JSON.stringify(backup.data)], { type: "application/json" }),
    "backup.json",
  );
  let res = await fetch(base + "/api/import/backup", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  assert.equal(res.status, 200, await res.text());
  const x = await fetch(base + "/api/export/excel", {
    headers: authHeaders(),
  });
  assert.equal(x.status, 200);
  const bytes = await x.arrayBuffer();
  assert.ok(bytes.byteLength > 10000);
  form = new FormData();
  form.append("file", new Blob([bytes]), "workbook.xlsx");
  res = await fetch(base + "/api/import/excel", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  assert.equal(res.status, 200, await res.text());
});
