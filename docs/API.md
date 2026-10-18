# REST API

The `/api` prefix applies to every endpoint below. Session cookies are HttpOnly and SameSite=Strict. Errors return `{error: string}`. Mutations validate payloads with Zod or strict column whitelists and execute database writes atomically. GET query strings match the UI's current filters.

| Route                         | Methods     | Access / behavior                                                                             |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `/auth/login`                 | POST        | Public, username/password, rate limited                                                       |
| `/auth/logout`                | POST        | Clears session                                                                                |
| `/auth/me`                    | GET         | Current user, current DB role/version                                                         |
| `/bootstrap`                  | GET         | Canonical batches, setup, years, user                                                         |
| `/setup/:key`                 | PUT         | Admin; list values                                                                            |
| `/transactions`               | GET, POST   | Admin/staff; GET filters from/to/batch/month/type/status/search/sort; staff receives no stats |
| `/transactions/suggestion`    | GET         | batch/student/actual/discounts/exclude → carry-forward and latest paid month                  |
| `/transactions/:id`           | PUT, DELETE | Update admin/staff; delete admin                                                              |
| `/reconcile`                  | POST        | Admin; rebuild fee state                                                                      |
| `/students`                   | GET, POST   | List admin/staff with batch_id/search; add admin                                              |
| `/students/:id`               | PUT, DELETE | Admin; cannot delete while linked transactions exist                                          |
| `/fees`                       | GET         | batch_id/year/months/status/search/sort; reconciles before reading; staff receives no stats   |
| `/fees/:student/:year/:month` | PUT         | Admin; status/plan/amount/cg, with linked payment handling                                    |
| `/manager/:name`              | GET, POST   | Admin/staff, search filter; register sync                                                     |
| `/manager/:name/:id`          | PUT, DELETE | Update admin/staff; delete admin                                                              |
| `/templates`                  | GET         | List template cards                                                                           |
| `/templates/:id`              | PUT         | Admin/staff; text                                                                             |
| `/attendance`                 | GET         | year/month filters                                                                            |
| `/attendance/year`            | POST        | Four-digit year                                                                               |
| `/attendance/month`           | POST        | year/month; generates ten clean batch sheets                                                  |
| `/attendance/:id`             | PATCH       | row/col/value, or name to append; summary sheets immutable                                    |
| `/worklog/people`             | GET, POST   | Admin/staff; name and manager/faculty role                                                    |
| `/worklog/people/:id`         | DELETE      | Admin; entries cascade                                                                        |
| `/worklog/entries`            | GET, POST   | person_id/month filter; action login/logout/leave/faculty                                     |
| `/worklog/entries/:id`        | DELETE      | Admin                                                                                         |
| `/reviews`                    | GET, POST   | batch_id/search; compute score/grade/status on server                                         |
| `/reviews/:id`                | PUT, DELETE | Update admin/staff; delete admin                                                              |
| `/users`                      | GET, POST   | Admin                                                                                         |
| `/users/:id`                  | PUT, DELETE | Admin; current-account and last-admin guards                                                  |
| `/export/excel`               | GET         | Admin/staff; optional attendance_year                                                         |
| `/export/backup`              | GET         | Admin; complete v1 JSON backup                                                                |
| `/import/backup`              | POST        | Admin; complete JSON backup body                                                              |
| `/import/excel`               | POST        | Admin; multipart file, kind, optional attendance year/month                                   |
| `/health`                     | GET         | Public; process health only                                                                   |
| `/health/database`            | GET         | MONITOR_SECRET bearer token; real database check                                              |

The server accepts fields required by the corresponding UI forms; computed status, score, grade, net effect and salary metrics are never trusted from the client. Excel imports and backups are limited to administrators. JSON backups contain sensitive account hashes and should be stored privately.
