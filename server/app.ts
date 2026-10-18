import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import multer from "multer";
import { atomic, rows, type DB } from "./db.js";
import { databaseTlsError } from "./db-config.js";
import {
  allTransactions,
  reconcile,
  saveTransaction,
  syncStudent,
  manualCell,
} from "./fees.js";
import { date, fail, reviewSchema, text } from "./validation.js";
import {
  assessment,
  carryForward,
  indiaNow,
  salary,
  MONTHS,
} from "../shared/rules.js";
import {
  exportExcel,
  exportBackup,
  importBackup,
  importExcel,
} from "./transfer.js";
export function createApp(db: any) {
  const app = express();
  if (process.env.VERCEL === "1") app.set("trust proxy", 1);
  const secret = process.env.JWT_SECRET || "";
  if (secret.length < 32)
    throw new Error(
      "Set JWT_SECRET to a random value of at least 32 characters.",
    );
  app.disable("x-powered-by");
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
      req.headers.origin !== process.env.APP_ORIGIN
    )
      return res.status(403).json({ error: "Untrusted request origin" });
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/health/database", async (req, res) => {
    if (
      !process.env.MONITOR_SECRET ||
      req.headers.authorization !== `Bearer ${process.env.MONITOR_SECRET}`
    )
      return res.sendStatus(401);
    await db.query(
      "INSERT INTO health_checks(id) VALUES(1) ON CONFLICT(id) DO UPDATE SET checked_at=now()",
    );
    res.json({ status: "ok", checked_at: new Date().toISOString() });
  });
  app.post(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const { username, password } = z
        .object({ username: text, password: z.string().min(1).max(200) })
        .parse(req.body);
      const u = (
        await rows(db, "SELECT * FROM users WHERE username=$1", [username])
      )[0];
      if (!u || !(await bcrypt.compare(password, u.password_hash)))
        fail("Invalid username or password", 401);
      const token = jwt.sign(
        { sub: String(u.id), version: u.token_version },
        secret,
        {
          expiresIn: "12h",
          issuer: "dance-palace",
          audience: "dance-palace-app",
        },
      );
      res
        .cookie("dp_session", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 12 * 60 * 60 * 1000,
          path: "/",
        })
        .json({ id: u.id, username: u.username, role: u.role });
    },
  );
  app.post("/api/auth/logout", (_req, res) =>
    res.clearCookie("dp_session", { path: "/" }).json({ ok: true }),
  );
  app.use("/api", async (req: any, _res, next) => {
    try {
      const p = jwt.verify(req.cookies.dp_session || "", secret, {
        issuer: "dance-palace",
        audience: "dance-palace-app",
      }) as any;
      const u = (
        await rows(
          db,
          "SELECT id,username,role,token_version FROM users WHERE id=$1",
          [p.sub],
        )
      )[0];
      if (!u || p.version !== u.token_version) fail("Session expired", 401);
      req.user = u;
      next();
    } catch (e: any) {
      if (e.code || (e.status && e.status !== 401)) return next(e);
      next(Object.assign(new Error("Please sign in"), { status: 401 }));
    }
  });
  const admin = (req: any, _res: any, next: any) =>
    req.user.role === "admin"
      ? next()
      : next(
          Object.assign(new Error("Admin access required"), { status: 403 }),
        );
  const mutate =
    (fn: (q: DB, req: any) => Promise<any>) => async (req: any, res: any) =>
      res.json(await atomic(db, (q) => fn(q, req)));
  app.get("/api/auth/me", (req: any, res) => res.json(req.user));
  app.get("/api/bootstrap", async (req: any, res) =>
    res.json({
      batches: await rows(db, "SELECT * FROM batches ORDER BY id"),
      setup: Object.fromEntries(
        (await rows(db, "SELECT * FROM setup")).map((x) => [x.key, x.values]),
      ),
      years: (
        await rows(db, "SELECT year FROM attendance_years ORDER BY year")
      ).map((x) => x.year),
      user: req.user,
    }),
  );
  app.put(
    "/api/setup/:key",
    admin,
    mutate(async (q, r) => {
      const values = z
        .array(z.union([z.string(), z.number()]))
        .parse(r.body.values);
      await q.query(
        "INSERT INTO setup(key,values) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET values=EXCLUDED.values",
        [r.params.key, JSON.stringify(values)],
      );
      return { ok: true };
    }),
  );
  app.get("/api/transactions", async (req: any, res) => {
    const f = req.query;
    let ts = await allTransactions(db);
    ts = ts.filter(
      (t) =>
        (!f.from || t.date >= f.from) &&
        (!f.to || t.date <= f.to) &&
        (!f.batch || t.batch_display === f.batch) &&
        (!f.type || t.type === f.type) &&
        (!f.status || t.status === f.status) &&
        (!f.month ||
          t.fee_months.some((m: any) => m.month === Number(f.month))) &&
        (!f.search ||
          `${t.student_name} ${t.id} ${t.category}`
            .toLowerCase()
            .includes(String(f.search).toLowerCase())),
    );
    if (f.sort === "az" || f.sort === "za")
      ts.sort((a, b) =>
        !a.student_name
          ? 1
          : !b.student_name
            ? -1
            : (f.sort === "az" ? 1 : -1) *
              a.student_name.localeCompare(b.student_name),
      );
    if (f.sort === "low" || f.sort === "high")
      ts.sort((a, b) => (f.sort === "low" ? 1 : -1) * (a.amount - b.amount));
    const sum = (p: (t: any) => boolean, k = "amount") =>
      ts.filter(p).reduce((s, t) => s + Number(t[k]), 0);
    const chart: Record<string, number> = {};
    for (const t of ts.filter(
      (t) => t.type === "Income" && t.status !== "Cancelled",
    ))
      for (const m of t.fee_months) {
        const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
        chart[key] = (chart[key] || 0) + t.amount / t.fee_months.length;
      }
    res.json({
      rows: ts,
      chart,
      ...(req.user.role === "admin"
        ? {
            stats: {
              "Total Income": sum(
                (t) => t.type === "Income" && t.status !== "Cancelled",
              ),
              "Total Expense": sum(
                (t) => t.type === "Expense" && t.status !== "Cancelled",
              ),
              "Net Cash Flow": sum(
                (t) => t.status !== "Cancelled",
                "net_effect",
              ),
              "Cash Income": sum(
                (t) =>
                  t.type === "Income" &&
                  t.channel === "Cash" &&
                  t.status !== "Cancelled",
              ),
              "Digital Income": sum(
                (t) =>
                  t.type === "Income" &&
                  t.channel === "Digital" &&
                  t.status !== "Cancelled",
              ),
              Completed: ts.filter((t) => t.status === "Completed").length,
              "Balance Due": sum((t) => t.status !== "Cancelled", "balance"),
              "Over Paid": sum((t) => t.status !== "Cancelled", "over_paid"),
            },
          }
        : {}),
    });
  });
  app.get("/api/transactions/suggestion", async (req, res) => {
    const ts = (await allTransactions(db)).filter(
      (t) =>
        t.type === "Income" &&
        t.status !== "Cancelled" &&
        t.batch_display === req.query.batch &&
        t.student_name.trim().toLowerCase() ===
          String(req.query.student || "")
            .trim()
            .toLowerCase() &&
        t.id !== req.query.exclude,
    );
    const months = ts
      .flatMap((t) => t.fee_months)
      .sort((a, b) => b.year - a.year || b.month - a.month);
    res.json({
      ...carryForward(
        ts,
        Number(req.query.actual || 0),
        Number(req.query.discounts || 0),
      ),
      lastPaid: months[0] || null,
    });
  });
  app.post(
    "/api/transactions",
    mutate((q, r) => saveTransaction(q, r.body)),
  );
  app.put(
    "/api/transactions/:id",
    mutate((q, r) => saveTransaction(q, r.body, r.params.id)),
  );
  app.delete(
    "/api/transactions/:id",
    admin,
    mutate(async (q, r) => {
      await q.query("DELETE FROM transactions WHERE id=$1", [r.params.id]);
      await reconcile(q);
      return { ok: true };
    }),
  );
  app.post(
    "/api/reconcile",
    admin,
    mutate(async (q) => {
      await reconcile(q);
      return { ok: true };
    }),
  );
  app.get("/api/students", async (req, res) =>
    res.json(
      await rows(
        db,
        `SELECT s.*,b.display_name batch FROM students s JOIN batches b ON b.id=s.batch_id WHERE ($1::integer IS NULL OR batch_id=$1) AND ($2='' OR s.name ILIKE '%'||$2||'%') ORDER BY s.name`,
        [req.query.batch_id || null, req.query.search || ""],
      ),
    ),
  );
  app.post(
    "/api/students",
    admin,
    mutate(async (q, r) => {
      const v = z
        .object({
          batch_id: z.coerce.number().int(),
          name: text,
          register_fields: z.record(z.string(), z.any()).optional(),
        })
        .parse(r.body);
      return syncStudent(q, v.batch_id, v.name, v.register_fields);
    }),
  );
  app.put(
    "/api/students/:id",
    admin,
    mutate(async (q, r) => {
      const name = text.parse(r.body.name);
      const old = (
        await rows(
          q,
          "SELECT s.*,b.display_name FROM students s JOIN batches b ON b.id=s.batch_id WHERE s.id=$1",
          [r.params.id],
        )
      )[0];
      if (!old) fail("Not found", 404);
      await q.query(
        "UPDATE students SET name=$1,last_activity_at=clock_timestamp() WHERE id=$2",
        [name, old.id],
      );
      await q.query(
        "UPDATE transactions SET student_name=$1 WHERE lower(student_name)=lower($2) AND batch_display=$3",
        [name, old.name, old.display_name],
      );
      for (const sheet of await rows(
        q,
        "SELECT * FROM attendance_sheets WHERE batch_id=$1",
        [old.batch_id],
      )) {
        for (const row of sheet.grid.slice(2))
          if (row[1] === old.name) row[1] = name;
        await q.query("UPDATE attendance_sheets SET grid=$1 WHERE id=$2", [
          JSON.stringify(sheet.grid),
          sheet.id,
        ]);
      }
      return { ok: true };
    }),
  );
  app.delete(
    "/api/students/:id",
    admin,
    mutate(async (q, r) => {
      const s = (
        await rows(
          q,
          "SELECT s.*,b.display_name FROM students s JOIN batches b ON b.id=s.batch_id WHERE s.id=$1",
          [r.params.id],
        )
      )[0];
      if (!s) fail("Not found", 404);
      if (
        (
          await rows(
            q,
            "SELECT id FROM transactions WHERE lower(student_name)=lower($1) AND batch_display=$2",
            [s.name, s.display_name],
          )
        ).length
      )
        fail(
          "Delete or reassign this student’s transactions before deleting the student.",
        );
      await q.query("DELETE FROM students WHERE id=$1", [s.id]);
      return { ok: true };
    }),
  );
  app.get("/api/fees", async (req: any, res) => {
    const result = await atomic(db, async (q) => {
      await reconcile(q);
      const batch = (
        await rows(q, "SELECT * FROM batches WHERE id=$1", [
          req.query.batch_id || 1,
        ])
      )[0];
      if (!batch) fail("Batch not found", 404);
      const year = Number(req.query.year || 2026);
      let students = await rows(q, "SELECT * FROM students WHERE batch_id=$1", [
        batch.id,
      ]);
      const cells = await rows(
        q,
        "SELECT f.* FROM fee_cells f JOIN students s ON s.id=f.student_id WHERE s.batch_id=$1 AND f.year=$2",
        [batch.id, year],
      );
      const available =
        year === 2026
          ? [
              ...new Set<number>([
                ...batch.month_order,
                ...cells.map((c) => c.month),
              ]),
            ].sort((a, b) => a - b)
          : Array.from({ length: 12 }, (_, i) => i + 1);
      const selected = String(req.query.months || "")
        .split(",")
        .map(Number)
        .filter(Boolean);
      const months = selected.length
        ? available.filter((m) => selected.includes(m))
        : available;
      students = students
        .map((s) => ({
          ...s,
          cells: Object.fromEntries(
            cells.filter((c) => c.student_id === s.id).map((c) => [c.month, c]),
          ),
        }))
        .filter(
          (s) =>
            (!req.query.search ||
              s.name
                .toLowerCase()
                .includes(String(req.query.search).toLowerCase())) &&
            (!req.query.status ||
              months.some(
                (m) => (s.cells[m]?.status || "DUE") === req.query.status,
              )),
        );
      students.sort((a, b) =>
        req.query.sort === "sl"
          ? a.sl_no - b.sl_no
          : req.query.sort === "az"
            ? a.name.localeCompare(b.name)
            : req.query.sort === "za"
              ? b.name.localeCompare(a.name)
              : new Date(b.last_activity_at).getTime() -
                new Date(a.last_activity_at).getTime(),
      );
      const shown = students.flatMap((s) =>
        months.map((m) => s.cells[m] || { status: "DUE", amount: 0 }),
      );
      const years = (
        await rows(q, "SELECT DISTINCT year FROM fee_cells ORDER BY year")
      ).map((c) => c.year);
      return {
        rows: students,
        months,
        available,
        years: [
          ...new Set([
            2026,
            2027,
            new Date().getFullYear(),
            new Date().getFullYear() + 1,
            ...years,
          ]),
        ].sort(),
        ...(req.user.role === "admin"
          ? {
              stats: {
                Students: students.length,
                "Total Collected": shown
                  .filter((c) => c.status === "PAID")
                  .reduce((s, c) => s + Number(c.amount), 0),
                "Payments Received": shown.filter((c) => c.status === "PAID")
                  .length,
                "Dues Pending": shown.filter((c) => c.status === "DUE").length,
                "Months Shown": months.length,
              },
            }
          : {}),
      };
    });
    res.json(result);
  });
  app.put(
    "/api/fees/:student/:year/:month",
    admin,
    mutate(async (q, r) => {
      const v = z
        .object({
          status: z.enum(["PAID", "DUE"]),
          plan: z.string(),
          amount: z.coerce.number().nonnegative(),
          cg: z.enum(["C", "G"]),
        })
        .parse(r.body);
      const year = z.coerce
          .number()
          .int()
          .min(1900)
          .max(9999)
          .parse(r.params.year),
        month = z.coerce.number().int().min(1).max(12).parse(r.params.month);
      await manualCell(
        q,
        Number(r.params.student),
        year,
        month,
        v,
        r.user.username,
      );
      return { ok: true };
    }),
  );
  app.get("/api/manager/:name", async (req, res) => {
    const table = (
      await rows(db, "SELECT * FROM manager_tables WHERE name=$1", [
        req.params.name,
      ])
    )[0];
    if (!table) fail("Table not found", 404);
    res.json({
      ...table,
      rows: await rows(
        db,
        "SELECT * FROM manager_rows WHERE table_name=$1 AND ($2='' OR data::text ILIKE '%'||$2||'%') ORDER BY updated_at DESC",
        [req.params.name, req.query.search || ""],
      ),
    });
  });
  async function managerSave(q: DB, r: any) {
    const data = z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      )
      .parse(r.body.data);
    const table = (
      await rows(q, "SELECT * FROM manager_tables WHERE name=$1", [
        r.params.name,
      ])
    )[0];
    if (!table) fail("Unknown table", 404);
    if (r.params.name === "Student Register") {
      if (!String(data.NAME || "").trim()) fail("Student name is required");
      for (const [key, value] of Object.entries(data).filter(([k]) =>
        /^BATCH/i.test(k),
      )) {
        if (!value) continue;
        const b = (
          await rows(
            q,
            "SELECT * FROM batches WHERE display_name=$1 AND NOT is_event",
            [value],
          )
        )[0];
        if (!b) fail(`Invalid class batch in ${key}`);
        await syncStudent(q, b.id, String(data.NAME), data);
      }
    }
    if (r.params.id)
      await q.query(
        "UPDATE manager_rows SET data=$1,updated_at=clock_timestamp() WHERE id=$2 AND table_name=$3",
        [JSON.stringify(data), r.params.id, r.params.name],
      );
    else
      await q.query("INSERT INTO manager_rows(table_name,data) VALUES($1,$2)", [
        r.params.name,
        JSON.stringify(data),
      ]);
    return { ok: true };
  }
  app.post("/api/manager/:name", mutate(managerSave));
  app.put("/api/manager/:name/:id", mutate(managerSave));
  app.delete(
    "/api/manager/:name/:id",
    admin,
    mutate(async (q, r) => {
      await q.query("DELETE FROM manager_rows WHERE id=$1 AND table_name=$2", [
        r.params.id,
        r.params.name,
      ]);
      return { ok: true };
    }),
  );
  app.get("/api/templates", async (_req, res) =>
    res.json(await rows(db, "SELECT * FROM templates ORDER BY id")),
  );
  app.put(
    "/api/templates/:id",
    mutate(async (q, r) => {
      await q.query("UPDATE templates SET text=$1 WHERE id=$2", [
        z.string().max(20000).parse(r.body.text),
        r.params.id,
      ]);
      return { ok: true };
    }),
  );
  app.get("/api/attendance", async (req, res) =>
    res.json(
      await rows(
        db,
        "SELECT * FROM attendance_sheets WHERE year=$1 AND ($2::integer IS NULL OR month=$2) ORDER BY month,id",
        [req.query.year || 2026, req.query.month || null],
      ),
    ),
  );
  app.post(
    "/api/attendance/year",
    mutate(async (q, r) => {
      const year = z.coerce
        .number()
        .int()
        .min(1000)
        .max(9999)
        .parse(r.body.year);
      await q.query(
        "INSERT INTO attendance_years(year) VALUES($1) ON CONFLICT DO NOTHING",
        [year],
      );
      return { ok: true };
    }),
  );
  app.post(
    "/api/attendance/month",
    mutate(async (q, r) => {
      const { year, month } = z
        .object({
          year: z.number().int().min(1000).max(9999),
          month: z.number().int().min(1).max(12),
        })
        .parse(r.body);
      await q.query(
        "INSERT INTO attendance_years(year) VALUES($1) ON CONFLICT DO NOTHING",
        [year],
      );
      for (const b of await rows(
        q,
        "SELECT * FROM batches WHERE NOT is_event",
      )) {
        const grid = [
          [
            "SL",
            "Name",
            ...Array.from({ length: 31 }, (_, i) =>
              new Date(Date.UTC(year, month - 1, i + 1)).toLocaleDateString(
                "en",
                { weekday: "short", timeZone: "UTC" },
              ),
            ),
          ],
          ["", "Date", ...Array.from({ length: 31 }, (_, i) => i + 1)],
          ...(
            await rows(
              q,
              "SELECT * FROM students WHERE batch_id=$1 ORDER BY sl_no",
              [b.id],
            )
          ).map((s) => [s.sl_no, s.name, ...Array(31).fill(false)]),
        ];
        await q.query(
          "INSERT INTO attendance_sheets(year,month,sheet_name,batch_id,grid) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [year, month, b.display_name, b.id, JSON.stringify(grid)],
        );
      }
      return { ok: true };
    }),
  );
  app.patch(
    "/api/attendance/:id",
    mutate(async (q, r) => {
      const sheet = (
        await rows(
          q,
          "SELECT * FROM attendance_sheets WHERE id=$1 FOR UPDATE",
          [r.params.id],
        )
      )[0];
      if (!sheet) fail("Sheet not found", 404);
      if (["Dashboard", "Student Summary"].includes(sheet.sheet_name))
        fail("Summary sheets are read-only", 403);
      const v = z
        .object({
          row: z.number().int().min(2).optional(),
          col: z.number().int().min(0).max(100).optional(),
          value: z
            .union([z.string().max(500), z.number(), z.boolean()])
            .optional(),
          name: text.optional(),
        })
        .parse(r.body);
      if (v.name)
        sheet.grid.push([
          sheet.grid.length - 1,
          v.name,
          ...Array(31).fill(false),
        ]);
      else {
        if (v.row === undefined || v.col === undefined || !sheet.grid[v.row])
          fail("Invalid cell");
        sheet.grid[v.row][v.col] =
          v.col >= 2 && typeof sheet.grid[v.row][v.col] === "boolean"
            ? !sheet.grid[v.row][v.col]
            : v.value;
      }
      await q.query("UPDATE attendance_sheets SET grid=$1 WHERE id=$2", [
        JSON.stringify(sheet.grid),
        sheet.id,
      ]);
      return { ok: true };
    }),
  );
  app.get("/api/worklog/people", async (_req, res) =>
    res.json(await rows(db, "SELECT * FROM worklog_people ORDER BY name")),
  );
  app.post(
    "/api/worklog/people",
    mutate(async (q, r) => {
      const v = z
        .object({ name: text, role: z.enum(["manager", "faculty"]) })
        .parse(r.body);
      return (
        await rows(
          q,
          "INSERT INTO worklog_people(name,role) VALUES($1,$2) RETURNING *",
          [v.name, v.role],
        )
      )[0];
    }),
  );
  app.delete(
    "/api/worklog/people/:id",
    admin,
    mutate(async (q, r) => {
      await q.query("DELETE FROM worklog_people WHERE id=$1", [r.params.id]);
      return { ok: true };
    }),
  );
  app.get("/api/worklog/entries", async (req, res) => {
    const entries = (
      await rows(
        db,
        "SELECT e.*,p.role FROM worklog_entries e JOIN worklog_people p ON p.id=e.person_id WHERE e.person_id=$1 AND to_char(e.date,'YYYY-MM')=$2 ORDER BY date,login",
        [req.query.person_id || 0, req.query.month || "2026-04"],
      )
    ).map((e) => ({ ...e, ...salary(e) }));
    const present = entries.filter((e) => e.status === "Present"),
      leave = entries.filter((e) => e.status === "Leave");
    res.json({
      rows: entries,
      stats: {
        "Present days": new Set(present.map((e) => e.date)).size,
        "Leave days": new Set(leave.map((e) => e.date)).size,
        "Classes taken": present.filter((e) => e.role === "faculty").length,
        "Late days": entries.filter((e) => e.late > 0).length,
        "Late minutes": entries.reduce((s, e) => s + e.late, 0),
        "Early leave days": entries.filter((e) => e.early > 0).length,
        "Early minutes": entries.reduce((s, e) => s + e.early, 0),
        "Overtime hours": +(
          entries.reduce((s, e) => s + e.overtime, 0) / 60
        ).toFixed(2),
        "Work hours": +(entries.reduce((s, e) => s + e.work, 0) / 60).toFixed(
          2,
        ),
      },
    });
  });
  app.post(
    "/api/worklog/entries",
    mutate(async (q, r) => {
      const v = z
        .object({
          person_id: z.coerce.number().int(),
          date,
          action: z.enum(["login", "logout", "leave", "faculty"]),
          login: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .optional(),
          logout: z
            .string()
            .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
            .optional(),
          batch: z.string().optional(),
          id: z.number().optional(),
        })
        .parse(r.body);
      const p = (
        await rows(q, "SELECT * FROM worklog_people WHERE id=$1", [v.person_id])
      )[0];
      if (!p) fail("Choose a person");
      const existing = await rows(
        q,
        "SELECT * FROM worklog_entries WHERE person_id=$1 AND date=$2 FOR UPDATE",
        [p.id, v.date],
      );
      if (p.role === "manager") {
        if (v.action === "faculty" || v.login || v.logout)
          fail("Manager times are stamped by the server");
        const now = indiaNow();
        if (v.action !== "leave" && v.date !== now.date)
          fail("Login and logout can only be stamped for today (India time).");
        if (v.action === "login") {
          if (existing.length) fail("This day already has an entry");
          await q.query(
            "INSERT INTO worklog_entries(person_id,date,status,login) VALUES($1,$2,'Present',$3)",
            [p.id, now.date, now.time],
          );
        } else if (v.action === "logout") {
          if (!existing[0]?.login || existing[0].logout)
            fail("A single open login is required");
          await q.query("UPDATE worklog_entries SET logout=$1 WHERE id=$2", [
            now.time,
            existing[0].id,
          ]);
        } else {
          if (existing.length) fail("Cannot replace a recorded day with leave");
          await q.query(
            "INSERT INTO worklog_entries(person_id,date,status) VALUES($1,$2,'Leave')",
            [p.id, v.date],
          );
        }
      } else {
        if (!["faculty", "leave"].includes(v.action)) fail("Use faculty entry");
        if (v.action === "leave") {
          if (existing.length) fail("Entries already recorded for this day");
          await q.query(
            "INSERT INTO worklog_entries(person_id,date,status) VALUES($1,$2,'Leave')",
            [p.id, v.date],
          );
        } else {
          if (!v.login || !v.logout || v.logout <= v.login || !v.batch)
            fail("Choose batch and valid entry/exit times");
          if (
            existing.some(
              (e) =>
                e.status === "Leave" ||
                (e.id !== v.id && v.login! < e.logout && v.logout! > e.login),
            )
          )
            fail("Class overlaps an existing entry or leave");
          if (v.id)
            await q.query(
              "UPDATE worklog_entries SET login=$1,logout=$2,batch=$3 WHERE id=$4 AND person_id=$5",
              [v.login, v.logout, v.batch, v.id, p.id],
            );
          else
            await q.query(
              "INSERT INTO worklog_entries(person_id,date,status,login,logout,batch) VALUES($1,$2,'Present',$3,$4,$5)",
              [p.id, v.date, v.login, v.logout, v.batch],
            );
        }
      }
      return { ok: true };
    }),
  );
  app.delete(
    "/api/worklog/entries/:id",
    admin,
    mutate(async (q, r) => {
      await q.query("DELETE FROM worklog_entries WHERE id=$1", [r.params.id]);
      return { ok: true };
    }),
  );
  app.get("/api/reviews", async (req, res) =>
    res.json(
      await rows(
        db,
        "SELECT r.*,s.name student,b.display_name batch,s.batch_id FROM progress_reviews r JOIN students s ON s.id=r.student_id JOIN batches b ON b.id=s.batch_id WHERE ($1::integer IS NULL OR b.id=$1) AND ($2='' OR s.name ILIKE '%'||$2||'%') ORDER BY r.month DESC,s.name",
        [req.query.batch_id || null, req.query.search || ""],
      ),
    ),
  );
  const saveReview = async (q: DB, r: any) => {
    const v = reviewSchema.parse(r.body);
    if (
      !(
        await rows(
          q,
          "SELECT s.id FROM students s JOIN batches b ON b.id=s.batch_id WHERE s.id=$1 AND NOT b.is_event",
          [v.student_id],
        )
      ).length
    )
      fail("Choose a student in a class batch");
    const a = assessment(v.ratings);
    const params = [
      v.student_id,
      v.month,
      v.attendance,
      JSON.stringify(v.ratings),
      a.overall,
      a.grade,
      a.status,
      v.strengths,
      v.needs_improvement,
      v.remarks,
    ];
    if (r.params.id)
      await q.query(
        "UPDATE progress_reviews SET student_id=$1,month=$2,attendance=$3,ratings=$4,overall=$5,grade=$6,status=$7,strengths=$8,needs_improvement=$9,remarks=$10 WHERE id=$11",
        [...params, r.params.id],
      );
    else
      await q.query(
        "INSERT INTO progress_reviews(student_id,month,attendance,ratings,overall,grade,status,strengths,needs_improvement,remarks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        params,
      );
    return { ...v, ...a };
  };
  app.post("/api/reviews", mutate(saveReview));
  app.put("/api/reviews/:id", mutate(saveReview));
  app.delete(
    "/api/reviews/:id",
    admin,
    mutate(async (q, r) => {
      await q.query("DELETE FROM progress_reviews WHERE id=$1", [r.params.id]);
      return { ok: true };
    }),
  );
  app.get("/api/users", admin, async (_req, res) =>
    res.json(await rows(db, "SELECT id,username,role FROM users ORDER BY id")),
  );
  const saveUser = async (q: DB, r: any) => {
    const v = z
      .object({
        username: text.max(80),
        role: z.enum(["admin", "staff"]),
        password: z.string().min(8).max(72).optional(),
      })
      .parse(r.body);
    if (r.params.id) {
      const old = (
        await rows(q, "SELECT * FROM users WHERE id=$1", [r.params.id])
      )[0];
      if (!old) fail("User not found", 404);
      if (
        old.role === "admin" &&
        v.role !== "admin" &&
        (await rows(q, "SELECT id FROM users WHERE role='admin'")).length === 1
      )
        fail("Cannot demote the last admin");
      await q.query(
        "UPDATE users SET username=$1,role=$2,password_hash=$3,token_version=token_version+1 WHERE id=$4",
        [
          v.username,
          v.role,
          v.password ? await bcrypt.hash(v.password, 12) : old.password_hash,
          old.id,
        ],
      );
    } else {
      if (!v.password) fail("Password required");
      await q.query(
        "INSERT INTO users(username,role,password_hash) VALUES($1,$2,$3)",
        [v.username, v.role, await bcrypt.hash(v.password, 12)],
      );
    }
    return { ok: true };
  };
  app.post("/api/users", admin, mutate(saveUser));
  app.put("/api/users/:id", admin, mutate(saveUser));
  app.delete(
    "/api/users/:id",
    admin,
    mutate(async (q, r) => {
      if (Number(r.params.id) === r.user.id)
        fail("Cannot delete your signed-in account");
      const u = (
        await rows(q, "SELECT * FROM users WHERE id=$1", [r.params.id])
      )[0];
      if (
        u?.role === "admin" &&
        (await rows(q, "SELECT id FROM users WHERE role='admin'")).length === 1
      )
        fail("Cannot delete the last admin");
      await q.query("DELETE FROM users WHERE id=$1", [r.params.id]);
      return { ok: true };
    }),
  );
  app.get("/api/export/excel", async (req, res) => {
    const buffer = await atomic(db, (q) =>
      exportExcel(
        q,
        req.query.attendance_year
          ? Number(req.query.attendance_year)
          : undefined,
      ),
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Dance-Palace.xlsx"',
    );
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
  });
  app.get("/api/export/backup", admin, async (_req, res) => {
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Dance-Palace-backup.json"',
    );
    res.json(await atomic(db, (q) => exportBackup(q)));
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });
  app.post(
    "/api/import/backup",
    admin,
    mutate(async (q, r) => importBackup(q, r.body, r.user)),
  );
  app.post(
    "/api/import/excel",
    admin,
    upload.single("file"),
    mutate(async (q, r) => {
      if (!r.file) fail("Choose an Excel workbook");
      return importExcel(q, r.file.buffer, r.file.originalname, r.body);
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found" }),
  );
  app.use((e: any, _req: any, res: any, _next: any) => {
    const validation = e instanceof z.ZodError;
    const conflict = e.code === "23505";
    const tlsError = databaseTlsError(e);
    const databaseUnavailable =
      [
        "ECONNREFUSED",
        "ENOTFOUND",
        "ETIMEDOUT",
        "28P01",
        "3D000",
        "42P01",
      ].includes(e.code) || /timeout|Connection terminated/i.test(e.message);
    const constraint = [
      "23503",
      "23514",
      "23502",
      "22P02",
      "22007",
      "22008",
    ].includes(e.code);
    const status = validation
      ? 400
      : conflict
        ? 409
        : constraint
          ? 400
          : e.status || 503;
    res.status(status).json({
      error:
        tlsError ||
        (validation
          ? e.issues
              .map((x: any) => `${x.path.join(".")}: ${x.message}`)
              .join("; ")
          : constraint
            ? "Invalid data: a referenced record is missing or a field violates a database constraint."
            : conflict
              ? "This record already exists."
              : databaseUnavailable
                ? "Database unavailable or not configured. Check DATABASE_URL, run database/supabase.sql, and restore a paused project from the Supabase dashboard."
                : status < 500
                  ? e.message
                  : "Server could not complete this request. Check server logs."),
    });
    if (status >= 500) console.error(e.message);
  });
  return app;
}
