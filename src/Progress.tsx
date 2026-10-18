import { useState } from "react";
import { Plus, Printer } from "lucide-react";
import { useData, useWrite } from "./api";
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
import { assessment, SKILLS } from "../shared/rules";
export function Progress({ tab, bootstrap }: any) {
  const [batch, setBatch] = useState(""),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [selected, setSelected] = useState(""),
    [month, setMonth] = useState("");
  const { data: reviews = [] } = useData("/reviews", {
    batch_id: batch,
    search,
  });
  const write = useWrite();
  const admin = bootstrap.user.role === "admin";
  const clean = bootstrap.batches.filter((b: any) => !b.is_event);
  const avg = (key: string) =>
    reviews.length
      ? reviews.reduce((s: number, r: any) => s + Number(r[key]), 0) /
        reviews.length
      : 0;
  const report = reviews.find(
    (r: any) => String(r.student_id) === selected && r.month === month,
  );
  return (
    <>
      <PageTitle
        title={
          tab === "Overview"
            ? "Every step is progress."
            : tab === "Reviews"
              ? "Student reviews"
              : "A journey worth celebrating."
        }
        subtitle="Recognize the growth. Guide the next step."
        action={
          tab === "Reviews" ? (
            <button className="primary" onClick={() => setEditing({})}>
              <Plus size={17} /> Add Review
            </button>
          ) : tab === "Report Card" && report ? (
            <button className="primary" onClick={() => window.print()}>
              <Printer size={17} /> Print report card
            </button>
          ) : null
        }
      />
      {tab !== "Report Card" && (
        <div className="filters panel">
          <Select
            aria-label="Batch filter"
            options={clean.map((b: any) => ({
              value: b.id,
              label: b.display_name,
            }))}
            value={batch}
            placeholder="All class batches"
            onChange={setBatch}
          />
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search student"
          />
        </div>
      )}
      {tab === "Overview" && (
        <>
          <Stats
            stats={{
              "Reviews entered": reviews.length,
              "Students reviewed": new Set(
                reviews.map((r: any) => r.student_id),
              ).size,
              "Average overall": avg("overall"),
              "Average attendance %": avg("attendance"),
            }}
          />
          <div className="two-columns">
            <section className="panel">
              <div className="section-heading">
                <h2>Average skill ratings</h2>
                <span className="muted">Out of 5</span>
              </div>
              <Bars
                data={Object.fromEntries(
                  SKILLS.map((s, i) => {
                    const rr = reviews.filter(
                      (r: any) => r.ratings[i] !== null,
                    );
                    return [
                      s,
                      rr.length
                        ? rr.reduce(
                            (sum: number, r: any) => sum + Number(r.ratings[i]),
                            0,
                          ) / rr.length
                        : 0,
                    ];
                  }),
                )}
                format={(v) => v.toFixed(2)}
              />
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Performance distribution</h2>
              </div>
              <Bars
                data={Object.fromEntries(
                  ["Excellent", "Good", "Improving", "Needs Support"].map(
                    (s) => [
                      s,
                      reviews.filter((r: any) => r.status === s).length,
                    ],
                  ),
                )}
              />
              <p className="info-note">
                Progress takes practice. Monthly reviews help teachers celebrate
                strengths and identify the next area of focus.
              </p>
            </section>
          </div>
        </>
      )}
      {tab === "Reviews" && (
        <section className="panel">
          {reviews.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Student",
                      "Batch",
                      "Month",
                      "Attendance %",
                      "Overall /5",
                      "Grade",
                      "Status",
                      "",
                    ].map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r: any) => (
                    <tr key={r.id}>
                      <td className="strong">{r.student}</td>
                      <td>{r.batch}</td>
                      <td>{r.month}</td>
                      <td>{r.attendance}%</td>
                      <td>{Number(r.overall).toFixed(2)}</td>
                      <td>{r.grade}</td>
                      <td>
                        <Badge>{r.status}</Badge>
                      </td>
                      <td>
                        <RowActions
                          edit={() => setEditing(r)}
                          remove={
                            admin
                              ? () =>
                                  write.mutate({
                                    path: `/reviews/${r.id}`,
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
            <Empty text="Add a monthly review to start following each student’s progress." />
          )}
        </section>
      )}
      {tab === "Report Card" && (
        <>
          <div className="filters panel">
            <Field label="Student">
              <Select
                placeholder="Choose student"
                value={selected}
                onChange={(v: string) => {
                  setSelected(v);
                  setMonth("");
                }}
                options={[
                  ...new Map(
                    reviews.map((r: any) => [
                      r.student_id,
                      {
                        value: r.student_id,
                        label: `${r.student} · ${r.batch}`,
                      },
                    ]),
                  ).values(),
                ]}
              />
            </Field>
            <Field label="Month">
              <Select
                placeholder="Choose month"
                value={month}
                onChange={setMonth}
                options={reviews
                  .filter((r: any) => String(r.student_id) === selected)
                  .map((r: any) => r.month)}
              />
            </Field>
          </div>
          {report ? (
            <article className="report-card">
              <div className="report-brand">
                <div className="logo-mark">DP</div>
                <div>
                  <h2>DANCE PALACE</h2>
                  <p>Nedumangad · Student Progress Report</p>
                </div>
                <span>{report.month}</span>
              </div>
              <div className="report-intro">
                <div>
                  <div className="eyebrow">CELEBRATING YOUR PROGRESS</div>
                  <h1>{report.student}</h1>
                  <p>
                    {report.batch} · Attendance {report.attendance}%
                  </p>
                </div>
                <div className="report-score">
                  <strong>
                    {Number(report.overall).toFixed(2)}
                    <small> /5</small>
                  </strong>
                  <span>Grade {report.grade}</span>
                  <Badge>{report.status}</Badge>
                </div>
              </div>
              <h2>Skill assessment</h2>
              <div className="skill-grid">
                {SKILLS.map((s, i) => (
                  <div className="skill-line" key={s}>
                    <span>{s}</span>
                    <span
                      className="rating-dots"
                      aria-label={`${report.ratings[i] ?? "Unrated"} out of 5`}
                    >
                      {Array.from({ length: 5 }, (_, j) => (
                        <i
                          className={
                            j < Number(report.ratings[i]) ? "filled" : ""
                          }
                          key={j}
                        />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted">
                1 Needs major improvement · 2 Developing · 3 Good / expected · 4
                Very good · 5 Excellent
              </p>
              {[
                ["Strengths", "strengths"],
                ["Needs improvement", "needs_improvement"],
                ["Teacher remarks", "remarks"],
              ].map(([label, key]) => (
                <section className="feedback" key={key}>
                  <h3>{label}</h3>
                  <p>{report[key] || "—"}</p>
                </section>
              ))}
              <footer>
                Keep moving. Keep growing. <span>Dance Palace, Nedumangad</span>
              </footer>
            </article>
          ) : (
            <Empty text="Choose a student and month to view their printable report card." />
          )}
        </>
      )}
      {editing && (
        <ReviewModal
          initial={editing}
          bootstrap={bootstrap}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function ReviewModal({ initial, bootstrap, onClose }: any) {
  const [form, setForm] = useState<any>({
    batch_id: "",
    student_id: "",
    month: "2026-04",
    attendance: 0,
    ratings: Array(10).fill(null),
    strengths: "",
    needs_improvement: "",
    remarks: "",
    ...initial,
  });
  const { data: students = [] } = useData(
    "/students",
    { batch_id: form.batch_id },
    !!form.batch_id,
  );
  const write = useWrite();
  const a = assessment(form.ratings);
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });
  return (
    <Modal
      title={initial.id ? "Edit review" : "Add monthly review"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await write.mutateAsync({
              path: initial.id ? `/reviews/${initial.id}` : "/reviews",
              method: initial.id ? "put" : "post",
              data: form,
            });
            onClose();
          } catch {}
        }}
      >
        <div className="form-grid">
          <Field label="Batch" required>
            <Select
              placeholder="Choose class batch"
              value={form.batch_id}
              options={bootstrap.batches
                .filter((b: any) => !b.is_event)
                .map((b: any) => ({ value: b.id, label: b.display_name }))}
              onChange={(v: string) =>
                setForm({ ...form, batch_id: v, student_id: "" })
              }
            />
          </Field>
          <Field label="Student" required>
            <Select
              placeholder="Choose student"
              value={form.student_id}
              options={students.map((s: any) => ({
                value: s.id,
                label: s.name,
              }))}
              onChange={(v: string) => set("student_id", v)}
            />
          </Field>
          <Field label="Month" required>
            <input
              required
              type="month"
              value={form.month}
              onChange={(e) => set("month", e.target.value)}
            />
          </Field>
          <Field label="Attendance %" required>
            <input
              required
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.attendance}
              onChange={(e) => set("attendance", Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="info-note">
          Overall <strong>{a.overall.toFixed(2)} /5</strong> · Grade{" "}
          <strong>{a.grade}</strong> · {a.status}
        </div>
        <p className="muted">
          1 Needs major improvement · 2 Developing · 3 Good / expected · 4 Very
          good · 5 Excellent
        </p>
        <div className="rating-form">
          {SKILLS.map((s, i) => (
            <Field label={s} key={s}>
              <Select
                placeholder="Not rated"
                value={form.ratings[i] ?? ""}
                options={[1, 2, 3, 4, 5]}
                onChange={(v: string) =>
                  set(
                    "ratings",
                    form.ratings.map((n: number | null, j: number) =>
                      j === i ? (v ? Number(v) : null) : n,
                    ),
                  )
                }
              />
            </Field>
          ))}
        </div>
        {[
          ["Strengths", "strengths"],
          ["Needs improvement", "needs_improvement"],
          ["Teacher remarks", "remarks"],
        ].map(([label, key]) => (
          <Field key={key} label={label}>
            <textarea
              value={form[key]}
              onChange={(e) => set(key, e.target.value)}
            />
          </Field>
        ))}
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={
              !form.student_id ||
              !form.month ||
              !form.ratings.some((n: any) => n !== null) ||
              write.isPending
            }
          >
            Save review
          </button>
        </div>
      </form>
    </Modal>
  );
}
