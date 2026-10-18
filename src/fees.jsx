import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  Wallet,
  Pencil,
  CalendarDays,
} from "lucide-react";
import { useData, useStore, useWrite, params, api } from "./api";
import {
  PageTitle,
  Card,
  Stats,
  Button,
  AddButton,
  Field,
  Select,
  SearchBox,
  Modal,
  Table,
  RowActions,
  Badge,
  BarChart,
  Empty,
  ErrorNotice,
  ConfirmDelete,
} from "./components";
import {
  MONTHS,
  PRICES,
  money,
  dateLabel,
  today,
  feeLabel,
  monthRun,
  countMonths,
  slideMonths,
  transactionStatus,
} from "../shared/domain";
const sorts = [
  { value: "recent", label: "Recent entry (newest first)" },
  { value: "az", label: "Student A → Z" },
  { value: "za", label: "Student Z → A" },
  { value: "low", label: "Amount low → high" },
  { value: "high", label: "Amount high → low" },
];
function TransactionForm({ initial, onClose, batches }) {
  const user = useStore((s) => s.user),
    write = useWrite();
  const [busy, B] = useState(false),
    [carry, C] = useState({ balance: 0, overPaid: 0, ids: [] });
  const [form, F] = useState(
    initial
      ? { ...initial }
      : {
          date: today(),
          id: "",
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
          recorded_by: user.username,
          description: "",
          drive_receipt: "",
          fee_months: [],
        },
  );
  const students = useData(
    ["students", form.batch_display],
    "/students?" + params({ batch: form.batch_display }),
  );
  const setup = useData("setup", "/setup");
  const change = (key, value) => F((f) => ({ ...f, [key]: value }));
  useEffect(() => {
    let active = true;
    api
      .get(
        "/transaction-defaults?" +
          params({
            batch: form.batch_display,
            student: form.student_name,
            category: form.category,
            year: Number(form.date.slice(0, 4)),
            exclude: initial?.id,
          }),
      )
      .then(({ data }) => {
        if (!active) return;
        C(data.carry);
        F((f) => ({
          ...f,
          id: f.id || data.id,
          ...(!initial &&
          f.batch_display &&
          f.student_name &&
          ["Monthly Fees", "3 Month Fees", "6 Month Fees"].includes(f.category)
            ? {
                fee_months: monthRun(
                  data.next[0].month,
                  Number(f.date.slice(0, 4)),
                  countMonths(f.category),
                ),
              }
            : {}),
          ...(!initial
            ? {
                amount:
                  Number(f.actual_amount) -
                  Number(f.discounts) +
                  data.carry.balance -
                  data.carry.overPaid,
              }
            : {}),
        }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [form.batch_display, form.student_name]);
  const numeric = (key, value) =>
    F((f) => {
      const next = { ...f, [key]: value };
      if (["actual_amount", "discounts"].includes(key))
        next.amount =
          Number(next.actual_amount) -
          Number(next.discounts) +
          carry.balance -
          carry.overPaid;
      return next;
    });
  const category = (value) =>
    F((f) => {
      const actual = PRICES[value] ?? f.actual_amount;
      return {
        ...f,
        category: value,
        actual_amount: actual,
        amount:
          Number(actual) - Number(f.discounts) + carry.balance - carry.overPaid,
        fee_months: f.fee_months.length
          ? monthRun(
              f.fee_months[0].month,
              Number(f.date.slice(0, 4)),
              countMonths(value),
            )
          : [],
      };
    });
  const required = [
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
  ];
  const valid =
    required.every((k) => form[k] !== "" && form[k] != null) &&
    form.fee_months.length > 0 &&
    ["actual_amount", "discounts", "balance", "over_paid"].every(
      (k) => Number(form[k]) >= 0,
    );
  return (
    <Modal
      title={initial ? "Edit transaction" : "Add a transaction"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          B(true);
          try {
            await write(
              initial ? "put" : "post",
              "/transactions" +
                (initial ? "/" + encodeURIComponent(initial.id) : ""),
              form,
            );
            onClose();
          } catch {
          } finally {
            B(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="form-section">
            PAYMENT DETAILS <span>Fields marked * are required</span>
          </div>
          <div className="form-grid three">
            <Field label="Date" required>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) =>
                  F((f) => ({
                    ...f,
                    date: e.target.value,
                    fee_months: f.fee_months.length
                      ? monthRun(
                          f.fee_months[0].month,
                          Number(e.target.value.slice(0, 4)),
                          countMonths(f.category),
                        )
                      : [],
                  }))
                }
              />
            </Field>
            <Field label="Transaction ID" required>
              <input
                required
                value={form.id}
                onChange={(e) => change("id", e.target.value)}
              />
            </Field>
            <Field label="Type" required>
              <Select
                value={form.type}
                options={["Income", "Expense"]}
                onChange={(e) => change("type", e.target.value)}
              />
            </Field>
            <Field label="Category" required>
              <Select
                value={form.category}
                options={[
                  ...new Set([
                    ...Object.keys(PRICES),
                    ...(setup.data?.categories || []),
                  ]),
                ]}
                onChange={(e) => category(e.target.value)}
              />
            </Field>
            <Field label="Batch / Department" required>
              <Select
                placeholder="Select batch"
                value={form.batch_display}
                options={batches.map((b) => b.display_name)}
                onChange={(e) =>
                  F((f) => ({
                    ...f,
                    batch_display: e.target.value,
                    student_name: "",
                    fee_months: [],
                  }))
                }
              />
            </Field>
            <Field label="Student name" required>
              <input
                list="transaction-students"
                required
                placeholder="Select or enter a student"
                value={form.student_name}
                onChange={(e) => change("student_name", e.target.value)}
              />
              <datalist id="transaction-students">
                {students.data?.map((s) => (
                  <option value={s.name} key={s.id} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="form-section">
            FEE MONTHS{" "}
            <span>
              {countMonths(form.category)} consecutive month
              {countMonths(form.category) > 1 ? "s" : ""} · start year{" "}
              {form.date.slice(0, 4)}
            </span>
          </div>
          <div className="month-chips">
            {MONTHS.map((m, i) => (
              <button
                type="button"
                className={
                  form.fee_months.some((f) => f.month === m) ? "selected" : ""
                }
                key={m}
                onClick={() =>
                  change(
                    "fee_months",
                    slideMonths(
                      form.fee_months,
                      i,
                      Number(form.date.slice(0, 4)),
                      countMonths(form.category),
                    ),
                  )
                }
              >
                {m.slice(0, 3)}
              </button>
            ))}
          </div>
          <p className="selection-note">
            {form.fee_months.length
              ? feeLabel(form.fee_months)
              : "Choose the month this payment covers."}
          </p>
          <div className="form-grid three">
            {[
              ["actual_amount", "Actual amount", true],
              ["discounts", "Discounts"],
              ["balance", "Unpaid balance"],
              ["over_paid", "Over paid"],
              ["amount", "Amount (Paid)", true],
            ].map(([k, l, r]) => (
              <Field key={k} label={l + " (₹)"} required={r}>
                <input
                  type="number"
                  min={k === "amount" ? undefined : "0"}
                  step="0.01"
                  required={r}
                  value={form[k]}
                  onChange={(e) => numeric(k, e.target.value)}
                />
              </Field>
            ))}
            <Field label="Payment mode" required>
              <Select
                placeholder="Select mode"
                options={
                  setup.data?.payment_modes || [
                    "Cash",
                    "GPay",
                    "Bank Transfer",
                    "Card",
                  ]
                }
                value={form.payment_mode}
                onChange={(e) => change("payment_mode", e.target.value)}
              />
            </Field>
            <Field label="Status · automatic">
              <input disabled value={transactionStatus(form.balance)} />
            </Field>
            <Field label="Recorded by" required>
              <input
                required
                value={form.recorded_by}
                onChange={(e) => change("recorded_by", e.target.value)}
              />
            </Field>
            <Field label="Receipt link">
              <input
                type="url"
                placeholder="https://…"
                value={form.drive_receipt}
                onChange={(e) => change("drive_receipt", e.target.value)}
              />
            </Field>
          </div>
          {!!carry.ids.length && (
            <div className="notice">
              Carry-forward: + {money(carry.balance)} unpaid balance −{" "}
              {money(carry.overPaid)} overpaid, from {carry.ids.length}{" "}
              payment(s): {carry.ids.join(", ")}. Suggested amount:{" "}
              {money(
                Number(form.actual_amount) -
                  Number(form.discounts) +
                  carry.balance -
                  carry.overPaid,
              )}
              .
            </div>
          )}
          <Field label="Description">
            <textarea
              rows="2"
              value={form.description}
              onChange={(e) => change("description", e.target.value)}
              placeholder="Add a note about this payment"
            />
          </Field>
        </div>
        <div className="modal-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || busy}>
            {busy ? "Saving…" : "Save transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Dashboard() {
  const user = useStore((s) => s.user),
    write = useWrite();
  const [filters, F] = useState({
      from: "",
      to: "",
      batch_display: "",
      month: "",
      type: "",
      status: "",
      search: "",
      sort: "recent",
    }),
    [editing, E] = useState(null);
  const batches = useData("batches", "/batches");
  const tx = useData(
    ["transactions", filters],
    "/transactions?" + params(filters),
  );
  const data = tx.data?.data || [],
    stats = tx.data?.stats;
  const set = (k, v) => F((f) => ({ ...f, [k]: v }));
  const chart = MONTHS.map((month) => ({
    label: month.slice(0, 3),
    value: data
      .filter((t) => t.type === "Income")
      .reduce(
        (s, t) =>
          s +
          (t.fee_months.some((m) => m.month === month)
            ? Number(t.amount) / t.fee_months.length
            : 0),
        0,
      ),
  }));
  return (
    <>
      <PageTitle
        eyebrow="FEES TRACKING / OVERVIEW"
        title="A clear view of every step."
        subtitle="Track payments, keep fees in order, and focus on what moves you."
      >
        <AddButton onClick={() => E({})}>Add Transaction</AddButton>
      </PageTitle>
      <ErrorNotice query={tx} />
      {stats && (
        <Stats
          items={[
            [
              "Total income",
              money(stats.income),
              "Income in this view",
              "teal-text",
            ],
            ["Total expense", money(stats.expense), "Expenses in this view"],
            [
              "Net cash flow",
              money(stats.income - stats.expense),
              "Income less expenses",
              "teal-text",
            ],
            [
              "Balance due",
              money(stats.balance),
              "Awaiting payment",
              "red-text",
            ],
          ]}
        />
      )}
      <div className="dashboard-middle">
        <Card
          title="Income by fee month"
          subtitle="A little perspective on your collections"
          action={
            <span className="chart-legend">
              <i /> Income (₹)
            </span>
          }
        >
          <BarChart items={chart} />
        </Card>
        <Card
          className="payment-summary"
          title="Payment snapshot"
          subtitle="Your current selection"
        >
          {stats ? (
            <>
              <div>
                <span className="snapshot-icon">
                  <Wallet size={18} />
                </span>
                <span>
                  Cash income<small>Cash payments</small>
                </span>
                <strong>{money(stats.cash)}</strong>
              </div>
              <div>
                <span className="snapshot-icon digital">
                  <ArrowUpRight size={18} />
                </span>
                <span>
                  Digital income<small>GPay, card & bank</small>
                </span>
                <strong>{money(stats.digital)}</strong>
              </div>
              <div className="snapshot-bottom">
                <span>
                  <strong>{stats.completed}</strong>Completed
                </span>
                <span>
                  <strong>{money(stats.overPaid)}</strong>Over paid
                </span>
              </div>
            </>
          ) : (
            <div className="staff-note">
              <ShieldNote />
              Your recorded payments keep the whole school in step.
            </div>
          )}
        </Card>
      </div>
      <Card
        title="Daily transactions"
        subtitle={`${data.length} transaction${data.length === 1 ? "" : "s"} · fixed entry dates`}
        action={<span className="muted tiny">All amounts in INR</span>}
      >
        <div className="filters">
          <SearchBox
            value={filters.search}
            onChange={(v) => set("search", v)}
            placeholder="Search student, ID, category…"
          />
          <Select
            aria-label="Batch filter"
            placeholder="All batches"
            options={batches.data?.map((b) => b.display_name) || []}
            value={filters.batch_display}
            onChange={(e) => set("batch_display", e.target.value)}
          />
          <Select
            aria-label="Type filter"
            placeholder="All types"
            options={["Income", "Expense"]}
            value={filters.type}
            onChange={(e) => set("type", e.target.value)}
          />
          <Select
            aria-label="Status filter"
            placeholder="All statuses"
            options={["Completed", "Pending", "Cancelled"]}
            value={filters.status}
            onChange={(e) => set("status", e.target.value)}
          />
          <Select
            aria-label="Fee month filter"
            placeholder="All fee months"
            options={MONTHS}
            value={filters.month}
            onChange={(e) => set("month", e.target.value)}
          />
        </div>
        <div className="filters secondary">
          <Field label="From">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={filters.to}
              onChange={(e) => set("to", e.target.value)}
            />
          </Field>
          <button
            className="text-button"
            onClick={() =>
              F({
                from: "",
                to: "",
                batch_display: "",
                month: "",
                type: "",
                status: "",
                search: "",
                sort: "recent",
              })
            }
          >
            Reset filters
          </button>
          <div className="sort-control">
            <SlidersHorizontal size={14} />
            <Select
              aria-label="Sort transactions"
              options={sorts}
              value={filters.sort}
              onChange={(e) => set("sort", e.target.value)}
            />
          </div>
        </div>
        <Table
          headers={[
            "Date / ID",
            "Student name",
            "Type",
            "Category",
            "Batch / Department",
            "Actual amount",
            "Discounts",
            "Balance",
            "Payment mode",
            "Over paid",
            "Amount",
            "Fee month(s)",
            "Status",
            "Recorded by",
            "Description",
            "Receipt",
            "",
          ]}
          empty={!data.length}
        >
          {data.map((t) => (
            <tr key={t.id}>
              <td>
                <strong>{dateLabel(t.date)}</strong>
                <small className="cell-sub">{t.id}</small>
              </td>
              <td className="student-cell">
                <span className="avatar">{t.student_name[0] || "—"}</span>
                <strong>{t.student_name}</strong>
              </td>
              <td>
                <span
                  className={
                    "type-label " +
                    (t.type === "Income" ? "teal-text" : "red-text")
                  }
                >
                  {t.type === "Income" ? (
                    <ArrowDownLeft size={14} />
                  ) : (
                    <ArrowUpRight size={14} />
                  )}{" "}
                  {t.type}
                </span>
              </td>
              <td>{t.category}</td>
              <td>{t.batch_display}</td>
              <td>{money(t.actual_amount)}</td>
              <td>{money(t.discounts)}</td>
              <td className={Number(t.balance) > 0 ? "red-text" : ""}>
                {money(t.balance)}
              </td>
              <td>{t.payment_mode}</td>
              <td>{money(t.over_paid)}</td>
              <td>
                <strong>{money(t.amount)}</strong>
              </td>
              <td>{feeLabel(t.fee_months)}</td>
              <td>
                <Badge>{t.status}</Badge>
              </td>
              <td>{t.recorded_by}</td>
              <td className="wrap-cell">{t.description || "—"}</td>
              <td>
                {/^https?:\/\//i.test(t.drive_receipt) ? (
                  <a href={t.drive_receipt} target="_blank" rel="noreferrer">
                    View receipt
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>
                <RowActions
                  onEdit={() => E(t)}
                  onDelete={
                    user.role === "admin"
                      ? () =>
                          ConfirmDelete({
                            onConfirm: () =>
                              write(
                                "delete",
                                "/transactions/" + encodeURIComponent(t.id),
                              ),
                            title: `Delete ${t.id} and reverse its fee payments?`,
                          })
                      : undefined
                  }
                />
              </td>
            </tr>
          ))}
        </Table>
        <div className="table-footer">
          Showing {data.length} transactions
          <span>
            <span className="small-dot" /> Synced with batch fees
          </span>
        </div>
      </Card>
      {editing && (
        <TransactionForm
          initial={editing.id ? editing : null}
          batches={batches.data || []}
          onClose={() => E(null)}
        />
      )}
    </>
  );
}
function ShieldNote() {
  return <CalendarDays size={36} />;
}
export function Batches() {
  const user = useStore((s) => s.user),
    write = useWrite();
  const batches = useData("batches", "/batches");
  const [batch, B] = useState("Adult Ladies"),
    [year, Y] = useState(2026),
    [months, M] = useState([]),
    [status, S] = useState(""),
    [search, Q] = useState(""),
    [sort, O] = useState("recent"),
    [edit, E] = useState(null),
    [student, U] = useState(null),
    [busy, W] = useState(false);
  const students = useData(
    ["students", batch, search, sort],
    "/students?" + params({ batch, search, sort }),
  );
  const fees = useData(["fees", year], "/fees?year=" + year);
  const feeYears = useData("fee-years", "/fee-years");
  const cells = fees.data || [];
  const active =
    year === 2026
      ? [
          ...new Set([
            ...(batches.data?.find((b) => b.display_name === batch)
              ?.month_order || MONTHS.slice(3)),
            ...cells.filter((c) => c.batch === batch).map((c) => c.month),
          ]),
        ].sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b))
      : MONTHS;
  const shown = active.filter((m) => !months.length || months.includes(m));
  const cell = (id, m) =>
    cells.find((c) => c.student_id === id && c.month === m);
  const roster = (students.data || []).filter(
    (s) =>
      !status || shown.some((m) => (cell(s.id, m)?.status || "DUE") === status),
  );
  const paid = roster
    .flatMap((s) => shown.map((m) => cell(s.id, m)))
    .filter((c) => c?.status === "PAID");
  const years = [
    ...new Set([
      2026,
      2027,
      new Date().getFullYear(),
      new Date().getFullYear() + 1,
      year,
      year + 1,
      ...(feeYears.data || []),
    ]),
  ].sort();
  return (
    <>
      <PageTitle
        eyebrow="FEES TRACKING / BATCHES"
        title="Every dancer. Every month."
        subtitle="A year-aware view of payments across your school."
      >
        {user.role === "admin" && (
          <AddButton onClick={() => U({ name: "", batch })}>
            Add Student
          </AddButton>
        )}
      </PageTitle>
      <ErrorNotice query={fees} />
      <div className="filters standalone">
        <Field label="Batch">
          <Select
            options={batches.data?.map((b) => b.display_name) || []}
            value={batch}
            onChange={(e) => B(e.target.value)}
          />
        </Field>
        <Field label="Year">
          <Select
            options={years}
            value={year}
            onChange={(e) => {
              Y(Number(e.target.value));
              M([]);
            }}
          />
        </Field>
        <Field label="Payment status">
          <Select
            placeholder="All payments"
            options={["PAID", "DUE"]}
            value={status}
            onChange={(e) => S(e.target.value)}
          />
        </Field>
        <SearchBox placeholder="Search student…" value={search} onChange={Q} />
        <Select
          aria-label="Student sort"
          options={[...sorts.slice(0, 3), { value: "sl", label: "SL order" }]}
          value={sort}
          onChange={(e) => O(e.target.value)}
        />
      </div>
      <div className="month-chips standalone">
        <button
          className={!months.length ? "selected" : ""}
          onClick={() => M([])}
        >
          All months
        </button>
        {active.map((m) => (
          <button
            className={months.includes(m) ? "selected" : ""}
            key={m}
            onClick={() =>
              M((v) => (v.includes(m) ? v.filter((x) => x !== m) : [...v, m]))
            }
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>
      {user.role === "admin" && (
        <Stats
          items={[
            ["Students", roster.length, batch],
            [
              "Total collected",
              money(paid.reduce((s, c) => s + Number(c.amount), 0)),
              String(year),
              "teal-text",
            ],
            ["Payments received", paid.length, "Paid month slots", "teal-text"],
            [
              "Dues pending",
              roster.length * shown.length - paid.length,
              "Unpaid month slots",
              "red-text",
            ],
            ["Months shown", shown.length, "Selected season months"],
          ]}
        />
      )}
      <Card
        title={batch}
        subtitle={`${year} · ${roster.length} students · missing payments are due`}
      >
        <Table
          headers={[
            "SL",
            "Student",
            ...shown.map((m) => m.slice(0, 3)),
            "Total paid",
            ...(user.role === "admin" ? [""] : []),
          ]}
          empty={!roster.length}
        >
          {roster.map((s) => (
            <tr key={s.id}>
              <td className="sticky-sl">{s.sl_no}</td>
              <td className="sticky-name">
                <strong>{s.name}</strong>
              </td>
              {shown.map((m) => {
                const c = cell(s.id, m),
                  isPaid = c?.status === "PAID";
                return (
                  <td key={m}>
                    <button
                      className={"fee-cell " + (isPaid ? "paid" : "due")}
                      disabled={user.role !== "admin"}
                      onClick={() =>
                        E({
                          student: s,
                          month: m,
                          status: c?.status || "DUE",
                          amount: Number(c?.amount || 1360),
                          plan: c?.plan || "Monthly Fees",
                          cg: c?.cg || "C",
                        })
                      }
                    >
                      <strong>{isPaid ? "PAID" : "DUE"}</strong>
                      {isPaid && (
                        <small>
                          {money(c.amount)} · {c.cg}
                        </small>
                      )}
                    </button>
                  </td>
                );
              })}
              <td>
                <strong>
                  {money(
                    shown.reduce(
                      (sum, m) =>
                        sum +
                        (cell(s.id, m)?.status === "PAID"
                          ? Number(cell(s.id, m).amount)
                          : 0),
                      0,
                    ),
                  )}
                </strong>
              </td>
              {user.role === "admin" && (
                <td>
                  <RowActions
                    onEdit={() => U(s)}
                    onDelete={() =>
                      ConfirmDelete({
                        onConfirm: () => write("delete", "/students/" + s.id),
                        title: `Delete ${s.name} from this batch, its attendance sheets, and progress reviews? Historical receipts will be retained.`,
                      })
                    }
                  />
                </td>
              )}
            </tr>
          ))}
        </Table>
      </Card>
      {edit && (
        <Modal
          title={`${edit.student.name} · ${edit.month} ${year}`}
          onClose={() => E(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              W(true);
              try {
                await write(
                  "put",
                  `/fees/${edit.student.id}/${year}/${edit.month}`,
                  edit,
                );
                E(null);
              } catch {
              } finally {
                W(false);
              }
            }}
          >
            <div className="modal-body">
              <div className="notice">
                This updates the month’s fee allocation. Existing receipt
                amounts stay unchanged; a new payment creates a matching ledger
                entry.
              </div>
              <div className="form-grid">
                {[
                  ["status", ["PAID", "DUE"]],
                  ["plan", Object.keys(PRICES)],
                  ["cg", ["C", "G"]],
                ].map(([k, options]) => (
                  <Field
                    label={k === "cg" ? "Mode (C = cash, G = digital)" : k}
                    key={k}
                  >
                    <Select
                      options={options}
                      value={edit[k]}
                      onChange={(e) => E({ ...edit, [k]: e.target.value })}
                    />
                  </Field>
                ))}
                <Field label="Amount (₹)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={edit.amount}
                    onChange={(e) => E({ ...edit, amount: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="modal-footer">
              <Button disabled={busy}>Save payment</Button>
            </div>
          </form>
        </Modal>
      )}
      {student && (
        <Modal
          title={student.id ? "Edit student" : "Add student"}
          onClose={() => U(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              W(true);
              try {
                await write(
                  student.id ? "put" : "post",
                  "/students" + (student.id ? "/" + student.id : ""),
                  student,
                );
                U(null);
              } catch {
              } finally {
                W(false);
              }
            }}
          >
            <div className="modal-body">
              <Field label="Name" required>
                <input
                  required
                  value={student.name}
                  onChange={(e) => U({ ...student, name: e.target.value })}
                />
              </Field>
              {student.id ? (
                <Field label="SL">
                  <input
                    type="number"
                    min="1"
                    value={student.sl_no}
                    onChange={(e) =>
                      U({ ...student, sl_no: Number(e.target.value) })
                    }
                  />
                </Field>
              ) : (
                <Field label="Batch">
                  <Select
                    options={batches.data?.map((b) => b.display_name) || []}
                    value={student.batch}
                    onChange={(e) => U({ ...student, batch: e.target.value })}
                  />
                </Field>
              )}
            </div>
            <div className="modal-footer">
              <Button disabled={busy}>Save student</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
