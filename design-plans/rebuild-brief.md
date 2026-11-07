# Armada rebuild: clean foundations, then shelves, avatars and the deck

Written against: 116f4ac (main of sankalpaacharya/bb-armada).

## User goal

The user runs bb with Armada as their sidebar. They want three things.
- **No more patches.** Armada grew through many fast UI rounds, and they asked for a proper solution with no sloppy code.
- **t3sidebar's settle/snooze shelves.** Finished threads can be settled or snoozed out of the live list.
- **A clearer sidebar.**
  - Captains become DiceBear "Adventurer" avatars.
  - Captains are named by their project, e.g. "cops", not "Captain · cops".
  - The Captains and Threads sections should read clearly as two different things.

## Inputs (read all before designing)

- `/Users/sanku/work/bb-armada/.audit/review-1.md`: an independent audit with 18 findings and a suggested order. **All 18 are in scope.** Where a finding contradicts an older plan, the finding wins.
- `design-plans/lifecycle-shelves.md`: shelf rules, data shape, UI and tests.
  - Superseded by finding 1 and finding 8: no generalised registry hook and no document store. Use the SDK query and invalidate layer, with one KV key per record (below).
- `design-plans/captain-avatars.md`: Adventurer avatars and project-named captains.
- `design-plans/capy-compact-sidebar.md`: the current visual language. Keep the thread cards as they are; the user likes them.
- The section design is **"Deck"**, which the user confirmed. Spec below.
- t3sidebar reference (MIT, already credited): `/Users/sanku/.bb/plugins/cache/git/github.com/SawyerHood/sawyer-plugins/8b535729dd2251ceb293c7caf74e43e477f942a3/plugins/t3sidebar/src/` (`lifecycle.ts`, `server.ts`, `useLifecycle.ts`, `ThreadInbox.tsx`, `SlimRow.tsx`, `ThreadCard.tsx`).
- SDK docs: `/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/server/dist/builtin-skills/bb-plugin-authoring/references/`. Types are in `node_modules/@get-bb/plugin-sdk/bundled-types`; trust them over prose.

## Storage and sync (decided)

- One KV key per record: `captain:<threadId>` and `park:<threadId>`. List with `kv.list(prefix)`.
  - Every write is one `set` or `delete`.
  - Unpark is idempotent.
  - There's no queue, no version field and no size ceiling.
- Parse each stored value leniently at the KV boundary. Skip and log malformed records. Inputs are parsed strictly at the rpc boundary.
- Migration on server start, idempotent:
  - If the legacy single `captains` key exists, write each record to `captain:<id>`.
  - Map `logo`/`color` to `avatar: { style: "adventurer", seed: threadId }`.
  - Then delete the legacy key.
  - Test this with the server harness.
- RPC:
  - Reads (`captains_list`, `parks_list`) declare contract `tags`.
  - Every write calls `bb.rpc.experimental_invalidate([...tags])`.
  - The client reads with `experimental_useRpcQuery` and writes with `experimental_useRpcMutation`, using optimistic updates where the SDK supports them.
- Delete:
  - `hooks/use-captain-registry.ts`
  - `REGISTRY_CHANNEL`
  - `isRegistry`
  - the retry ladder, the generation counter, the module global and the localStorage registry cache. Bring back a first-paint seed only if you measure a flicker without it, and say what you measured.
- `captains_create` must not leave an unrecorded thread. Either record first and roll back on spawn failure, or spawn and then record with a retry that reports clearly. Pick one, justify it, and test it.
- Stale parks and captains for threads that no longer exist are pruned server-side when listed against the live thread set, or skipped in the model. Choose one owner and keep it there.

## Domain model (decided shape, refine names freely)

- **One status table** in `lib/status.ts`. Each status row holds:
  - its lane rank
  - its card word and colour token
  - its compact glyph (shade grid, bb `ThreadStatusGlyph` indicator, or none)
  - whether it is parkable
  Every surface (captain row, card, shelf row) reads from the table, and "queued" looks the same everywhere. Remove the translation back into bb indicator names except where `ThreadStatusGlyph` needs an indicator. That mapping lives in the table.
- **`buildArmada`** returns view-ready entries only. Workers are entries, never raw threads, with:
  - status
  - activity time
  - folded subtree
  - shelf
  - whether they can be adopted as captains
- One fold and one tree policy, in the model.
- Shelves follow `lifecycle-shelves.md`. Parks are a discriminated union (`settled { at }` | `snoozed { at, until }`). A working, queued or needs-you thread always resolves active.
- **One clock.**
  - A single `now` source drives ages, wake labels, and a scheduled re-render at the next snooze wake.
  - One duration formatter serves ages and "wakes in".
  - `ShadeGrid` uses the existing reduced-motion helper.

## Components (decided split)

- `armada-list.tsx` becomes a thin composition, about 120 lines at most. It holds:
  - `CaptainsSection` (the deck)
  - `ThreadsSection` (header, scope, active cards)
  - `ShelfSection` (Snoozed, Settled)
  Plus hooks for scope and expanded state.
- Row layouts, each its own component:
  - `CaptainRow`
  - `ThreadCard` (the current card, unchanged visually)
  - `WorkerCard`
  - `ShelfRow`
  They share one `ThreadLink` that owns bb's row contract: the full-bleed anchor, data attributes, split, shortcuts, the context menu and rename. Remove the `kind` flag.
- **Headings never contain controls.** The header is a `div` with an `h2` label and sibling action buttons. The worker list nests inside its captain's `li`.
- **One choice-list primitive** for the project scope and any other picker, with:
  - correct ARIA (listbox/option or menu/menuitemradio; pick one and use it everywhere)
  - arrow-key navigation and focus management
  - `useId`, not a global id
- Shared style constants live in one module, so files don't retype them. Don't override the vendored `Button`'s bb tokens. Use a variant, or a plain button where a Button doesn't fit.
- One toast helper for rpc errors, used by every mutation.

## Deck section design

- **Headers.** "Captains" and "Threads" are `text-[12px] font-semibold` at about 72% of the foreground colour, so they outrank the cards' project labels. Each header shows a muted count (`text-2xs`). Actions sit on the right: `+` on Captains, the scope trigger on Threads. Put about 14px of space between sections, with no divider lines.
- **Card project labels** drop to about 80% of their current muted colour, so they stop reading as headings.
- **The Captains deck.** Captains sit on one raised panel: `rounded-[10px]`, a background of about 5% foreground mixed into the sidebar, using a bb token or `color-mix` with the token; no hex. The panel has 4px padding.
  - Each captain row has a 28px Adventurer avatar (`rounded-[8px]`), the name in `text-sm font-medium`, and a summary line under it in `text-2xs`:
    - "2 working" in the blue status colour
    - "1 needs you" in amber
    - otherwise "Idle"
    Counts come from the model.
  - The right side shows the age, or the shade grid when working.
  - Workers nest inside the deck under their captain, using `WorkerCard`.
  - Empty deck: one line, "Start a captain to run a project from one chat.", plus the header's `+`.
- **Threads** stay flat on the sidebar background, with the cards unchanged.

## Avatars and names

Follow `captain-avatars.md` and its "Captain names" section exactly. Run the bundle-size check and report it.

## Cleanup (from the review)

- Remove the dead dependencies and exports fallow confirms. Run `npx fallow dead-code` and `npx fallow dupes` before and after, and report both.
- Rewrite `README.md`, `PLUGIN_OVERVIEW.md` and `THIRD_PARTY_NOTICES.md` to describe the code as it is. Add a short README "Design" note.
- Make the types strong: no casts hiding invariants, and no unreachable fallbacks.
- Make the tests behavioural, and cover the risky paths:
  - the stale-overwrite race is gone by construction (assert the query is invalidated after a write)
  - a bad stored record doesn't take down the list
  - migration
  - shelf rules
  - park actions round-trip

## Execution

- Work in `/Users/sanku/work/bb-armada-wt` on a fresh branch `refactor/armada-rebuild` from `main` (116f4ac or later; run `git merge --ff-only main` first).
- Follow the review's suggested order as **verifiable units**:
  1. Sync and storage, with migration.
  2. Model and the status table.
  3. Component split and accessibility.
  4. Cleanup and docs.
  5. Lifecycle shelves.
  6. Avatars and names.
  7. Deck section design.
  Each unit ends with `npm run check` green and a conventional commit, or several, before the next starts.
- Don't push, don't run `bb plugin install`/`reload`, and don't change bb settings. The lead verifies in bb.
- No AI attribution or Co-Authored-By trailers. No explanatory comments beyond a non-obvious why.
- **Report:**
  - commits by unit
  - each review finding with how it was resolved (or why not)
  - fallow before and after
  - bundle size before and after
  - anything in the SDK that contradicted this brief and what you did
  - what needs visual confirmation
