import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessment,
  carryForward,
  countMonths,
  pickMonths,
  runMonths,
  salary,
  statusFor,
  indiaNow,
} from "../shared/rules.js";
test("six-month September window crosses into next year", () => {
  assert.deepEqual(runMonths({ month: 9, year: 2026 }, 6), [
    { month: 9, year: 2026 },
    { month: 10, year: 2026 },
    { month: 11, year: 2026 },
    { month: 12, year: 2026 },
    { month: 1, year: 2027 },
    { month: 2, year: 2027 },
  ]);
});
test("month picker radio and sliding window wrap", () => {
  const june = pickMonths([], 6, 2026, 3);
  assert.deepEqual(
    june.map((m) => m.month),
    [6, 7, 8],
  );
  assert.deepEqual(
    pickMonths(june, 9, 2026, 3).map((m) => m.month),
    [7, 8, 9],
  );
  assert.deepEqual(
    pickMonths(june, 2, 2026, 3).map((m) => m.month),
    [2, 3, 4],
  );
  assert.deepEqual(pickMonths([{ month: 3, year: 2026 }], 3, 2026, 1), []);
  assert.deepEqual(
    pickMonths(runMonths({ month: 10, year: 2026 }, 3), 1, 2026, 3),
    runMonths({ month: 11, year: 2026 }, 3),
  );
  assert.equal(countMonths("Classical Fees"), 1);
});
test("carry-forward includes every unpaid balance and overpayment", () => {
  const r = carryForward(
    [
      { id: "DP-1", balance: 500, over_paid: 0 },
      { id: "DP-2", balance: 580, over_paid: 0 },
      { id: "DP-3", balance: 0, over_paid: 100 },
    ],
    1360,
    60,
  );
  assert.equal(r.amount, 2280);
  assert.deepEqual(r.balanceIds, ["DP-1", "DP-2"]);
  assert.deepEqual(r.creditIds, ["DP-3"]);
  assert.equal(statusFor(1), "Pending");
  assert.equal(statusFor(0), "Completed");
});
test("salary shift calculations: weekday, weekend, holiday and partial day", () => {
  assert.deepEqual(
    salary({ date: "2026-10-20", login: "15:15", logout: "18:45" }),
    { late: 15, early: 15, overtime: 0, work: 210, holiday: false },
  );
  assert.equal(
    salary({ date: "2026-10-18", login: "08:30", logout: "19:30" }).overtime,
    60,
  );
  const mon = salary({ date: "2026-10-19", login: "10:00", logout: "12:30" });
  assert.equal(mon.overtime, 150);
  assert.equal(mon.late, 0);
  assert.equal(salary({ date: "2026-10-20", login: "15:10" }).early, 0);
  assert.equal(
    salary({
      date: "2026-10-20",
      role: "faculty",
      login: "16:00",
      logout: "17:00",
    }).late,
    0,
  );
  assert.equal(salary({ date: "2026-10-20", status: "Leave" }).work, 0);
});
test("progress grade/status thresholds and unrated skills", () => {
  const r = assessment([2.54]);
  assert.equal(r.grade, "C");
  assert.equal(r.status, "Improving");
  assert.equal(assessment([5, null, 4]).grade, "A+");
  assert.equal(assessment([2]).status, "Improving");
});
test("India clock is independent of host time zone", () =>
  assert.deepEqual(indiaNow(new Date("2026-10-18T20:00:00Z")), {
    date: "2026-10-19",
    time: "01:30",
  }));
