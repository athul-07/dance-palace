import { useState } from "react";
import { Plus, Pencil, Download } from "lucide-react";
import { useData, useWrite } from "./api";
import { Empty, Field, Modal, PageTitle, SearchBox } from "./components";
import { MONTHS } from "../shared/rules";
export function Attendance({ year, month, sheetId, setSheetId }: any) {
  const { data: all = [] } = useData("/attendance", { year });
  const sheets = all.filter((s: any) => s.month === Number(month));
  const sheet = sheets.find((s: any) => s.id === sheetId) || sheets[0];
  const [edit, setEdit] = useState(false),
    [search, setSearch] = useState(""),
    [add, setAdd] = useState(false),
    [name, setName] = useState("");
  const write = useWrite();
  const editable =
    sheet && !["Dashboard", "Student Summary"].includes(sheet.sheet_name);
  return (
    <>
      <nav className="subtabs attendance-tabs">
        {sheets.map((s: any) => (
          <button
            className={s.id === sheet?.id ? "active" : ""}
            key={s.id}
            onClick={() => setSheetId(s.id)}
          >
            {s.sheet_name}
          </button>
        ))}
      </nav>
      <PageTitle
        title={`${MONTHS[Number(month) - 1]} attendance`}
        subtitle={`${year} · A little consistency makes a big difference.`}
        action={
          <a
            className="button"
            href={`/api/export/excel?attendance_year=${year}`}
          >
            <Download size={16} /> Export {year}
          </a>
        }
      />
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{sheet?.sheet_name || "No sheets yet"}</h2>
            <p>
              {editable
                ? "Click a day to mark present or absent in edit mode."
                : "Summary sheets are read-only."}
            </p>
          </div>
          {editable && (
            <div className="actions">
              <button
                className={edit ? "primary" : ""}
                onClick={() => setEdit(!edit)}
              >
                <Pencil size={15} />
                {edit ? "Done editing" : "Edit"}
              </button>
              {edit && (
                <button onClick={() => setAdd(true)}>
                  <Plus size={15} /> Student
                </button>
              )}
            </div>
          )}
        </div>
        <div className="filters">
          <SearchBox
            placeholder="Search student"
            value={search}
            onChange={setSearch}
          />
          <span className="muted">✓ Present · Absent</span>
        </div>
        {sheet ? (
          <div className="table-scroll">
            <table className="attendance-grid">
              <thead>
                {sheet.grid.slice(0, 2).map((r: any[], ri: number) => (
                  <tr key={ri}>
                    {Array.from({ length: Math.max(33, r.length) }, (_, ci) => (
                      <th key={ci} className={ci === 1 ? "sticky" : ""}>
                        {String(r[ci] ?? (ri === 1 && ci >= 2 ? ci - 1 : ""))}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {sheet.grid
                  .slice(2)
                  .map((r: any[], i: number) => ({ r, i }))
                  .filter(({ r }: { r: any[] }) =>
                    String(r[1]).toLowerCase().includes(search.toLowerCase()),
                  )
                  .map(({ r, i }: { r: any[]; i: number }) => (
                    <tr key={i}>
                      {r.map((v: any, c: number) => (
                        <td key={c} className={c === 1 ? "sticky strong" : ""}>
                          {typeof v === "boolean" ? (
                            <button
                              aria-label={`${r[1]}, day ${c - 1}: ${v ? "present" : "absent"}`}
                              className={v ? "present" : "absent"}
                              disabled={!edit || !editable || write.isPending}
                              onClick={() =>
                                write.mutate({
                                  path: `/attendance/${sheet.id}`,
                                  method: "patch",
                                  data: { row: i + 2, col: c },
                                })
                              }
                            >
                              {v ? "✓" : "·"}
                            </button>
                          ) : edit && editable ? (
                            <input
                              key={`${sheet.id}-${i}-${c}-${v}`}
                              aria-label={`Row ${i + 1}, column ${c + 1}`}
                              defaultValue={String(v ?? "")}
                              onBlur={(e) => {
                                if (e.target.value !== String(v))
                                  write.mutate({
                                    path: `/attendance/${sheet.id}`,
                                    method: "patch",
                                    data: {
                                      row: i + 2,
                                      col: c,
                                      value: e.target.value,
                                    },
                                  });
                              }}
                            />
                          ) : (
                            String(v ?? "")
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Add this month using the sidebar to generate sheets for all class batches." />
        )}
      </section>
      {add && (
        <Modal title="Add attendance student" onClose={() => setAdd(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: `/attendance/${sheet.id}`,
                  method: "patch",
                  data: { name },
                });
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
              <button className="primary" disabled={write.isPending}>
                Add student
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
