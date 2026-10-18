import {
  MONTHS,
  BATCHES,
  SHEETS,
  PRICES,
  TABLES,
  monthRun,
  countMonths,
  transactionStatus,
} from "../shared/domain.js";
import { atomic, query, rows } from "./db.js";
import { config } from './config.js';
import { authEmailForUsername, getSupabaseAdmin } from "./supabase.js";
export const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export async function ensureStudent(q, batch, name, fields = {}) {
  const b = (await q("SELECT * FROM batches WHERE display_name=$1", [batch]))
    .rows[0];
  if (!b) throw fail("Unknown batch");
  const student = (
    await q(
      `INSERT INTO students(batch_id,sl_no,name,register_fields) VALUES($1,(SELECT COALESCE(MAX(sl_no),0)+1 FROM students WHERE batch_id=$1),$2,$3) ON CONFLICT(batch_id,name) DO UPDATE SET last_activity_at=NOW(),register_fields=students.register_fields || EXCLUDED.register_fields RETURNING *`,
      [b.id, name.trim(), JSON.stringify(fields)],
    )
  ).rows[0];
  const sheets = (
    await q("SELECT * FROM attendance WHERE sheet=$1 OR sheet=$2", [
      batch,
      b.sheet_name,
    ])
  ).rows;
  for (const a of sheets) {
    if (
      !a.grid.some(
        (r) => String(r[1]).toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      a.grid.push([student.sl_no, name, ...Array(31).fill(false)]);
      await q("UPDATE attendance SET grid=$1 WHERE id=$2", [
        JSON.stringify(a.grid),
        a.id,
      ]);
    }
  }
  return student;
}
export async function reconcile(q) {
  await q("UPDATE fee_cells SET status='DUE',amount=0,plan='',cg=''");
  const tx = (
    await q(
      "SELECT * FROM transactions WHERE type='Income' AND status!='Cancelled' ORDER BY created_at,id",
    )
  ).rows;
  for (const t of tx) {
    const s = (
      await q(
        "SELECT s.id FROM students s JOIN batches b ON b.id=s.batch_id WHERE b.display_name=$1 AND s.name=$2",
        [t.batch_display, t.student_name],
      )
    ).rows[0];
    if (!s) continue;
    for (const fm of t.fee_months) {
      // A matrix edit is stored on the source transaction's allocation. This
      // preserves the receipt and its cash amount while correcting the register.
      if (fm.cell_status === "DUE") continue;
      await q(
        `INSERT INTO fee_cells(student_id,year,month,status,amount,plan,cg) VALUES($1,$2,$3,'PAID',$4,$5,$6) ON CONFLICT(student_id,year,month) DO UPDATE SET status='PAID',amount=CASE WHEN fee_cells.status='PAID' THEN fee_cells.amount+EXCLUDED.amount ELSE EXCLUDED.amount END,plan=EXCLUDED.plan,cg=EXCLUDED.cg`,
        [
          s.id,
          fm.year,
          fm.month,
          fm.cell_amount ?? Number(t.amount) / t.fee_months.length,
          fm.cell_plan ??
            (t.id.startsWith("CELL-")
              ? t.description.split("Plan: ")[1] || t.category
              : t.category),
          fm.cell_cg ?? (t.payment_mode === "Cash" ? "C" : "G"),
        ],
      );
    }
  }
}
export async function saveTransaction(t, oldId = null, qOverride = null) {
  const work = async (q) => {
    if (oldId) {
      const old = (await q("SELECT * FROM transactions WHERE id=$1", [oldId]))
        .rows[0];
      if (!old) throw fail("Transaction not found", 404);
      await q("DELETE FROM transactions WHERE id=$1", [oldId]);
      await q(
        "UPDATE students SET last_activity_at=NOW() WHERE name=$1 AND batch_id=(SELECT id FROM batches WHERE display_name=$2)",
        [old.student_name, old.batch_display],
      );
    }
    t.status = transactionStatus(t.balance);
    t.channel = t.payment_mode === "Cash" ? "Cash" : "Digital";
    t.net_effect = t.type === "Income" ? t.amount : -t.amount;
    t.fee_months = monthRun(
      t.fee_months[0].month,
      Number(t.date.slice(0, 4)),
      countMonths(t.category),
    );
    t.legacy_months = t.legacy_months || t.fee_months.map((fm) => fm.month);
    const keys = [
      "id",
      "date",
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
      "fee_months",
      "legacy_months",
    ];
    await q(
      `INSERT INTO transactions(${keys.join(",")}) VALUES(${keys.map((_, i) => "$" + (i + 1)).join(",")})`,
      keys.map((k) =>
        ["fee_months", "legacy_months"].includes(k)
          ? JSON.stringify(t[k])
          : (t[k] ?? ""),
      ),
    );
    if (t.type === "Income")
      await ensureStudent(q, t.batch_display, t.student_name);
    await reconcile(q);
    return t;
  };
  return qOverride ? work(qOverride) : atomic(work);
}
export function blankGrid(students, year, month) {
  const m = MONTHS.indexOf(month);
  return [
    [
      "SL",
      "Name",
      ...Array.from({ length: 31 }, (_, i) =>
        new Date(Date.UTC(year, m, i + 1)).toLocaleDateString("en", {
          weekday: "short",
          timeZone: "UTC",
        }),
      ),
    ],
    ["", "", ...Array.from({ length: 31 }, (_, i) => i + 1)],
    ...students.map((s) => [s.sl_no, s.name, ...Array(31).fill(false)]),
  ];
}
export async function seed() {
  if (!(await rows("SELECT id FROM users LIMIT 1")).length) {
    if (
      !config.bootstrapAdminUsername ||
      !config.bootstrapAdminPassword ||
      config.bootstrapAdminPassword.length < 6
    )
      throw new Error(
        "Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD (at least 6 characters) before initializing an empty database.",
      );
    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email: authEmailForUsername(config.bootstrapAdminUsername),
      password: config.bootstrapAdminPassword,
      email_confirm: true,
    });
    if (error) throw new Error(`Could not create bootstrap Supabase user: ${error.message}`);
    try {
      await query(
        "INSERT INTO users(username,role,supabase_user_id) VALUES($1,$2,$3)",
        [config.bootstrapAdminUsername.toLowerCase(), "admin", data.user.id],
      );
    } catch (error) {
      const { error: cleanupError } = await getSupabaseAdmin().auth.admin.deleteUser(data.user.id);
      if (cleanupError)
        console.error("Could not remove bootstrap Supabase user after database insert failed:", cleanupError.message);
      throw error;
    }
  }
  for (const name of BATCHES)
    await query(
      "INSERT INTO batches(sheet_name,display_name,is_event) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [
        SHEETS[name] || name,
        name,
        ["Onam Fees", "Palace Night"].includes(name),
      ],
    );
  for (const [name, cols] of Object.entries(TABLES))
    await query(
      "INSERT INTO manager_tables(name,columns) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [name, JSON.stringify(cols)],
    );
  const setup = {
    categories: Object.keys(PRICES),
    types: ["Income", "Expense"],
    payment_modes: ["Cash", "GPay", "Bank Transfer", "Card"],
    statuses: ["Completed", "Pending", "Cancelled"],
    batches: BATCHES,
    recorded_by: ["Admin"],
    amounts: Object.values(PRICES),
    months: MONTHS,
    students_master: [],
  };
  for (const [key, value] of Object.entries(setup))
    await query(
      "INSERT INTO setup(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [key, JSON.stringify(value)],
    );
  if (!(await rows("SELECT id FROM templates LIMIT 1")).length)
    for (const [title, text] of Object.entries({
      "Fees Receipt":
        "Dear {name}, we have received ₹{amount} for {month}. Thank you for being part of Dance Palace.",
      "Fees Due":
        "Dear {name}, your fees for {month} are due. Kindly complete your payment.",
      "Fees Due & Reduced Classes":
        "Dear {name}, please clear your pending fees. Contact us about the adjusted class schedule.",
      "Admission Cancelled":
        "Dear {name}, your admission has been cancelled as requested. We hope to dance together again.",
      "Leave Reply":
        "Thank you for informing us. Your leave has been noted. See you in class!",
    }))
      await query("INSERT INTO templates(title,text) VALUES($1,$2)", [
        title,
        text,
      ]);
  await query(
    "INSERT INTO attendance_years(year) VALUES(2026) ON CONFLICT DO NOTHING",
  );
  if (
    config.seedDemo &&
    !(await rows("SELECT key FROM setup WHERE key='demo_seeded'")).length
  ) {
    await atomic(async (q) => {
      for (const [i, name] of [
        "Ananya S",
        "Diya Krishna",
        "Meera Nair",
        "Arjun R",
        "Devika S",
        "Aarav P",
        "Nila Raj",
        "Ishaan K",
      ].entries())
        await ensureStudent(q, BATCHES[i % 4], name);
    });
    for (let i = 0; i < 8; i++) {
      const s = (
        await rows(
          "SELECT s.*,b.display_name FROM students s JOIN batches b ON b.id=s.batch_id ORDER BY s.id",
        )
      )[i];
      await saveTransaction({
        id: `DP-${String(i + 1).padStart(2, "0")}`,
        date: `2026-10-${String(i + 1).padStart(2, "0")}`,
        type: "Income",
        category: "Monthly Fees",
        batch_display: s.display_name,
        student_name: s.name,
        actual_amount: 1360,
        discounts: 0,
        balance: i === 2 ? 360 : 0,
        payment_mode: i % 2 ? "GPay" : "Cash",
        over_paid: 0,
        amount: 1360,
        recorded_by: "Admin",
        description: "Sample data",
        fee_months: [{ month: "October", year: 2026 }],
      });
    }
    await query(
      "INSERT INTO people(name,role) VALUES('Reception Manager','manager'),('Dance Faculty','faculty') ON CONFLICT DO NOTHING",
    );
    await query("INSERT INTO setup(key,value) VALUES('demo_seeded','true')");
  }
  if (!(await rows("SELECT id FROM attendance LIMIT 1")).length) {
    for (const month of [
      "January",
      "February",
      "March",
      "April",
      "May",
      "July",
      "August",
      "September",
    ])
      for (const b of await rows("SELECT * FROM batches WHERE NOT is_event")) {
        const s = await rows(
          "SELECT * FROM students WHERE batch_id=$1 ORDER BY sl_no",
          [b.id],
        );
        await query(
          "INSERT INTO attendance(year,month,sheet,grid) VALUES(2026,$1,$2,$3)",
          [month, b.display_name, JSON.stringify(blankGrid(s, 2026, month))],
        );
      }
  }
}
