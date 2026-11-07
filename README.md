# bb-plugin-armada

A sidebar for people who run many bb threads. Long-lived **captain** threads sit
at the top, every thread appears once in one list you can filter by project
(a captain's workers carry its face), and finished threads can be settled or
snoozed onto quiet shelves below it.

- `app.tsx` registers the thread list (`app.slots.experimental_threadList`).
- `server.ts` owns the captain and park records in plugin KV and exposes them
  over RPC.
- `PLUGIN_OVERVIEW.md` is the store listing text.

## How it works

The server keeps one KV record per captain at `captain:<threadId>`: the thread
id, an avatar (`{ style: "anime", character, background }`), and when it was
made. A record from before avatars, with a logo and colour, gets the portrait
and background its thread id picks, and a stored DiceBear avatar (Adventurer
or Micah) gets the ones its seed picks (`avatarFromSeed`). `captains_list` declares the
`captains` tag and every write calls `bb.rpc.experimental_invalidate`, so the
sidebar reads through `experimental_useRpcQuery` and refreshes on each write,
on reconnect, and from any client. Records that cannot be parsed are skipped
and logged. On start the server moves records out of the old single
`captains` key, copies its raw value to `legacy-captains-backup`, then deletes
it. If that fails the server still starts, logs the error and retries on the
next start. Writes to one captain run one after another on the server, so an
update that read a record cannot write it back after a remove. RPC inputs are
strict objects: unknown fields are refused, not dropped.

Parks follow the same pattern at `park:<threadId>` with the `parks` tag. A park
is `settled { at }` or `snoozed { at, until }`. The client stamps `at` when
the user acts and predicts the park in the cache, so a card leaves at once;
the server stores the same record. A new settle or snooze replaces whatever
park the thread had, and adopting or removing a captain clears its park.

`lib/model.ts` turns the sidebar's threads, projects, captain records and
parks into what the list draws. It is pure and unit-tested.

- One tree policy, through `parentThreadId` or `lifecycleOwnerThreadId`: a
  card's root is reached by climbing parents until there are none or the next
  is a captain. So a captain's children are cards of their own (its
  workers), each folding its own descendants, and each carries `captain`, the
  captain's thread id, name and avatar. Every other root has `captain: null`.
  A captain nested under another captain keeps its own workers.
- Every card carries a folded status, the newest activity and the newest
  attention time of its subtree. A captain row folds itself and every
  descendant below it, stopping at nested captains, for its summary counts.
- Cards without a captain can be made captains; workers cannot.
- Each card resolves a shelf from its park and its fold
  (`lib/lifecycle.ts`). The fold is parkable only when no thread in it is
  working, queued or needs you. That is read from every signal of every
  thread, not from the folded status, because a failure outranks work still
  running beside it. So a tree with live work or a raised hand is always
  active, and it offers no Settle or Snooze. A snooze wakes on its timer or on
  attention after it was set, and a settle returns on new attention. Captains are
  never parked; workers park like any card. Snoozed is ordered by soonest
  wake, Settled by newest settle.
- Records and parks whose thread is archived, hidden or gone are ignored. They
  stay in KV until you remove them. A park that can never apply again, because
  attention came after it or its snooze passed, is listed by the model as
  expired, and the sidebar deletes it once.

`lib/status.ts` is one table: each status has a rank, a word, a colour tone,
a glyph, whether it counts as live, and whether a thread in it can be parked.
Every row reads from the table through `StatusMark`.

### RPC

| method            | input                                       | output         |
| ----------------- | ------------------------------------------- | -------------- |
| `captains_list`   | none                                        | captain records |
| `captains_create` | `projectId`, `projectName`, `name`, `avatar` | recorded record, or the unrecorded thread |
| `captains_adopt`  | `threadId`, `avatar`, `createdAt` (kept if already a captain) | captain record |
| `captains_update` | `threadId`, `avatar`                        | captain record |
| `captains_remove` | `threadId`                                  | none           |
| `parks_list`      | none                                        | park records   |
| `parks_settle`    | `threadId`, `at`                            | park record    |
| `parks_snooze`    | `threadId`, `at`, `until` (after `at`)      | park record    |
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

The sidebar remembers two things in `localStorage`: `armada/thread-scope`
(the project filter) and `armada/shelves` (which shelves are open). It removes
`armada/captains`, the registry cache from before captains were read through
RPC, and `armada/captain-toggles`, from when workers nested in the deck.

## Avatars

Captain avatars are ten original anime portraits with transparent
backgrounds, drawn on one of six pastel backgrounds. The record stores the two
separately, so either can change without the other. The portraits live in
`assets/avatars/` as 128px WebP; `node scripts/embed-portraits.mjs` writes them
into `lib/portraits.ts` as data URIs, so the app bundle carries them and the
server bundle does not. `CaptainTile` is the one owner of avatar rendering: a
decorative `<img alt="">` on the background colour, in a rounded-square tile.
In the dialog, clicking the avatar rolls a different character, and the
swatches beside it pick the background.

## Design

Captains sit flat on the sidebar, one row each: a 28px portrait, the
name, and a one-line summary of the captain's tree ("2 working" in the
working tone, "1 needs you" in the attention tone, else "Idle") with the
shade grid at the right while working. "1 failed" shows in the failure tone,
apart from "needs you". Until the captains read settles the section says
"Loading captains…", and after a failed read "Could not load captains",
never the first-captain invitation. Captains holds only captain rows. Every
thread appears once, as a card in Threads, flat on the sidebar background. A
worker's first line starts with its captain's avatar in a 14px tile, then the
captain's name, a muted "·" and the project ("[face] cops · cops" reads
"[face] cops" when the names match). When the scope hides the project the
face and name stay. Screen readers hear "Launched by <captain>". Section headers are a `div` with a small semibold `h2`
title, a muted count, and the actions beside it, with no divider lines. Every row shares `ThreadLink`, which
owns bb's row contract: the full-bleed anchor, `data-sidebar-thread-id`, split
on cmd-click, the jump shortcuts, bb's context menu and inline rename. Pickers
are one `ChoiceList` with listbox semantics; in the avatar grid up and down
move by a row. Ages and "wakes in" labels come
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
