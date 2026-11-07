# Armada reads like Capy's sidebar: compact one-line rows, small square avatars, quiet type

Written against: 40db0ed (main of sankalpaacharya/bb-armada)

## Evidence chain

- Surface: Armada thread list rendered in bb at `http://127.0.0.1:38886/`, provider `armada/armada`, dark mode, 1280×860, deviceScaleFactor 2.
  Current state: `.audit/shot/armada-1.png`, `.audit/shot/armada-2-crop.png`, `.audit/shot/armada-dialog.png` (all under `/Users/sanku/work/bb-armada/`).
- Design contract: the user's own reference, Capy's sidebar (`.audit/shot/capy-ref.png`), with the instruction "look at the capy sidebar ui, the font we have and everything looks so ass, the font size and all, fix them". The user earlier also praised t3sidebar (`.audit/shot/t3-ref.png`) as clean and professional; Capy is the newer, binding reference. Take from t3 only its row mechanics (see Reuse), not its three-line card layout.
- What Capy does (read from `capy-ref.png`):
  - Section headers are plain sentence case ("Captains", "Threads") in the muted colour at the same size as rows, no rule, no caps. Actions sit at the right edge of the header: `+` for Captains; search and `…` for Threads.
  - Captain rows are one line: a small (~18px) rounded-square image avatar (small corner radius, clearly not a circle), the name in regular weight, and a muted relative time ("5d", "2h") at the right edge. The active row is a soft rounded fill.
  - Thread rows are one line: a small status dot in the same leading column as the avatars, then the title, then the time at the right edge. A muted second line appears only for an identifier ("SCO-6").
  - A project shows as a row with a small icon, the project name and a count ("transcribe-groq 1").
  - Everything shares one left edge (the leading 18px column) and one right edge (the time).
  - Type is small and even: about 13px rows, 12px times. Weight changes are rare, and the density is calm (~32px rows).
- Problems in the current Armada render, against that contract:
  1. Headers are tracked ALL CAPS (`components/armada-list.tsx` `SectionHeader`: `uppercase tracking-wide`).
  2. Type is too large and too bright. Titles render at `text-sm` (14px) in full foreground and the sizes are uneven, so the list looks heavy next to Capy's 13px.
  3. Edges don't line up. The captain row has an empty gutter before its 28px tile, thread rows are indented under the project chevron, and status glyphs sit at the left only sometimes.
  4. The captain tile is too big (28px) and the 🧭 emoji in the title repeats it. A pin glyph also shows in the captain row.
  5. PR numbers show as stray violet second lines (`experimental_ThreadRowMetadata`, `#1772`/`#1478`) that Capy doesn't have.
  6. Status glyphs are custom (`components/lane-glyph.tsx`) rather than bb's own.
- Owner: `components/thread-row.tsx`, `components/armada-list.tsx`, `components/captain-tile.tsx`, `components/lane-glyph.tsx`, `components/captain-dialog.tsx` (preview only), `app.css`.
- SDK facts (checked in `node_modules/@get-bb/plugin-sdk` 0.6.104):
  - `experimental_ThreadStatusGlyph`, `experimental_useSidebarThreadActions` and `PluginSidebarThreadIndicator` exist.
  - `experimental_useSidebarThreadPullRequest` does NOT exist, so no PR number goes on rows.
- Uncertainty: the font family. Armada must inherit bb's sidebar font, because the user customises bb's font. Change sizes, weights and colours only, never `font-family`.

## Design decision

Rebuild every row and header in Capy's compact language. The layout has one leading 18px column (captain avatar, status glyph, or project icon), a 13px title, and one right-edge column (time, or the live status). The coloured rounded-square captain avatar is the only coloured element. Everything else uses bb's muted sidebar tokens, so it sits inside bb's look and under any theme or background the user has (their sidebar has a starfield image, so no opaque fills except the active and hover row fill bb itself uses).

```
Captains                                   +
[■] Captain · cops                        2m     ← 18px tile, 13px title, 12px muted time
    ⣿ Fix flaky payouts test             ⋯      ← worker: indented to the title column, loader in its leading slot
    ● Add dark mode                       4m
[■] Captain · content                ◌ 1h        ← right slot shows loader/attention glyph when the captain or its workers need it
Threads                                    ⌄
[▢] cops  3                                      ← project row: icon, name, muted count; click toggles
    ⣿ Explain sidebar chat plugin…        now
      Hi                                   1h
[▢] Personal  12
```

Measurements:
- Rows are `h-8` (32px), `px-2`, `rounded-md`, `gap-2` between columns, `gap-px` between rows.
- Active row: `bg-sidebar-accent`. Hover: `bg-sidebar-accent/60`.
- Title: `text-[13px] leading-5 truncate`. Use `text-foreground/90` at rest and `font-medium text-foreground` when unread, and no other weights.
- Time: `text-[12px] tabular-nums text-muted-foreground`.
- Headers: `text-[13px] text-muted-foreground`, row height `h-8`, `mt-3` above each section, actions as `size-6` ghost icon buttons with `size-4` icons, visible at rest like Capy's `+`.
- Leading column: `w-[18px] shrink-0 grid place-items-center`.
- Captain avatar: `size-[18px] rounded-[5px]`, logo `size-3` in white.
- Workers and a project's threads indent so their leading column starts under the parent's title: `pl-[26px]`, i.e. 18px column plus gap.

## Revision: thread rows borrow t3sidebar's way of showing a thread (user, after this plan was drafted)

The user said: "don't copy the whole t3 design but just the way to see the threads nicely".
So the overall sidebar stays Capy (headers, captain rows, project rows, density, type scale), and
**thread rows and worker rows** take t3sidebar's thread presentation (`$T3/src/ThreadCard.tsx` lines 2-3, the
status slot idea), not its three-line card, shelves, or project line:

- Line 1: title (`text-[13px] leading-5 truncate`, unread `font-medium`) + ONE fixed-width right slot
  (`w-5 shrink-0 flex justify-end`) showing the live status glyph when the thread has something to say
  (loader for working, bb's glyph for waiting/error/unread-success) and the age otherwise. This replaces the
  leading status column for threads and workers.
- Line 2: `mt-0.5 h-4 text-[11px] text-muted-foreground`: branch in `font-mono truncate` (`environment.branchName`),
  or the host name when there is no branch, or nothing. Activity counts as t3 does, only when non-zero.
  No PR number (the SDK hook is missing), no provider glyph.
- Row: `rounded-md px-2 py-1.5`, active `bg-sidebar-accent`, hover `bg-sidebar-accent/60`.
- Indent: threads under a project and workers under a captain start at the parent's title column (`pl-[26px]`).

This supersedes the thread/worker parts of Changes 3, 5 and 6 and the ASCII sketch (thread rows are two lines,
status sits in the right slot, not the leading column). Captain rows and project rows stay one line as specified.

## Reuse

- bb tokens: `bg-sidebar-accent`, `bg-sidebar-accent/60`, `text-muted-foreground`, `text-foreground`.
- SDK:
  - `experimental_ThreadStatusGlyph` for waiting-for-input, error and unread-success (bb's own vocabulary).
  - `experimental_useSidebarThreadSplit`, `useSidebarThreadShortcut`, `experimental_ThreadActionsContextMenu` and `displayTitle`.
- Row mechanics from t3sidebar (MIT; credit in `THIRD_PARTY_NOTICES.md` as "t3sidebar, MIT, Copyright (c) 2026 Michael Yong"):
  - Source: `T3=/Users/sanku/.bb/plugins/cache/git/github.com/SawyerHood/sawyer-plugins/8b535729dd2251ceb293c7caf74e43e477f942a3/plugins/t3sidebar/src/ThreadCard.tsx`.
  - Pattern: a full-bleed `<a>` (`absolute inset-0 rounded-md`) carrying `href`, `data-sidebar-thread-shortcut-target=""`, `data-sidebar-thread-id`, `aria-current`, `aria-label`, the split pointer handler and click-to-open.
  - The visible content sits above it as `pointer-events-none relative`, with buttons `pointer-events-auto`. This keeps a `<button>` out of the `<a>`.
- Keep Armada's data model (`lib/model.ts`), registry hook, server, menus and dialog behaviour. This change is presentation only.

## Changes

1. **`components/armada-list.tsx` `SectionHeader`.**
   - Change: sentence case, styled per Measurements, with no uppercase or letter-spacing.
     - Captains: `+` (`aria-label="New captain"`, `title="New captain"`).
     - Threads: a collapse-all chevron only. Don't add search, since bb's own search field already sits above the list.
   - Preserve: `+` opens `CaptainDialog`.
2. **Project groups.**
   - Change: each project is a row like Capy's "transcribe-groq 1".
     - Leading column: a small folder icon from Armada's `components/ui/icon` (`size-3.5`, muted).
     - Content: project name `text-[13px] text-muted-foreground`, then a muted count of its root threads.
     - Right edge: the group's live status glyph when collapsed and something needs attention or is working.
     - Click toggles. Its threads indent `pl-[26px]`.
   - Preserve: collapse state in localStorage.
3. **`components/thread-row.tsx`, one shared row for captain, worker and thread.**
   - Change: one line per row, styled per Measurements, using the full-bleed anchor pattern.
     - Leading column, threads and workers: the status glyph (see 6), or empty when quiet.
     - Leading column, captains: the avatar.
     - Right column: the live status glyph for captains whose lane needs it, otherwise the age. While bb shows shortcuts, a small `kbd` replaces the age.
     - Remove `experimental_ThreadRowMetadata`, every second line, and the pin glyph.
     - Inline rename replaces the title only.
   - Preserve: context menu with its inline items, rename, split drag, ⌘1…9 shortcuts.
4. **Captain avatar (`components/captain-tile.tsx`).**
   - Change: the default size becomes `size-[18px] rounded-[5px]` with logo `size-3`. Keep the larger size only for the dialog preview (`size-10 rounded-[10px]`).
   - Captain title: `displayTitle` with any leading emoji and its following space stripped, via one small pure helper in `lib/` with a unit test.
   - Workers toggle: a `size-4` chevron button that appears on hover or focus just before the right column (`aria-expanded`). Workers stay open by default while any of them is working or needs attention.
5. **Workers.**
   - Change: one-line rows indented `pl-[26px]` under their captain, with no guide lines or boxes.
   - Cap the open list at 5 workers, then show a muted "N more" row that expands the rest.
6. **Status glyphs (`components/lane-glyph.tsx` → `components/status-glyph.tsx`).**
   - Change:
     - Working states (runtime, workflow, background-agent, background-command, goal, plan-mode, queued-waiting, working-draft) draw the square-grid loader (see 9).
     - waiting-for-input, unread-error, queued-failed and unread-success draw `experimental_ThreadStatusGlyph`.
     - A captain's lifted lane maps attention → `waiting-for-input`, working → loader, done → `unread-success`.
   - Delete `lane-glyph.tsx` and its now-unused CSS.
7. **`components/captain-dialog.tsx`.**
   - Change: match the type scale (13px labels in the muted colour, no caps). The preview uses the large tile and the stripped title. Make logo tiles `rounded-[7px]`.
   - Preserve: fields and behaviour.
8. **Captains empty state.**
   - Change: one muted 13px line, "Start a captain to run a project from one chat.", aligned to the title column.

## Scope

- Inherit: captain rows, worker rows, project rows, thread rows, headers, the empty state, and the dialog styling.
- Verify: rename, context menu, split drag, shortcuts, and collapse persistence.
- Exclude: data model, server, rpc, registries, bb theme and font family.

## Validation

- Product: next to `capy-ref.png` the list reads as compact, even and aligned, with the captains standing out only by their avatars.
- Interface:
  - Dark and light, at 1280×860.
  - Long titles truncate before the time.
  - A captain with 0, 3 and 8 workers.
  - Collapsed and open projects.
  - The active row.
- System: one shared row component, no parallel glyph set, no `font-family`, and no new colour values where a bb token exists.
- Repository: `npm run check` passes (typecheck, tests, `bb plugin build`).

## Stop conditions

- Stop if `experimental_ThreadStatusGlyph`'s props cannot express a lane-only status. Report it rather than inventing one.
- Stop if the full-bleed anchor breaks the context menu trigger. Report the failure.

## Design documentation

- After acceptance: add a README "Design" note saying Armada follows Capy's compact sidebar (one leading 18px column, 13px rows, one right edge) and that the captain avatar is its only coloured element.

## Working indicator: a tiny square-grid loader

The user asked for loading-ui's Square Grid loader (https://www.loading-ui.com/docs/components/square-grid) for the working state, "very small, minimal and nice looking". Its registry source is saved verbatim at `design-plans/square-grid.reference.tsx`, from `https://www.loading-ui.com/r/square-grid.json`. loading-ui credits the animation to shaah1d (https://x.com/shaah1d); the page states no licence.

9. **`components/square-grid.tsx` (new, adapted from the reference).**
   - Change:
     - Port the component with `size = 3` cells, sized to about 10px square inside the 18px leading column. Set the font size (e.g. `text-[5px]`/`text-[6px]`) and measure the rendered box.
     - Keep the `ch`-unit perimeter track (`░`) and the three chasing blocks (`█▓▒`).
     - Define the `@keyframes` once in `app.css`, not in a `<style>` tag per instance.
     - Colour is `currentColor`, `text-muted-foreground` by default.
   - No opaque mask background, because the user's sidebar has an image behind it.
     - Moving glyphs get a transparent background.
     - If `▓`/`▒` over `░` reads muddy, hide the track cell under the moving block another way (e.g. per-cell opacity) without any fill.
   - Respect `prefers-reduced-motion`: show the static track with one solid block.
   - Add a `THIRD_PARTY_NOTICES.md` credit for loading-ui Square Grid and shaah1d.
   - Verify: crisp, about 10px, smooth, and centred in the leading column.

## Revision 2: thread cards show their project, like T3 Code (user, supersedes Revision 1 and Change 2)

Reference: `.audit/shot/t3code-ref.png` (T3 Code's own sidebar). The user: "it shows a project as well, we gotta use like this".
Captains stay exactly as in this plan (Capy compact rows). The **Threads** section changes:

- **No project group rows.** Threads is one flat list ordered as the model already orders entries (pinned first, then latest activity). Delete the project group UI and its collapse state; keep `buildArmada`'s grouping only if something else needs it, otherwise flatten it in the model with tests updated.
- **Each thread is a three-line card** (`rounded-md px-2 py-2`, active `bg-sidebar-accent`, hover `bg-sidebar-accent/60`, `gap-px` between cards):
  1. `h-5 flex items-center gap-1.5 text-[12px] text-muted-foreground`: small folder icon (`size-3`, muted) + project name (truncate) + right: a **status word** when the thread has something to say, else the age.
     Words and colours: `Working` (bb's info/blue token, e.g. `text-info-foreground` or whatever blue token bb's sidebar uses; find the real token, no hex) preceded by the tiny square-grid loader; `Approval` / `Needs you` for waiting-for-input (bb's warning/amber token); `Failed` for unread-error and queued-failed (`text-destructive-text`); `Queued` for queued-waiting (muted); `Done` with bb's unread dot for unread-success. Age: `text-[12px] tabular-nums text-muted-foreground`.
  2. Title: `mt-0.5 text-[13px] leading-5 truncate text-foreground/90`, unread `font-medium text-foreground`.
  3. `mt-0.5 h-4 flex items-center gap-1.5 text-[11px] text-muted-foreground`: branch in `font-mono truncate` (or host name when no branch), then the environment name when it differs from the branch, separated by a muted `·` exactly as T3 Code does (this is the one place a middle dot carries meaning), then the provider glyph pinned to the right edge (`experimental_ProviderIcon` from the SDK if it exists, else omit).
- Child threads still fold into their root card (lane lifts), as the model does today.
- **Workers under a captain** use the same three-line card, indented `pl-[26px]`, minus the project line (their project is the captain's): two lines, title + branch, status word or age at the right of the title line.
- Captain rows' right slot uses the same status words in compact form: the loader alone for working, the bb waiting glyph for attention, else age.

## Revision 3: project scope picker on Threads (user)

The user: "there should be a select if I want to see the threads from all the projects or just this one single one".

- In the **Threads** section header, right side, a compact select (ghost trigger, `text-[12px] text-muted-foreground`, label + `size-3` chevron, no border at rest, `bg-sidebar-accent/60` on hover/open) whose options are **All projects** first, then every project (non-personal first, then personal), each with the same small folder icon used on cards.
- Selecting a project filters the Threads list to that project's threads; **All projects** shows everything. Captains are not filtered (they are the cross-project overview).
- When one project is selected, thread cards drop their project line (it would repeat the picker) and become two lines: title + status/age, then branch · environment + provider glyph.
- Persist the choice in localStorage (`armada/thread-scope`); if the stored project no longer exists, fall back to All projects.
- Empty filtered list: one muted line "No threads in <project> yet."
- Reuse the vendored popover/select primitive if one exists in `components/ui/`; otherwise port t3sidebar's `src/components/Select.tsx` (MIT, credit already added) rather than inventing one. Keyboard accessible.
- Filtering is a pure function (`scopeThreads(entries, scope)` or a parameter to the model) with a unit test.
