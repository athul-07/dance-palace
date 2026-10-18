import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { Clock, Copy, Trash2, UserRound, LogIn, LogOut } from "lucide-react";
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
  ConfirmDelete,
} from "./components";
import { MONTHS, dateLabel, today } from "../shared/domain";
const names = {
  daily: "Daily Worklog",
  register: "Student Register",
  timetable: "Timetable",
  enquiry: "Enquiry",
  pending: "Fees Pending",
};
export function Manager() {
  const { tab } = useParams();
  const name = names[tab] || "Daily Worklog",
    write = useWrite(),
    user = useStore((s) => s.user);
  const data = useData(
      ["manager", name],
      "/manager/" + encodeURIComponent(name),
    ),
    batches = useData("batches", "/batches");
  const [search, S] = useState(""),
    [edit, E] = useState(null),
    [busy, B] = useState(false);
  const columns = data.data?.columns || [],
    rows = (data.data?.rows || []).filter((r) =>
      Object.values(r).some((v) =>
        String(v).toLowerCase().includes(search.toLowerCase()),
      ),
    );
  return (
    <>
      <PageTitle
        eyebrow="MANAGER / SCHOOL OPERATIONS"
        title={name}
        subtitle="The everyday details, all in one place."
      >
        <AddButton onClick={() => E({})}>
          Add {tab === "register" ? "Student" : "Record"}
        </AddButton>
      </PageTitle>
      <ErrorNotice query={data} />
      <Card
        title={name}
        subtitle={`${rows.length} records`}
        action={
          <SearchBox
            value={search}
            onChange={S}
            placeholder="Search this table…"
          />
        }
      >
        <Table headers={[...columns, ""]} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r._id}>
              {columns.map((c) => (
                <td key={c} className="wrap-cell">
                  {String(r[c] ?? "") || "—"}
                </td>
              ))}
              <td>
                <RowActions
                  onEdit={() => E(r)}
                  onDelete={
                    user.role === "admin"
                      ? () =>
                          ConfirmDelete({
                            onConfirm: () =>
                              write(
                                "delete",
                                `/manager/${encodeURIComponent(name)}/rows/${r._id}`,
                              ),
                          })
                      : undefined
                  }
                />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {edit && (
        <Modal
          title={(edit._id ? "Edit " : "Add ") + name + " record"}
          onClose={() => E(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              B(true);
              try {
                await write(
                  edit._id ? "put" : "post",
                  `/manager/${encodeURIComponent(name)}/rows` +
                    (edit._id ? "/" + edit._id : ""),
                  edit,
                );
                E(null);
              } catch {
              } finally {
                B(false);
              }
            }}
          >
            <div className="modal-body form-grid three">
              {columns.map((c) => (
                <Field label={c} required={c === "NAME"} key={c}>
                  {/batch/i.test(c) ? (
                    <Select
                      placeholder="Choose a class batch"
                      options={
                        batches.data
                          ?.filter((b) => !b.is_event)
                          .map((b) => b.display_name) || []
                      }
                      value={edit[c] || ""}
                      onChange={(e) => E({ ...edit, [c]: e.target.value })}
                    />
                  ) : (
                    <input
                      required={c === "NAME"}
                      value={edit[c] ?? ""}
                      onChange={(e) => E({ ...edit, [c]: e.target.value })}
                      placeholder={/date/i.test(c) ? "DD-MMM-YYYY" : ""}
                    />
                  )}
                </Field>
              ))}
            </div>
            <div className="modal-footer">
              <Button type="button" variant="ghost" onClick={() => E(null)}>
                Cancel
              </Button>
              <Button disabled={busy}>Save record</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Templates() {
  const data = useData("templates", "/templates"),
    write = useWrite();
  return (
    <>
      <PageTitle
        eyebrow="MANAGER / COMMUNICATION"
        title="The right words, ready to go."
        subtitle="Reusable messages for a personal touch. Edit text to save automatically."
      />
      <ErrorNotice query={data} />
      <div className="template-grid">
        {data.data?.map((t) => (
          <Card
            key={t.id}
            title={t.title}
            action={
              <button
                className="icon-button"
                aria-label={"Copy " + t.title}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(t.text);
                    useStore.getState().notify("Copied to clipboard");
                  } catch {
                    useStore
                      .getState()
                      .setError(
                        "Clipboard unavailable. Select and copy the message text.",
                      );
                  }
                }}
              >
                <Copy size={17} />
              </button>
            }
          >
            <textarea
              className="template-text"
              defaultValue={t.text}
              key={t.text}
              rows="6"
              aria-label={t.title}
              onBlur={(e) => {
                if (e.target.value !== t.text)
                  write("put", "/templates/" + t.id, {
                    ...t,
                    text: e.target.value,
                  }).catch(() => {});
              }}
            />
            <div className="template-hint">
              Use {"{name}"}, {"{month}"}, and {"{amount}"} as placeholders
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
export function Worklog() {
  const write = useWrite(),
    user = useStore((s) => s.user);
  const [role, R] = useState("manager"),
    [person, P] = useState(""),
    [month, M] = useState(today().slice(0, 7)),
    [day, D] = useState(null),
    [add, A] = useState(false),
    [name, N] = useState(""),
    [batch, B] = useState(""),
    [login, L] = useState(""),
    [logout, O] = useState(""),
    [busy, W] = useState(false);
  const people = useData("people", "/people"),
    batches = useData("batches", "/batches");
  const group = people.data?.filter((p) => p.role === role) || [],
    selected =
      group.find((p) => String(p.id) === String(person))?.id ||
      group[0]?.id ||
      "";
  const data = useData(
    ["worklog", selected, month],
    "/worklog?" + params({ person: selected, month }),
  );
  const entries = data.data?.entries || [],
    summary = data.data?.summary;
  const [year, m] = month.split("-").map(Number);
  const days = new Date(year, m, 0).getDate(),
    offset = new Date(year, m - 1, 1).getDay();
  const entry = entries.find((e) => e.date === day);
  async function save(action) {
    W(true);
    try {
      await write("post", "/worklog", {
        person_id: selected,
        date: day,
        action,
        ...(role === "faculty"
          ? {
              batch,
              ...(login ? { login } : {}),
              ...(logout ? { logout } : {}),
            }
          : {}),
      });
      D(null);
    } catch {
    } finally {
      W(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="MANAGER / LOGIN & LOGOUT"
        title="Good work starts here."
        subtitle="Attendance, working hours, and a clear picture for salary planning."
      >
        <div className="segmented">
          {["manager", "faculty"].map((r) => (
            <button
              key={r}
              className={role === r ? "active" : ""}
              onClick={() => {
                R(r);
                P("");
              }}
            >
              {r === "manager" ? "Manager" : "Faculty"}
            </button>
          ))}
        </div>
      </PageTitle>
      <div className="filters standalone">
        <Field label="Staff member">
          <Select
            placeholder={group.length ? undefined : "Add a staff member"}
            options={group.map((p) => ({ value: p.id, label: p.name }))}
            value={selected}
            onChange={(e) => P(e.target.value)}
          />
        </Field>
        <AddButton variant="ghost" onClick={() => A(true)}>
          Add person
        </AddButton>
        {user.role === "admin" && selected && (
          <Button
            variant="ghost danger"
            onClick={() =>
              ConfirmDelete({
                title: "Delete this person and all their worklog entries?",
                onConfirm: () => write("delete", "/people/" + selected),
              })
            }
          >
            <Trash2 size={16} />
            Delete
          </Button>
        )}
        <Field label="Month & year">
          <input
            type="month"
            value={month}
            onChange={(e) => M(e.target.value)}
          />
        </Field>
        <span className="timezone-note">All times in IST · Asia/Kolkata</span>
      </div>
      <ErrorNotice query={data} />
      {summary && (
        <Stats
          items={
            role === "manager"
              ? [
                  ["Present days", summary.present, "Clocked in"],
                  ["Leave days", summary.leave, "Recorded leave"],
                  [
                    "Late",
                    `${summary.late} min`,
                    `${summary.lateDays} days`,
                    "red-text",
                  ],
                  [
                    "Early leave",
                    `${summary.early} min`,
                    `${summary.earlyDays} days`,
                    "red-text",
                  ],
                  [
                    "Overtime",
                    `${(summary.overtime / 60).toFixed(1)} h`,
                    "Beyond scheduled hours",
                    "green-text",
                  ],
                  [
                    "Work hours",
                    `${(summary.work / 60).toFixed(1)} h`,
                    "Total recorded work",
                  ],
                ]
              : [
                  ["Classes taken", summary.present, "Recorded classes"],
                  ["Working days", data.data.workingDays, "Distinct days"],
                  ["Leave days", summary.leave, "Recorded leave"],
                  [
                    "Total hours",
                    `${(summary.work / 60).toFixed(1)} h`,
                    "Class hours",
                  ],
                ]
          }
        />
      )}
      <div className="worklog-layout">
        <Card
          title={`${MONTHS[m - 1]} ${year}`}
          subtitle="Select a day to record attendance"
        >
          <div className="calendar">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div className="calendar-heading" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div className="calendar-blank" key={"blank" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`,
                matches = entries.filter((e) => e.date === date),
                holiday =
                  role === "manager" &&
                  new Date(year, m - 1, i + 1).getDay() === 1;
              return (
                <button
                  key={date}
                  className={
                    "calendar-day " +
                    (holiday ? "holiday " : "") +
                    (date === today() ? "today" : "")
                  }
                  disabled={!selected}
                  onClick={() => {
                    D(date);
                    B("");
                    L("");
                    O("");
                  }}
                >
                  <strong>{i + 1}</strong>
                  {holiday && <small>Holiday</small>}
                  {matches.map((e) => (
                    <span
                      key={e.id}
                      className={
                        e.status === "Leave"
                          ? "leave"
                          : e.late || e.early
                            ? "late"
                            : "present"
                      }
                    >
                      {e.status === "Leave"
                        ? "Leave"
                        : `${e.login || "—"}${e.logout ? " – " + e.logout : ""}`}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </Card>
        <Card
          title={role === "manager" ? "Your weekly rhythm" : "Faculty schedule"}
        >
          <div className="shift-card">
            <Clock size={28} />
            {role === "manager" ? (
              <>
                <h3>Fixed manager shifts</h3>
                <div>
                  <span>Tuesday – Friday</span>
                  <strong>15:00 – 19:00</strong>
                </div>
                <div>
                  <span>Saturday – Sunday</span>
                  <strong>08:30 – 18:30</strong>
                </div>
                <div>
                  <span>Monday</span>
                  <strong>Holiday</strong>
                </div>
                <p>
                  Clock in and out on today’s date. Late arrivals and early
                  departures appear in red; overtime in green.
                </p>
              </>
            ) : (
              <>
                <h3>Every class counts</h3>
                <p>
                  Choose a day, batch, and class entry and exit times. Record
                  multiple batches on the same day.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
      <Card
        title="Daily entries"
        subtitle="Calculated automatically from recorded times"
      >
        <Table
          headers={[
            "Date",
            "Status",
            "Batch",
            "Login",
            "Logout",
            "Work hours",
            ...(role === "manager" ? ["Late", "Early leave", "Overtime"] : []),
            ...(user.role === "admin" ? [""] : []),
          ]}
          empty={!entries.length}
        >
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{dateLabel(e.date)}</td>
              <td>
                <Badge>{e.status}</Badge>
              </td>
              <td>{e.batch || "—"}</td>
              <td>{e.login || "—"}</td>
              <td>{e.logout || "—"}</td>
              <td>{(e.work / 60).toFixed(2)}</td>
              {role === "manager" && (
                <>
                  <td className={e.late ? "red-text" : ""}>{e.late} min</td>
                  <td className={e.early ? "red-text" : ""}>{e.early} min</td>
                  <td className={e.overtime ? "green-text" : ""}>
                    {e.overtime} min
                  </td>
                </>
              )}
              {user.role === "admin" && (
                <td>
                  <RowActions
                    onDelete={() =>
                      ConfirmDelete({
                        onConfirm: () => write("delete", "/worklog/" + e.id),
                      })
                    }
                  />
                </td>
              )}
            </tr>
          ))}
        </Table>
      </Card>
      {add && (
        <Modal title={"Add " + role} onClose={() => A(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const p = await write("post", "/people", { name, role });
                P(p.id);
                A(false);
                N("");
              } catch {}
            }}
          >
            <div className="modal-body">
              <Field label="Full name" required>
                <input
                  required
                  value={name}
                  onChange={(e) => N(e.target.value)}
                />
              </Field>
            </div>
            <div className="modal-footer">
              <Button>Add person</Button>
            </div>
          </form>
        </Modal>
      )}
      {day && (
        <Modal
          title={
            dateLabel(day) + " · " + group.find((p) => p.id === selected)?.name
          }
          onClose={() => D(null)}
        >
          <div className="modal-body">
            {role === "manager" ? (
              <>
                <div className="notice">
                  Server-stamped clock times.{" "}
                  {day !== today()
                    ? "Select today to clock in or out. You can record leave on this date."
                    : "The current IST time will be saved."}
                </div>
                <div className="clock-record">
                  <span>
                    Login<strong>{entry?.login || "—"}</strong>
                  </span>
                  <span>
                    Logout<strong>{entry?.logout || "—"}</strong>
                  </span>
                </div>
              </>
            ) : (
              <div className="form-grid">
                <Field label="Class / batch" required>
                  <Select
                    placeholder="Choose batch"
                    options={
                      batches.data
                        ?.filter((b) => !b.is_event)
                        .map((b) => b.display_name) || []
                    }
                    value={batch}
                    onChange={(e) => B(e.target.value)}
                  />
                </Field>
                <Field label="Class entry" required>
                  <input
                    type="time"
                    value={login}
                    onChange={(e) => L(e.target.value)}
                  />
                </Field>
                <Field label="Class exit" required>
                  <input
                    type="time"
                    value={logout}
                    onChange={(e) => O(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <Button
              variant="ghost"
              disabled={busy || (role === "manager" && !!entry?.login)}
              onClick={() => save("leave")}
            >
              Mark Leave
            </Button>
            {role === "manager" ? (
              <Button
                disabled={busy || day !== today() || !!entry?.logout}
                onClick={() => save(entry?.login ? "logout" : "login")}
              >
                {entry?.login ? <LogOut size={16} /> : <LogIn size={16} />}{" "}
                {entry?.login ? "Logout now" : "Login now"}
              </Button>
            ) : (
              <Button
                disabled={busy || !batch || !login || !logout}
                onClick={() => save("save")}
              >
                Save class
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function Users() {
  const data = useData("users", "/users"),
    write = useWrite(),
    current = useStore((s) => s.user);
  const [edit, E] = useState(null),
    [show, S] = useState(false),
    [busy, B] = useState(false);
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION / ACCESS"
        title="Your team, in step."
        subtitle="Manage who can access the school workspace."
      >
        <AddButton
          onClick={() => {
            E({ username: "", password: "", role: "staff" });
            S(false);
          }}
        >
          Add User
        </AddButton>
      </PageTitle>
      <ErrorNotice query={data} />
      <Card title="Team members" subtitle="Administrator and staff access">
        <Table headers={["Name", "Role", "Access", ""]}>
          {data.data?.map((u) => (
            <tr key={u.id}>
              <td>
                <strong>{u.username}</strong>
                {u.id === current.id && <small className="cell-sub">You</small>}
              </td>
              <td>
                <Badge>{u.role}</Badge>
              </td>
              <td>
                {u.role === "admin"
                  ? "Full workspace access"
                  : "Record payments, worklogs, attendance & progress"}
              </td>
              <td>
                <RowActions
                  onEdit={() => {
                    E({ ...u, password: "" });
                    S(false);
                  }}
                  onDelete={
                    u.id !== current.id
                      ? () =>
                          ConfirmDelete({
                            title: `Delete ${u.username}?`,
                            onConfirm: () => write("delete", "/users/" + u.id),
                          })
                      : undefined
                  }
                />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {edit && (
        <Modal
          title={edit.id ? "Edit user" : "Add user"}
          onClose={() => E(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              B(true);
              try {
                await write(
                  edit.id ? "put" : "post",
                  "/users" + (edit.id ? "/" + edit.id : ""),
                  edit,
                );
                if (edit.id === current.id) {
                  useStore
                    .getState()
                    .setUser({
                      ...current,
                      username: edit.username,
                      role: edit.role,
                    });
                }
                E(null);
              } catch {
              } finally {
                B(false);
              }
            }}
          >
            <div className="modal-body">
              <Field label="Username" required>
                <input
                  minLength="2"
                  required
                  value={edit.username}
                  onChange={(e) => E({ ...edit, username: e.target.value })}
                />
              </Field>
              <Field label="Role" required>
                <Select
                  options={["admin", "staff"]}
                  value={edit.role}
                  onChange={(e) => E({ ...edit, role: e.target.value })}
                />
              </Field>
              <Field
                label={
                  edit.id ? "Reset password (leave blank to keep)" : "Password"
                }
                required={!edit.id}
              >
                <div className="password-input">
                  <input
                    type={show ? "text" : "password"}
                    minLength="8"
                    required={!edit.id}
                    value={edit.password}
                    autoComplete="new-password"
                    onChange={(e) => E({ ...edit, password: e.target.value })}
                  />
                  <button type="button" onClick={() => S(!show)}>
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
              </Field>
              <p className="muted tiny">
                At least 8 characters. The last administrator cannot be removed
                or demoted.
              </p>
            </div>
            <div className="modal-footer">
              <Button disabled={busy}>Save user</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
