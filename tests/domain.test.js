import test from "node:test";
import assert from "node:assert/strict";
import {
  monthRun,
  slideMonths,
  carryForward,
  transactionStatus,
  scoreReview,
  salaryEntry,
  salarySummary,
  feeLabel,
} from "../shared/domain.js";
test("six-month window crosses December with real years", () => {
  const run = monthRun("September", 2026, 6);
  assert.deepEqual(run, [
    { month: "September", year: 2026 },
    { month: "October", year: 2026 },
    { month: "November", year: 2026 },
    { month: "December", year: 2026 },
    { month: "January", year: 2027 },
    { month: "February", year: 2027 },
  ]);
  assert.equal(
    feeLabel(monthRun("December", 2026, 3)),
    "Dec, Jan '27, Feb '27",
  );
});
test("sliding windows extend at the end, restart far away, single month toggles", () => {
  let run = slideMonths([], 5, 2026, 3);
  assert.deepEqual(
    run.map((m) => m.month),
    ["June", "July", "August"],
  );
  run = slideMonths(run, 8, 2026, 3);
  assert.deepEqual(
    run.map((m) => m.month),
    ["July", "August", "September"],
  );
  assert.equal(slideMonths(run, 0, 2026, 3)[0].month, "January");
  assert.deepEqual(slideMonths(monthRun(0, 2026, 1), 0, 2026, 1), []);
  assert.equal(slideMonths(monthRun(11, 2026, 3), 2, 2026, 3)[0].year, 2027);
});
test("carry forward sums all historical income balances and overpayments, excluding edit", () => {
  const result = carryForward(
    [
      { id: "DP-1", type: "Income", balance: 500, over_paid: 0 },
      { id: "DP-2", type: "Income", balance: 580, over_paid: 0 },
      { id: "DP-3", type: "Income", balance: 0, over_paid: 100 },
      { id: "DP-4", type: "Expense", balance: 999 },
      { id: "DP-5", type: "Income", balance: 90 },
    ],
    "DP-5",
  );
  assert.equal(result.balance, 1080);
  assert.equal(result.overPaid, 100);
  assert.deepEqual(result.ids, ["DP-1", "DP-2", "DP-3"]);
});
test("status derives only from outstanding balance", () => {
  assert.equal(transactionStatus(1), "Pending");
  assert.equal(transactionStatus(0), "Completed");
});
test("grade and status boundaries include sample 2.54", () => {
  assert.deepEqual(scoreReview({ sample: 2.54 }), {
    overall: 2.54,
    grade: "C",
    status: "Improving",
  });
  for (const [value, grade, status] of [
    [4.5, "A+", "Excellent"],
    [4, "A", "Excellent"],
    [3.5, "B+", "Good"],
    [3, "B", "Good"],
    [2.5, "C", "Improving"],
    [2, "D", "Improving"],
    [1, "E", "Needs Support"],
  ]) {
    assert.equal(scoreReview({ a: value }).grade, grade);
    assert.equal(scoreReview({ a: value }).status, status);
  }
});
test("manager weekday late, early and overtime use fixed shift", () => {
  assert.deepEqual(
    salaryEntry({
      role: "manager",
      date: "2026-10-06",
      login: "15:15",
      logout: "18:30",
    }),
    { work: 195, late: 15, early: 30, overtime: 0, holiday: false },
  );
  assert.equal(
    salaryEntry({
      role: "manager",
      date: "2026-10-10",
      login: "08:30",
      logout: "19:30",
    }).overtime,
    60,
  );
});
test("Monday work is all overtime, incomplete and leave entries are safe", () => {
  const e = {
    role: "manager",
    date: "2026-10-05",
    login: "10:00",
    logout: "12:00",
  };
  assert.equal(salaryEntry(e).overtime, 120);
  assert.equal(salaryEntry({ ...e, logout: null }).work, 0);
  const s = salarySummary([
    e,
    { role: "manager", date: "2026-10-06", status: "Leave" },
  ]);
  assert.equal(s.present, 1);
  assert.equal(s.leave, 1);
  assert.equal(s.overtime, 120);
  assert.equal(salaryEntry({ ...e, role: "faculty" }).overtime, 0);
});
