import { useState } from "react";
import { Plus, Copy, Check } from "lucide-react";
import { useData, useWrite, notify } from "./api";
import {
  Badge,
  Empty,
  Field,
  Modal,
  PageTitle,
  RowActions,
  SearchBox,
  Select,
  Stats,
} from "./components";
import { MONTHS, dateLabel, indiaNow } from "../shared/rules";
export function ManagerTable({ name, bootstrap }: any) {
  const [search, setSearch] = useState(""),
    [editing, setEditing] = useState<any>(null);
  const { data } = useData(`/manager/${name}`, { search });
  const write = useWrite();
  const admin = bootstrap.user.role === "admin";
  return (
    <>
      <PageTitle
        title={name}
        subtitle="The small details that keep your studio moving."
        action={
          <button className="primary" onClick={() => setEditing({ data: {} })}>
            <Plus size={17} /> Add record
          </button>
        }
      />
      <section className="panel">
        <div className="filters">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={`Search ${name.toLowerCase()}`}
          />
          <span className="muted">{data?.rows.length || 0} records</span>
        </div>
        {data?.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {data.columns.map((c: string) => (
                    <th key={c}>{c}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.id}>
                    {data.columns.map((c: string) => (
                      <td key={c} className="wrap">
                        {String(r.data[c] ?? "")}
                      </td>
                    ))}
                    <td>
                      <RowActions
                        edit={() => setEditing(r)}
                        remove={
                          admin
                            ? () =>
                                write.mutate({
                                  path: `/manager/${name}/${r.id}`,
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
          <Empty />
        )}
      </section>
      {editing && (
        <Modal
          title={`${editing.id ? "Edit" : "Add"} · ${name}`}
          onClose={() => setEditing(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: `/manager/${name}${editing.id ? "/" + editing.id : ""}`,
                  method: editing.id ? "put" : "post",
                  data: { data: editing.data },
                });
                setEditing(null);
              } catch {}
            }}
          >
            <div className="form-grid">
              {data?.columns.map((c: string) => (
                <Field
                  key={c}
                  label={c}
                  required={name === "Student Register" && c === "NAME"}
                >
                  {/^batch/i.test(c) ? (
                    <Select
                      placeholder="Choose class batch"
                      value={editing.data[c] || ""}
                      options={bootstrap.batches
                        .filter((b: any) => !b.is_event)
                        .map((b: any) => b.display_name)}
                      onChange={(v: string) =>
                        setEditing({
                          ...editing,
                          data: { ...editing.data, [c]: v },
                        })
                      }
                    />
                  ) : (
                    <input
                      required={name === "Student Register" && c === "NAME"}
                      value={editing.data[c] ?? ""}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          data: { ...editing.data, [c]: e.target.value },
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="primary" disabled={write.isPending}>
                Save record
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Templates() {
  const { data = [] } = useData("/templates");
  return (
    <>
      <PageTitle
        title="A few words, ready to go."
        subtitle="Reusable messages for your studio. Edit a message and click outside to save."
      />
      <div className="template-grid">
        {data.map((t: any) => (
          <Template key={t.id} template={t} />
        ))}
      </div>
    </>
  );
}
function Template({ template }: any) {
  const [text, setText] = useState(template.text),
    [copied, setCopied] = useState(false);
  const write = useWrite();
  return (
    <section className="panel template">
      <div className="section-heading">
        <h2>{template.title}</h2>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              notify(
                "Clipboard unavailable. Select and copy the message text.",
              );
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        aria-label={template.title}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== template.text)
            write.mutate({
              path: `/templates/${template.id}`,
              method: "put",
              data: { text },
            });
        }}
      />
      <p className="muted">
        Personalize {"{name}"}, {"{month}"} and {"{amount}"} before sending.
      </p>
    </section>
  );
}
export function Worklog({ bootstrap }: any) {
  const [role, setRole] = useState("manager"),
    [person, setPerson] = useState(""),
    [month, setMonth] = useState("04"),
    [year, setYear] = useState("2026"),
    [day, setDay] = useState(""),
    [add, setAdd] = useState(false),
    [name, setName] = useState(""),
    [form, setForm] = useState<any>({ login: "", logout: "", batch: "" });
  const { data: people = [] } = useData("/worklog/people");
  const list = people.filter((p: any) => p.role === role);
  const personId = person || String(list[0]?.id || "");
  const { data } = useData(
    "/worklog/entries",
    { person_id: personId, month: `${year}-${month}` },
    !!personId,
  );
  const write = useWrite();
  const days = new Date(Number(year), Number(month), 0).getDate(),
    offset = new Date(Number(year), Number(month) - 1, 1).getDay();
  const today = indiaNow().date;
  const entries = data?.rows.filter((e: any) => e.date === day) || [];
  const admin = bootstrap.user.role === "admin";
  const action = async (a: string) => {
    try {
      await write.mutateAsync({
        path: "/worklog/entries",
        data: {
          person_id: Number(personId),
          date: day,
          action: a,
          ...(a === "faculty" ? form : {}),
        },
      });
    } catch {}
  };
  const stats = data?.stats
    ? Object.fromEntries(
        Object.entries(data.stats).filter(([k]) =>
          role === "manager"
            ? k !== "Classes taken"
            : [
                "Present days",
                "Leave days",
                "Classes taken",
                "Work hours",
              ].includes(k),
        ),
      )
    : undefined;
  return (
    <>
      <PageTitle
        title="Time well spent."
        subtitle="Attendance and working hours, ready for your monthly salary review."
      />
      <div className="worklog-controls panel">
        <div className="segmented">
          {["manager", "faculty"].map((r) => (
            <button
              key={r}
              className={role === r ? "selected" : ""}
              onClick={() => {
                setRole(r);
                setPerson("");
                setDay("");
              }}
            >
              {r === "manager" ? "Manager" : "Faculty"}
            </button>
          ))}
        </div>
        <div className="filters">
          <Select
            aria-label="Staff member"
            value={personId}
            placeholder={list.length ? undefined : "Add a staff member"}
            options={list.map((p: any) => ({ value: p.id, label: p.name }))}
            onChange={setPerson}
          />
          <button onClick={() => setAdd(true)}>
            <Plus size={16} /> Add person
          </button>
          {admin && personId && (
            <button
              className="danger"
              onClick={() => {
                if (
                  confirm("Delete this person and all their worklog entries?")
                ) {
                  write.mutate({
                    path: `/worklog/people/${personId}`,
                    method: "delete",
                  });
                  setPerson("");
                }
              }}
            >
              Delete person
            </button>
          )}
          <Select
            aria-label="Month"
            options={MONTHS.map((label, i) => ({
              label,
              value: String(i + 1).padStart(2, "0"),
            }))}
            value={month}
            onChange={(v: string) => {
              setMonth(v);
              setDay("");
            }}
          />
          <input
            aria-label="Year"
            className="year-input"
            type="number"
            min="1000"
            max="9999"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
      </div>
      <Stats stats={stats as any} />
      <div className="calendar-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>
              {MONTHS[Number(month) - 1]} {year}
            </h2>
            <span className="muted">
              {role === "manager"
                ? "Monday is a holiday"
                : "Choose a day to record a class"}
            </span>
          </div>
          <div className="calendar">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div className="day-heading" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${year}-${month}-${String(i + 1).padStart(2, "0")}`;
              const es = data?.rows.filter((e: any) => e.date === date) || [];
              const holiday =
                role === "manager" &&
                new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
              return (
                <button
                  disabled={!personId}
                  key={i}
                  className={`calendar-day ${date === day ? "selected" : ""} ${holiday ? "holiday" : ""} ${date === today ? "today" : ""}`}
                  onClick={() => {
                    setDay(date);
                    setForm({ login: "", logout: "", batch: "" });
                  }}
                >
                  <strong>{i + 1}</strong>
                  <small>
                    {es.length
                      ? es.some((e: any) => e.status === "Leave")
                        ? "Leave"
                        : `${es.length} ${role === "manager" ? "entry" : "class(es)"}`
                      : holiday
                        ? "Holiday"
                        : ""}
                  </small>
                  {es.some((e: any) => e.late || e.early) && (
                    <span className="dot red" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel day-detail">
          <h2>{day ? dateLabel(day) : "Select a day"}</h2>
          {!day ? (
            <p className="muted">
              Choose a date on the calendar to view or record attendance.
            </p>
          ) : (
            <>
              {entries.map((e: any) => (
                <div className="entry" key={e.id}>
                  <Badge>{e.status}</Badge>
                  <p>
                    {e.login?.slice(0, 5) || "—"} →{" "}
                    {e.logout?.slice(0, 5) || "—"} {e.batch}
                  </p>
                  {role === "manager" && (
                    <p>
                      <span className="danger">
                        Late {e.late}m · Early {e.early}m
                      </span>
                      <br />
                      <span className="success">Overtime {e.overtime}m</span>
                    </p>
                  )}
                  {role === "faculty" && e.status === "Present" && (
                    <button
                      onClick={() =>
                        setForm({
                          id: e.id,
                          login: e.login.slice(0, 5),
                          logout: e.logout.slice(0, 5),
                          batch: e.batch,
                        })
                      }
                    >
                      Edit class
                    </button>
                  )}
                  {admin && (
                    <button
                      className="text-button danger"
                      onClick={() => {
                        if (confirm("Delete this worklog entry?"))
                          write.mutate({
                            path: `/worklog/entries/${e.id}`,
                            method: "delete",
                          });
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
              {role === "manager" ? (
                <>
                  <p className="muted">
                    {new Date(day + "T12:00:00Z").getUTCDay() === 1
                      ? "Holiday: all work counts as overtime."
                      : [0, 6].includes(
                            new Date(day + "T12:00:00Z").getUTCDay(),
                          )
                        ? "Shift 08:30 – 18:30"
                        : "Shift 15:00 – 19:00"}
                  </p>
                  {!entries.length ? (
                    <button
                      className="primary"
                      disabled={day !== today || write.isPending}
                      onClick={() => action("login")}
                    >
                      ⏱ Login now
                    </button>
                  ) : (
                    entries[0].login &&
                    !entries[0].logout && (
                      <button
                        className="primary"
                        disabled={day !== today || write.isPending}
                        onClick={() => action("logout")}
                      >
                        ⏱ Logout now
                      </button>
                    )
                  )}
                  {day !== today && (
                    <p className="muted">
                      Clock stamping is available for today only.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Field label="Batch / Class">
                    <Select
                      placeholder="Choose batch"
                      options={bootstrap.batches
                        .filter((b: any) => !b.is_event)
                        .map((b: any) => b.display_name)}
                      value={form.batch}
                      onChange={(v: string) => setForm({ ...form, batch: v })}
                    />
                  </Field>
                  <Field label="Class entry">
                    <input
                      type="time"
                      value={form.login}
                      onChange={(e) =>
                        setForm({ ...form, login: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Class exit">
                    <input
                      type="time"
                      value={form.logout}
                      onChange={(e) =>
                        setForm({ ...form, logout: e.target.value })
                      }
                    />
                  </Field>
                  <button
                    className="primary"
                    disabled={
                      !form.batch ||
                      !form.login ||
                      !form.logout ||
                      write.isPending
                    }
                    onClick={() => action("faculty")}
                  >
                    Save class
                  </button>
                </>
              )}
              {!entries.length && (
                <button
                  disabled={write.isPending}
                  onClick={() => action("leave")}
                >
                  Mark Leave
                </button>
              )}
            </>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Monthly entries</h2>
        </div>
        {data?.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Date",
                    "Status",
                    "Batch",
                    "Login",
                    "Logout",
                    ...(role === "manager"
                      ? ["Late (min)", "Early leave (min)", "Overtime (min)"]
                      : []),
                    "Work (hours)",
                  ].map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((e: any) => (
                  <tr key={e.id}>
                    <td>{dateLabel(e.date)}</td>
                    <td>
                      <Badge>{e.status}</Badge>
                    </td>
                    <td>{e.batch || "—"}</td>
                    <td>{e.login?.slice(0, 5) || "—"}</td>
                    <td>{e.logout?.slice(0, 5) || "—"}</td>
                    {role === "manager" && (
                      <>
                        <td className={e.late ? "danger" : ""}>{e.late}</td>
                        <td className={e.early ? "danger" : ""}>{e.early}</td>
                        <td className={e.overtime ? "success" : ""}>
                          {e.overtime}
                        </td>
                      </>
                    )}
                    <td>{(e.work / 60).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Choose a staff member and record their first working day." />
        )}
      </section>
      {add && (
        <Modal title={`Add ${role}`} onClose={() => setAdd(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const p = await write.mutateAsync({
                  path: "/worklog/people",
                  data: { name, role },
                });
                setPerson(String(p.id));
                setAdd(false);
                setName("");
              } catch {}
            }}
          >
            <Field label="Name" required>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="modal-footer">
              <button
                className="primary"
                disabled={!name.trim() || write.isPending}
              >
                Add person
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
