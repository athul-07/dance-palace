import {
  useEffect,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { X, Search, ArrowUpRight } from "lucide-react";
import { money } from "../shared/rules";
export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="field">
      <span>
        <span id={id}>{label}</span>
        {required && (
          <b className="required" aria-hidden="true">
            {" "}
            *
          </b>
        )}
      </span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<any>, { "aria-labelledby": id })
        : children}
    </label>
  );
}
export function Select({
  value,
  onChange,
  options,
  placeholder,
  ...props
}: any) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o: any) => {
        const v = typeof o === "object" ? o.value : o;
        return (
          <option key={v} value={v}>
            {typeof o === "object" ? o.label : o}
          </option>
        );
      })}
    </select>
  );
}
export function SearchBox({ value, onChange, placeholder = "Search…" }: any) {
  return (
    <div className="search">
      <Search size={16} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageTitle({ eyebrow, title, subtitle, action }: any) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow || "DANCE PALACE · NEDUMANGAD"}</div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function Stats({
  stats,
  currency = [],
}: {
  stats?: Record<string, number>;
  currency?: string[];
}) {
  return stats ? (
    <div className="stats">
      {Object.entries(stats).map(([k, v]) => (
        <div className="stat" key={k}>
          <span>{k}</span>
          <strong>
            {currency.includes(k)
              ? money(v)
              : new Intl.NumberFormat("en-IN", {
                  maximumFractionDigits: 2,
                }).format(v)}
          </strong>
          <ArrowUpRight size={15} />
        </div>
      ))}
    </div>
  ) : null;
}
export function Badge({ children }: any) {
  return (
    <span
      className={`badge ${["PAID", "Completed", "Excellent", "Good", "Present", "ACTIVE"].includes(children) ? "good" : ["DUE", "Needs Support", "Cancelled"].includes(children) ? "bad" : "warn"}`}
    >
      {children}
    </span>
  );
}
export function Empty({
  text = "No records yet. Add your first record to get started.",
}: any) {
  return (
    <div className="empty">
      <div className="empty-mark">DP</div>
      <h3>A little room to grow</h3>
      <p>{text}</p>
    </div>
  );
}
export function Bars({
  data,
  format = (v: number) => String(v),
}: {
  data: Record<string, number>;
  format?: (v: number) => string;
}) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return entries.length ? (
    <div className="bars">
      {entries.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span>{k}</span>
          <div>
            <i style={{ width: `${Math.max(1, (v / max) * 100)}%` }} />
          </div>
          <strong>{format(v)}</strong>
        </div>
      ))}
    </div>
  ) : (
    <p className="muted chart-empty">
      Your chart will appear as records are added.
    </p>
  );
}
export function RowActions({ edit, remove }: any) {
  return (
    <div className="row-actions">
      <button className="text-button" onClick={edit}>
        Edit
      </button>
      {remove && (
        <button
          className="text-button danger"
          onClick={() => {
            if (confirm("Delete this record? This cannot be undone.")) remove();
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}
