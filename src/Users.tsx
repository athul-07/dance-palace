import { useState } from "react";
import { Plus, Eye, EyeOff } from "lucide-react";
import { useData, useWrite } from "./api";
import { Field, Modal, PageTitle, RowActions, Select } from "./components";
export function Users({ bootstrap }: any) {
  const { data = [] } = useData("/users");
  const [editing, setEditing] = useState<any>(null),
    [show, setShow] = useState(false);
  const write = useWrite();
  return (
    <>
      <PageTitle
        title="Your studio team"
        subtitle="Manage who has access and what they can do."
        action={
          <button
            className="primary"
            onClick={() =>
              setEditing({ username: "", role: "staff", password: "" })
            }
          >
            <Plus size={17} /> Add User
          </button>
        }
      />
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Permissions</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((u: any) => (
                <tr key={u.id}>
                  <td className="strong">
                    {u.username}
                    {u.id === bootstrap.user.id ? " (you)" : ""}
                  </td>
                  <td>
                    <span className="badge">{u.role}</span>
                  </td>
                  <td>
                    {u.role === "admin"
                      ? "Full studio administration"
                      : "View and record operations"}
                  </td>
                  <td>
                    <RowActions
                      edit={() => setEditing({ ...u, password: "" })}
                      remove={
                        u.id !== bootstrap.user.id
                          ? () =>
                              write.mutate({
                                path: `/users/${u.id}`,
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
      </section>
      {editing && (
        <Modal
          title={editing.id ? "Edit user" : "Add user"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await write.mutateAsync({
                  path: editing.id ? `/users/${editing.id}` : "/users",
                  method: editing.id ? "put" : "post",
                  data: {
                    username: editing.username,
                    role: editing.role,
                    ...(editing.password ? { password: editing.password } : {}),
                  },
                });
                setEditing(null);
              } catch {}
            }}
          >
            <Field label="Username" required>
              <input
                required
                value={editing.username}
                onChange={(e) =>
                  setEditing({ ...editing, username: e.target.value })
                }
              />
            </Field>
            <Field label="Role" required>
              <Select
                value={editing.role}
                options={["admin", "staff"]}
                onChange={(v: string) => setEditing({ ...editing, role: v })}
              />
            </Field>
            <Field
              label={
                editing.id ? "New password (leave blank to keep)" : "Password"
              }
              required={!editing.id}
            >
              <div className="password">
                <input
                  type={show ? "text" : "password"}
                  required={!editing.id}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  value={editing.password}
                  onChange={(e) =>
                    setEditing({ ...editing, password: e.target.value })
                  }
                />
                <button
                  type="button"
                  aria-label="Show or hide password"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <p className="muted">
              At least 8 characters. Password and role changes end the user’s
              existing sessions.
            </p>
            <div className="modal-footer">
              <button className="primary" disabled={write.isPending}>
                Save user
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
