export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const BATCHES = [
  "Adult Ladies",
  "Adult Beginners",
  "Kids Beginners",
  "Kids Advanced",
  "Adult Advanced",
  "Superkids Advanced",
  "Superkids Beginners - Morning",
  "Superkids Beginners - Evening",
  "Indian Classical",
  "Online Class",
  "Onam Fees",
  "Palace Night",
];
export const SHEETS = {
  "Superkids Beginners - Morning": "Superkids Beginners-Morn",
  "Superkids Beginners - Evening": "Superkids Beginner-Even",
};
export const PRICES = {
  "Monthly Fees": 1360,
  "3 Month Fees": 3780,
  "6 Month Fees": 6540,
  "Admission Fees": 2000,
  "Classical Fees": 1200,
  Regular: 1000,
  "Online Class": 1000,
  "Onam Fees": 1000,
  "Palace Night": 1000,
};
export const SKILLS = [
  "Rhythm / Musicality",
  "Coordination",
  "Flexibility",
  "Expression",
  "Choreography Memory",
  "Stage Confidence",
  "Discipline / Focus",
  "Technique",
  "Strength / Stamina",
  "Punctuality",
];
export const TABLES = {
  "Daily Worklog": [
    "Date",
    "Manager",
    "Category",
    "Work/Task Details",
    "Priority",
    "Status",
    "Start Time",
    "End Time",
    "Time Spent Hrs",
    "Customer/Student",
    "Phone",
    "Follow-up Date",
    "Notes",
  ],
  "Student Register": [
    "ACTIVE",
    "ID",
    "NAME",
    "DATE OF ADMSN",
    "ADMSN FEES",
    "AMOUNT",
    "PAID|DUE",
    "AGE",
    "PHONE",
    "PLACE",
    "HEALTH ISSUE",
    "JOB",
    "BATCHES",
    "BATCHES 2",
    "DRIVE RECEIPT",
  ],
  Timetable: [
    "NO.",
    "Dance Style",
    "Teachers",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
    "Status",
  ],
  Enquiry: [
    "SL No",
    "Name",
    "Phone",
    "Batches",
    "Note",
    "Admission Taken",
    "Time Slot",
    "Call Date",
    "Time",
  ],
  "Fees Pending": [
    "SL No",
    "Name",
    "Batches",
    "Reason Not Paid",
    "Amount Pending",
    "Due Month",
    "Call Back Date",
    "Time",
    "Cleared",
  ],
};
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const money = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const dateLabel = (d) =>
  d
    ? new Date(String(d).slice(0, 10) + "T12:00:00")
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replaceAll(" ", "-")
    : "—";
export const countMonths = (category) =>
  category === "6 Month Fees" ? 6 : category === "3 Month Fees" ? 3 : 1;
export function monthRun(month, year, count) {
  const start = typeof month === "number" ? month : MONTHS.indexOf(month);
  if (start < 0) throw new Error("Invalid month");
  return Array.from({ length: count }, (_, i) => ({
    month: MONTHS[(start + i) % 12],
    year: year + Math.floor((start + i) / 12),
  }));
}
export function slideMonths(selected, clicked, year, count) {
  if (count === 1)
    return selected.length === 1 && selected[0].month === MONTHS[clicked]
      ? []
      : monthRun(clicked, year, 1);
  if (!selected.length) return monthRun(clicked, year, count);
  const first = MONTHS.indexOf(selected[0].month),
    relative = (clicked - first + 12) % 12;
  if (relative < count) return selected;
  if (relative === count)
    return monthRun(
      (first + 1) % 12,
      selected[0].year + (first === 11 ? 1 : 0),
      count,
    );
  if ((first - clicked + 12) % 12 === 1) return monthRun(clicked, year, count);
  return monthRun(clicked, year, count);
}
export const feeLabel = (months) =>
  (months || [])
    .map(
      (m, i) =>
        m.month.slice(0, 3) +
        (m.year !== months[0].year ? ` '${String(m.year).slice(2)}` : ""),
    )
    .join(", ");
export function carryForward(transactions, excludeId) {
  const rows = transactions.filter(
    (t) =>
      t.type === "Income" && t.id !== excludeId && t.status !== "Cancelled",
  );
  return {
    balance: rows.reduce((a, t) => a + Number(t.balance || 0), 0),
    overPaid: rows.reduce((a, t) => a + Number(t.over_paid || 0), 0),
    ids: rows
      .filter((t) => Number(t.balance) || Number(t.over_paid))
      .map((t) => t.id),
  };
}
export const transactionStatus = (balance) =>
  Number(balance) > 0 ? "Pending" : "Completed";
export function scoreReview(ratings) {
  const values = Object.values(ratings)
    .map(Number)
    .filter((n) => n >= 1 && n <= 5);
  const overall = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : 0;
  return {
    overall,
    grade:
      overall >= 4.5
        ? "A+"
        : overall >= 4
          ? "A"
          : overall >= 3.5
            ? "B+"
            : overall >= 3
              ? "B"
              : overall >= 2.5
                ? "C"
                : overall >= 2
                  ? "D"
                  : "E",
    status:
      overall >= 4
        ? "Excellent"
        : overall >= 3
          ? "Good"
          : overall >= 2
            ? "Improving"
            : "Needs Support",
  };
}
const minutes = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export function salaryEntry(entry) {
  const day = new Date(entry.date + "T12:00:00Z").getUTCDay(),
    holiday = day === 1,
    weekend = day === 0 || day === 6;
  const start = weekend ? 510 : 900,
    end = weekend ? 1110 : 1140,
    login = minutes(entry.login),
    logout = minutes(entry.logout);
  const work =
    login != null && logout != null ? Math.max(0, logout - login) : 0;
  return {
    work,
    late:
      entry.role === "manager" && !holiday && login != null
        ? Math.max(0, login - start)
        : 0,
    early:
      entry.role === "manager" && !holiday && logout != null
        ? Math.max(0, end - logout)
        : 0,
    overtime:
      entry.role === "manager"
        ? holiday
          ? work
          : logout != null
            ? Math.max(0, logout - end)
            : 0
        : 0,
    holiday,
  };
}
export function salarySummary(entries) {
  return entries.reduce(
    (s, e) => {
      const m = salaryEntry(e);
      s.present += e.status !== "Leave" && !!e.login ? 1 : 0;
      s.leave += e.status === "Leave" ? 1 : 0;
      s.lateDays += m.late > 0 ? 1 : 0;
      s.earlyDays += m.early > 0 ? 1 : 0;
      s.late += m.late;
      s.early += m.early;
      s.overtime += m.overtime;
      s.work += m.work;
      return s;
    },
    {
      present: 0,
      leave: 0,
      lateDays: 0,
      earlyDays: 0,
      late: 0,
      early: 0,
      overtime: 0,
      work: 0,
    },
  );
}
