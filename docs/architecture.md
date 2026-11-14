# How Armada works

## Captains and their memory

Each captain keeps its memory in a home of its own, `~/.bb/captains/<home>/`,
following the armada skill. A project can have several captains, and they share
nothing. The folder holds `captain.md`, `learnings.md`, `backlog.md`,
`archive.md`, and a `tasks/<name>/` folder for each piece of work. The Memory
section in Crew lists the `.md` files in that folder, up to two folders deep,
and clicking one opens it in bb's file preview.

A new captain's home is its name as a slug, so a captain named "Video editing"
keeps `~/.bb/captains/video-editing/`. When that name is taken by any folder
there, by another captain's home, or by the project folder of a captain from
before, the server numbers it, `personal-2` and on, so a new captain always
starts in an empty folder. It makes the folder, writes any instructions into
it, then records the name as `home` on the captain (`claimHome` in
`server.ts`). **Make captain** on an existing thread does the same and tells
the thread where its home is, unless a home's `backlog.md` already names that
thread on its `Captain:` line, as a removed captain's does; then it gets that
home back. Renaming a captain keeps its home, and removing
one leaves the folder on disk. A captain recorded before per-captain homes has
no `home` and keeps its project's folder, `~/.bb/captains/<project>/`
(`homeOf` in `lib/captain-home.ts`).

A captain hands work to a crew captain thread, and the crew captain starts the
workers. The first line of `backlog.md` names the crew captain
(`Crew captain: thr_…`, or `Supervisor:` in older homes). Armada reads that line and treats the crew captain as part
of its captain. Workers count as the captain's own threads in its Crew tab and
its row's summary, and the crew captain never shows as a row. The sidebar list
leaves out every thread a captain started. A new crew captain appears within 5 minutes.

**Add to captain** in a thread's menu makes a captain of the same project the
thread's parent, and **Remove from crew** on a Crew row clears it.

Armada ships the armada skill in `skills/armada/`, and bb loads every
`skills/<name>/SKILL.md` in a plugin into agent threads. So installing Armada
installs the skill, and nothing else is needed for a captain to work. A new
captain's first message invokes the skill as an `/armada` skill mention, the
same way bb's composer sends one, and points it at its own home
(`lib/captain-text.ts`). The skill is adapted from
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
including the crew captain rule above. The server's auto-settle job uses the same
rule. `lib/status.ts` is one table that gives each status its rank, word,
colour and mark.

| Method | Input | Output |
| --- | --- | --- |
| `captains_list` | none | captain records |
| `captains_create` | `projectId`, `projectName`, `name`, `avatar`, optional `instructions` | the record, or the thread and its home if recording it failed |
| `captains_adopt` | `threadId`, `avatar`, `createdAt`, `name`, optional `home` | captain record |
| `captains_update` | `threadId`, `avatar` | captain record |
| `captains_remove` | `threadId` | none |
| `parks_list` | none | park records |
| `parks_settle` | `threadId`, `at` | park record |
| `parks_snooze` | `threadId`, `at`, `until` | park record |
| `parks_unpark` | `threadId` | none |
| `parks_keep` | `threadId`, `at` | park record |
| `parks_evaluate` | none | the threads auto-settle just settled |
| `captain_home` | `threadId`, `project` | the captain's memory folder's file list |
| `captain_instructions` | `threadId`, `project` | the user's instructions in its `captain.md`, or `""` |
| `captain_instructions_save` | `threadId`, `project`, `instructions` | whether the captain was told |
| `captain_supervisors` | none | every crew captain's thread id |
| `project_logos` | none | a logo for each project that has one |

The dialog's **Instructions** live in the home's `captain.md` under
`## Instructions from the user`, one quoted line each, so a line of the user's
cannot end the section. A save replaces only that section, a blank one removes
it, and the write is refused if the captain changed the file meanwhile
(`lib/captain-instructions.ts`, `lib/instructions-file.ts`). A create writes
them before it starts the thread, and its first message points the captain at
them. Saving them from **Edit captain** also tells the captain to re-read them.

`captains_create` starts the thread first and records it second, retrying
after 100 ms and 400 ms. If the record still fails, the dialog switches to
**Record captain**, which records the same thread and home instead of
starting another.

The home methods take the captain's `project` only for a captain without a
home of its own. In the Crew tab, a thread no captain started belongs to its
project's captain when the project has one, and shows the captain picker when
it has several.

Pull request numbers come from bb's GitHub PR Status plugin. Without it, rows
show no PR numbers. The sidebar remembers the project filter and which shelves
are open in `localStorage`.

## Layout

```
app.tsx          registers the sidebar list and the Crew tab
skills/          the armada skill, which bb loads into agent threads
server.ts        records, migration, RPC handlers and schedules
lib/             model, folding, status table, shelves, scope, logos, memory reader
hooks/           queries for captains, parks, crew captains and logos, park actions
components/      sections, rows, shelves, Crew tab, Memory, dialog, pickers
components/ui/   bb components copied into the plugin
docs/            screenshots and this file
test/            model, server, shelf, scope and rendered-list tests
```
