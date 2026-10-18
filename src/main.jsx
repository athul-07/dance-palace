import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
} from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  Wallet,
  UsersRound,
  CalendarDays,
  ChartNoAxesCombined,
  ShieldCheck,
  Download,
  Upload,
  Moon,
  Sun,
  LogOut,
  Menu,
  Check,
  X,
  ArrowRight,
  Music2,
  ChevronDown,
} from "lucide-react";
import { api, client, useData, useStore, useWrite } from "./api";
import { Button, Field, Modal, Select } from "./components";
import { MONTHS } from "../shared/domain";
import { Dashboard, Batches } from "./fees";
import { Manager, Worklog, Templates, Users } from "./management";
import { Attendance, Progress } from "./school";
import "./styles.css";
const NAV = [
  ["fees", "Fees Tracking", Wallet],
  ["manager", "Manager", UsersRound],
  ["attendance", "Attendance", CalendarDays],
  ["progress", "Progress Report", ChartNoAxesCombined],
  ["users", "Users", ShieldCheck],
];
const TABS = {
  fees: [
    ["dashboard", "Dashboard"],
    ["batches", "Batches & Fees"],
  ],
  manager: [
    ["worklog", "Login / Logout"],
    ["daily", "Daily Worklog"],
    ["register", "Student Register"],
    ["timetable", "Timetable"],
    ["templates", "Templates"],
    ["enquiry", "Enquiry"],
    ["pending", "Fees Pending"],
  ],
  progress: [
    ["overview", "Overview"],
    ["reviews", "Reviews"],
    ["report", "Report Card"],
  ],
  users: [["", "User management"]],
};
function Login() {
  const [username, U] = useState(""),
    [password, P] = useState(""),
    [show, S] = useState(false),
    [busy, B] = useState(false),
    [error, E] = useState("");
  const { setUser } = useStore();
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            dp<span>✦</span>
          </span>
          <div>
            Dance Palace<small>NEDUMANGAD</small>
          </div>
        </div>
        <div>
          <div className="eyebrow">A LITTLE RHYTHM. A LOT OF POSSIBILITY.</div>
          <h1>
            Room to move.
            <br />
            Space to grow.
          </h1>
          <p>
            Behind every great performance is a well-run school.
            <br />
            Bring your people, classes, and everyday work together.
          </p>
          <div className="dance-art">
            <i />
            <i />
            <i />
            <Music2 size={70} />
          </div>
        </div>
        <small>Your school. In perfect step.</small>
      </div>
      <div className="login-form">
        <div className="login-box">
          <span className="mini-label">SCHOOL MANAGEMENT</span>
          <h2>Welcome back</h2>
          <p>Sign in to your Dance Palace workspace.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              B(true);
              E("");
              try {
                setUser(
                  (await api.post("/auth/login", { username, password })).data,
                );
              } catch (e) {
                E(e.response?.data?.error || "Unable to connect");
              } finally {
                B(false);
              }
            }}
          >
            <Field label="Username" required>
              <input
                value={username}
                onChange={(e) => U(e.target.value)}
                autoComplete="username"
                required
                placeholder="Enter your username"
              />
            </Field>
            <Field label="Password" required>
              <div className="password-input">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => P(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                />
                <button type="button" onClick={() => S(!show)}>
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
            {error && <div className="notice error">{error}</div>}
            <Button disabled={busy || !username || !password}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={18} />
            </Button>
          </form>
          <div className="login-foot">
            <ShieldCheck size={15} /> A private workspace for your school
          </div>
        </div>
        <small>Dance Palace Management System · 2026</small>
      </div>
    </div>
  );
}
function Transfer({ onClose }) {
  const [mode, M] = useState("backup"),
    [file, F] = useState(null),
    [year, Y] = useState(2026),
    [month, O] = useState("April"),
    [busy, B] = useState(false);
  const write = useWrite();
  return (
    <Modal title="Import & backup" onClose={onClose}>
      <div className="modal-body">
        <p>
          Import original Excel files or restore a complete backup. Matching
          transaction IDs are updated. JSON and Dance Palace workbook restores
          replace the dataset.
        </p>
        <div className="download-links">
          <a className="button ghost" href="/api/export/backup">
            Download JSON backup
          </a>
          <a className="button ghost" href={`/api/export/attendance/${year}`}>
            Attendance Excel
          </a>
        </div>
        <Field label="File type">
          <Select
            value={mode}
            onChange={(e) => M(e.target.value)}
            options={[
              { value: "backup", label: "JSON backup (replace all data)" },
              { value: "fees", label: "Fees Excel / Dance Palace export" },
              { value: "manager", label: "Manager Excel" },
              { value: "attendance", label: "Monthly attendance Excel" },
              { value: "progress", label: "Progress report Excel" },
            ]}
          />
        </Field>
        <div className="form-grid">
          <Field label="Year">
            <input
              type="number"
              min="1900"
              max="9999"
              value={year}
              onChange={(e) => Y(Number(e.target.value))}
            />
          </Field>
          {mode === "attendance" && (
            <Field label="Month">
              <Select
                value={month}
                options={MONTHS}
                onChange={(e) => O(e.target.value)}
              />
            </Field>
          )}
        </div>
        <Field label="Choose file" required>
          <input
            type="file"
            accept={mode === "backup" ? ".json" : ".xlsx,.xls"}
            onChange={(e) => F(e.target.files[0])}
          />
        </Field>
        <div className="notice">
          Keep a JSON backup before importing. Backups contain personal data and
          password hashes; store them privately.
        </div>
      </div>
      <div className="modal-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!file || busy}
          onClick={async () => {
            if (
              !confirm(
                "Import this file? A full backup restore replaces existing data.",
              )
            )
              return;
            B(true);
            const form = new FormData();
            form.append("file", file);
            form.append("mode", mode);
            form.append("year", year);
            form.append("month", month);
            try {
              const r = await write(
                "post",
                `/import/${mode === "backup" ? "backup" : "excel"}`,
                form,
              );
              useStore.getState().notify(r.message);
              onClose();
            } catch {
            } finally {
              B(false);
            }
          }}
        >
          {busy ? "Importing…" : "Import file"}
        </Button>
      </div>
    </Modal>
  );
}
function App() {
  const { user, setUser, theme, toggleTheme, saving, error, setError, toast } =
    useStore();
  const [ready, R] = useState(false),
    [menu, M] = useState(false),
    [transfer, T] = useState(false);
  const location = useLocation();
  const section = location.pathname.split("/")[1] || "fees";
  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {})
      .finally(() => R(true));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => M(false), [location.pathname]);
  if (!ready) return <div className="boot">Opening Dance Palace…</div>;
  if (!user) return <Login />;
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <NavLink className="brand" to="/fees/dashboard">
          <span className="brand-mark">
            dp<span>✦</span>
          </span>
          <div>
            Dance Palace<small>NEDUMANGAD</small>
          </div>
        </NavLink>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {NAV.filter((n) => n[0] !== "users" || user.role === "admin").map(
            ([key, label, Icon]) => (
              <NavLink
                key={key}
                to={`/${key}/${TABS[key]?.[0]?.[0] || ""}`}
                className={section === key ? "active" : ""}
              >
                <Icon size={19} />
                <span>{label}</span>
                {section === key && <span className="nav-dot" />}
              </NavLink>
            ),
          )}
        </nav>
        <div id="attendance-nav" />
        <div className="sidebar-bottom">
          <div className="term-card">
            <span className="term-dot" /> ACADEMIC YEAR
            <strong>2026 — 2027</strong>
            <small>Every step counts.</small>
          </div>
          <div className="school-note">
            <Music2 size={18} />
            <span>
              Made for the rhythm
              <br />
              of your school.
            </span>
          </div>
        </div>
      </aside>
      {menu && <div className="sidebar-scrim" onClick={() => M(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => M(!menu)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Dance Palace <span>/</span>{" "}
            <strong>{NAV.find((n) => n[0] === section)?.[1]}</strong>
            <small>Fees Tracker · 2026</small>
          </div>
          <div className="header-actions">
            <span className="saved">
              <Check size={13} />
              {saving
                ? "Saving…"
                : error
                  ? "Needs attention"
                  : "All changes saved"}
            </span>
            <a href="/api/export/excel" className="button ghost compact">
              <Download size={15} />
              <span>Export Excel</span>
            </a>
            {user.role === "admin" && (
              <Button variant="ghost compact" onClick={() => T(true)}>
                <Upload size={15} />
                <span>Import backup</span>
              </Button>
            )}
            <button
              className="icon-button"
              aria-label="Toggle dark mode"
              onClick={toggleTheme}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="user-chip">
              <span>{user.username[0].toUpperCase()}</span>
              <div>
                {user.username}
                <small>{user.role}</small>
              </div>
            </div>
            <button
              className="icon-button"
              title="Logout"
              aria-label="Logout"
              onClick={async () => {
                await api.post("/auth/logout");
                setUser(null);
                client.clear();
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {TABS[section] && (
          <div className="subtabs">
            {TABS[section].map(([path, label]) => (
              <NavLink key={path} to={`/${section}/${path}`}>
                {label}
              </NavLink>
            ))}
          </div>
        )}
        <main>
          <Routes>
            <Route path="/fees/dashboard" element={<Dashboard />} />
            <Route path="/fees/batches" element={<Batches />} />
            <Route path="/manager/worklog" element={<Worklog />} />
            <Route path="/manager/templates" element={<Templates />} />
            <Route path="/manager/:tab" element={<Manager />} />
            <Route path="/attendance/*" element={<Attendance />} />
            <Route path="/progress/:tab" element={<Progress />} />
            <Route
              path="/users/*"
              element={
                user.role === "admin" ? (
                  <Users />
                ) : (
                  <Navigate to="/fees/dashboard" />
                )
              }
            />
            <Route
              path="*"
              element={<Navigate to="/fees/dashboard" replace />}
            />
          </Routes>
        </main>
        <footer>
          Dance Palace, Nedumangad<span>One school. Every step, together.</span>
        </footer>
      </div>
      {transfer && <Transfer onClose={() => T(false)} />}{" "}
      {error && (
        <div className="global-message error" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}
      {toast && (
        <div className="global-message toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);
