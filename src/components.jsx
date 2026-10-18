import React, { useEffect, useRef, useId } from "react";
import {
  X,
  Search,
  Plus,
  Pencil,
  Trash2,
  ArrowUpRight,
  Inbox,
} from "lucide-react";
import { useStore } from "./api";
import { apiErrorMessage } from "./error-message";
export function Button({ children, variant = "", className = "", ...props }) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Field({ label, required, children, hint }) {
  const id = useId();
  const connect = (child) => {
    if (!React.isValidElement(child)) return child;
    if (["input", "select", "textarea", Select].includes(child.type))
      return React.cloneElement(child, {
        id,
        "aria-labelledby": id + "-label",
        ...(hint ? { "aria-describedby": id + "-hint" } : {}),
      });
    return child.props.children
      ? React.cloneElement(child, {
          children: React.Children.map(child.props.children, connect),
        })
      : child;
  };
  return (
    <div className="field">
      <label htmlFor={id} id={id + "-label"}>
        {label} {required && <em aria-hidden="true">*</em>}
      </label>
      {React.Children.map(children, connect)}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
export function Select({ options, placeholder, ...props }) {
  return (
    <select {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) =>
        typeof o === "object" ? (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ) : (
          <option key={o} value={o}>
            {o}
          </option>
        ),
      )}
    </select>
  );
}
export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function PageTitle({ eyebrow, title, subtitle, children }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow || "DANCE PALACE · NEDUMANGAD"}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Card({ title, subtitle, children, action, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Stats({ items }) {
  return (
    <div className="stats">
      {items.map(([label, value, detail, color]) => (
        <div className="stat" key={label}>
          <span>
            {label}
            <ArrowUpRight size={15} />
          </span>
          <strong className={color || ""}>{value}</strong>
          <small>{detail || "Current selection"}</small>
        </div>
      ))}
    </div>
  );
}
export function Badge({ children }) {
  const text = String(children);
  return (
    <span
      className={
        "badge " +
        (/paid|completed|excellent|present|active/i.test(text) &&
        !/due|unpaid/i.test(text)
          ? "green"
          : /due|late|support|cancel/i.test(text)
            ? "red"
            : /pending|improving|leave/i.test(text)
              ? "amber"
              : "teal")
      }
    >
      {children}
    </span>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const old = document.activeElement;
    ref.current?.focus();
    const fn = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = ref.current.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        );
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  text = "Add your first record to get started.",
  action,
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function RowActions({ onEdit, onDelete }) {
  return (
    <div className="row-actions">
      {onEdit && (
        <button
          className="icon-button"
          aria-label="Edit record"
          onClick={onEdit}
        >
          <Pencil size={15} />
        </button>
      )}
      {onDelete && (
        <button
          className="icon-button danger"
          aria-label="Delete record"
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
export function Table({ headers, children, empty = false }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <Empty />}
    </div>
  );
}
export function AddButton({ children, ...props }) {
  return (
    <Button {...props}>
      <Plus size={17} />
      {children}
    </Button>
  );
}
export function ErrorNotice({ query }) {
  return query?.isError ? (
    <div className="notice error">
      Unable to load data.{" "}
      {apiErrorMessage(query.error, "Please try again.")}
      <Button variant="ghost" onClick={() => query.refetch()}>
        Retry
      </Button>
    </div>
  ) : query?.isPending ? (
    <div className="loading">Loading records…</div>
  ) : null;
}
export function BarChart({ items, color = "var(--teal)" }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bar-chart">
      {items.map((i) => (
        <div className="bar-item" key={i.label}>
          <div className="bar-space">
            <div
              style={{
                height: `${Math.max(2, (i.value / max) * 100)}%`,
                background: color,
              }}
              title={`${i.label}: ${i.value.toLocaleString("en-IN")}`}
            >
              <span>
                {i.value
                  ? i.value.toLocaleString("en-IN", {
                      maximumFractionDigits: 0,
                    })
                  : ""}
              </span>
            </div>
          </div>
          <small>{i.label}</small>
        </div>
      ))}
    </div>
  );
}
export function ConfirmDelete({ onConfirm, title = "Delete this record?" }) {
  if (window.confirm(title)) onConfirm().catch(() => {});
}
