import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { createApp } from "../server/app.js";
import { indiaNow } from "../shared/rules.js";
let db: any, app: any, admin: any, staff: any;
const tx = (id: string, month = 9, category = "6 Month Fees") => ({
  id,
  date: "2026-10-05",
  type: "Income",
  category,
  batch_display: "Adult Ladies",
  student_name: "Ananya",
  actual_amount: 6540,
  discounts: 0,
  balance: 0,
  over_paid: 0,
  amount: 6540,
  payment_mode: "GPay",
  recorded_by: "admin",
  description: "Test payment",
  fee_months: [{ year: 2026, month }],
});
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.APP_ORIGIN = "http://localhost:5173";
  db = new PGlite();
  await db.exec(
    await readFile(
      new URL("../database/supabase.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("SET search_path TO dance_palace,public");
  await db.query(
    "INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3)",
    ["staff", await bcrypt.hash("staff123", 4), "staff"],
  );
  app = createApp(db);
  admin = request.agent(app);
  staff = request.agent(app);
  await admin
    .post("/api/auth/login")
    .send({ username: "admin", password: "admin123" })
    .expect(200);
  await staff
    .post("/api/auth/login")
    .send({ username: "staff", password: "staff123" })
    .expect(200);
});
after(async () => {
  await db.close();
});
test("auth rejects anonymous requests and spoofed client role", async () => {
  await request(app).get("/api/transactions").expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ username: "admin", password: "wrong" })
    .expect(401);
  await staff.get("/api/users").expect(403);
  await staff
    .post("/api/students")
    .send({ batch_id: 1, name: "Forbidden", role: "admin" })
    .expect(403);
  await staff.delete("/api/transactions/nothing").expect(403);
  await staff.post("/api/import/backup").send({}).expect(403);
  await staff.put("/api/fees/1/2026/4").send({}).expect(403);
  await admin
    .post("/api/users")
    .set("Origin", "https://malicious.example")
    .send({})
    .expect(403);
});
test("income propagates wrapped months; edit reverses old years and delete clears", async () => {
  await admin.post("/api/transactions").send(tx("DP-01")).expect(200);
  let cells = (
    await db.query(
      "SELECT * FROM fee_cells WHERE status='PAID' ORDER BY year,month",
    )
  ).rows;
  assert.equal(cells.length, 6);
  assert.equal(cells[4].year, 2027);
  assert.equal(cells[5].month, 2);
  assert.equal(Number(cells[0].amount), 1090);
  await admin
    .put("/api/transactions/DP-01")
    .send(tx("DP-01", 7, "Monthly Fees"))
    .expect(200);
  cells = (await db.query("SELECT * FROM fee_cells WHERE status='PAID'")).rows;
  assert.equal(cells.length, 1);
  assert.equal(cells[0].month, 7);
  await admin.delete("/api/transactions/DP-01").expect(200);
  assert.equal(
    (await db.query("SELECT * FROM fee_cells WHERE status='PAID'")).rows.length,
    0,
  );
});
test("orphan reconciliation and manual cell payment survive reload", async () => {
  const s = (await db.query("SELECT * FROM students LIMIT 1")).rows[0];
  await db.query(
    "INSERT INTO fee_cells(student_id,year,month,status,amount) VALUES($1,2026,4,'PAID',50) ON CONFLICT(student_id,year,month) DO UPDATE SET status='PAID'",
    [s.id],
  );
  await admin.get("/api/fees?batch_id=1&year=2026").expect(200);
  assert.equal(
    (
      await db.query(
        "SELECT status FROM fee_cells WHERE student_id=$1 AND year=2026 AND month=4",
        [s.id],
      )
    ).rows[0].status,
    "DUE",
  );
  await admin
    .put(`/api/fees/${s.id}/2027/3`)
    .send({ status: "PAID", amount: 1360, plan: "Monthly Fees", cg: "C" })
    .expect(200);
  const fees = await admin.get("/api/fees?batch_id=1&year=2027").expect(200);
  assert.equal(fees.body.months.length, 12);
  assert.equal(fees.body.rows[0].cells["3"].status, "PAID");
  await admin
    .put(`/api/fees/${s.id}/2027/3`)
    .send({ status: "DUE", amount: 0, plan: "Monthly Fees", cg: "C" })
    .expect(200);
});
test("staff can add/edit transactions but KPI summaries are omitted", async () => {
  await staff
    .post("/api/transactions")
    .send({
      ...tx("DP-02", 4, "Monthly Fees"),
      balance: 100,
      status: "Completed",
    })
    .expect(200);
  const dashboard = await staff.get("/api/transactions").expect(200);
  assert.equal(dashboard.body.stats, undefined);
  assert.equal(
    dashboard.body.rows.find((r: any) => r.id === "DP-02").status,
    "Pending",
  );
  const fees = await staff.get("/api/fees?batch_id=1").expect(200);
  assert.equal(fees.body.stats, undefined);
  const carry = await staff
    .get(
      "/api/transactions/suggestion?batch=Adult%20Ladies&student=Ananya&actual=1360",
    )
    .expect(200);
  assert.equal(carry.body.balance, 100);
  assert.equal(carry.body.amount, 1460);
  await staff
    .put("/api/transactions/DP-02")
    .send(tx("DP-02", 5, "Monthly Fees"))
    .expect(200);
});
test("new register student syncs to fee roster and all batch attendance sheets", async () => {
  await staff
    .post("/api/manager/Student%20Register")
    .send({
      data: {
        NAME: "Meera",
        BATCHES: "Kids Beginners",
        "BATCHES 2": "Indian Classical",
      },
    })
    .expect(200);
  const students = (await db.query("SELECT * FROM students WHERE name='Meera'"))
    .rows;
  assert.equal(students.length, 2);
  const sheets = (
    await db.query("SELECT * FROM attendance_sheets WHERE batch_id=$1", [
      students[0].batch_id,
    ])
  ).rows;
  assert.equal(sheets.length, 8);
  assert.ok(
    sheets.every((s: any) => s.grid.some((r: any[]) => r[1] === "Meera")),
  );
  await staff
    .post("/api/manager/Student%20Register")
    .send({ data: { NAME: "Invalid", BATCHES: "Onam Fees" } })
    .expect(400);
});
test("attendance generates class sheets, edit guards and student search", async () => {
  await staff.post("/api/attendance/year").send({ year: 2027 }).expect(200);
  await staff
    .post("/api/attendance/month")
    .send({ year: 2027, month: 1 })
    .expect(200);
  const result = await staff
    .get("/api/attendance?year=2027&month=1")
    .expect(200);
  assert.equal(result.body.length, 10);
  const s = result.body.find((s: any) => s.batch_id === 3);
  await staff
    .patch(`/api/attendance/${s.id}`)
    .send({ row: 2, col: 2 })
    .expect(200);
  const sheet = (
    await db.query("SELECT grid FROM attendance_sheets WHERE id=$1", [s.id])
  ).rows[0];
  assert.equal(sheet.grid[2][2], true);
  await db.query(
    "INSERT INTO attendance_sheets(year,month,sheet_name,grid) VALUES(2027,1,'Dashboard','[]')",
  );
  const dash = (
    await db.query(
      "SELECT id FROM attendance_sheets WHERE sheet_name='Dashboard'",
    )
  ).rows[0];
  await staff
    .patch(`/api/attendance/${dash.id}`)
    .send({ name: "No edit" })
    .expect(403);
});
test("manager timestamps cannot be supplied, backdated or overwritten; faculty manual entries work", async () => {
  const p = (
    await staff
      .post("/api/worklog/people")
      .send({ name: "Manager One", role: "manager" })
      .expect(200)
  ).body;
  await staff
    .post("/api/worklog/entries")
    .send({ person_id: p.id, date: "2026-01-01", action: "login" })
    .expect(400);
  await staff
    .post("/api/worklog/entries")
    .send({
      person_id: p.id,
      date: indiaNow().date,
      action: "login",
      login: "08:00",
    })
    .expect(400);
  await staff
    .post("/api/worklog/entries")
    .send({ person_id: p.id, date: indiaNow().date, action: "login" })
    .expect(200);
  await staff
    .post("/api/worklog/entries")
    .send({ person_id: p.id, date: indiaNow().date, action: "login" })
    .expect(400);
  await staff
    .post("/api/worklog/entries")
    .send({ person_id: p.id, date: indiaNow().date, action: "logout" })
    .expect(200);
  await staff.delete(`/api/worklog/people/${p.id}`).expect(403);
  const f = (
    await staff
      .post("/api/worklog/people")
      .send({ name: "Faculty One", role: "faculty" })
      .expect(200)
  ).body;
  await staff
    .post("/api/worklog/entries")
    .send({
      person_id: f.id,
      date: "2026-04-10",
      action: "faculty",
      login: "15:00",
      logout: "16:00",
      batch: "Adult Ladies",
    })
    .expect(200);
  const summary = await staff
    .get(`/api/worklog/entries?person_id=${f.id}&month=2026-04`)
    .expect(200);
  assert.equal(summary.body.stats["Work hours"], 1);
});
test("review computes server-side grade; user guards and password revocation", async () => {
  const s = (await db.query("SELECT * FROM students LIMIT 1")).rows[0];
  const review = await staff
    .post("/api/reviews")
    .send({
      student_id: s.id,
      month: "2026-04",
      attendance: 85,
      ratings: [3, 3, 3, 2, 2, 3, 3, 2, 2, 3],
      overall: 5,
      grade: "A+",
    })
    .expect(200);
  assert.equal(review.body.grade, "C");
  assert.equal(review.body.status, "Improving");
  const id = (await db.query("SELECT id FROM users WHERE username='admin'"))
    .rows[0].id;
  await admin.delete(`/api/users/${id}`).expect(400);
  await admin
    .put(`/api/users/${id}`)
    .send({ username: "admin", role: "staff" })
    .expect(400);
  const staffId = (
    await db.query("SELECT id FROM users WHERE username='staff'")
  ).rows[0].id;
  await admin
    .put(`/api/users/${staffId}`)
    .send({ username: "staff", role: "staff", password: "newpassword" })
    .expect(200);
  await staff.get("/api/auth/me").expect(401);
  await staff
    .post("/api/auth/login")
    .send({ username: "staff", password: "newpassword" })
    .expect(200);
});
test("Excel export, cached formula dates, JSON full backup and rollback", async () => {
  const workbook = await admin
    .get("/api/export/excel")
    .buffer(true)
    .parse((res: any, cb: any) => {
      const parts: Buffer[] = [];
      res.on("data", (b: Buffer) => parts.push(b));
      res.on("end", () => cb(null, Buffer.concat(parts)));
    })
    .expect(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(workbook.body);
  assert.ok(wb.getWorksheet("Transactions"));
  assert.ok(wb.getWorksheet("Superkids Beginner-Even"));
  const backupWs = wb.getWorksheet("_DancePalaceBackup")!;
  const embedded = JSON.parse(
    backupWs
      .getRows(2, backupWs.rowCount - 1)!
      .map((r) => r.getCell(1).value)
      .join(""),
  );
  assert.deepEqual(embedded.tables.users, []);
  const original = new ExcelJS.Workbook();
  const ws = original.addWorksheet("Transactions");
  ws.addRow([
    "Date",
    "ID",
    "Type",
    "Category",
    "Batch/Department",
    "Student Name",
    "Actual Amount",
    "Amount",
    "Payment Mode",
    "Recorded By",
    "Month",
  ]);
  ws.addRow([
    { formula: "TODAY()", result: 46200 },
    "IMPORT-1",
    "Income",
    "3 Month Fees",
    "Adult Ladies",
    "Imported Student",
    3780,
    3780,
    "Cash",
    "admin",
    "December",
  ]);
  const importResult = await admin
    .post("/api/import/excel")
    .field("kind", "fees")
    .attach("file", Buffer.from(await original.xlsx.writeBuffer()), "fees.xlsx")
    .expect(200);
  assert.equal(importResult.body.imported, 1);
  const imported = (
    await db.query("SELECT * FROM transactions WHERE id='IMPORT-1'")
  ).rows[0];
  assert.equal(
    new Date(imported.date).toISOString().slice(0, 10),
    "2026-06-27",
  );
  const months = (
    await db.query(
      "SELECT * FROM transaction_months WHERE transaction_id='IMPORT-1' ORDER BY position",
    )
  ).rows;
  assert.equal(months[1].year, 2027);
  const backup = (await admin.get("/api/export/backup").expect(200)).body;
  const bad = structuredClone(backup);
  bad.tables.students[0].batch_id = 99999;
  await admin.post("/api/import/backup").send(bad).expect(400);
  assert.equal(
    Number((await db.query("SELECT count(*) n FROM transactions")).rows[0].n),
    backup.tables.transactions.length,
  );
  await admin.post("/api/import/backup").send(backup).expect(200);
  await admin.get("/api/auth/me").expect(401);
});
