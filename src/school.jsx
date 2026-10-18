import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import { Check, Pencil, Printer, Plus, Download } from "lucide-react";
import { useData, useStore, useWrite, params } from "./api";
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
  Empty,
  ErrorNotice,
  BarChart,
  ConfirmDelete,
} from "./components";
import { MONTHS, SKILLS, scoreReview, today } from "../shared/domain";
export function Attendance() {
  const write = useWrite();
  const [year, Y] = useState(2026),
    [month, M] = useState("September"),
    [sheet, S] = useState(""),
    [edit, E] = useState(false),
    [search, Q] = useState(""),
    [add, A] = useState(null),
    [value, V] = useState(""),
    [busy, B] = useState(false);
  const data = useData(["attendance", year], "/attendance?year=" + year);
  const all = data.data?.sheets || [],
    months = MONTHS.filter((m) => all.some((s) => s.month === m)),
    sheets = all.filter((s) => s.month === month);
  const current = sheets.find((s) => s.sheet === sheet) || sheets[0];
  const readOnly = ["Dashboard", "Student Summary"].includes(current?.sheet);
  const grid = current?.grid || [],
    filtered = grid
      .map((r, i) => ({ r, i }))
      .slice(2)
      .filter(({ r }) =>
        String(r[1]).toLowerCase().includes(search.toLowerCase()),
      );
  const nav = document.getElementById("attendance-nav");
  const update = async (row, col, value) => {
    try {
      await write("patch", `/attendance/${current.id}/cell`, {
        row,
        col,
        value,
      });
    } catch {}
  };
  return (
    <>
      {nav &&
        createPortal(
          <div className="attendance-nav">
            <div className="workspace-label">ATTENDANCE YEAR</div>
            <div className="year-control">
              <Select
                aria-label="Attendance year"
                options={[
                  ...new Set([2026, year, ...(data.data?.years || [])]),
                ].sort()}
                value={year}
                onChange={(e) => Y(Number(e.target.value))}
              />
              <button
                className="icon-button"
                title="Add year"
                aria-label="Add attendance year"
                onClick={() => {
                  A("year");
                  V(String(year + 1));
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="month-nav">
              {months.map((m) => (
                <button
                  key={m}
                  className={m === month ? "active" : ""}
                  onClick={() => {
                    M(m);
                    S("");
                  }}
                >
                  {m}
                  <span>{all.filter((s) => s.month === m).length}</span>
                </button>
              ))}
            </div>
            <button
              className="text-button"
              onClick={() => {
                A("month");
                V(MONTHS.find((m) => !months.includes(m)) || "January");
              }}
            >
              + Add month
            </button>
          </div>,
          nav,
        )}
      <div className="attendance-tabs subtabs">
        {sheets.map((s) => (
          <button
            className={current?.id === s.id ? "active" : ""}
            key={s.id}
            onClick={() => S(s.sheet)}
          >
            {s.sheet}
          </button>
        ))}
      </div>
      <PageTitle
        eyebrow="ATTENDANCE / CLASS REGISTER"
        title="Showing up is the first step."
        subtitle={`${month} ${year} · ${current?.sheet || "Choose a month"} · Attendance saves as you go.`}
      >
        <a className="button ghost" href={`/api/export/attendance/${year}`}>
          <Download size={16} />
          Export year
        </a>
        {current && !readOnly && (
          <Button variant={edit ? "" : "ghost"} onClick={() => E(!edit)}>
            <Pencil size={15} />
            {edit ? "Done editing" : "Edit"}
          </Button>
        )}
      </PageTitle>
      <ErrorNotice query={data} />
      <div className="filters standalone attendance-mobile-controls">
        <Select
          aria-label="Year"
          options={[...new Set([year, ...(data.data?.years || [])])]}
          value={year}
          onChange={(e) => Y(Number(e.target.value))}
        />
        <Select
          aria-label="Month"
          options={months}
          value={month}
          onChange={(e) => M(e.target.value)}
        />
        <Button
          variant="ghost"
          onClick={() => {
            A("month");
            V("October");
          }}
        >
          + Month
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            A("year");
            V(String(year + 1));
          }}
        >
          + Year
        </Button>
      </div>
      {current ? (
        <Card
          title={current.sheet}
          subtitle={`${filtered.length} students · ✓ present · · absent`}
          action={
            <div className="actions">
              <SearchBox
                value={search}
                onChange={Q}
                placeholder="Search student…"
              />
              {edit && !readOnly && (
                <AddButton
                  variant="ghost"
                  onClick={() => {
                    A("student");
                    V("");
                  }}
                >
                  Student
                </AddButton>
              )}
            </div>
          }
        >
          <div className="table-scroll attendance-table">
            <table>
              <thead>
                {grid.slice(0, 2).map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <th className={j === 1 ? "sticky-name" : ""} key={j}>
                        {String(c)}
                      </th>
                    ))}
                    <th>{i === 0 ? "Present" : "Total"}</th>
                  </tr>
                ))}
              </thead>
              <tbody>
                {filtered.map(({ r, i }) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td className={j === 1 ? "sticky-name" : ""} key={j}>
                        {j < 2 ? (
                          <span
                            contentEditable={edit && !readOnly}
                            suppressContentEditableWarning
                            onBlur={(e) => {
                              if (e.target.textContent !== String(v))
                                update(i, j, e.target.textContent);
                            }}
                          >
                            {String(v)}
                          </span>
                        ) : typeof v === "boolean" ? (
                          <button
                            className={
                              "attendance-cell " + (v ? "present" : "absent")
                            }
                            aria-label={`${r[1]} day ${j - 1}: ${v ? "present" : "absent"}`}
                            disabled={
                              !edit ||
                              readOnly ||
                              j - 1 >
                                new Date(
                                  year,
                                  MONTHS.indexOf(month) + 1,
                                  0,
                                ).getDate()
                            }
                            onClick={() => update(i, j, !v)}
                          >
                            {v ? "✓" : "·"}
                          </button>
                        ) : (
                          <span
                            contentEditable={edit && !readOnly}
                            suppressContentEditableWarning
                            onBlur={(e) => {
                              if (e.target.textContent !== String(v))
                                update(i, j, e.target.textContent);
                            }}
                          >
                            {String(v)}
                          </span>
                        )}
                      </td>
                    ))}
                    <td>
                      <strong>
                        {r.slice(2).filter((v) => v === true).length}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <Empty
              title="No students in this sheet"
              text="Add students here or through the Student Register."
            />
          )}
        </Card>
      ) : (
        <Card>
          <Empty
            title="A fresh month awaits"
            text="Add a month to generate attendance sheets for every class batch."
            action={
              <AddButton
                onClick={() => {
                  A("month");
                  V(month);
                }}
              >
                Add Month
              </AddButton>
            }
          />
        </Card>
      )}
      {add && (
        <Modal title={"Add " + add} onClose={() => A(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              B(true);
              try {
                if (add === "year") {
                  await write("post", "/attendance/year", {
                    year: Number(value),
                  });
                  Y(Number(value));
                } else if (add === "month") {
                  await write("post", "/attendance/month", {
                    year,
                    month: value,
                  });
                  M(value);
                } else
                  await write("post", `/attendance/${current.id}/student`, {
                    name: value,
                  });
                A(null);
              } catch {
              } finally {
                B(false);
              }
            }}
          >
            <div className="modal-body">
              <Field label={add} required>
                {add === "month" ? (
                  <Select
                    options={MONTHS.filter((m) => !months.includes(m))}
                    value={value}
                    onChange={(e) => V(e.target.value)}
                  />
                ) : (
                  <input
                    type={add === "year" ? "number" : "text"}
                    min={add === "year" ? 1900 : undefined}
                    max={add === "year" ? 9999 : undefined}
                    required
                    value={value}
                    onChange={(e) => V(e.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="modal-footer">
              <Button disabled={busy || !value}>Add {add}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function ReviewForm({ initial, onClose, batches, students }) {
  const write = useWrite();
  const [batch, B] = useState(initial?.batch || ""),
    [form, F] = useState(
      initial
        ? { ...initial }
        : {
            student_id: "",
            month: today().slice(0, 7),
            attendance: 0,
            ratings: Object.fromEntries(SKILLS.map((s) => [s, 3])),
            strengths: "",
            needs_improvement: "",
            remarks: "",
          },
    ),
    [busy, W] = useState(false);
  const score = scoreReview(form.ratings),
    set = (k, v) => F((f) => ({ ...f, [k]: v }));
  return (
    <Modal
      title={initial ? "Edit monthly review" : "Add monthly review"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          W(true);
          try {
            await write(
              initial ? "put" : "post",
              "/reviews" + (initial ? "/" + initial.id : ""),
              form,
            );
            onClose();
          } catch {
          } finally {
            W(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            <Field label="Batch" required>
              <Select
                placeholder="Choose batch"
                options={batches
                  .filter((b) => !b.is_event)
                  .map((b) => b.display_name)}
                value={batch}
                onChange={(e) => {
                  B(e.target.value);
                  set("student_id", "");
                }}
              />
            </Field>
            <Field label="Student" required>
              <Select
                required
                placeholder="Choose student"
                options={students
                  .filter((s) => s.batch === batch)
                  .map((s) => ({ value: s.id, label: s.name }))}
                value={form.student_id}
                onChange={(e) => set("student_id", e.target.value)}
              />
            </Field>
            <Field label="Review month" required>
              <input
                type="month"
                required
                value={form.month}
                onChange={(e) => set("month", e.target.value)}
              />
            </Field>
            <Field label="Attendance %" required>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={form.attendance}
                onChange={(e) => set("attendance", e.target.value)}
              />
            </Field>
          </div>
          <div className="score-preview">
            <strong>
              {score.overall.toFixed(2)} <small>/ 5</small>
            </strong>
            <span>Grade {score.grade}</span>
            <Badge>{score.status}</Badge>
          </div>
          <div className="skill-ratings">
            {SKILLS.map((s) => (
              <div key={s}>
                <span>{s}</span>
                <div role="group" aria-label={s}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      type="button"
                      key={v}
                      aria-pressed={Number(form.ratings[s]) === v}
                      className={
                        Number(form.ratings[s]) === v ? "selected" : ""
                      }
                      onClick={() =>
                        F((f) => ({ ...f, ratings: { ...f.ratings, [s]: v } }))
                      }
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="muted tiny">
            1 Needs major improvement · 2 Developing · 3 Good / expected · 4
            Very good · 5 Excellent
          </p>
          {[
            ["strengths", "Strengths"],
            ["needs_improvement", "Needs improvement"],
            ["remarks", "Teacher remarks"],
          ].map(([k, l]) => (
            <Field label={l} key={k}>
              <textarea
                rows="2"
                value={form[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <div className="modal-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !form.student_id}>Save review</Button>
        </div>
      </form>
    </Modal>
  );
}
export function Progress() {
  const { tab } = useParams(),
    write = useWrite(),
    user = useStore((s) => s.user);
  const [batch, B] = useState(""),
    [search, Q] = useState(""),
    [edit, E] = useState(null),
    [student, S] = useState(""),
    [month, M] = useState("");
  const batches = useData("batches", "/batches"),
    students = useData("students-all", "/students");
  const reviews = useData(
    ["reviews", batch, search],
    "/reviews?" + params({ batch, search }),
  );
  const data = reviews.data || [],
    report = data.find(
      (r) => String(r.student_id) === student && r.month === month,
    );
  const average = (k) =>
    data.length ? data.reduce((s, r) => s + Number(r[k]), 0) / data.length : 0;
  return (
    <>
      <PageTitle
        eyebrow="PROGRESS REPORT / STUDENT DEVELOPMENT"
        title={
          tab === "report"
            ? "A story of progress."
            : tab === "reviews"
              ? "Small steps. Real progress."
              : "Watch their confidence grow."
        }
        subtitle="Celebrate strengths, guide improvement, and make every class count."
      >
        {tab !== "report" && (
          <AddButton onClick={() => E({})}>Add Review</AddButton>
        )}
        {tab === "report" && report && (
          <Button onClick={() => window.print()}>
            <Printer size={17} />
            Print report
          </Button>
        )}
      </PageTitle>
      <ErrorNotice query={reviews} />
      {tab === "overview" ? (
        <>
          <Stats
            items={[
              ["Reviews entered", data.length, "Monthly observations"],
              [
                "Students reviewed",
                new Set(data.map((r) => r.student_id)).size,
                "Across class batches",
              ],
              [
                "Average overall",
                average("overall").toFixed(2) + " / 5",
                "Ten assessed skills",
                "teal-text",
              ],
              [
                "Average attendance",
                average("attendance").toFixed(1) + "%",
                "Reviewed students",
              ],
            ]}
          />
          <div className="progress-charts">
            <Card
              title="Average skill ratings"
              subtitle="Each skill rated on a scale of 1–5"
            >
              <div className="horizontal-chart">
                {SKILLS.map((s) => {
                  const n = data.length
                    ? data.reduce((a, r) => a + Number(r.ratings[s] || 0), 0) /
                      data.length
                    : 0;
                  return (
                    <div key={s}>
                      <span>{s}</span>
                      <div>
                        <i style={{ width: (n / 5) * 100 + "%" }} />
                      </div>
                      <strong>{n.toFixed(1)}</strong>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card
              title="Performance distribution"
              subtitle="Where our dancers are today"
            >
              <BarChart
                items={["Excellent", "Good", "Improving", "Needs Support"].map(
                  (s) => ({
                    label: s,
                    value: data.filter((r) => r.status === s).length,
                  }),
                )}
              />
            </Card>
          </div>
        </>
      ) : tab === "report" ? (
        <>
          <div className="filters standalone no-print">
            <Field label="Student">
              <Select
                placeholder="Choose student"
                options={[
                  ...new Map(
                    data.map((r) => [
                      r.student_id,
                      {
                        value: r.student_id,
                        label: r.student + " · " + r.batch,
                      },
                    ]),
                  ).values(),
                ]}
                value={student}
                onChange={(e) => {
                  S(e.target.value);
                  M("");
                }}
              />
            </Field>
            <Field label="Review month">
              <Select
                placeholder="Choose month"
                options={data
                  .filter((r) => String(r.student_id) === student)
                  .map((r) => r.month)}
                value={month}
                onChange={(e) => M(e.target.value)}
              />
            </Field>
          </div>
          {report ? (
            <article className="report-card" id="print-report">
              <header>
                <div className="brand">
                  <span className="brand-mark">
                    dp<span>✦</span>
                  </span>
                  <div>
                    Dance Palace<small>NEDUMANGAD</small>
                  </div>
                </div>
                <span>
                  STUDENT PROGRESS REPORT
                  <br />
                  {report.month}
                </span>
              </header>
              <div className="report-identity">
                <div>
                  <div className="eyebrow">CELEBRATING YOUR JOURNEY</div>
                  <h1>{report.student}</h1>
                  <p>
                    {report.batch} · Attendance {report.attendance}%
                  </p>
                </div>
                <div>
                  <strong>
                    {Number(report.overall).toFixed(2)} <small>/ 5</small>
                  </strong>
                  <div>
                    Grade {report.grade} <Badge>{report.status}</Badge>
                  </div>
                </div>
              </div>
              <h2>Skill assessment</h2>
              <div className="report-skills">
                {SKILLS.map((s) => (
                  <div key={s}>
                    <span>{s}</span>
                    <span className="rating-dots">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <i
                          className={n <= report.ratings[s] ? "filled" : ""}
                          key={n}
                        />
                      ))}
                      <small>{report.ratings[s]} / 5</small>
                    </span>
                  </div>
                ))}
              </div>
              {[
                ["strengths", "Strengths"],
                ["needs_improvement", "Areas to grow"],
                ["remarks", "A note from your teacher"],
              ].map(([k, l]) => (
                <section key={k}>
                  <h3>{l}</h3>
                  <p>{report[k] || "No feedback recorded."}</p>
                </section>
              ))}
              <footer>
                Every dancer grows at their own pace.
                <span>Dance Palace · Nedumangad</span>
              </footer>
            </article>
          ) : (
            <Card>
              <Empty
                title="Their next chapter"
                text="Choose a student and review month to view a printable report card."
              />
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="filters standalone">
            <Select
              aria-label="Review batch filter"
              placeholder="All class batches"
              options={
                batches.data
                  ?.filter((b) => !b.is_event)
                  .map((b) => b.display_name) || []
              }
              value={batch}
              onChange={(e) => B(e.target.value)}
            />
            <SearchBox
              placeholder="Search student…"
              value={search}
              onChange={Q}
            />
          </div>
          <Card title="Monthly reviews" subtitle={`${data.length} reviews`}>
            <Table
              headers={[
                "Student",
                "Batch",
                "Month",
                "Attendance",
                "Overall",
                "Grade",
                "Status",
                "",
              ]}
              empty={!data.length}
            >
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.student}</strong>
                  </td>
                  <td>{r.batch}</td>
                  <td>{r.month}</td>
                  <td>{r.attendance}%</td>
                  <td>
                    <strong>{Number(r.overall).toFixed(2)}</strong> / 5
                  </td>
                  <td>
                    <span className="grade">{r.grade}</span>
                  </td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                  <td>
                    <RowActions
                      onEdit={() => E(r)}
                      onDelete={
                        user.role === "admin"
                          ? () =>
                              ConfirmDelete({
                                onConfirm: () =>
                                  write("delete", "/reviews/" + r.id),
                              })
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
      {edit && (
        <ReviewForm
          initial={edit.id ? edit : null}
          onClose={() => E(null)}
          batches={batches.data || []}
          students={students.data || []}
        />
      )}
    </>
  );
}
