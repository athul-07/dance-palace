import multer from "multer";
import XLSX from "xlsx";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { rows, atomic } from "./db.js";
import { ensureStudent, reconcile, saveTransaction, fail } from "./services.js";
import {
  MONTHS,
  BATCHES,
  SHEETS,
  SKILLS,
  scoreReview,
  monthRun,
  countMonths,
  today,
} from "../shared/domain.js";
const TABLE_NAMES = [
  "users",
  "batches",
  "students",
  "transactions",
  "fee_cells",
  "setup",
  "manager_tables",
  "templates",
  "attendance_years",
  "attendance",
  "people",
  "worklog",
  "progress_reviews",
];
const JSON_FIELDS = new Set([
  "month_order",
  "register_fields",
  "fee_months",
  "legacy_months",
  "value",
  "columns",
  "rows",
  "grid",
  "ratings",
]);
const SERIAL_TABLES = [
  "users",
  "batches",
  "students",
  "templates",
  "attendance",
  "people",
  "worklog",
  "progress_reviews",
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
async function backup() {
  return atomic(async (q) => {
    const tables = {};
    for (const name of TABLE_NAMES)
      tables[name] = (await q(`SELECT * FROM ${name}`)).rows;
    return {
      format: "dance-palace",
      version: 1,
      exported_at: new Date().toISOString(),
      tables,
    };
  });
}
async function restore(data, adminId) {
  if (data.format !== "dance-palace" || data.version !== 1 || !data.tables)
    throw fail("Unsupported backup format");
  for (const name of TABLE_NAMES)
    if (!Array.isArray(data.tables[name])) throw fail(`Missing table: ${name}`);
  if (!data.tables.users.some((u) => u.role === "admin" && u.id === adminId))
    throw fail("Backup must preserve the signed-in administrator");
  for (const u of data.tables.users)
    if (
      !["admin", "staff"].includes(u.role) ||
      !/^\$2[aby]\$/.test(u.password_hash)
    )
      throw fail("Invalid user data");
  await atomic(async (q) => {
    const columns = {};
    for (const name of TABLE_NAMES) {
      columns[name] = (
        await q(
          "SELECT column_name FROM information_schema.columns WHERE table_name=$1",
          [name],
        )
      ).rows.map((r) => r.column_name);
    }
    for (const name of [...TABLE_NAMES].reverse())
      await q(`DELETE FROM ${name}`);
    for (const name of TABLE_NAMES) {
      for (const row of data.tables[name]) {
        const keys = Object.keys(row);
        if (keys.some((k) => !columns[name].includes(k)))
          throw fail(`Invalid column in ${name}`);
        await q(
          `INSERT INTO ${name}(${keys.map((k) => '"' + k + '"').join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
          keys.map((k) =>
            JSON_FIELDS.has(k) ? JSON.stringify(row[k]) : row[k],
          ),
        );
      }
    }
    for (const name of SERIAL_TABLES)
      await q(
        `SELECT setval(pg_get_serial_sequence('${name}','id'),COALESCE((SELECT MAX(id) FROM ${name}),1),(SELECT COUNT(*)>0 FROM ${name}))`,
      );
    for (const a of (await q("SELECT id FROM attendance WHERE sheet='DATA'"))
      .rows)
      await q("DELETE FROM attendance WHERE id=$1", [a.id]);
    await reconcile(q);
  });
}
const TX_HEADERS = {
  date: "Date",
  id: "ID",
  type: "Type",
  category: "Category",
  batch_display: "Batch/Department",
  student_name: "Student Name",
  actual_amount: "Actual Amount",
  discounts: "Discounts",
  balance: "Balance",
  payment_mode: "Payment Mode",
  over_paid: "Over Paid",
  amount: "Amount",
  status: "Status",
  recorded_by: "Recorded By",
  description: "Description",
  channel: "Channel",
  net_effect: "Net Effect",
  drive_receipt: "Drive Receipt",
};
function excelDate(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (!v)
    throw fail(
      "Transaction has no cached date; enter a fixed date in Excel before import",
    );
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw fail(`Invalid date: ${s}`);
  return d.toISOString().slice(0, 10);
}
const normalized = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const batchName = (s) =>
  BATCHES.find(
    (b) =>
      normalized(b) === normalized(String(s).replace(/\s*\(\d+\)\s*$/, "")) ||
      normalized(SHEETS[b] || b) === normalized(s),
  ) || String(s);
function tableGrid(sheet, marker) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const start = marker
    ? grid.findIndex((r) => r.some((c) => normalized(c) === marker))
    : 0;
  return grid.slice(Math.max(0, start));
}
function uniqueHeaders(row) {
  const seen = new Map();
  return row.map((v, i) => {
    const base = String(v || `Column ${i + 1}`).trim();
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} ${count}`;
  });
}
export function installTransfers(app, admin, transactionSchema) {
  app.get("/api/export/backup", admin, async (req, res) => {
    res.attachment(`dance-palace-${today()}.json`).json(await backup());
  });
  app.post(
    "/api/import/backup",
    admin,
    upload.single("file"),
    async (req, res) => {
      if (!req.file) throw fail("Choose a JSON backup");
      let data;
      try {
        data = JSON.parse(req.file.buffer.toString());
      } catch {
        throw fail("Invalid JSON file");
      }
      await restore(data, req.user.id);
      res.json({ ok: true, message: "Backup restored" });
    },
  );
  app.get("/api/export/excel", async (req, res) => {
    const data = await backup();
    const t = data.tables;
    const wb = XLSX.utils.book_new();
    const used = new Set();
    const add = (name, data) => {
      let n = name.slice(0, 31),
        i = 1;
      while (used.has(n)) n = name.slice(0, 27) + " " + i++;
      used.add(n);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), n);
    };
    add("Transactions", [
      [
        ...Object.values(TX_HEADERS),
        "Month",
        "Month2",
        "Month3",
        "Month4",
        "Month5",
        "Month6",
        "Fee Months (JSON)",
      ],
      ...t.transactions.map((r) => [
        ...Object.keys(TX_HEADERS).map((k) => r[k]),
        ...Array.from(
          { length: 6 },
          (_, i) => r.legacy_months?.[i] ?? r.fee_months[i]?.month ?? "",
        ),
        JSON.stringify(r.fee_months),
      ]),
    ]);
    for (const b of t.batches) {
      const years = [
        ...new Set([2026, ...t.fee_cells.map((c) => c.year)]),
      ].sort();
      for (const year of years) {
        const months =
          year === 2026
            ? [
                ...new Set([
                  ...b.month_order,
                  ...t.fee_cells
                    .filter((c) => c.year === year)
                    .map((c) => c.month),
                ]),
              ].sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b))
            : MONTHS;
        add(b.sheet_name + (year === 2026 ? "" : ` ${year}`), [
          ["SL", "Name", ...months.flatMap((m) => [m, "", "", ""])],
          ["", "", ...months.flatMap(() => ["PLAN", "AMOUNT", "C-G", "P-D"])],
          ...t.students
            .filter((s) => s.batch_id === b.id)
            .map((s) => [
              s.sl_no,
              s.name,
              ...months.flatMap((m) => {
                const c = t.fee_cells.find(
                  (c) =>
                    c.student_id === s.id && c.year === year && c.month === m,
                );
                return [
                  c?.plan || "",
                  Number(c?.amount || 0),
                  c?.cg || "",
                  c?.status === "PAID" ? "P" : "D",
                ];
              }),
            ]),
        ]);
      }
    }
    add("Setup", [
      ["List", "Value"],
      ...t.setup.flatMap((s) =>
        Array.isArray(s.value)
          ? s.value.map((v) => [
              s.key,
              typeof v === "object" ? JSON.stringify(v) : v,
            ])
          : [[s.key, JSON.stringify(s.value)]],
      ),
    ]);
    for (const m of t.manager_tables)
      add(m.name, [
        m.columns,
        ...m.rows.map((r) => m.columns.map((c) => r[c] ?? "")),
      ]);
    add("Templates", [
      ["Title", "Text"],
      ...t.templates.map((r) => [r.title, r.text]),
    ]);
    add("Login Logout", [
      ["Person", "Role", "Date", "Status", "Login", "Logout", "Batch"],
      ...t.worklog.map((e) => [
        t.people.find((p) => p.id === e.person_id)?.name,
        e.role,
        e.date,
        e.status,
        e.login,
        e.logout,
        e.batch,
      ]),
    ]);
    add("Progress Report", [
      [
        "Student",
        "Batch",
        "Month",
        "Attendance %",
        "Overall",
        "Grade",
        "Status",
        "Ratings",
        "Strengths",
        "Needs Improvement",
        "Remarks",
      ],
      ...t.progress_reviews.map((r) => {
        const s = t.students.find((s) => s.id === r.student_id);
        return [
          s?.name,
          t.batches.find((b) => b.id === s?.batch_id)?.display_name,
          r.month,
          r.attendance,
          r.overall,
          r.grade,
          r.status,
          JSON.stringify(r.ratings),
          r.strengths,
          r.needs_improvement,
          r.remarks,
        ];
      }),
    ]);
    // Machine-readable rows allow a lossless Excel round trip without Excel cell-size overflow.
    if (req.user.role === "admin") {
      add("_DancePalace", [
        ["Format", "Version"],
        ["dance-palace", 1],
      ]);
      for (const name of TABLE_NAMES) {
        if (name === "users") continue;
        add("_dp_" + name, [
          ["Row JSON chunk", "Record", "Part"],
          ...t[name].flatMap((r, index) => {
            const text = JSON.stringify(r);
            return Array.from(
              { length: Math.ceil(text.length / 30000) },
              (_, i) => [text.slice(i * 30000, (i + 1) * 30000), index, i],
            );
          }),
        ]);
      }
    }
    res
      .attachment(`Dance-Palace-${today()}.xlsx`)
      .send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  });
  app.get("/api/export/attendance/:year", async (req, res) => {
    const data = await rows(
      "SELECT * FROM attendance WHERE year=$1 ORDER BY id",
      [Number(req.params.year)],
    );
    const wb = XLSX.utils.book_new();
    data.forEach((a, i) =>
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(a.grid),
        `${a.month.slice(0, 3)} ${a.sheet}`.slice(0, 27) + " " + i,
      ),
    );
    if (!data.length)
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["No attendance data"]]),
        "Empty",
      );
    res
      .attachment(`Attendance-${req.params.year}.xlsx`)
      .send(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  });
  app.post(
    "/api/import/excel",
    admin,
    upload.single("file"),
    async (req, res) => {
      if (!req.file) throw fail("Choose an Excel workbook");
      let wb;
      try {
        wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: false });
      } catch {
        throw fail("Cannot parse Excel workbook");
      }
      if (wb.Sheets._DancePalace) {
        const data = await backup();
        for (const name of TABLE_NAMES) {
          if (name === "users") continue;
          const sh = wb.Sheets["_dp_" + name];
          if (!sh) throw fail(`Missing backup sheet ${name}`);
          const parts = XLSX.utils.sheet_to_json(sh, { header: 1 }).slice(1),
            group = new Map();
          for (const [chunk, index, part] of parts) {
            if (!group.has(index)) group.set(index, []);
            group.get(index)[part] = chunk;
          }
          try {
            data.tables[name] = [...group.values()].map((p) =>
              JSON.parse(p.join("")),
            );
          } catch {
            throw fail("Invalid workbook backup data");
          }
        }
        await restore(data, req.user.id);
        return res.json({ ok: true, message: "Complete workbook restored" });
      }
      const mode = req.body.mode || "fees";
      let imported = 0;
      const warnings = [];
      await atomic(async (q) => {
        if (mode === "attendance") {
          const year = z.coerce
            .number()
            .int()
            .min(1900)
            .max(9999)
            .parse(req.body.year);
          const month = z.enum(MONTHS).parse(req.body.month);
          await q(
            "INSERT INTO attendance_years(year) VALUES($1) ON CONFLICT DO NOTHING",
            [year],
          );
          for (const name of wb.SheetNames) {
            if (name.toUpperCase() === "DATA") continue;
            const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
              header: 1,
              defval: "",
            });
            await q(
              "INSERT INTO attendance(year,month,sheet,grid) VALUES($1,$2,$3,$4) ON CONFLICT(year,month,sheet) DO UPDATE SET grid=$4",
              [year, month, batchName(name), JSON.stringify(grid)],
            );
            imported++;
          }
          return;
        }
        if (mode === "manager") {
          for (const name of wb.SheetNames) {
            const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
              header: 1,
              defval: "",
            });
            if (!grid.length) continue;
            if (name === "Templates") {
              for (const r of grid.slice(1))
                if (r[0])
                  await q("INSERT INTO templates(title,text) VALUES($1,$2)", [
                    String(r[0]),
                    String(r[1] || ""),
                  ]);
            } else {
              const columns = uniqueHeaders(grid[0]);
              const entries = grid
                .slice(1)
                .filter((r) => r.some(Boolean))
                .map((r) => ({
                  ...Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])),
                  _id: randomBytes(10).toString("hex"),
                }));
              await q(
                "INSERT INTO manager_tables(name,columns,rows) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET columns=$2,rows=$3",
                [name, JSON.stringify(columns), JSON.stringify(entries)],
              );
              if (name === "Student Register")
                for (const r of entries)
                  for (const k of ["BATCHES", "BATCHES 2"])
                    if (r[k] && r.NAME)
                      await ensureStudent(
                        q,
                        batchName(r[k]),
                        String(r.NAME),
                        r,
                      );
            }
            imported++;
          }
          return;
        }
        if (mode === "progress") {
          for (const name of wb.SheetNames) {
            for (const r of XLSX.utils.sheet_to_json(wb.Sheets[name])) {
              if (!r.Student || !r.Batch) continue;
              const s = await ensureStudent(q, batchName(r.Batch), r.Student);
              let ratings;
              try {
                ratings = JSON.parse(r.Ratings);
              } catch {
                const fields = Object.fromEntries(
                  Object.entries(r).map(([key, value]) => [
                    normalized(key),
                    value,
                  ]),
                );
                ratings = Object.fromEntries(
                  SKILLS.map((skill) => [
                    skill,
                    Number(fields[normalized(skill)]),
                  ]),
                );
              }
              if (
                !SKILLS.every(
                  (skill) =>
                    Number(ratings[skill]) >= 1 && Number(ratings[skill]) <= 5,
                )
              )
                throw fail(
                  `Progress row for ${r.Student}: provide ten skill columns (1–5) or a Ratings JSON column`,
                );
              const reviewMonth =
                typeof r.Month === "number"
                  ? excelDate(r.Month).slice(0, 7)
                  : String(r.Month);
              if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reviewMonth))
                throw fail(
                  `Progress row for ${r.Student}: Month must use YYYY-MM`,
                );
              const attendance = Number(r["Attendance %"] || 0);
              if (
                attendance < 0 ||
                attendance > 100 ||
                !Number.isFinite(attendance)
              )
                throw fail("Attendance must be between 0 and 100");
              const score = scoreReview(ratings);
              await q(
                "INSERT INTO progress_reviews(student_id,month,attendance,ratings,overall,grade,status,strengths,needs_improvement,remarks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(student_id,month) DO UPDATE SET attendance=$3,ratings=$4,overall=$5,grade=$6,status=$7,strengths=$8,needs_improvement=$9,remarks=$10",
                [
                  s.id,
                  reviewMonth,
                  attendance,
                  JSON.stringify(ratings),
                  score.overall,
                  score.grade,
                  score.status,
                  r.Strengths || "",
                  r["Needs Improvement"] || "",
                  r.Remarks || "",
                ],
              );
              imported++;
            }
          }
          return;
        }
        for (const name of wb.SheetNames) {
          const mapped = batchName(name);
          if (BATCHES.includes(mapped)) {
            const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], {
              header: 1,
              defval: "",
            });
            for (const r of grid.slice(2))
              if (r[1] && Number(r[0]))
                await ensureStudent(q, mapped, String(r[1]));
          }
        }
        const txName = wb.SheetNames.find((n) =>
          /transaction|dashboard/i.test(n),
        );
        if (!txName)
          throw fail(
            "No Transactions sheet found. Choose the correct workbook type.",
          );
        const txGrid = tableGrid(wb.Sheets[txName], "id");
        const txColumns = uniqueHeaders(txGrid[0] || []);
        const txRows = txGrid
          .slice(1)
          .map((r) =>
            Object.fromEntries(txColumns.map((c, i) => [c, r[i] ?? ""])),
          );
        if (wb.Sheets.Setup) {
          const grid = tableGrid(wb.Sheets.Setup);
          await q(
            "INSERT INTO setup(key,value) VALUES('original_setup',$1) ON CONFLICT(key) DO UPDATE SET value=$1",
            [JSON.stringify(grid)],
          );
          const aliases = {
            category: "categories",
            categories: "categories",
            transactiontype: "types",
            types: "types",
            paymentmode: "payment_modes",
            paymentmodes: "payment_modes",
            status: "statuses",
            statuses: "statuses",
            batch: "batches",
            batches: "batches",
            recordedby: "recorded_by",
            amount: "amounts",
            amounts: "amounts",
            month: "months",
            months: "months",
            studentsmaster: "students_master",
          };
          for (const [index, heading] of (grid[0] || []).entries()) {
            const key = aliases[normalized(heading)];
            if (key) {
              const values = grid
                .slice(1)
                .map((r) => r[index])
                .filter((v) => v !== undefined && v !== "");
              await q(
                "INSERT INTO setup(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2",
                [key, JSON.stringify(values)],
              );
            }
          }
        }
        for (const [index, r] of txRows.entries()) {
          const lookup = Object.fromEntries(
            Object.entries(r).map(([k, v]) => [normalized(k), v]),
          );
          const get = (...names) =>
            names
              .map((n) => lookup[normalized(n)])
              .find((v) => v !== undefined && v !== "");
          const t = {};
          for (const [k, h] of Object.entries(TX_HEADERS)) t[k] = get(h, k);
          if (!t.id && !t.student_name) continue;
          t.id = String(t.id || `IMPORT-${index + 1}`);
          t.date = excelDate(t.date);
          t.type = t.type || "Income";
          t.category = t.category || "Monthly Fees";
          t.batch_display = batchName(t.batch_display || get("Batch"));
          t.student_name = String(
            t.student_name || get("Student") || "",
          ).trim();
          for (const k of [
            "actual_amount",
            "discounts",
            "balance",
            "over_paid",
            "amount",
          ])
            t[k] = Number(String(t[k] || 0).replace(/[,₹]/g, ""));
          t.payment_mode = t.payment_mode || "Cash";
          t.recorded_by = t.recorded_by || req.user.username;
          t.description = String(t.description || "");
          t.drive_receipt = String(t.drive_receipt || "");
          // Historical amount inference is restricted to monthly plans.
          if (
            ["Monthly Fees", "3 Month Fees", "6 Month Fees"].includes(
              t.category,
            )
          ) {
            const inferred = {
              1360: "Monthly Fees",
              3780: "3 Month Fees",
              6540: "6 Month Fees",
            }[t.actual_amount];
            if (inferred && inferred !== t.category) {
              warnings.push(
                `${t.id}: normalized ${t.category} to ${inferred} from Actual Amount`,
              );
              t.category = inferred;
            }
          }
          t.legacy_months = Array.from(
            { length: 6 },
            (_, i) => get(i === 0 ? "Month" : `Month${i + 1}`) || "",
          );
          const start = String(get("Month", "Month1", "Fee Month") || "");
          const m = MONTHS.find((m) =>
            m.toLowerCase().startsWith(start.slice(0, 3).toLowerCase()),
          );
          if (!start || !m)
            throw fail(
              `Transaction ${t.id}: missing or invalid starting fee month`,
            );
          t.fee_months = monthRun(
            m,
            Number(t.date.slice(0, 4)),
            countMonths(t.category),
          );
          const existing = (
            await q("SELECT id FROM transactions WHERE id=$1", [t.id])
          ).rows[0];
          await saveTransaction(transactionSchema.parse(t), existing?.id, q);
          imported++;
        }
        await reconcile(q);
      });
      res.json({
        ok: true,
        message: `Imported ${imported} records/sheets`,
        warnings,
      });
    },
  );
}
