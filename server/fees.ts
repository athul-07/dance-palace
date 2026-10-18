import { randomUUID } from "node:crypto";
import { rows, type DB } from "./db.js";
import {
  countMonths,
  runMonths,
  statusFor,
  MONTHS,
  carryForward,
  indiaNow,
} from "../shared/rules.js";
import { transactionSchema, fail } from "./validation.js";
export async function syncStudent(
  q: DB,
  batchId: number,
  name: string,
  fields: any = {},
) {
  const existing = (
    await rows(
      q,
      "SELECT * FROM students WHERE batch_id=$1 AND lower(trim(name))=lower(trim($2))",
      [batchId, name],
    )
  )[0];
  const student = existing
    ? (
        await rows(
          q,
          "UPDATE students SET last_activity_at=clock_timestamp(),register_fields=register_fields || $2::jsonb WHERE id=$1 RETURNING *",
          [existing.id, JSON.stringify(fields)],
        )
      )[0]
    : (
        await rows(
          q,
          "INSERT INTO students(batch_id,sl_no,name,register_fields) SELECT $1,coalesce(max(sl_no),0)+1,$2,$3::jsonb FROM students WHERE batch_id=$1 RETURNING *",
          [batchId, name.trim(), JSON.stringify(fields)],
        )
      )[0];
  for (const sheet of await rows(
    q,
    "SELECT * FROM attendance_sheets WHERE batch_id=$1 FOR UPDATE",
    [batchId],
  )) {
    if (
      !sheet.grid
        .slice(2)
        .some(
          (r: any[]) =>
            String(r[1]).trim().toLowerCase() === name.trim().toLowerCase(),
        )
    ) {
      sheet.grid.push([student.sl_no, student.name, ...Array(31).fill(false)]);
      await q.query("UPDATE attendance_sheets SET grid=$1 WHERE id=$2", [
        JSON.stringify(sheet.grid),
        sheet.id,
      ]);
    }
  }
  return student;
}
export async function allTransactions(q: DB) {
  return rows(
    q,
    `SELECT t.*,coalesce((SELECT jsonb_agg(jsonb_build_object('year',m.year,'month',m.month) ORDER BY m.position) FROM transaction_months m WHERE m.transaction_id=t.id),'[]'::jsonb) fee_months FROM transactions t ORDER BY created_at DESC,id DESC`,
  );
}
export async function reconcile(q: DB) {
  // Normally students already exist from transaction/register writes. Repair
  // imported rosters first, then rebuild all payments in one database operation.
  const missing = await rows(
    q,
    `
    SELECT DISTINCT ON (b.id,lower(trim(t.student_name))) b.id batch_id,t.student_name
    FROM transactions t JOIN batches b ON b.display_name=t.batch_display
    LEFT JOIN students s ON s.batch_id=b.id AND lower(trim(s.name))=lower(trim(t.student_name))
    WHERE t.type='Income' AND t.status<>'Cancelled' AND s.id IS NULL
    ORDER BY b.id,lower(trim(t.student_name)),t.created_at DESC`,
  );
  for (const student of missing)
    await syncStudent(q, student.batch_id, student.student_name);
  await q.query("UPDATE fee_cells SET status='DUE',amount=0,plan='',cg=NULL");
  await q.query(`WITH linked AS (
    SELECT s.id student_id,m.year,m.month,t.category plan,
      CASE WHEN t.payment_mode='Cash' THEN 'C' ELSE 'G' END cg,
      t.amount / count(*) OVER (PARTITION BY t.id) amount,
      row_number() OVER (PARTITION BY s.id,m.year,m.month ORDER BY t.created_at DESC,t.id DESC) priority
    FROM transactions t JOIN transaction_months m ON m.transaction_id=t.id
    JOIN batches b ON b.display_name=t.batch_display
    JOIN students s ON s.batch_id=b.id AND lower(trim(s.name))=lower(trim(t.student_name))
    WHERE t.type='Income' AND t.status<>'Cancelled'
  ) INSERT INTO fee_cells(student_id,year,month,status,amount,plan,cg)
    SELECT student_id,year,month,'PAID',amount,plan,cg FROM linked WHERE priority=1
    ON CONFLICT(student_id,year,month) DO UPDATE SET status='PAID',amount=EXCLUDED.amount,plan=EXCLUDED.plan,cg=EXCLUDED.cg`);
}
export async function saveTransaction(
  q: DB,
  input: unknown,
  oldId?: string,
  importing = false,
) {
  const t = transactionSchema.parse(input);
  const status =
    importing && (input as any).status === "Cancelled"
      ? "Cancelled"
      : statusFor(t.balance);
  if (!oldId && !importing) {
    const history = (await allTransactions(q)).filter(
      (past) =>
        past.type === "Income" &&
        past.status !== "Cancelled" &&
        past.batch_display === t.batch_display &&
        past.student_name.trim().toLowerCase() ===
          t.student_name.trim().toLowerCase(),
    );
    t.amount = carryForward(history, t.actual_amount, t.discounts).amount;
  }
  let createdAt: string | undefined;
  if (oldId) {
    const old = (
      await rows(q, "SELECT * FROM transactions WHERE id=$1", [oldId])
    )[0];
    if (!old) fail("Transaction not found", 404);
    createdAt = old.created_at;
    await q.query("DELETE FROM transactions WHERE id=$1", [oldId]);
  }
  const batch = (
    await rows(q, "SELECT id FROM batches WHERE display_name=$1", [
      t.batch_display,
    ])
  )[0];
  if (!batch) fail("Choose a valid batch");
  const start = {
    month: t.fee_months[0].month,
    year: Number(t.date.slice(0, 4)),
  };
  const months = runMonths(start, countMonths(t.category, t.actual_amount));
  // Normalize historical tags and never trust a client-supplied status or net effect.
  await q.query(
    `INSERT INTO transactions(id,date,type,category,batch_display,student_name,actual_amount,discounts,balance,payment_mode,over_paid,amount,status,recorded_by,description,channel,net_effect,drive_receipt,legacy_months) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      t.id,
      t.date,
      t.type,
      t.category,
      t.batch_display,
      t.student_name,
      t.actual_amount,
      t.discounts,
      t.balance,
      t.payment_mode,
      t.over_paid,
      t.amount,
      status,
      t.recorded_by,
      t.description,
      t.payment_mode === "Cash" ? "Cash" : "Digital",
      t.type === "Income" ? t.amount : -t.amount,
      t.drive_receipt,
      JSON.stringify(months.map((m) => MONTHS[m.month - 1])),
    ],
  );
  if (createdAt)
    await q.query(
      "UPDATE transactions SET created_at=$1,updated_at=clock_timestamp() WHERE id=$2",
      [createdAt, t.id],
    );
  for (const [i, m] of months.entries())
    await q.query(
      "INSERT INTO transaction_months(transaction_id,position,year,month) VALUES($1,$2,$3,$4)",
      [t.id, i, m.year, m.month],
    );
  if (t.type === "Income") await syncStudent(q, batch.id, t.student_name);
  if (!importing) await reconcile(q);
  return { ...t, fee_months: months, status };
}
export async function manualCell(
  q: DB,
  studentId: number,
  year: number,
  month: number,
  input: any,
  user: string,
) {
  const s = (
    await rows(
      q,
      "SELECT s.*,b.display_name FROM students s JOIN batches b ON b.id=s.batch_id WHERE s.id=$1",
      [studentId],
    )
  )[0];
  if (!s) fail("Student not found", 404);
  // Remove only this month's links, preserving other months of multi-month transactions.
  if (input.status === "DUE") {
    const matching = await rows(
      q,
      `SELECT t.id FROM transactions t JOIN transaction_months m ON m.transaction_id=t.id WHERE lower(trim(t.student_name))=lower(trim($1)) AND t.batch_display=$2 AND t.type='Income' AND m.year=$3 AND m.month=$4`,
      [s.name, s.display_name, year, month],
    );
    for (const t of matching) {
      await q.query(
        "DELETE FROM transaction_months WHERE transaction_id=$1 AND year=$2 AND month=$3",
        [t.id, year, month],
      );
      await q.query(
        "UPDATE transactions SET description=description || $2 WHERE id=$1",
        [t.id, ` [Manual DUE correction: ${MONTHS[month - 1]} ${year}]`],
      );
    }
  } else {
    const payment = await saveTransaction(
      q,
      {
        id: `CELL-${randomUUID().slice(0, 8)}`,
        date: indiaNow().date,
        type: "Income",
        category: input.plan || "Regular",
        batch_display: s.display_name,
        student_name: s.name,
        actual_amount: Number(input.amount),
        amount: Number(input.amount),
        payment_mode: input.cg === "C" ? "Cash" : "GPay",
        recorded_by: user,
        description: "Manual fee cell payment",
        fee_months: [{ year, month }],
      },
      undefined,
      true,
    );
    // A manual cell is exactly one month, even when labelled with a multi-month plan.
    await q.query(
      "DELETE FROM transaction_months WHERE transaction_id=$1 AND position>0",
      [payment.id],
    );
    await q.query(
      "UPDATE transaction_months SET year=$1,month=$2 WHERE transaction_id=$3 AND position=0",
      [year, month, payment.id],
    );
  }
  await q.query(
    "UPDATE students SET last_activity_at=clock_timestamp() WHERE id=$1",
    [studentId],
  );
  await reconcile(q);
}
