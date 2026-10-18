import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { query, rows, one, atomic } from "./db.js";
import {
  fail,
  ensureStudent,
  reconcile,
  saveTransaction,
  blankGrid,
} from "./services.js";
import {
  MONTHS,
  PRICES,
  SKILLS,
  countMonths,
  monthRun,
  carryForward,
  salaryEntry,
  salarySummary,
  scoreReview,
  today,
} from "../shared/domain.js";
import { installTransfers } from "./transfers.js";
const app = express();
const secret =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === "production"
    ? null
    : randomBytes(48).toString("hex"));
if (!secret) throw new Error("JWT_SECRET required in production");
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(express.json({ limit: "30mb" }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    new URL(req.headers.origin).host !== req.headers.host
  )
    throw fail("Cross-origin mutation denied", 403);
  next();
});
const safeUser = (u) => ({ id: u.id, username: u.username, role: u.role });
app.post(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req, res) => {
    const { username, password } = z
      .object({ username: z.string(), password: z.string() })
      .parse(req.body);
    const u = await one("SELECT * FROM users WHERE username=$1", [username]);
    if (!u || !(await bcrypt.compare(password, u.password_hash)))
      throw fail("Incorrect username or password", 401);
    res.cookie(
      "session",
      jwt.sign({ id: u.id }, secret, { expiresIn: "12h" }),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.COOKIE_SECURE === "true",
        maxAge: 43200000,
      },
    );
    res.json(safeUser(u));
  },
);
app.post("/api/auth/logout", (req, res) =>
  res.clearCookie("session").json({ ok: true }),
);
app.use("/api", async (req, res, next) => {
  try {
    const token = req.cookies.session;
    const payload = jwt.verify(token, secret);
    req.user = await one("SELECT * FROM users WHERE id=$1", [payload.id]);
    if (!req.user) throw Error();
    next();
  } catch {
    res.status(401).json({ error: "Please sign in" });
  }
});
const admin = (req, res, next) => {
  if (req.user.role !== "admin")
    throw fail("Administrator access required", 403);
  next();
};
app.get("/api/auth/me", (req, res) => res.json(safeUser(req.user)));
app.get("/api/setup", async (req, res) =>
  res.json(
    Object.fromEntries(
      (await rows("SELECT * FROM setup")).map((r) => [r.key, r.value]),
    ),
  ),
);
app.put("/api/setup", admin, async (req, res) => {
  const data = z
    .record(z.string(), z.array(z.union([z.string(), z.number()])))
    .parse(req.body);
  await atomic(async (q) => {
    for (const [k, v] of Object.entries(data))
      await q(
        "INSERT INTO setup(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
        [k, JSON.stringify(v)],
      );
  });
  res.json({ ok: true });
});
app.get("/api/batches", async (req, res) =>
  res.json(
    await rows(
      "SELECT b.*,COUNT(s.id)::int AS student_count FROM batches b LEFT JOIN students s ON s.batch_id=b.id GROUP BY b.id ORDER BY b.id",
    ),
  ),
);
app.get("/api/students", async (req, res) => {
  let data = await rows(
    "SELECT s.*,b.display_name AS batch FROM students s JOIN batches b ON b.id=s.batch_id",
  );
  if (req.query.batch) data = data.filter((s) => s.batch === req.query.batch);
  if (req.query.search)
    data = data.filter((s) =>
      s.name.toLowerCase().includes(req.query.search.toLowerCase()),
    );
  const sort = req.query.sort || "recent";
  data.sort((a, b) =>
    sort === "sl"
      ? a.sl_no - b.sl_no
      : sort === "az"
        ? a.name.localeCompare(b.name)
        : sort === "za"
          ? b.name.localeCompare(a.name)
          : new Date(b.last_activity_at) - new Date(a.last_activity_at),
  );
  res.json(data);
});
app.post("/api/students", admin, async (req, res) => {
  const b = z
    .object({ name: z.string().trim().min(1), batch: z.string().min(1) })
    .parse(req.body);
  res.json(await atomic((q) => ensureStudent(q, b.batch, b.name)));
});
app.put("/api/students/:id", admin, async (req, res) => {
  const b = z
    .object({
      name: z.string().trim().min(1),
      sl_no: z.coerce.number().int().positive(),
    })
    .parse(req.body);
  await atomic(async (q) => {
    const s = (
      await q(
        "SELECT s.*,b.display_name,b.sheet_name FROM students s JOIN batches b ON b.id=s.batch_id WHERE s.id=$1",
        [req.params.id],
      )
    ).rows[0];
    if (!s) throw fail("Student not found", 404);
    await q(
      "UPDATE students SET name=$1,sl_no=$2,last_activity_at=NOW() WHERE id=$3",
      [b.name, b.sl_no, s.id],
    );
    await q(
      "UPDATE transactions SET student_name=$1 WHERE student_name=$2 AND batch_display=$3",
      [b.name, s.name, s.display_name],
    );
    for (const a of (
      await q("SELECT * FROM attendance WHERE sheet=$1 OR sheet=$2", [
        s.display_name,
        s.sheet_name,
      ])
    ).rows) {
      a.grid = a.grid.map((r) =>
        r[1] === s.name ? [b.sl_no, b.name, ...r.slice(2)] : r,
      );
      await q("UPDATE attendance SET grid=$1 WHERE id=$2", [
        JSON.stringify(a.grid),
        a.id,
      ]);
    }
  });
  res.json({ ok: true });
});
app.delete("/api/students/:id", admin, async (req, res) => {
  await atomic(async (q) => {
    const s = (
      await q(
        "SELECT s.*,b.display_name,b.sheet_name FROM students s JOIN batches b ON b.id=s.batch_id WHERE s.id=$1",
        [req.params.id],
      )
    ).rows[0];
    if (!s) throw fail("Student not found", 404);
    for (const a of (
      await q("SELECT * FROM attendance WHERE sheet=$1 OR sheet=$2", [
        s.display_name,
        s.sheet_name,
      ])
    ).rows) {
      await q("UPDATE attendance SET grid=$1 WHERE id=$2", [
        JSON.stringify(a.grid.filter((r, i) => i < 2 || r[1] !== s.name)),
        a.id,
      ]);
    }
    await q("DELETE FROM students WHERE id=$1", [s.id]);
  });
  res.json({ ok: true });
});
app.get("/api/fees", async (req, res) => {
  await atomic(reconcile);
  const year = Number(req.query.year) || 2026;
  const cells = await rows(
    "SELECT f.*,s.name,b.display_name AS batch FROM fee_cells f JOIN students s ON s.id=f.student_id JOIN batches b ON b.id=s.batch_id WHERE f.year=$1",
    [year],
  );
  res.json(cells);
});
app.get("/api/fee-years", async (req, res) => {
  const saved = await rows("SELECT DISTINCT year FROM fee_cells ORDER BY year");
  const year = Number(today().slice(0, 4));
  res.json(
    [
      ...new Set([2026, 2027, year, year + 1, ...saved.map((r) => r.year)]),
    ].sort(),
  );
});
const amount = z.coerce.number().finite().min(0).max(100000000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  );
const transactionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  date,
  type: z.enum(["Income", "Expense"]),
  category: z.string().min(1),
  batch_display: z.string().min(1),
  student_name: z.string().trim().min(1),
  actual_amount: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    amount,
  ),
  discounts: amount.default(0),
  balance: amount.default(0),
  over_paid: amount.default(0),
  amount: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().finite().min(-100000000).max(100000000),
  ),
  payment_mode: z.string().min(1),
  recorded_by: z.string().min(1),
  description: z.string().default(""),
  drive_receipt: z.string().default(""),
  legacy_months: z
    .array(z.union([z.string(), z.number(), z.null()]))
    .max(6)
    .optional(),
  fee_months: z
    .array(
      z.object({
        month: z.enum(MONTHS),
        year: z.number().int().min(1900).max(9999),
      }),
    )
    .min(1)
    .max(6),
});
app.get("/api/transactions", async (req, res) => {
  let data = await rows(
    "SELECT * FROM transactions ORDER BY created_at DESC,id DESC",
  );
  const f = req.query;
  for (const key of ["type", "status", "batch_display"])
    if (f[key]) data = data.filter((t) => t[key] === f[key]);
  if (f.from) data = data.filter((t) => t.date >= f.from);
  if (f.to) data = data.filter((t) => t.date <= f.to);
  if (f.month)
    data = data.filter((t) => t.fee_months.some((m) => m.month === f.month));
  if (f.search)
    data = data.filter((t) =>
      [t.student_name, t.id, t.category].some((v) =>
        v.toLowerCase().includes(f.search.toLowerCase()),
      ),
    );
  if (["az", "za"].includes(f.sort))
    data.sort((a, b) =>
      !a.student_name
        ? 1
        : !b.student_name
          ? -1
          : (f.sort === "az" ? 1 : -1) *
            a.student_name.localeCompare(b.student_name),
    );
  if (f.sort === "low" || f.sort === "high")
    data.sort(
      (a, b) =>
        (f.sort === "low" ? 1 : -1) * (Number(a.amount) - Number(b.amount)),
    );
  const stats =
    req.user.role === "admin"
      ? {
          income: data
            .filter((t) => t.type === "Income")
            .reduce((a, t) => a + Number(t.amount), 0),
          expense: data
            .filter((t) => t.type === "Expense")
            .reduce((a, t) => a + Number(t.amount), 0),
          cash: data
            .filter((t) => t.type === "Income" && t.channel === "Cash")
            .reduce((a, t) => a + Number(t.amount), 0),
          digital: data
            .filter((t) => t.type === "Income" && t.channel === "Digital")
            .reduce((a, t) => a + Number(t.amount), 0),
          completed: data.filter((t) => t.status === "Completed").length,
          balance: data.reduce((a, t) => a + Number(t.balance), 0),
          overPaid: data.reduce((a, t) => a + Number(t.over_paid), 0),
        }
      : null;
  res.json({ data, stats });
});
app.get("/api/transaction-defaults", async (req, res) => {
  const history = await rows(
    "SELECT * FROM transactions WHERE batch_display=$1 AND student_name=$2",
    [req.query.batch || "", req.query.student || ""],
  );
  const carry = carryForward(history, req.query.exclude);
  const paid = history
    .filter(
      (t) =>
        t.id !== req.query.exclude &&
        t.type === "Income" &&
        t.status !== "Cancelled",
    )
    .flatMap((t) => t.fee_months.filter((m) => m.cell_status !== "DUE"))
    .sort(
      (a, b) =>
        b.year - a.year || MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month),
    );
  const last = paid[0];
  const start = last ? (MONTHS.indexOf(last.month) + 1) % 12 : 3;
  const y = last
    ? last.year + (last.month === "December" ? 1 : 0)
    : Number(req.query.year) || 2026;
  const ids = await rows("SELECT id FROM transactions");
  const next =
    Math.max(0, ...ids.map((t) => Number(t.id.match(/^DP-(\d+)$/)?.[1]) || 0)) +
    1;
  res.json({
    carry,
    next: monthRun(start, y, countMonths(req.query.category)),
    id: "DP-" + String(next).padStart(2, "0"),
  });
});
app.post("/api/transactions", async (req, res) =>
  res.json(await saveTransaction(transactionSchema.parse(req.body))),
);
app.put("/api/transactions/:id", async (req, res) =>
  res.json(
    await saveTransaction(transactionSchema.parse(req.body), req.params.id),
  ),
);
app.delete("/api/transactions/:id", admin, async (req, res) => {
  await atomic(async (q) => {
    await q("DELETE FROM transactions WHERE id=$1", [req.params.id]);
    await reconcile(q);
  });
  res.json({ ok: true });
});
app.post("/api/reconcile", admin, async (req, res) => {
  await atomic(reconcile);
  res.json({ ok: true });
});
// Manual paid cells create matching ledger entries, so reconciliation never discards a valid edit.
app.put("/api/fees/:student/:year/:month", admin, async (req, res) => {
  const b = z
    .object({
      status: z.enum(["PAID", "DUE"]),
      amount,
      plan: z.string().min(1),
      cg: z.enum(["C", "G"]),
    })
    .parse(req.body);
  const year = z.coerce
    .number()
    .int()
    .min(1900)
    .max(9999)
    .parse(req.params.year);
  const month = z.enum(MONTHS).parse(req.params.month);
  await atomic(async (q) => {
    const s = (
      await q(
        "SELECT s.*,b.display_name FROM students s JOIN batches b ON b.id=s.batch_id WHERE s.id=$1",
        [req.params.student],
      )
    ).rows[0];
    if (!s) throw fail("Student not found", 404);
    const tx = (
      await q(
        "SELECT * FROM transactions WHERE batch_display=$1 AND student_name=$2 AND type='Income'",
        [s.display_name, s.name],
      )
    ).rows;
    const linked = tx.filter((t) =>
      t.fee_months.some((m) => m.year === year && m.month === month),
    );
    const regular = linked.filter((t) => !t.id.startsWith("CELL-"));
    for (const t of linked.filter((t) => t.id.startsWith("CELL-")))
      await q("DELETE FROM transactions WHERE id=$1", [t.id]);
    // Explicit per-month allocation edits remain on the source transactions,
    // and therefore survive reconciliation and lossless exports.
    for (const [index, t] of regular.entries()) {
      const months = t.fee_months.map((fm) =>
        fm.year === year && fm.month === month
          ? {
              ...fm,
              cell_status: index === 0 ? b.status : "DUE",
              cell_amount: index === 0 && b.status === "PAID" ? b.amount : 0,
              cell_plan: b.plan,
              cell_cg: b.cg,
            }
          : fm,
      );
      await q("UPDATE transactions SET fee_months=$1 WHERE id=$2", [
        JSON.stringify(months),
        t.id,
      ]);
    }
    if (b.status === "PAID" && regular.length === 0)
      await saveTransaction(
        {
          id: `CELL-${s.id}-${year}-${MONTHS.indexOf(month) + 1}`,
          date: `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-01`,
          type: "Income",
          category: "Regular",
          batch_display: s.display_name,
          student_name: s.name,
          actual_amount: b.amount,
          amount: b.amount,
          discounts: 0,
          balance: 0,
          over_paid: 0,
          payment_mode: b.cg === "C" ? "Cash" : "GPay",
          recorded_by: req.user.username,
          description: `Manual cell · Plan: ${b.plan}`,
          fee_months: [{ month, year }],
        },
        null,
        q,
      );
    await q("UPDATE students SET last_activity_at=NOW() WHERE id=$1", [s.id]);
    await reconcile(q);
  });
  res.json({ ok: true });
});
app.get("/api/manager/:name", async (req, res) =>
  res.json(
    (await one("SELECT * FROM manager_tables WHERE name=$1", [
      req.params.name,
    ])) || { columns: [], rows: [] },
  ),
);
app.post("/api/manager/:name/rows", async (req, res) => {
  const b = z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .parse(req.body);
  await atomic(async (q) => {
    const t = (
      await q("SELECT * FROM manager_tables WHERE name=$1", [req.params.name])
    ).rows[0];
    if (!t) throw fail("Unknown table", 404);
    const row = { ...b, _id: randomBytes(10).toString("hex") };
    t.rows.push(row);
    await q("UPDATE manager_tables SET rows=$1 WHERE name=$2", [
      JSON.stringify(t.rows),
      t.name,
    ]);
    if (t.name === "Student Register") {
      if (!b.NAME) throw fail("Student name required");
      for (const k of ["BATCHES", "BATCHES 2"])
        if (b[k]) {
          const batch = (
            await q(
              "SELECT * FROM batches WHERE display_name=$1 AND NOT is_event",
              [b[k]],
            )
          ).rows[0];
          if (!batch) throw fail("Choose a class batch");
          await ensureStudent(q, b[k], b.NAME, b);
        }
    }
  });
  res.json({ ok: true });
});
app.put("/api/manager/:name/rows/:id", async (req, res) => {
  const b = z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .parse(req.body);
  await atomic(async (q) => {
    const t = (
      await q("SELECT * FROM manager_tables WHERE name=$1", [req.params.name])
    ).rows[0];
    if (!t) throw fail("Unknown table", 404);
    const i = t.rows.findIndex((r) => r._id === req.params.id);
    if (i < 0) throw fail("Row not found", 404);
    t.rows[i] = { ...b, _id: req.params.id };
    await q("UPDATE manager_tables SET rows=$1 WHERE name=$2", [
      JSON.stringify(t.rows),
      t.name,
    ]);
    if (t.name === "Student Register") {
      if (!b.NAME) throw fail("Student name required");
      for (const k of ["BATCHES", "BATCHES 2"])
        if (b[k]) {
          if (
            !(
              await q(
                "SELECT id FROM batches WHERE display_name=$1 AND NOT is_event",
                [b[k]],
              )
            ).rows.length
          )
            throw fail("Choose a class batch");
          await ensureStudent(q, b[k], b.NAME, b);
        }
    }
  });
  res.json({ ok: true });
});
app.delete("/api/manager/:name/rows/:id", admin, async (req, res) => {
  await atomic(async (q) => {
    const t = (
      await q("SELECT * FROM manager_tables WHERE name=$1", [req.params.name])
    ).rows[0];
    if (!t) throw fail("Unknown table", 404);
    await q("UPDATE manager_tables SET rows=$1 WHERE name=$2", [
      JSON.stringify(t.rows.filter((r) => r._id !== req.params.id)),
      t.name,
    ]);
  });
  res.json({ ok: true });
});
app.get("/api/templates", async (req, res) =>
  res.json(await rows("SELECT * FROM templates ORDER BY id")),
);
app.put("/api/templates/:id", async (req, res) => {
  const b = z
    .object({ title: z.string().min(1), text: z.string() })
    .parse(req.body);
  await query("UPDATE templates SET title=$1,text=$2 WHERE id=$3", [
    b.title,
    b.text,
    req.params.id,
  ]);
  res.json({ ok: true });
});
app.get("/api/attendance", async (req, res) =>
  res.json({
    years: (await rows("SELECT year FROM attendance_years ORDER BY year")).map(
      (r) => r.year,
    ),
    sheets: await rows("SELECT * FROM attendance WHERE year=$1 ORDER BY id", [
      Number(req.query.year) || 2026,
    ]),
  }),
);
app.post("/api/attendance/year", async (req, res) => {
  const year = z.coerce.number().int().min(1900).max(9999).parse(req.body.year);
  await query(
    "INSERT INTO attendance_years(year) VALUES($1) ON CONFLICT DO NOTHING",
    [year],
  );
  res.json({ ok: true });
});
app.post("/api/attendance/month", async (req, res) => {
  const b = z
    .object({
      year: z.coerce.number().int().min(1900).max(9999),
      month: z.enum(MONTHS),
    })
    .parse(req.body);
  await atomic(async (q) => {
    await q(
      "INSERT INTO attendance_years(year) VALUES($1) ON CONFLICT DO NOTHING",
      [b.year],
    );
    for (const batch of (await q("SELECT * FROM batches WHERE NOT is_event"))
      .rows) {
      const s = (
        await q("SELECT * FROM students WHERE batch_id=$1 ORDER BY sl_no", [
          batch.id,
        ])
      ).rows;
      await q(
        "INSERT INTO attendance(year,month,sheet,grid) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [
          b.year,
          b.month,
          batch.display_name,
          JSON.stringify(blankGrid(s, b.year, b.month)),
        ],
      );
    }
  });
  res.json({ ok: true });
});
app.patch("/api/attendance/:id/cell", async (req, res) => {
  const b = z
    .object({
      row: z.number().int().min(2),
      col: z.number().int().min(0),
      value: z.union([z.boolean(), z.string(), z.number()]),
    })
    .parse(req.body);
  await atomic(async (q) => {
    const a = (await q("SELECT * FROM attendance WHERE id=$1", [req.params.id]))
      .rows[0];
    if (!a) throw fail("Sheet not found", 404);
    if (["Dashboard", "Student Summary", "DATA"].includes(a.sheet))
      throw fail("This sheet is read-only", 403);
    if (!a.grid[b.row] || b.col >= a.grid[b.row].length)
      throw fail("Invalid cell");
    a.grid[b.row][b.col] = b.value;
    await q("UPDATE attendance SET grid=$1 WHERE id=$2", [
      JSON.stringify(a.grid),
      a.id,
    ]);
  });
  res.json({ ok: true });
});
app.post("/api/attendance/:id/student", async (req, res) => {
  const name = z.string().trim().min(1).parse(req.body.name);
  await atomic(async (q) => {
    const a = (await q("SELECT * FROM attendance WHERE id=$1", [req.params.id]))
      .rows[0];
    if (!a || ["Dashboard", "Student Summary", "DATA"].includes(a.sheet))
      throw fail("Sheet is not editable");
    await ensureStudent(q, a.sheet, name);
  });
  res.json({ ok: true });
});
app.get("/api/people", async (req, res) =>
  res.json(await rows("SELECT * FROM people ORDER BY name")),
);
app.post("/api/people", async (req, res) => {
  const b = z
    .object({
      name: z.string().trim().min(1),
      role: z.enum(["manager", "faculty"]),
    })
    .parse(req.body);
  res.json(
    await one("INSERT INTO people(name,role) VALUES($1,$2) RETURNING *", [
      b.name,
      b.role,
    ]),
  );
});
app.delete("/api/people/:id", admin, async (req, res) => {
  await query("DELETE FROM people WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});
app.get("/api/worklog", async (req, res) => {
  const data = await rows(
    "SELECT * FROM worklog WHERE person_id=$1 AND date LIKE $2 ORDER BY date",
    [Number(req.query.person) || 0, `${req.query.month || "2026-04"}%`],
  );
  res.json({
    entries: data.map((e) => ({ ...e, ...salaryEntry(e) })),
    summary: salarySummary(data),
    workingDays: new Set(data.filter((e) => e.login).map((e) => e.date)).size,
  });
});
app.post("/api/worklog", async (req, res) => {
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const b = z
    .object({
      person_id: z.coerce.number().int(),
      date,
      action: z.enum(["login", "logout", "leave", "save"]),
      batch: z.string().default(""),
      login: time.optional(),
      logout: time.optional(),
    })
    .parse(req.body);
  const p = await one("SELECT * FROM people WHERE id=$1", [b.person_id]);
  if (!p) throw fail("Choose a staff member");
  await atomic(async (q) => {
    if (p.role === "manager") {
      if (b.action !== "leave" && b.date !== today())
        throw fail("Manager clock stamps can only be recorded for today");
      if (b.action === "save" || b.login || b.logout)
        throw fail("Manager time must come from the server clock");
      const old = (
        await q(
          "SELECT * FROM worklog WHERE person_id=$1 AND date=$2 AND batch=''",
          [p.id, b.date],
        )
      ).rows[0];
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      if (b.action === "login" && old?.login) throw fail("Already clocked in");
      if (b.action === "logout" && (!old?.login || old.logout))
        throw fail("A single logout requires an active login");
      if (b.action === "leave" && old?.login)
        throw fail("Cannot mark a worked day as leave");
      await q(
        `INSERT INTO worklog(person_id,role,date,status,login,logout,batch) VALUES($1,'manager',$2,$3,$4,$5,'') ON CONFLICT(person_id,date,batch) DO UPDATE SET status=EXCLUDED.status,login=EXCLUDED.login,logout=EXCLUDED.logout`,
        [
          p.id,
          b.date,
          b.action === "leave" ? "Leave" : "Present",
          b.action === "login" ? now : old?.login || null,
          b.action === "logout" ? now : null,
        ],
      );
    } else {
      if (
        b.action !== "leave" &&
        (!b.batch || !b.login || !b.logout || b.logout <= b.login)
      )
        throw fail("Choose a class and valid entry/exit times");
      await q(
        `INSERT INTO worklog(person_id,role,date,status,login,logout,batch) VALUES($1,'faculty',$2,$3,$4,$5,$6) ON CONFLICT(person_id,date,batch) DO UPDATE SET status=EXCLUDED.status,login=EXCLUDED.login,logout=EXCLUDED.logout`,
        [
          p.id,
          b.date,
          b.action === "leave" ? "Leave" : "Present",
          b.action === "leave" ? null : b.login,
          b.action === "leave" ? null : b.logout,
          b.action === "leave" ? "" : b.batch,
        ],
      );
    }
  });
  res.json({ ok: true });
});
app.delete("/api/worklog/:id", admin, async (req, res) => {
  await query("DELETE FROM worklog WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});
const reviewSchema = z.object({
  student_id: z.coerce.number().int(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  attendance: z.coerce.number().min(0).max(100),
  ratings: z
    .record(z.string(), z.coerce.number().min(1).max(5))
    .refine(
      (r) => SKILLS.every((s) => r[s] != null) && Object.keys(r).length === 10,
      "Rate all ten skills",
    ),
  strengths: z.string().default(""),
  needs_improvement: z.string().default(""),
  remarks: z.string().default(""),
});
app.get("/api/reviews", async (req, res) => {
  let data = await rows(
    "SELECT r.*,s.name AS student,b.display_name AS batch FROM progress_reviews r JOIN students s ON s.id=r.student_id JOIN batches b ON b.id=s.batch_id ORDER BY r.month DESC,r.id DESC",
  );
  if (req.query.batch) data = data.filter((r) => r.batch === req.query.batch);
  if (req.query.search)
    data = data.filter((r) =>
      r.student.toLowerCase().includes(req.query.search.toLowerCase()),
    );
  res.json(data);
});
for (const method of ["post", "put"])
  app[method](
    "/api/reviews" + (method === "put" ? "/:id" : ""),
    async (req, res) => {
      const b = reviewSchema.parse(req.body),
        s = scoreReview(b.ratings);
      if (method === "put") {
        await query(
          "UPDATE progress_reviews SET student_id=$1,month=$2,attendance=$3,ratings=$4,overall=$5,grade=$6,status=$7,strengths=$8,needs_improvement=$9,remarks=$10 WHERE id=$11",
          [
            b.student_id,
            b.month,
            b.attendance,
            JSON.stringify(b.ratings),
            s.overall,
            s.grade,
            s.status,
            b.strengths,
            b.needs_improvement,
            b.remarks,
            req.params.id,
          ],
        );
      } else
        await query(
          "INSERT INTO progress_reviews(student_id,month,attendance,ratings,overall,grade,status,strengths,needs_improvement,remarks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            b.student_id,
            b.month,
            b.attendance,
            JSON.stringify(b.ratings),
            s.overall,
            s.grade,
            s.status,
            b.strengths,
            b.needs_improvement,
            b.remarks,
          ],
        );
      res.json({ ...b, ...s });
    },
  );
app.delete("/api/reviews/:id", admin, async (req, res) => {
  await query("DELETE FROM progress_reviews WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});
app.get("/api/users", admin, async (req, res) =>
  res.json(await rows("SELECT id,username,role FROM users ORDER BY id")),
);
app.post("/api/users", admin, async (req, res) => {
  const b = z
    .object({
      username: z.string().trim().min(2),
      password: z.string().min(8),
      role: z.enum(["admin", "staff"]),
    })
    .parse(req.body);
  res.json(
    safeUser(
      await one(
        "INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) RETURNING *",
        [b.username, await bcrypt.hash(b.password, 12), b.role],
      ),
    ),
  );
});
app.put("/api/users/:id", admin, async (req, res) => {
  const b = z
    .object({
      username: z.string().trim().min(2),
      password: z.string().min(8).optional().or(z.literal("")),
      role: z.enum(["admin", "staff"]),
    })
    .parse(req.body);
  await atomic(async (q) => {
    await q("LOCK TABLE users IN EXCLUSIVE MODE");
    const old = (await q("SELECT * FROM users WHERE id=$1", [req.params.id]))
      .rows[0];
    if (!old) throw fail("User not found", 404);
    if (
      old.role === "admin" &&
      b.role !== "admin" &&
      (await q("SELECT id FROM users WHERE role='admin'")).rows.length <= 1
    )
      throw fail("Cannot demote the last administrator");
    await q(
      "UPDATE users SET username=$1,role=$2,password_hash=$3 WHERE id=$4",
      [
        b.username,
        b.role,
        b.password ? await bcrypt.hash(b.password, 12) : old.password_hash,
        old.id,
      ],
    );
  });
  res.json({ ok: true });
});
app.delete("/api/users/:id", admin, async (req, res) => {
  if (Number(req.params.id) === req.user.id)
    throw fail("Cannot delete the signed-in account");
  await atomic(async (q) => {
    await q("LOCK TABLE users IN EXCLUSIVE MODE");
    const u = (await q("SELECT * FROM users WHERE id=$1", [req.params.id]))
      .rows[0];
    if (
      u?.role === "admin" &&
      (await q("SELECT id FROM users WHERE role='admin'")).rows.length <= 1
    )
      throw fail("Cannot delete the last administrator");
    await q("DELETE FROM users WHERE id=$1", [req.params.id]);
  });
  res.json({ ok: true });
});
installTransfers(app, admin, transactionSchema);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
app.use((err, req, res, next) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({
      error: err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  const conflict = err.code === "23505";
  res
    .status(err.status || (conflict ? 409 : err.code === "23503" ? 400 : 500))
    .json({
      error: conflict
        ? "A record with these details already exists"
        : err.status
          ? err.message
          : err.code === "23503"
            ? "Referenced record does not exist"
            : "Server error. Please try again.",
    });
  if (!err.status && !conflict) console.error(err.message);
});
export default app;
