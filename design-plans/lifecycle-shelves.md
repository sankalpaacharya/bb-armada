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

## Revision: automatic Inactive shelf (user)

The user saw every one of 176 threads as a full card and expected T3 Code's behaviour: threads you are done with leave the live list on their own.

- **New computed shelf `inactive`.** It is derived on read, never stored. A thread with no stored park is inactive when all four hold:
  - its whole folded subtree is parkable (not live)
  - it is not unread
  - it is not pinned
  - its activity time is older than the threshold
- **Resolution order:**
  1. live or attention → active
  2. stored snooze → snoozed, if not woken
  3. stored settle → settled, if no new attention
  4. inactive by age
  5. active
- **Threshold:** a plugin setting `inactiveAfterHours` (number, default 24; 0 turns the shelf off). Declare it the way bb plugins declare settings (see the SDK docs for settings definitions; chat-sidebar at `/Users/sanku/.bb/plugins/cache/git/github.com/seoperin/bb-plugin-chat-sidebar/121dbe761f4203fa8cbc6d877f3551feae765481/server.ts` and `lib/settings.ts` is an example). The client reads it reactively. The re-render tick must also move a thread to inactive when it crosses the threshold.
- **UI.** Threads shows active cards, then an "Inactive N" section of one-line `ShelfRow`s.
  - A row shows the title, then the project as a small muted label, and the age at the right edge.
  - Inactive is open by default; Snoozed and Settled stay collapsed by default. Open states persist.
  - On hover, an inactive row offers Settle.
  - Opening an inactive thread doesn't move it; new activity moves it back automatically.
- **Scope filter** applies to Inactive too. Captains are never inactive.
- **Tests:**
  - age crossing the threshold
  - pinned and unread exempt
  - live subtree exempt
  - setting 0 disables the shelf
  - a stored park beats inactive
  - new activity returns the thread to active

## Revision: copy bb-sidebar's auto-shelving exactly (user; supersedes the earlier "automatic Inactive shelf" revision)

The user measured their 178 threads. bb-sidebar shows Pinned 1, Active 4, Inactive 33 and Settled 140. Armada shows all 175 as active. They want Armada to behave like bb-sidebar.

The lead extracted bb-sidebar's decision code from `/Users/sanku/.bb/plugins/cache/git/github.com/yusuf8834/bb-sidebar/*/dist/server.js` (`decideAutoSettle`/`cp`, `cannotAutoSettle`/`Wm`, the `auto-settle` schedule) and `dist/app.js` (`Od`, `uf`). Read those minified functions yourself to confirm. Its live settings are: inactive after **6** hours, auto-settle after **3** days, settle on merge **on**.

### Rules to port

`lastActivity(thread) = max(createdAt, updatedAt, latestAttentionAt)`.

- **Inactive** (client, computed, never stored): not on another shelf, not live, and `lastActivity <= now - inactiveAfterHours*3600e3`. Captains are never inactive. Pinned threads stay active.
- **Auto-settle** (server, persisted), `decideAutoSettle({ park, now, pullRequest, settings, thread })` returns `"keep" | "settle" | "unsettle"`:
  1. A user override (manual settle, or "keep active") → `keep`.
  2. `cannotAutoSettle` → `unsettle` if currently auto-settled, else `keep`. It is true when any of these holds:
     - pinned
     - pending interaction
     - queued work
     - working (any live activity)
     - snoozed
  3. PR outcome unknown (fetch failed) → `keep`.
  4. PR closed, or merged with `settleOnMerge`, and `Date.parse(pr.updatedAt) >= lastActivity` → should settle.
  5. PR open or draft → never settle.
  6. Otherwise, with `afterDays !== null` and no open/draft PR, settle when `lastActivity < now - afterDays*86400e3`.
  7. Return `settle`/`unsettle` only when that differs from the current auto-settled state, else `keep`.
  - Port it as a pure, unit-tested function in `lib/lifecycle.ts`, with a test per branch.
- **Runner** (server): `bb.background.schedule("auto-settle", "*/5 * * * *", evaluate)`. Also run it once at plugin start, and expose `parks_evaluate: null → { changed: string[] }` for the client to call on mount.
  - `evaluate` loads every non-archived thread through the server SDK. Check how bb-sidebar's `loadPolicyThreads` does it; it is likely `bb.sdk.threads.list`.
  - It loads each thread environment's PR with `bb.sdk.environments.pullRequest({ environmentId })`, at most 4 concurrent, as bb-sidebar does. A thread without an environment counts as PR `absent`.
  - It applies the decisions as single `park:<id>` KV writes and deletes, then invalidates `parks`.
  - Only threads whose decision isn't `keep` are written.
  - It must be idempotent.
- **Park model.**
  - Settled parks become `{ kind: "settled"; at; by: "user" | "auto" }`. Stored records without `by` parse as `"user"`; test that migration.
  - "Move to active" on an auto-settled or inactive thread stores `{ kind: "kept"; at }`, the user override. A kept thread is never auto-settled, but can still show as Inactive by age, as in bb-sidebar.
  - Settling it again replaces the kept record.
  - `resolveShelf` keeps "live always wins". An auto-settled thread whose `lastActivity > at` resolves active immediately on the client, without waiting for the 5-minute job.
  - A user settle keeps Armada's current rule: it returns on new attention.
- **Settings** (`bb.settings.define`, read reactively on the client):
  - `inactiveAfterHours` (default 6; 0 = off)
  - `autoSettleAfterDays` (default 3; 0 = off)
  - `autoSettleOnMerge` (default true)
  - Re-run `evaluate` when a setting changes, if the SDK exposes a change hook.
- **UI.**
  - Active list first; pinned threads stay at the top, as today.
  - Then an "Inactive N" section of one-line `ShelfRow`s, then "Snoozed N", then "Settled N".
  - Inactive and Settled are **collapsed by default**, with their open state persisted. The chevron rotates.
  - The scope filter applies to all shelves.
  - Hover on an inactive row offers Settle. On a settled row it offers "Move to active".
- **Tests.**
  - every `decideAutoSettle` branch
  - the inactive threshold
  - pinned and live threads exempt
  - an auto-settled thread unsettling on new activity, on both the client and the server
  - a kept thread never auto-settled
  - the legacy `by` migration
  - the runner writing only changed records (fake SDK)
  - a rendered list showing Inactive and Settled collapsed with counts
- Don't import bb-sidebar's stored settles; Armada computes its own.
