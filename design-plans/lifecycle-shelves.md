# Settle and snooze threads into shelves

Written against: f84a9aa (main of sankalpaacharya/bb-armada)

## Goal

The user wants t3sidebar's lifecycle in Armada: finished threads can be **settled** (folded into a quiet one-line shelf) or **snoozed** until a chosen time, so the live list shows only what is in play. Reference implementation (MIT, Michael Yong), already credited in `THIRD_PARTY_NOTICES.md`:
`T3=/Users/sanku/.bb/plugins/cache/git/github.com/SawyerHood/sawyer-plugins/8b535729dd2251ceb293c7caf74e43e477f942a3/plugins/t3sidebar`,
files `src/lifecycle.ts` (the rules), `src/server.ts` (storage and rpc), `src/useLifecycle.ts`, `src/ThreadInbox.tsx` (shelves), `src/ThreadCard.tsx` (hover park buttons), `src/SlimRow.tsx` (one-line shelf rows), `README.md` ("Where the lifecycle lives").

The one rule that must never break: **a thread that is working, queued, or waiting on the user is never hidden.** Live work and a raised hand always resolve to the active shelf, whatever was stored.

## Data shape (decided)

`lib/lifecycle.ts`, pure, no React, unit-tested:

```ts
type Park =
  | { kind: "settled"; at: number }
  | { kind: "snoozed"; at: number; until: number };
type LifecycleRegistry = { version: 1; parks: Record<string, Park> }; // keyed by threadId
type Shelf = "active" | "snoozed" | "settled";

canPark(status: Status | null): boolean            // false for working, queued, needs-you
resolveShelf(park: Park | undefined, signals: { status: Status | null; latestAttentionAt: number }, now: number): Shelf
snoozePresets(now: Date): { id: "hour" | "evening" | "tomorrow" | "next-week"; label: string; until: number }[]
wakeLabel(until: number, now: number): string      // "5m", "2h", "3d"
nextWakeDelayMs(parks: LifecycleRegistry, now: number): number | null
```

The discriminated union replaces t3's three nullable columns, so "settled and snoozed at once" can't be represented. Port t3's rules faithfully:
- Order: live or attention → active. A snooze wakes on its timer or on attention after `at`. A settle returns to active on attention after `at`.
- DST-safe calendar presets. "This evening" only while more than an hour before 18:00.
- Clamp the 32-bit `setTimeout`.

`Status` is Armada's existing status type in `lib/status.ts`. Reuse it; don't add a second vocabulary.

## Storage (server)

Captains and parks are two independent server-owned documents in plugin KV. Keep them as **separate keys** so a park write never contends with a captain write.
- Today `server.ts` hand-rolls one serialized `mutate` queue for captains.
- Extract that into one small owner for "a versioned JSON document in KV with serialized mutations and a realtime publish after each write", and use it for both documents.
- This removes the duplication instead of copying the queue.

Parse stored data leniently at the KV boundary (drop malformed entries) and inputs strictly at the rpc boundary.

RPC (zod, `lib/rpc.ts`):
- `lifecycle_list: null → LifecycleRegistry`
- `lifecycle_settle: { threadId } → Park`
- `lifecycle_snooze: { threadId, until } → Park`. Reject `until <= now`.
- `lifecycle_unpark: { threadId } → null`. Idempotent: removes the entry if present.

Settle and snooze overwrite any existing park for that thread. The server doesn't know thread status; safety comes from `resolveShelf` on read, plus the client offering park actions only when `canPark`.

## Client data flow

- Generalise `hooks/use-captain-registry.ts` into one hook that loads a server document over rpc and follows its realtime channel, with refetch on reconnect. Use it for both documents rather than copying it.
- A wake timer re-renders at `nextWakeDelayMs`, so a snoozed thread comes back on time even when nothing else changes.

## Model (`lib/model.ts`)

`buildArmada` takes the lifecycle registry and `now`, and returns:

```ts
{ captains: CaptainEntry[]; threads: ThreadEntry[]; snoozed: ParkedEntry[]; settled: ParkedEntry[] }
```

- Captains are never parked. A stored park on a captain thread is ignored.
- Root thread cards resolve their shelf from the card's lifted status and the newest `latestAttentionAt` in their folded subtree.
- Workers resolve individually. A parked worker leaves its captain's worker list and appears in the shelf.
- `snoozed` is ordered by soonest wake; `settled` by newest settle.
- The project scope filter applies to all three thread lists, never to captains.
- Stale parks for threads that no longer exist are ignored.

## UI

- **Park actions on hover.** On a parkable card (thread or worker), the right status slot swaps on hover or focus for two `size-5` ghost icon buttons:
  - "Snooze until tomorrow" (clock icon)
  - "Settle" (check icon)
  The status never shifts the project text (t3's pattern). Buttons sit `pointer-events-auto` above the full-bleed link.
- **Context menu inline items.**
  - Parkable thread: "Settle" plus the snooze presets.
  - Use a submenu if `PluginThreadActionsInlineItem` supports one in the installed SDK; otherwise list them flat as "Snooze for 1 hour", "Snooze until this evening", "Snooze until tomorrow", "Snooze until next week".
  - Parked thread: "Move to active".
  - All of these go through `components/captain-menu.ts`'s existing pattern, or its generalisation; no second menu-building path.
- **Shelves.** Below the active Threads list:
  - Two collapsible sections, "Snoozed" and "Settled", using the same `SectionHeader` (Capy style, no rules), with a muted count. Both are collapsed by default; their open state persists in localStorage.
  - A section renders only when it has entries.
  - Shelf rows are **one line**: muted title, then the right edge shows "wakes 2h" for snoozed or the age for settled.
  - Hover on a shelf row offers "Move to active" (an undo icon).
  - Clicking a row opens the thread as usual.
- **Empty states.** If every thread is parked, the active list says "Nothing active. Settled and snoozed threads are below."

## Verification

- `npm run check` passes.
- Unit tests for `lifecycle.ts`. These are behaviour tests: a working thread is never hidden whatever is stored; a snooze wakes on time and on activity; a settle returns on new attention; the presets across a DST change; the clamp.
- Model tests for shelf partitioning: workers, captains, scope, stale parks.
- A rendered-list test: settle a card from its hover button and it moves to the Settled shelf; "Move to active" brings it back.
- Server tests through the rpc contract: idempotent unpark, and a past `until` rejected.

## SDK note (checked in 0.6.104)

`PluginThreadAction` has `choices?: PluginThreadActionChoices` (a choice list rendered as a submenu, picked value passed to `run(input)`). Use ONE "Snooze" inline item with the presets as `choices`, not four flat items.
