import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCheck,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Music2,
  Sun,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { api, client, notify, useApp, useData, useWrite } from "./api";
import { Field, Modal, Select } from "./components";
import { MONTHS } from "../shared/rules";
import { apiErrorMessage } from "../shared/api-errors";
import { Dashboard, Batches } from "./Fees";
import { ManagerTable, Templates, Worklog } from "./Manager";
import { Attendance } from "./Attendance";
import { Progress } from "./Progress";
import { Users } from "./Users";
const sections = [
  {
    path: "fees",
    label: "Fees Tracking",
    icon: LayoutDashboard,
    tabs: ["Dashboard", "Batches & Fees"],
  },
  {
    path: "manager",
    label: "Manager",
    icon: UsersRound,
    tabs: [
      "Login / Logout",
      "Daily Worklog",
      "Student Register",
      "Timetable",
      "Templates",
      "Enquiry",
      "Fees Pending",
    ],
  },
  { path: "attendance", label: "Attendance", icon: CalendarDays, tabs: [] },
  {
    path: "progress",
    label: "Progress Report",
    icon: ChartNoAxesCombined,
    tabs: ["Overview", "Reviews", "Report Card"],
  },
  {
    path: "users",
    label: "Users",
    icon: UsersRound,
    tabs: ["User management"],
  },
];
export default function App() {
  const me = useData("/auth/me");
  const { data: bootstrap } = useData("/bootstrap", undefined, !!me.data);
  const { theme, pending, error, notice, set } = useApp();
  const location = useLocation(),
    navigate = useNavigate();
  const parts = location.pathname.split("/").filter(Boolean),
    section = sections.find((s) => s.path === parts[0]) || sections[0],
    tab = section.tabs[Number(parts[1] || 0)] || section.tabs[0];
  const [year, setYear] = useState(2026),
    [month, setMonth] = useState(4),
    [sheetId, setSheetId] = useState<number | undefined>(),
    [mobile, setMobile] = useState(false),
    [transfer, setTransfer] = useState(false),
    [adding, setAdding] = useState<"year" | "month" | null>(null),
    [addValue, setAddValue] = useState("");
  const write = useWrite();
  const { data: attendance = [] } = useData(
    "/attendance",
    { year },
    !!me.data && section.path === "attendance",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  if (me.isPending)
    return (
      <div className="loading">
        <div className="logo-mark">DP</div>
        <p>Opening your studio…</p>
      </div>
    );
  if (!me.data) return <Login />;
  if (!bootstrap)
    return (
      <div className="loading">
        <p>{error || "Loading studio records…"}</p>
        <button onClick={() => client.invalidateQueries()}>Retry</button>
      </div>
    );
  const admin = bootstrap.user.role === "admin";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="/fees">
          <span className="logo-mark">DP</span>
          <span>
            <strong>Dance Palace</strong>
            <small>NEDUMANGAD</small>
          </span>
        </a>
        <div className="sidebar-caption">STUDIO WORKSPACE</div>
        <nav>
          {sections
            .filter((s) => s.path !== "users" || admin)
            .map((s) => (
              <NavLink
                key={s.path}
                to={`/${s.path}/0`}
                className={section.path === s.path ? "active" : ""}
                onClick={() => setMobile(false)}
              >
                <s.icon size={19} />
                <span>{s.label}</span>
                {section.path === s.path && <ChevronRight size={15} />}
              </NavLink>
            ))}
        </nav>
        {section.path === "attendance" && (
          <div className="attendance-nav">
            <div className="sidebar-caption">ATTENDANCE YEAR</div>
            <Select
              aria-label="Attendance year"
              value={year}
              options={[...new Set([2026, ...bootstrap.years])].sort()}
              onChange={(v: string) => {
                setYear(Number(v));
                setSheetId(undefined);
              }}
            />
            <button
              className="sidebar-add"
              onClick={() => {
                setAdding("year");
                setAddValue(String(year + 1));
              }}
            >
              + Add Year
            </button>
            <div className="months-nav">
              {MONTHS.map((m, i) => (
                <button
                  key={m}
                  className={month === i + 1 ? "active" : ""}
                  onClick={() => {
                    setMonth(i + 1);
                    setSheetId(undefined);
                  }}
                >
                  {m}
                  <span>
                    {attendance.some((s: any) => s.month === i + 1) ? "●" : "○"}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="sidebar-add"
              onClick={() => {
                setAdding("month");
                setAddValue(String(month));
              }}
            >
              + Add Month
            </button>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="studio-note">
            <Music2 size={20} />
            <strong>
              Made for the rhythm
              <br />
              of your studio.
            </strong>
            <span>Academic year 2026–27</span>
          </div>
          <span className="sidebar-version">DANCE PALACE MANAGEMENT</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>{section.label}</strong>
            <small>Fees Tracker · 2026</small>
          </div>
          <div className="header-actions">
            <span className={`saved ${error ? "danger" : ""}`}>
              <CheckCheck size={15} />
              {pending
                ? "Saving…"
                : error
                  ? "Save / connection error"
                  : "Saved"}
            </span>
            <a className="button export-header" href="/api/export/excel">
              <Download size={15} /> Export Excel
            </a>
            {admin && (
              <button
                className="import-header"
                onClick={() => setTransfer(true)}
              >
                <Upload size={15} /> Import backup
              </button>
            )}
            <button
              className="icon"
              aria-label="Toggle dark mode"
              onClick={() =>
                set({ theme: theme === "light" ? "dark" : "light" })
              }
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <span className="user-avatar">
              {bootstrap.user.username.slice(0, 1).toUpperCase()}
            </span>
            <div className="user-label">
              <strong>{bootstrap.user.username}</strong>
              <small>{bootstrap.user.role}</small>
            </div>
            <button
              className="icon"
              aria-label="Logout"
              title="Logout"
              onClick={async () => {
                await api.post("/auth/logout");
                client.clear();
                navigate("/");
                window.location.reload();
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {section.path !== "attendance" && (
          <nav className="subtabs">
            {section.tabs.map((t, i) => (
              <NavLink
                className={t === tab ? "active" : ""}
                key={t}
                to={`/${section.path}/${i}`}
              >
                {t}
              </NavLink>
            ))}
          </nav>
        )}
        <main>
          {(error || notice) && (
            <div role="alert" className={`notice ${error ? "error" : ""}`}>
              <span>{error || notice}</span>
              <button
                className="icon"
                aria-label="Dismiss message"
                onClick={() => set({ error: "", notice: "" })}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {section.path === "fees" &&
            (tab === "Dashboard" ? (
              <Dashboard bootstrap={bootstrap} />
            ) : (
              <Batches bootstrap={bootstrap} />
            ))}
          {section.path === "manager" &&
            (tab === "Login / Logout" ? (
              <Worklog bootstrap={bootstrap} />
            ) : tab === "Templates" ? (
              <Templates />
            ) : (
              <ManagerTable key={tab} name={tab} bootstrap={bootstrap} />
            ))}
          {section.path === "attendance" && (
            <Attendance {...{ year, month, sheetId, setSheetId }} />
          )}
          {section.path === "progress" && (
            <Progress tab={tab} bootstrap={bootstrap} />
          )}{" "}
          {section.path === "users" &&
            (admin ? (
              <Users bootstrap={bootstrap} />
            ) : (
              <p>Admin access required.</p>
            ))}
          <footer className="page-footer">
            <span>Dance Palace, Nedumangad</span>
            <span>A space to move. A place to grow.</span>
          </footer>
        </main>
      </div>
      {transfer && <Transfer onClose={() => setTransfer(false)} />}{" "}
      {adding && (
        <Modal
          title={
            adding === "year"
              ? "Add attendance year"
              : "Generate attendance month"
          }
          onClose={() => setAdding(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: `/attendance/${adding}`,
                  data:
                    adding === "year"
                      ? { year: Number(addValue) }
                      : { year, month: Number(addValue) },
                });
                if (adding === "year") setYear(Number(addValue));
                else setMonth(Number(addValue));
                setAdding(null);
              } catch { }
            }}
          >
            <Field
              label={adding === "year" ? "Four-digit year" : `Month in ${year}`}
              required
            >
              {adding === "year" ? (
                <input
                  type="number"
                  min="1000"
                  max="9999"
                  required
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                />
              ) : (
                <Select
                  value={addValue}
                  onChange={setAddValue}
                  options={MONTHS.map((label, i) => ({ label, value: i + 1 }))}
                />
              )}
            </Field>
            <p className="muted">
              New months contain a blank sheet for each class batch, with the
              current student roster. Existing months are preserved.
            </p>
            <div className="modal-footer">
              <button className="primary" disabled={write.isPending}>
                Create {adding}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Login() {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <div className="logo-mark">DP</div>
          <span>
            <strong>Dance Palace</strong>
            <small>NEDUMANGAD</small>
          </span>
        </div>
        <div className="story-content">
          <span className="eyebrow">MORE ROOM FOR WHAT YOU LOVE</span>
          <h1>
            Behind every
            <br />
            great performance,
            <br />
            <em>a well-run studio.</em>
          </h1>
          <p>
            Students, payments, attendance and progress.
            <br />
            One thoughtful workspace for your dance family.
          </p>
          <div className="dance-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>
              move.
              <br />
              grow.
              <br />
              belong.
            </span>
          </div>
        </div>
        <span className="login-footer">DANCE PALACE · EST. WITH PASSION</span>
      </div>
      <div className="login-form-wrap">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api.post("/auth/login", { username, password });
              await client.invalidateQueries();
            } catch (e: any) {
              setError(apiErrorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="login-icon">
            <Activity size={26} />
          </div>
          <div className="eyebrow">YOUR STUDIO, SIMPLIFIED</div>
          <h2>Welcome back.</h2>
          <p></p>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <Field label="Username" required>
            <input
              autoComplete="username"
              autoFocus
              required
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password" required>
            <div className="password">
              <input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label="Show or hide password"
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </Field>
          <button className="primary login-submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to Dance Palace workspace"}
            <ChevronRight size={18} />
          </button>
          <p className="login-help">
            Need access? Contact your studio administrator.
          </p>
          <div className="login-security">
            <CheckCheck size={15} /> Your studio data is securely saved.
          </div>
        </form>
      </div>
    </div>
  );
}
function Transfer({ onClose }: any) {
  const [kind, setKind] = useState("fees"),
    [year, setYear] = useState(2026),
    [month, setMonth] = useState(4),
    [busy, setBusy] = useState(false);
  const write = useWrite();
  return (
    <Modal title="Import & backup" onClose={onClose}>
      <p className="muted">
        Keep a JSON backup before refreshing workbook data. Imports are applied
        atomically.
      </p>
      <a className="button" href="/api/export/backup">
        <Download size={16} /> Download full JSON backup
      </a>
      <hr />
      <Field label="Restore JSON backup">
        <input
          type="file"
          accept=".json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (
              !file ||
              !confirm(
                "Replace all studio data with this backup? Download a backup first.",
              )
            )
              return;
            setBusy(true);
            try {
              await write.mutateAsync({
                path: "/import/backup",
                data: JSON.parse(await file.text()),
              });
              window.location.reload();
            } catch {
              setBusy(false);
            }
          }}
        />
      </Field>
      <hr />
      <Field label="Excel workbook type">
        <Select
          value={kind}
          onChange={setKind}
          options={[
            { value: "fees", label: "Fees / Manager / Progress / Full export" },
            { value: "attendance", label: "Monthly attendance workbook" },
          ]}
        />
      </Field>
      {kind === "attendance" && (
        <div className="form-grid">
          <Field label="Year">
            <input
              type="number"
              min="1000"
              max="9999"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </Field>
          <Field label="Month">
            <Select
              value={month}
              onChange={(v: string) => setMonth(Number(v))}
              options={MONTHS.map((label, i) => ({ label, value: i + 1 }))}
            />
          </Field>
        </div>
      )}
      <Field label="Import Excel (.xlsx)">
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (
              !file ||
              !confirm("Import this workbook and refresh its matching records?")
            )
              return;
            setBusy(true);
            const data = new FormData();
            data.append("file", file);
            data.append("kind", kind);
            data.append("year", String(year));
            data.append("month", String(month));
            try {
              const r = await write.mutateAsync({
                path: "/import/excel",
                data,
              });
              notify(
                `${r.imported ?? "All"} records imported. ${(r.warnings || []).join(" ")}`,
              );
              onClose();
            } catch {
              setBusy(false);
            }
          }}
        />
      </Field>
      <p className="info-note">
        Formula dates use the workbook’s cached result. Missing cached dates are
        reported, never replaced with today’s date.
      </p>
    </Modal>
  );
}
