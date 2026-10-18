import { useEffect, useState } from "react";
import { Plus, Download, SlidersHorizontal } from "lucide-react";
import { useData, useWrite, notify } from "./api";
import {
  Badge,
  Bars,
  Empty,
  Field,
  Modal,
  PageTitle,
  RowActions,
  SearchBox,
  Select,
  Stats,
} from "./components";
import {
  AMOUNTS,
  MONTHS,
  countMonths,
  dateLabel,
  feeLabel,
  indiaNow,
  money,
  pickMonths,
  runMonths,
  statusFor,
  type FeeMonth,
} from "../shared/rules";
const sortOptions = [
  { value: "recent", label: "Recent entry (newest first)" },
  { value: "az", label: "Student A → Z" },
  { value: "za", label: "Student Z → A" },
  { value: "low", label: "Amount low → high" },
  { value: "high", label: "Amount high → low" },
];
export function Dashboard({ bootstrap }: any) {
  const [filters, setFilters] = useState<any>({ sort: "recent" }),
    [editing, setEditing] = useState<any>(null);
  const { data } = useData("/transactions", filters);
  const write = useWrite();
  const admin = bootstrap.user.role === "admin";
  const filter = (k: string, v: string) => setFilters({ ...filters, [k]: v });
  return (
    <>
      <PageTitle
        title="A clear view of your studio."
        subtitle="Every payment, every class. All in one place."
        action={
          <button className="primary" onClick={() => setEditing({})}>
            <Plus size={17} /> Add Transaction
          </button>
        }
      />
      <Stats
        stats={data?.stats}
        currency={[
          "Total Income",
          "Total Expense",
          "Net Cash Flow",
          "Cash Income",
          "Digital Income",
          "Balance Due",
          "Over Paid",
        ]}
      />
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Income by fee month</h2>
            <p>Payments allocated to the months they cover</p>
          </div>
          <span className="legend">
            <i /> Income
          </span>
        </div>
        <Bars
          data={Object.fromEntries(
            Object.entries(data?.chart || {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [
                `${MONTHS[Number(k.slice(5)) - 1].slice(0, 3)} ${k.slice(0, 4)}`,
                Number(v),
              ]),
          )}
          format={money}
        />
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>
              Daily transactions{" "}
              <span className="count">{data?.rows.length || 0}</span>
            </h2>
            <p>Your studio’s income and expenses</p>
          </div>
          <a className="button" href="/api/export/excel">
            <Download size={15} /> Export
          </a>
        </div>
        <div className="filters">
          <SearchBox
            value={filters.search || ""}
            onChange={(v: string) => filter("search", v)}
            placeholder="Search student, ID or category"
          />
          <Field label="From">
            <input
              type="date"
              value={filters.from || ""}
              onChange={(e) => filter("from", e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={filters.to || ""}
              onChange={(e) => filter("to", e.target.value)}
            />
          </Field>
          <Select
            aria-label="Batch filter"
            placeholder="All batches"
            value={filters.batch}
            onChange={(v: string) => filter("batch", v)}
            options={bootstrap.batches.map((b: any) => b.display_name)}
          />
          <Select
            aria-label="Fee month filter"
            placeholder="All fee months"
            value={filters.month}
            onChange={(v: string) => filter("month", v)}
            options={MONTHS.map((label, i) => ({ label, value: i + 1 }))}
          />
          <Select
            aria-label="Type filter"
            placeholder="All types"
            value={filters.type}
            onChange={(v: string) => filter("type", v)}
            options={["Income", "Expense"]}
          />
          <Select
            aria-label="Status filter"
            placeholder="All statuses"
            value={filters.status}
            onChange={(v: string) => filter("status", v)}
            options={["Completed", "Pending", "Cancelled"]}
          />
          <Select
            aria-label="Sort transactions"
            options={sortOptions}
            value={filters.sort}
            onChange={(v: string) => filter("sort", v)}
          />
        </div>
        {data?.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Date",
                    "ID",
                    "Type",
                    "Category",
                    "Batch / Department",
                    "Student Name",
                    "Actual Amount",
                    "Discounts",
                    "Balance",
                    "Payment Mode",
                    "Over Paid",
                    "Amount",
                    "Fee Month(s)",
                    "Status",
                    "Recorded By",
                    "Description",
                    "",
                  ].map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((t: any) => (
                  <tr key={t.id}>
                    <td>{dateLabel(t.date)}</td>
                    <td className="mono">{t.id}</td>
                    <td>
                      <Badge>{t.type}</Badge>
                    </td>
                    <td>{t.category}</td>
                    <td>{t.batch_display}</td>
                    <td className="strong">{t.student_name}</td>
                    {["actual_amount", "discounts", "balance"].map((k) => (
                      <td key={k}>{money(t[k])}</td>
                    ))}
                    <td>{t.payment_mode}</td>
                    <td>{money(t.over_paid)}</td>
                    <td className="strong">{money(t.amount)}</td>
                    <td>
                      {t.fee_months
                        .map((m: FeeMonth) => feeLabel(m, t.fee_months[0].year))
                        .join(", ")}
                    </td>
                    <td>
                      <Badge>{t.status}</Badge>
                    </td>
                    <td>{t.recorded_by}</td>
                    <td className="wrap">{t.description}</td>
                    <td>
                      <RowActions
                        edit={() => setEditing(t)}
                        remove={
                          admin
                            ? () =>
                                write.mutate({
                                  path: `/transactions/${encodeURIComponent(t.id)}`,
                                  method: "delete",
                                })
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Record a payment or expense to start tracking your studio’s finances." />
        )}
        <div className="table-footer">
          {data?.rows.length || 0} transactions{" "}
          <span>
            <SlidersHorizontal size={14} /> Showing filtered results
          </span>
        </div>
      </section>
      {editing && (
        <TransactionModal
          initial={editing}
          bootstrap={bootstrap}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function TransactionModal({ initial, bootstrap, onClose }: any) {
  const [form, setForm] = useState<any>({
    date: indiaNow().date,
    id: `DP-${Date.now()}`,
    type: "Income",
    category: "Monthly Fees",
    batch_display: "",
    student_name: "",
    actual_amount: 1360,
    discounts: 0,
    balance: 0,
    over_paid: 0,
    amount: 1360,
    payment_mode: "",
    recorded_by: bootstrap.user.username,
    description: "",
    fee_months: [],
    ...initial,
  });
  const [manualMonths, setManualMonths] = useState(!!initial.id);
  const write = useWrite();
  const selectedBatch = bootstrap.batches.find(
    (b: any) => b.display_name === form.batch_display,
  );
  const { data: students = [] } = useData(
    "/students",
    { batch_id: selectedBatch?.id },
    !!selectedBatch,
  );
  const { data: suggestion } = useData(
    "/transactions/suggestion",
    {
      batch: form.batch_display,
      student: form.student_name,
      actual: form.actual_amount,
      discounts: form.discounts,
      exclude: initial.id || "",
    },
    !!form.batch_display && !!form.student_name,
  );
  const year = Number(form.date.slice(0, 4)),
    count = countMonths(form.category);
  const set = (key: string, value: any) =>
    setForm((f: any) => ({
      ...f,
      [key]: value,
      ...(key === "date" && value && f.fee_months.length
        ? {
            fee_months: runMonths(
              { month: f.fee_months[0].month, year: Number(value.slice(0, 4)) },
              countMonths(f.category),
            ),
          }
        : {}),
    }));
  useEffect(() => {
    if (suggestion && !initial.id)
      setForm((f: any) => ({ ...f, amount: suggestion.amount }));
  }, [suggestion?.amount, initial.id]);
  useEffect(() => {
    if (!initial.id && !form.student_name)
      setForm((f: any) => ({
        ...f,
        amount: Number(f.actual_amount) - Number(f.discounts),
      }));
  }, [form.actual_amount, form.discounts, form.student_name]);
  useEffect(() => {
    if (
      !manualMonths &&
      suggestion &&
      ["Monthly Fees", "3 Month Fees", "6 Month Fees"].includes(form.category)
    ) {
      const last = suggestion.lastPaid;
      const start = last ? runMonths(last, 2)[1] : { year, month: 4 };
      setForm((f: any) => ({
        ...f,
        fee_months: runMonths({ month: start.month, year }, count),
      }));
    }
  }, [
    suggestion?.lastPaid?.year,
    suggestion?.lastPaid?.month,
    form.student_name,
    form.batch_display,
    form.category,
    year,
    manualMonths,
  ]);
  const changeCategory = (category: string) => {
    setForm((f: any) => ({
      ...f,
      category,
      actual_amount: AMOUNTS[category] ?? f.actual_amount,
      fee_months: f.fee_months.length
        ? runMonths(
            { month: f.fee_months[0].month, year },
            countMonths(category),
          )
        : [],
    }));
  };
  const valid =
    [
      "date",
      "id",
      "type",
      "category",
      "batch_display",
      "student_name",
      "actual_amount",
      "amount",
      "payment_mode",
      "recorded_by",
    ].every((k) => String(form[k] ?? "").trim() !== "") &&
    form.fee_months.length > 0 &&
    Number(form.actual_amount) >= 0;
  return (
    <Modal
      title={initial.id ? "Edit transaction" : "Add transaction"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await write.mutateAsync({
              path: initial.id
                ? `/transactions/${encodeURIComponent(initial.id)}`
                : "/transactions",
              method: initial.id ? "put" : "post",
              data: {
                ...form,
                fee_months: form.fee_months.map((m: FeeMonth) => ({
                  ...m,
                  year: m.year,
                })),
              },
            });
            onClose();
          } catch {}
        }}
      >
        <div className="form-grid">
          {["date", "id"].map((k) => (
            <Field
              key={k}
              label={k === "date" ? "Date" : "Transaction ID"}
              required
            >
              <input
                required
                type={k === "date" ? "date" : "text"}
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Type" required>
            <Select
              options={["Income", "Expense"]}
              value={form.type}
              onChange={(v: string) => set("type", v)}
            />
          </Field>
          <Field label="Category" required>
            <Select
              options={bootstrap.setup.categories || Object.keys(AMOUNTS)}
              value={form.category}
              onChange={changeCategory}
            />
          </Field>
          <Field label="Batch / Department" required>
            <Select
              placeholder="Choose batch"
              options={bootstrap.batches.map((b: any) => b.display_name)}
              value={form.batch_display}
              onChange={(v: string) => {
                set("batch_display", v);
                set("student_name", "");
                setManualMonths(false);
              }}
            />
          </Field>
          <Field label="Student name" required>
            <input
              required
              list="students"
              value={form.student_name}
              onChange={(e) => {
                set("student_name", e.target.value);
                setManualMonths(false);
              }}
            />
            <datalist id="students">
              {students.map((s: any) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </Field>
          {["actual_amount", "discounts", "balance", "over_paid", "amount"].map(
            (k) => (
              <Field
                key={k}
                label={
                  {
                    actual_amount: "Actual Amount",
                    discounts: "Discounts",
                    balance: "Balance",
                    over_paid: "Over Paid",
                    amount: "Amount (Paid)",
                  }[k]!
                }
                required={["actual_amount", "amount"].includes(k)}
              >
                <input
                  type="number"
                  min={k === "amount" ? undefined : 0}
                  readOnly={k === "amount" && !initial.id}
                  step="0.01"
                  required={["actual_amount", "amount"].includes(k)}
                  value={form[k]}
                  onChange={(e) =>
                    set(k, e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </Field>
            ),
          )}
          <Field label="Payment Mode" required>
            <Select
              placeholder="Choose mode"
              options={bootstrap.setup.payment_modes}
              value={form.payment_mode}
              onChange={(v: string) => set("payment_mode", v)}
            />
          </Field>
          <Field label="Recorded By" required>
            <input
              required
              value={form.recorded_by}
              onChange={(e) => set("recorded_by", e.target.value)}
            />
          </Field>
          <Field label="Status (automatic)">
            <input disabled value={statusFor(Number(form.balance))} />
          </Field>
        </div>
        {suggestion && (
          <div className="info-note">
            Amount = actual − discounts + unpaid balances − overpayments.
            <br />
            {suggestion.balance > 0 && (
              <>
                ＋ {money(suggestion.balance)} unpaid balance from{" "}
                {suggestion.balanceIds.length} payment(s):{" "}
                {suggestion.balanceIds.join(", ")}
                <br />
              </>
            )}
            {suggestion.credit > 0 && (
              <>
                − {money(suggestion.credit)} overpaid from:{" "}
                {suggestion.creditIds.join(", ")}
                <br />
              </>
            )}
            Suggested amount: <strong>{money(suggestion.amount)}</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => set("amount", suggestion.amount)}
            >
              Use amount
            </button>
          </div>
        )}
        <Field
          label={`Fee Month(s) · ${count} ${count === 1 ? "month" : "consecutive months"}`}
          required
        >
          <div className="chips">
            {MONTHS.map((m, i) => (
              <button
                type="button"
                key={m}
                className={
                  form.fee_months.some((x: FeeMonth) => x.month === i + 1)
                    ? "selected"
                    : ""
                }
                onClick={() => {
                  setManualMonths(true);
                  set(
                    "fee_months",
                    pickMonths(form.fee_months, i + 1, year, count),
                  );
                }}
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
        </Field>
        <p className="muted">
          {form.fee_months.length
            ? form.fee_months
                .map((m: FeeMonth) => feeLabel(m, form.fee_months[0].year))
                .join(" → ")
            : "Select the month this payment covers."}
        </p>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!valid || write.isPending}>
            Save transaction
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Batches({ bootstrap }: any) {
  const [filters, setFilters] = useState<any>({
      batch_id: bootstrap.batches[0]?.id,
      year: 2026,
      sort: "recent",
      months: "",
    }),
    [student, setStudent] = useState<any>(null),
    [cell, setCell] = useState<any>(null);
  const { data } = useData("/fees", filters);
  const write = useWrite(),
    admin = bootstrap.user.role === "admin";
  const set = (k: string, v: any) => setFilters({ ...filters, [k]: v });
  return (
    <>
      <PageTitle
        title="Batches & fees"
        subtitle="Every student’s payment journey, month by month."
        action={
          admin && (
            <button
              className="primary"
              onClick={() => setStudent({ name: "" })}
            >
              <Plus size={17} /> Add Student
            </button>
          )
        }
      />
      <div className="panel">
        <div className="filters">
          <Field label="Batch">
            <Select
              options={bootstrap.batches.map((b: any) => ({
                value: b.id,
                label: b.display_name,
              }))}
              value={filters.batch_id}
              onChange={(v: string) => set("batch_id", v)}
            />
          </Field>
          <Field label="Year">
            <Select
              options={data?.years || [2026, 2027]}
              value={filters.year}
              onChange={(v: string) => set("year", v)}
            />
          </Field>
          <Field label="Payment status">
            <Select
              placeholder="All statuses"
              options={["PAID", "DUE"]}
              value={filters.status}
              onChange={(v: string) => set("status", v)}
            />
          </Field>
          <SearchBox
            placeholder="Search student"
            value={filters.search || ""}
            onChange={(v: string) => set("search", v)}
          />
          <Select
            aria-label="Sort students"
            value={filters.sort}
            options={[
              { value: "recent", label: "Recent entry" },
              { value: "sl", label: "SL order" },
              ...sortOptions.slice(1, 3),
            ]}
            onChange={(v: string) => set("sort", v)}
          />
        </div>
        <div className="chips">
          <button
            className={!filters.months ? "selected" : ""}
            onClick={() => set("months", "")}
          >
            All months
          </button>
          {(data?.available || []).map((m: number) => (
            <button
              key={m}
              className={
                filters.months.split(",").includes(String(m)) ? "selected" : ""
              }
              onClick={() => {
                const current = filters.months.split(",").filter(Boolean);
                set(
                  "months",
                  current.includes(String(m))
                    ? current.filter((x: string) => x !== String(m)).join(",")
                    : [...current, String(m)].join(","),
                );
              }}
            >
              {MONTHS[m - 1].slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
      <Stats stats={data?.stats} currency={["Total Collected"]} />
      <section className="panel">
        {data?.rows.length ? (
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th>SL</th>
                  <th className="sticky">Student</th>
                  {data.months.map((m: number) => (
                    <th key={m}>
                      {MONTHS[m - 1].slice(0, 3)} {filters.year}
                    </th>
                  ))}
                  <th>Total Paid</th>
                  {admin && <th />}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.sl_no}</td>
                    <td className="sticky strong">{s.name}</td>
                    {data.months.map((m: number) => {
                      const c = s.cells[m] || {
                        status: "DUE",
                        amount: 0,
                        plan: "Regular",
                        cg: "C",
                      };
                      return (
                        <td key={m}>
                          <button
                            disabled={!admin}
                            className={`fee-cell ${c.status === "PAID" ? "paid" : "due"}`}
                            onClick={() =>
                              setCell({
                                ...c,
                                student_id: s.id,
                                student: s.name,
                                month: m,
                                year: Number(filters.year),
                              })
                            }
                          >
                            {c.status}
                            {c.status === "PAID" && (
                              <small>
                                {money(c.amount)} · {c.cg}
                              </small>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="strong">
                      {money(
                        data.months.reduce(
                          (total: number, m: number) =>
                            total +
                            (s.cells[m]?.status === "PAID"
                              ? Number(s.cells[m].amount)
                              : 0),
                          0,
                        ),
                      )}
                    </td>
                    {admin && (
                      <td>
                        <RowActions
                          edit={() => setStudent(s)}
                          remove={() =>
                            write.mutate({
                              path: `/students/${s.id}`,
                              method: "delete",
                            })
                          }
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Add students here or in the Student Register. Their fee and attendance records will stay connected." />
        )}
      </section>
      {student && (
        <Modal
          title={student.id ? "Edit student" : "Add student"}
          onClose={() => setStudent(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: student.id ? `/students/${student.id}` : "/students",
                  method: student.id ? "put" : "post",
                  data: {
                    name: student.name,
                    batch_id: Number(filters.batch_id),
                  },
                });
                setStudent(null);
              } catch {}
            }}
          >
            <Field label="Student name" required>
              <input
                autoFocus
                required
                value={student.name}
                onChange={(e) =>
                  setStudent({ ...student, name: e.target.value })
                }
              />
            </Field>
            <div className="modal-footer">
              <button
                className="primary"
                disabled={write.isPending || !student.name.trim()}
              >
                Save student
              </button>
            </div>
          </form>
        </Modal>
      )}
      {cell && (
        <Modal
          title={`${cell.student} · ${MONTHS[cell.month - 1]} ${cell.year}`}
          onClose={() => setCell(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: `/fees/${cell.student_id}/${cell.year}/${cell.month}`,
                  method: "put",
                  data: cell,
                });
                setCell(null);
                notify("Fee cell and linked transaction updated.");
              } catch {}
            }}
          >
            <Field label="Status">
              <Select
                options={["PAID", "DUE"]}
                value={cell.status}
                onChange={(v: string) => setCell({ ...cell, status: v })}
              />
            </Field>
            <Field label="Plan">
              <Select
                options={bootstrap.setup.categories}
                value={cell.plan || "Regular"}
                onChange={(v: string) => setCell({ ...cell, plan: v })}
              />
            </Field>
            <Field label="Amount">
              <input
                type="number"
                min="0"
                step="0.01"
                value={cell.amount}
                onChange={(e) =>
                  setCell({ ...cell, amount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Mode">
              <Select
                options={["C", "G"]}
                value={cell.cg || "C"}
                onChange={(v: string) => setCell({ ...cell, cg: v })}
              />
            </Field>
            <p className="info-note">
              PAID creates a linked payment. DUE removes this month’s payment
              links and preserves the financial history.
            </p>
            <div className="modal-footer">
              <button className="primary" disabled={write.isPending}>
                Save cell
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
