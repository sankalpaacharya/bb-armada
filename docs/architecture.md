# How Armada works

## Captains and their memory

A captain keeps its memory in `~/.bb/captains/<project>/`, following the
armada skill. The folder holds `captain.md`, `learnings.md`, `backlog.md`,
`archive.md`, and a `tasks/<name>/` folder for each piece of work. The Memory
section in Crew lists the `.md` files in that folder, up to two folders deep,
and clicking one opens it in bb's file preview.

A captain hands work to a supervisor thread, and the supervisor starts the
workers. The first line of `backlog.md` names the supervisor
(`Supervisor: thr_…`). Armada reads that line and treats the supervisor as part
of its captain. Workers count as the captain's own threads in its Crew tab and
its row's summary, and the supervisor never shows as a row. The sidebar list
leaves out every thread a captain started. A new supervisor appears within 5 minutes.

Armada ships the armada skill in `skills/armada/`, and bb loads every
`skills/<name>/SKILL.md` in a plugin into agent threads. So installing Armada
installs the skill, and nothing else is needed for a captain to work. A new
captain's first message invokes the skill as an `/armada` skill mention, the
same way bb's composer sends one, and points it at its home at
`~/.bb/captains/<project>/` (`lib/captain-text.ts`). The skill is adapted from
[kunchenguid/firstmate](https://github.com/kunchenguid/firstmate).

## Storage and RPC

The server keeps one KV record per captain at `captain:<threadId>` and one per
put-away thread at `park:<threadId>`. A park is `settled { at, by }`,
`snoozed { at, until }` or `kept { at }`. A kept thread is one you moved back
to the list, and auto-settle leaves it alone. Each list method declares a tag, and every write
invalidates it, so the sidebar refreshes after each change and on reconnect.
The client predicts each settle and snooze, so a row leaves the list at once.
The server skips and logs records it cannot read. It also reads older records,
which held a logo and a colour or an Adventurer or anime avatar, as Micah
avatars.

`lib/model.ts` turns bb's threads and projects and these records into the
rows the list draws. Sub-threads fold into their parent, and the parent takes
the most urgent status among them. `lib/forest.ts` holds that folding rule,
including the supervisor rule above. The server's auto-settle job uses the same
rule. `lib/status.ts` is one table that gives each status its rank, word,
colour and mark.

| Method | Input | Output |
| --- | --- | --- |
| `captains_list` | none | captain records |
| `captains_create` | `projectId`, `projectName`, `name`, `avatar` | the record, or the thread if recording it failed |
| `captains_adopt` | `threadId`, `avatar`, `createdAt` | captain record |
| `captains_update` | `threadId`, `avatar` | captain record |
| `captains_remove` | `threadId` | none |
| `parks_list` | none | park records |
| `parks_settle` | `threadId`, `at` | park record |
| `parks_snooze` | `threadId`, `at`, `until` | park record |
| `parks_unpark` | `threadId` | none |
| `parks_keep` | `threadId`, `at` | park record |
| `parks_evaluate` | none | the threads auto-settle just settled |
| `captain_home` | `project` | the memory folder's file list |
| `captain_supervisors` | none | every supervisor's thread id |
| `project_logos` | none | a logo for each project that has one |

`captains_create` starts the thread first and records it second, retrying
after 100 ms and 400 ms. If the record still fails, the dialog switches to
**Record captain**, which records the same thread instead of starting another.

Pull request numbers come from bb's GitHub PR Status plugin. Without it, rows
show no PR numbers. The sidebar remembers the project filter and which shelves
are open in `localStorage`.

## Layout

```
app.tsx          registers the sidebar list and the Crew tab
skills/          the armada skill, which bb loads into agent threads
server.ts        records, migration, RPC handlers and schedules
lib/             model, folding, status table, shelves, scope, logos, memory reader
hooks/           queries for captains, parks, supervisors and logos, park actions
components/      sections, rows, shelves, Crew tab, Memory, dialog, pickers
components/ui/   bb components copied into the plugin
docs/            screenshots and this file
test/            model, server, shelf, scope and rendered-list tests
```
