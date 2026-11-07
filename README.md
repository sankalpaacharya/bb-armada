# bb-plugin-armada

A sidebar for people who run many bb threads. Long-lived **captain** threads sit
at the top with their workers nested underneath, every other thread sits in one
list you can filter by project, and finished threads can be settled or snoozed
onto quiet shelves below it.

- `app.tsx` registers the thread list (`app.slots.experimental_threadList`).
- `server.ts` owns the captain and park records in plugin KV and exposes them
  over RPC.
- `PLUGIN_OVERVIEW.md` is the store listing text.

## How it works

The server keeps one KV record per captain at `captain:<threadId>`: the thread
id, an avatar (`{ style: "micah", seed }`), and when it was made. A record
from before avatars, with a logo and colour, reads as a Micah avatar seeded by
its thread id, and a stored Adventurer avatar reads as Micah with the same seed. `captains_list` declares the
`captains` tag and every write calls `bb.rpc.experimental_invalidate`, so the
sidebar reads through `experimental_useRpcQuery` and refreshes on each write,
on reconnect, and from any client. Records that cannot be parsed are skipped
and logged. On start the server moves records out of the old single
`captains` key, then deletes it.

Parks follow the same pattern at `park:<threadId>` with the `parks` tag. A park
is `settled { at }` or `snoozed { at, until }`. The server stamps the time, and
a new settle or snooze replaces whatever park the thread had.

`lib/model.ts` turns the sidebar's threads, projects, captain records and
parks into what the list draws. It is pure and unit-tested.

- A captain's workers are its children, through `parentThreadId` or
  `lifecycleOwnerThreadId`. Each worker folds its own descendants, the same way
  a root card folds its subtree. A captain nested under another captain keeps
  its own workers.
- Every entry carries a folded status, the newest activity and the newest
  attention time of its subtree. A captain folds itself and all its workers.
- Root cards can be made captains; workers cannot.
- Each root card and each worker resolves a shelf from its park and its fold
  (`lib/lifecycle.ts`). The fold is parkable only when no thread in it is
  working, queued or needs you. That is read from every signal of every
  thread, not from the folded status, because a failure outranks work still
  running beside it. So a tree with live work or a raised hand is always
  active, and it offers no Settle or Snooze, a snooze wakes on its timer or on attention after it was set, and a
  settle returns on new attention. Captains are never parked. A parked worker
  leaves its captain's list for the shelf. Snoozed is ordered by soonest wake,
  Settled by newest settle.
- Records and parks whose thread is archived, hidden or gone are ignored. They
  stay in KV until you remove them.

`lib/status.ts` is one table: each status has a rank, a word, a colour tone,
a glyph, whether it counts as live, and whether a thread in it can be parked.
Every row reads from the table through `StatusMark`.

### RPC

| method            | input                                       | output         |
| ----------------- | ------------------------------------------- | -------------- |
| `captains_list`   | none                                        | captain records |
| `captains_create` | `projectId`, `projectName`, `name`, `avatar` | recorded record, or the unrecorded thread |
| `captains_adopt`  | `threadId`, `avatar`                        | captain record |
| `captains_update` | `threadId`, `avatar`                        | captain record |
| `captains_remove` | `threadId`                                  | none           |
| `parks_list`      | none                                        | park records   |
| `parks_settle`    | `threadId`                                  | park record    |
| `parks_snooze`    | `threadId`, `until` (must be in the future) | park record    |
| `parks_unpark`    | `threadId` (idempotent)                     | none           |

`captains_create` spawns a thread titled with the name from the dialog, which
starts as the project's name (`cops`, not `Captain · cops`; the Captains
section already says what it is). The title is the captain's only name; the
record keeps just the avatar. The thread's first prompt tells the agent to follow the `/captain` skill and keep notes in
`~/.bb/captains/<project>.md`. The thread is spawned first and recorded after,
retrying the write after 100 ms and again after 400 ms. If it still fails,
`captains_create` answers `{ outcome: "unrecorded", threadId }` rather than
throwing, and the dialog switches to **Record captain**, which records that
same thread through `captains_adopt` instead of spawning a second one.

### Pull requests

Cards show the pull request number for their environment by reading the GitHub
PR Status plugin (`bb--github-pr-status`) through `experimental_useRpcKeyedQuery`.
Nothing shows when that plugin is absent.

### Local state

The sidebar remembers three things in `localStorage`: `armada/thread-scope`
(the project filter), `armada/captain-toggles` (which captains have their
workers open) and `armada/shelves` (which shelves are open).

## Avatars

Captain avatars are DiceBear's **Micah** style on a solid pastel background picked by the seed, generated
locally by `@dicebear/core` and `@dicebear/micah` from the record's seed
(`lib/avatar.ts`, memoised per style and seed, no network). `CaptainTile` is
the one owner of avatar rendering: a decorative `<img alt="">` inside a
rounded-square tile. The dialog offers twelve random seeds, **Shuffle** draws
twelve more, and picking one stores its seed.

## Design

Captains sit on one raised panel, the deck: a 28px Micah avatar, the
name, and a one-line summary of the captain's tree ("2 working" in the
working tone, "1 needs you" in the attention tone, else "Idle") with the
shade grid while working or the age at the right. Active workers nest inside
the deck under their captain as t3sidebar-style cards, indented to the
captain's name. Threads stay flat on the sidebar background as the same
three-line cards. Section headers are a `div` with a small semibold `h2`
title, a muted count, and the actions beside it, with no divider lines. Every row shares `ThreadLink`, which
owns bb's row contract: the full-bleed anchor, `data-sidebar-thread-id`, split
on cmd-click, the jump shortcuts, bb's context menu and inline rename. Pickers
are one `ChoiceList` with listbox semantics. Ages and "wakes in" labels come
from one 30 s clock in `lib/clock.ts` through the `Age` and `WakesIn` leaves,
so a tick re-renders only those leaves. The model is built from a separate
wake time (`useWakeTime`) that moves only when the next snooze is due, so a
snoozed thread returns on time without the list rebuilding every tick. A
wake label rounds up and never reads "now" while the thread is still hidden. Shelf rows are one line in t3sidebar's style, and a
parkable card swaps its status for Snooze and Settle buttons on hover.

## Develop

```
npm install
npm run check     # typecheck, tests, build
bb plugin install .
bb plugin reload armada
```

Then pick **Armada** under Settings, Appearance, Sidebar.

## Layout

```
app.tsx               registers the thread list
server.ts             captain records, migration and RPC handlers
lib/                  model, status table, lifecycle rules, schemas, avatar, scope, clock, styles
hooks/                captains and parks queries, park actions, stored state, arrow-key rows
components/           sections, shelves, row layouts, ThreadLink, ChoiceList, dialog
components/ui/        vendored bb components (dialog, button, icon, hooks)
test/                 model, lifecycle, server, status and rendered-list tests
```

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for what is adapted from
other projects.
