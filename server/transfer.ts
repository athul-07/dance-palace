import ExcelJS from "exceljs";
import { rows, type DB } from "./db.js";
import {
  allTransactions,
  reconcile,
  saveTransaction,
  syncStudent,
} from "./fees.js";
import { MONTHS, assessment, MANAGER_COLUMNS } from "../shared/rules.js";
import { fail, reviewSchema } from "./validation.js";
const TABLES = [
  "users",
  "batches",
  "students",
  "transactions",
  "transaction_months",
  "fee_cells",
  "setup",
  "manager_tables",
  "manager_rows",
  "templates",
  "attendance_years",
  "attendance_sheets",
  "worklog_people",
  "worklog_entries",
  "progress_reviews",
  "import_sources",
  "health_checks",
];
export async function exportBackup(q: DB) {
  const tables: Record<string, any[]> = {};
  for (const table of TABLES)
    tables[table] = await rows(q, `SELECT * FROM ${table}`);
  return {
    format: "dance-palace",
    version: 1,
    exported_at: new Date().toISOString(),
    tables,
  };
}
export async function importBackup(q: DB, backup: any, user: any) {
  if (
    backup?.format !== "dance-palace" ||
    backup.version !== 1 ||
    !backup.tables
  )
    fail("Not a Dance Palace v1 backup");
  for (const table of TABLES)
    if (!Array.isArray(backup.tables[table])) fail(`Missing table ${table}`);
  if (!backup.tables.users.some((u: any) => u.role === "admin"))
    fail("Backup needs at least one admin");
  if (
    !backup.tables.users.some(
      (u: any) =>
        u.id === user.id && u.username === user.username && u.role === "admin",
    )
  )
    fail("Backup must retain the signed-in admin account");
  for (const table of [...TABLES].reverse())
    await q.query(`DELETE FROM ${table}`);
  for (const table of TABLES) {
    const columns = await rows(
      q,
      "SELECT column_name,data_type,is_identity FROM information_schema.columns WHERE table_schema='dance_palace' AND table_name=$1",
      [table],
    );
    const names = columns.map((c) => c.column_name);
    for (const item of backup.tables[table]) {
      if (!item || typeof item !== "object") fail("Invalid backup row");
      const keys = Object.keys(item);
      if (keys.some((k) => !names.includes(k)))
        fail(`Unknown column in ${table}`);
      if (!keys.length) continue;
      const params = keys.map((k) =>
        columns.find((c) => c.column_name === k)?.data_type === "jsonb"
          ? JSON.stringify(item[k])
          : item[k],
      );
      await q.query(
        `INSERT INTO ${table}(${keys.map((k) => `"${k}"`).join(",")}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(",")})`,
        params,
      );
    }
    const sequence = columns.some(
      (c) => c.column_name === "id" && c.is_identity === "YES",
    )
      ? (
          await rows(q, "SELECT pg_get_serial_sequence($1,'id') AS seq", [
            `dance_palace.${table}`,
          ])
        )[0]?.seq
      : null;
    if (sequence)
      await q.query(
        `SELECT setval($1,coalesce((SELECT max(id) FROM ${table}),1),EXISTS(SELECT 1 FROM ${table}))`,
        [sequence],
      );
  }
  await q.query("UPDATE users SET token_version=token_version+1");
  await reconcile(q);
  return { ok: true, message: "Backup restored. Sign in again." };
}
function addSheet(wb: ExcelJS.Workbook, name: string, grid: any[][]) {
  let clean = name.replace(/[\[\]*?:/\\]/g, " ").slice(0, 31) || "Sheet";
  let n = 1;
  while (wb.getWorksheet(clean)) clean = name.slice(0, 26) + " " + n++;
  const ws = wb.addWorksheet(clean);
  for (const row of grid)
    ws.addRow(
      row.map((v) =>
        v === undefined
          ? null
          : typeof v === "object" && v !== null
            ? JSON.stringify(v)
            : v,
      ),
    );
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F6F6A" },
  };
  ws.columns.forEach((c) => (c.width = 20));
  return ws;
}
export async function exportExcel(q: DB, attendanceYear?: number) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dance Palace";
  wb.created = new Date();
  if (attendanceYear) {
    for (const s of await rows(
      q,
      "SELECT * FROM attendance_sheets WHERE year=$1 ORDER BY month,id",
      [attendanceYear],
    ))
      addSheet(
        wb,
        `${MONTHS[s.month - 1].slice(0, 3)} ${s.sheet_name}`,
        s.grid,
      );
  } else {
    const ts = await allTransactions(q);
    const keys = [
      "date",
      "id",
      "type",
      "category",
      "batch_display",
      "student_name",
      "actual_amount",
      "discounts",
      "balance",
      "payment_mode",
      "over_paid",
      "amount",
      "status",
      "recorded_by",
      "description",
      "channel",
      "net_effect",
      "drive_receipt",
    ];
    addSheet(wb, "Transactions", [
      [
        "Date",
        "ID",
        "Type",
        "Category",
        "Batch/Department",
        "Student Name",
        "Actual Amount",
        "Discounts",
        "Balance",
        "Payment Mode",
        "Over Paid",
        "Amount",
        "Status",
        "Recorded By",
        "Description",
        "Channel",
        "Net Effect",
        "Drive Receipt",
        "Month",
        "Month2",
        "Month3",
        "Month4",
        "Month5",
        "Month6",
        "Fee Months JSON",
      ],
      ...ts.map((t) => [
        ...keys.map((k) => t[k]),
        ...Array.from({ length: 6 }, (_, i) =>
          t.fee_months[i] ? MONTHS[t.fee_months[i].month - 1] : "",
        ),
        JSON.stringify(t.fee_months),
      ]),
    ]);
    for (const b of await rows(q, "SELECT * FROM batches ORDER BY id")) {
      const students = await rows(
        q,
        "SELECT * FROM students WHERE batch_id=$1 ORDER BY sl_no",
        [b.id],
      );
      const cells = await rows(
        q,
        "SELECT f.* FROM fee_cells f JOIN students s ON s.id=f.student_id WHERE s.batch_id=$1",
        [b.id],
      );
      const years = [
        ...new Set<number>([2026, ...cells.map((c) => c.year)]),
      ].sort();
      const slots = years.flatMap((y) =>
        (y === 2026
          ? [
              ...new Set<number>([
                ...b.month_order,
                ...cells.filter((c) => c.year === y).map((c) => c.month),
              ]),
            ].sort((a, b) => a - b)
          : Array.from({ length: 12 }, (_, i) => i + 1)
        ).map((m) => ({ year: y, month: m })),
      );
      addSheet(wb, b.sheet_name, [
        [
          "SL",
          "Name",
          ...slots.flatMap((m) => [
            `${MONTHS[m.month - 1]} ${m.year}`,
            "",
            "",
            "",
          ]),
        ],
        ["", "", ...slots.flatMap(() => ["PLAN", "AMOUNT", "C-G", "P-D"])],
        ...students.map((s) => [
          s.sl_no,
          s.name,
          ...slots.flatMap((m) => {
            const c = cells.find(
              (c) =>
                c.student_id === s.id &&
                c.year === m.year &&
                c.month === m.month,
            );
            return [
              c?.plan || "",
              c?.amount || 0,
              c?.cg || "",
              c?.status || "DUE",
            ];
          }),
        ]),
      ]);
    }
    addSheet(wb, "Setup", [
      ["Key", "Values JSON"],
      ...(await rows(q, "SELECT * FROM setup")).map((s) => [
        s.key,
        JSON.stringify(s.values),
      ]),
    ]);
    for (const table of await rows(q, "SELECT * FROM manager_tables"))
      addSheet(wb, table.name, [
        table.columns,
        ...(
          await rows(
            q,
            "SELECT * FROM manager_rows WHERE table_name=$1 ORDER BY id",
            [table.name],
          )
        ).map((r) => table.columns.map((k: string) => r.data[k] ?? "")),
      ]);
    addSheet(wb, "Templates", [
      ["Title", "Text"],
      ...(await rows(q, "SELECT * FROM templates")).map((t) => [
        t.title,
        t.text,
      ]),
    ]);
    const reviews = await rows(
      q,
      "SELECT r.*,s.name student,b.display_name batch FROM progress_reviews r JOIN students s ON s.id=r.student_id JOIN batches b ON b.id=s.batch_id",
    );
    const reviewKeys = [
      "student",
      "batch",
      "month",
      "attendance",
      "ratings",
      "overall",
      "grade",
      "status",
      "strengths",
      "needs_improvement",
      "remarks",
    ];
    addSheet(wb, "Progress Report", [
      reviewKeys,
      ...reviews.map((r) => reviewKeys.map((k) => r[k])),
    ]);
    for (const table of ["worklog_people", "worklog_entries"]) {
      const rr = await rows(q, `SELECT * FROM ${table}`);
      addSheet(wb, table, [
        rr.length ? Object.keys(rr[0]) : ["id"],
        ...rr.map((r) => Object.values(r)),
      ]);
    }
    // A full structured payload makes our Excel export lossless on re-import, including attendance.
    const backup = JSON.stringify(await exportBackup(q));
    const ws = addSheet(wb, "_DancePalaceBackup", [
      ["JSON chunks"],
      ...Array.from({ length: Math.ceil(backup.length / 30000) }, (_, i) => [
        backup.slice(i * 30000, (i + 1) * 30000),
      ]),
    ]);
    ws.state = "veryHidden";
    // Password hashes stay exclusive to admin-only JSON backups, never in staff Excel exports.
    const safe = JSON.parse(backup);
    safe.tables.users = [];
    const text = JSON.stringify(safe);
    ws.spliceRows(
      2,
      ws.rowCount - 1,
      ...Array.from({ length: Math.ceil(text.length / 30000) }, (_, i) => [
        text.slice(i * 30000, (i + 1) * 30000),
      ]),
    );
  }
  if (!wb.worksheets.length) addSheet(wb, "Empty", [["No records"]]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
function cellValue(cell: ExcelJS.Cell): any {
  const v: any = cell.value;
  if (v === null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) {
      if (v.result === undefined)
        fail(
          `Formula ${cell.address} has no cached value. Open and save the source workbook with cached results before importing.`,
        );
      return v.result instanceof Date
        ? v.result.toISOString().slice(0, 10)
        : v.result;
    }
    if (v.richText) return v.richText.map((x: any) => x.text).join("");
    if (v.text) return v.text;
  }
  return v;
}
function excelDate(v: any) {
  if (typeof v === "number")
    return new Date(Math.round((v - 25569) * 86400000))
      .toISOString()
      .slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) fail(`Unrecognized date: ${v}`);
  return d.toISOString().slice(0, 10);
}
export async function importExcel(
  q: DB,
  buffer: Buffer,
  filename: string,
  options: any = {},
) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const saved = wb.getWorksheet("_DancePalaceBackup");
  if (saved) {
    const payload = JSON.parse(
      saved
        .getRows(2, saved.rowCount - 1)!
        .map((r) => String(r.getCell(1).value || ""))
        .join(""),
    );
    payload.tables.users = await rows(q, "SELECT * FROM users");
    const admin = payload.tables.users.find((u: any) => u.role === "admin");
    return importBackup(q, payload, admin);
  }
  const sheets: Record<string, any[][]> = {};
  for (const ws of wb.worksheets) {
    if (ws.name === "DATA") continue;
    const grid: any[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const rr: any[] = [];
      for (let c = 1; c <= ws.columnCount; c++)
        rr.push(cellValue(row.getCell(c)));
      grid.push(rr);
    });
    sheets[ws.name] = grid;
  }
  let imported = 0;
  const warnings: string[] = [];
  for (const [name, grid] of Object.entries(sheets)) {
    if (options.kind === "attendance") {
      const year = Number(options.year),
        month = Number(options.month);
      if (
        !Number.isInteger(year) ||
        year < 1000 ||
        year > 9999 ||
        month < 1 ||
        month > 12
      )
        fail("Attendance import requires year and month");
      const b = (
        await rows(
          q,
          "SELECT * FROM batches WHERE sheet_name=$1 OR display_name=$1",
          [name.replace(/\s*\(\d+\)$/, "")],
        )
      )[0];
      if (b?.is_event) continue;
      await q.query(
        "INSERT INTO attendance_years(year) VALUES($1) ON CONFLICT DO NOTHING",
        [year],
      );
      await q.query(
        "INSERT INTO attendance_sheets(year,month,sheet_name,batch_id,grid) VALUES($1,$2,$3,$4,$5) ON CONFLICT(year,month,sheet_name) DO UPDATE SET grid=EXCLUDED.grid,batch_id=EXCLUDED.batch_id",
        [
          year,
          month,
          b?.display_name || name,
          b?.id || null,
          JSON.stringify(grid),
        ],
      );
      imported++;
      continue;
    }
    const headerIndex = grid.findIndex(
      (r) =>
        r.some((c) => /^id$/i.test(String(c))) &&
        r.some((c) => /^type$/i.test(String(c))),
    );
    if (headerIndex >= 0 && /transaction|daily/i.test(name)) {
      const headers = grid[headerIndex].map((v) =>
        String(v)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
      );
      for (const row of grid.slice(headerIndex + 1)) {
        const get = (...names: string[]) =>
          row[headers.findIndex((h) => names.includes(h))];
        if (!get("id")) continue;
        const monthValues = [
          "month",
          "month2",
          "month3",
          "month4",
          "month5",
          "month6",
        ]
          .map((k) => get(k))
          .filter(Boolean);
        let fm: any[] = [];
        try {
          fm = JSON.parse(get("feemonthsjson") || "[]");
        } catch {}
        if (!fm.length) {
          const first = monthValues[0];
          const month =
            typeof first === "number"
              ? first
              : MONTHS.findIndex((m) =>
                  m
                    .toLowerCase()
                    .startsWith(String(first).slice(0, 3).toLowerCase()),
                ) + 1;
          if (!month)
            fail(`Transaction ${get("id")} is missing a valid fee month`);
          fm = [{ month, year: Number(excelDate(get("date")).slice(0, 4)) }];
        }
        const batchName = String(
          get("batchdepartment", "batchdept", "batch") || "",
        ).replace(/\s*\(\d+\)$/, "");
        const batch = (
          await rows(
            q,
            "SELECT * FROM batches WHERE sheet_name=$1 OR display_name=$1",
            [batchName],
          )
        )[0];
        const id = String(get("id"));
        const exists = (
          await rows(q, "SELECT id FROM transactions WHERE id=$1", [id])
        ).length;
        await saveTransaction(
          q,
          {
            id,
            date: excelDate(get("date")),
            type: get("type") || "Income",
            category: get("category") || "",
            batch_display: batch?.display_name || batchName,
            student_name: String(get("studentname", "student") || ""),
            actual_amount: Number(get("actualamount") || 0),
            discounts: Number(get("discounts") || 0),
            balance: Number(get("balance") || 0),
            payment_mode: get("paymentmode") || "Cash",
            over_paid: Number(get("overpaid") || 0),
            amount: Number(get("amount") || 0),
            recorded_by: String(get("recordedby") || "admin"),
            status: get("status"),
            description: String(get("description") || ""),
            drive_receipt: String(get("drivereceipt") || ""),
            fee_months: fm,
          },
          exists ? id : undefined,
          true,
        );
        imported++;
      }
      continue;
    }
    if (name in MANAGER_COLUMNS) {
      const headers = grid[0].map((v, i, a) => {
        const s = String(v || `Column ${i + 1}`);
        return a.slice(0, i).includes(v)
          ? `${s} ${a.slice(0, i).filter((x) => x === v).length + 1}`
          : s;
      });
      await q.query("UPDATE manager_tables SET columns=$1 WHERE name=$2", [
        JSON.stringify(headers),
        name,
      ]);
      await q.query("DELETE FROM manager_rows WHERE table_name=$1", [name]);
      for (const row of grid.slice(1).filter((r) => r.some(Boolean))) {
        const data = Object.fromEntries(
          headers.map((h, i) => [h, row[i] ?? ""]),
        );
        await q.query(
          "INSERT INTO manager_rows(table_name,data) VALUES($1,$2)",
          [name, JSON.stringify(data)],
        );
        if (name === "Student Register") {
          const student = String(data.NAME || data.Name || "");
          for (const [k, v] of Object.entries(data))
            if (/^batch/i.test(k) && v && student) {
              const b = (
                await rows(
                  q,
                  "SELECT * FROM batches WHERE (display_name=$1 OR sheet_name=$1) AND NOT is_event",
                  [String(v).replace(/\s*\(\d+\)$/, "")],
                )
              )[0];
              if (b) await syncStudent(q, b.id, student, data);
            }
        }
        imported++;
      }
      continue;
    }
    if (name === "Templates") {
      for (const r of grid.slice(1))
        if (r[0])
          await q.query(
            "INSERT INTO templates(title,text) VALUES($1,$2) ON CONFLICT(title) DO UPDATE SET text=EXCLUDED.text",
            [String(r[0]), String(r[1] || "")],
          );
      continue;
    }
    if (name === "Setup" && grid[0]?.[0] === "Key") {
      for (const r of grid.slice(1))
        if (r[0])
          await q.query(
            "INSERT INTO setup(key,values) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET values=EXCLUDED.values",
            [r[0], JSON.stringify(JSON.parse(r[1]))],
          );
      continue;
    }
    if (/progress|review/i.test(name)) {
      const headers = grid[0].map((v) => String(v).toLowerCase());
      if (headers.includes("ratings")) {
        for (const r of grid.slice(1)) {
          const v = Object.fromEntries(headers.map((h, i) => [h, r[i]]));
          const b = (
            await rows(
              q,
              "SELECT * FROM batches WHERE display_name=$1 AND NOT is_event",
              [v.batch],
            )
          )[0];
          if (!b) continue;
          const s = await syncStudent(q, b.id, String(v.student));
          const review = reviewSchema.parse({
            ...v,
            student_id: s.id,
            ratings:
              typeof v.ratings === "string" ? JSON.parse(v.ratings) : v.ratings,
          });
          const a = assessment(review.ratings);
          await q.query(
            "INSERT INTO progress_reviews(student_id,month,attendance,ratings,overall,grade,status,strengths,needs_improvement,remarks) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(student_id,month) DO UPDATE SET ratings=EXCLUDED.ratings,overall=EXCLUDED.overall,grade=EXCLUDED.grade,status=EXCLUDED.status,attendance=EXCLUDED.attendance,strengths=EXCLUDED.strengths,needs_improvement=EXCLUDED.needs_improvement,remarks=EXCLUDED.remarks",
            [
              s.id,
              review.month,
              review.attendance,
              JSON.stringify(review.ratings),
              a.overall,
              a.grade,
              a.status,
              review.strengths,
              review.needs_improvement,
              review.remarks,
            ],
          );
          imported++;
        }
        continue;
      }
    }
    const b = (
      await rows(
        q,
        "SELECT * FROM batches WHERE sheet_name=$1 OR display_name=$1",
        [name.replace(/\s*\(\d+\)$/, "")],
      )
    )[0];
    if (b) {
      const hi = grid.findIndex((r) =>
        r.some((c) => /^name|student name$/i.test(String(c))),
      );
      if (hi >= 0) {
        const ni = grid[hi].findIndex((c) =>
          /^name|student name$/i.test(String(c)),
        );
        for (const r of grid.slice(hi + 1)) {
          if (!r[ni] || /^(name|total)$/i.test(String(r[ni]))) continue;
          await syncStudent(q, b.id, String(r[ni]));
          imported++;
        }
      }
      continue;
    }
    warnings.push(
      `Preserved unrecognized sheet "${name}" in source archive; no records inferred.`,
    );
  }
  await q.query("INSERT INTO import_sources(filename,sheets) VALUES($1,$2)", [
    filename,
    JSON.stringify(sheets),
  ]);
  await reconcile(q);
  return { ok: true, imported, warnings };
}
