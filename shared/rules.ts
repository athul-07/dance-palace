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
export const SHEETS = BATCHES.map((b) =>
  b === "Superkids Beginners - Morning"
    ? "Superkids Beginners-Morn"
    : b === "Superkids Beginners - Evening"
      ? "Superkids Beginner-Even"
      : b,
);
export const AMOUNTS: Record<string, number> = {
  "Monthly Fees": 1360,
  "3 Month Fees": 3780,
  "6 Month Fees": 6540,
  "Admission Fees": 2000,
  "Classical Fees": 1200,
  Regular: 1000,
  "Online Class": 1000,
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
export type FeeMonth = { year: number; month: number };
export const countMonths = (category: string, amount?: number) =>
  category === "6 Month Fees"
    ? 6
    : category === "3 Month Fees"
      ? 3
      : !category && amount === 6540
        ? 6
        : !category && amount === 3780
          ? 3
          : 1;
export function runMonths(start: FeeMonth, count: number): FeeMonth[] {
  return Array.from({ length: count }, (_, i) => ({
    year: start.year + Math.floor((start.month - 1 + i) / 12),
    month: ((start.month - 1 + i) % 12) + 1,
  }));
}
export function pickMonths(
  current: FeeMonth[],
  month: number,
  year: number,
  count: number,
): FeeMonth[] {
  if (count === 1) return current[0]?.month === month ? [] : [{ month, year }];
  if (!current.length) return runMonths({ month, year }, count);
  const first = current[0],
    last = current.at(-1)!;
  const after = (last.month % 12) + 1,
    before = ((first.month + 10) % 12) + 1;
  if (month === after) return runMonths(runMonths(first, 2)[1], count);
  if (month === before)
    return runMonths(
      { month, year: first.year - (first.month === 1 ? 1 : 0) },
      count,
    );
  return runMonths({ month, year }, count);
}
export const feeLabel = (m: FeeMonth, startYear: number) =>
  `${MONTHS[m.month - 1].slice(0, 3)}${m.year !== startYear ? ` '${String(m.year).slice(-2)}` : ""}`;
export const money = (n: number | string = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n));
export const dateLabel = (s: string) =>
  s
    ? new Date(s.slice(0, 10) + "T00:00:00Z")
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
        .replaceAll(" ", "-")
    : "";
export function indiaNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = (t: string) => parts.find((x) => x.type === t)!.value;
  return {
    date: `${p("year")}-${p("month")}-${p("day")}`,
    time: `${p("hour")}:${p("minute")}`,
  };
}
export function carryForward(history: any[], actual: number, discounts = 0) {
  const balances = history.filter((t) => Number(t.balance) > 0),
    overpaid = history.filter((t) => Number(t.over_paid) > 0);
  const balance = balances.reduce((s, t) => s + Number(t.balance), 0),
    credit = overpaid.reduce((s, t) => s + Number(t.over_paid), 0);
  return {
    amount: Math.round((actual - discounts + balance - credit) * 100) / 100,
    balance,
    credit,
    balanceIds: balances.map((t) => t.id),
    creditIds: overpaid.map((t) => t.id),
  };
}
export const statusFor = (balance: number) =>
  balance > 0 ? "Pending" : "Completed";
export function assessment(ratings: (number | null)[]) {
  const rated = ratings.filter((n): n is number => n !== null && n > 0);
  const overall = rated.length
    ? rated.reduce((a, b) => a + b, 0) / rated.length
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
export function salary(entry: {
  date: string;
  login?: string | null;
  logout?: string | null;
  status?: string;
  role?: string;
}) {
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const dow = new Date(entry.date.slice(0, 10) + "T12:00:00Z").getUTCDay();
  const holiday = dow === 1,
    start = dow === 0 || dow === 6 ? 510 : 900,
    end = dow === 0 || dow === 6 ? 1110 : 1140;
  if (entry.status === "Leave")
    return { late: 0, early: 0, overtime: 0, work: 0, holiday };
  const login = entry.login ? minutes(entry.login) : null,
    logout = entry.logout ? minutes(entry.logout) : null;
  const work =
    login !== null && logout !== null ? Math.max(0, logout - login) : 0;
  return {
    late:
      entry.role === "faculty" || holiday || login === null
        ? 0
        : Math.max(0, login - start),
    early:
      entry.role === "faculty" || holiday || logout === null
        ? 0
        : Math.max(0, end - logout),
    overtime:
      entry.role === "faculty"
        ? 0
        : holiday
          ? work
          : logout === null
            ? 0
            : Math.max(0, logout - end),
    work,
    holiday,
  };
}
export const MANAGER_COLUMNS: Record<string, string[]> = {
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
