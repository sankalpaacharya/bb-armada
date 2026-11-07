# Armada rows read like t3sidebar cards, with the captain tile as the one bold element

Written against: 5ee20c7 (main of sankalpaacharya/bb-armada)

## Evidence chain

- Surface: Armada thread list rendered in bb at `http://127.0.0.1:38886/`, sidebar provider `armada/armada`, dark mode, 1280×860.
  Screenshots: `.audit/shot/armada-1.png`, `.audit/shot/armada-2-crop.png`, `.audit/shot/armada-dialog.png`.
- Reference surface (the user's stated design contract: "look at the t3sidebar … that was so much better and professional looking"):
  t3sidebar rendered under the same conditions, `.audit/shot/t3-ref.png`.
  Source (MIT, Michael Yong / Sawyer Hood): `T3=/Users/sanku/.bb/plugins/cache/git/github.com/SawyerHood/sawyer-plugins/8b535729dd2251ceb293c7caf74e43e477f942a3/plugins/t3sidebar`,
  files `src/ThreadCard.tsx`, `src/ThreadInbox.tsx` (shelf header ~L295-313), `src/StatusGlyph.tsx`, `src/ProviderGlyph.tsx`, `src/components/Icon.tsx`.
- Problems observed in the rendered Armada list:
  1. Section labels are tracked ALL CAPS (`CAPTAINS`, `THREADS`, `components/armada-list.tsx` `SectionHeader`, `uppercase tracking-wide`). t3 uses sentence-case `text-2xs font-medium text-muted-foreground/70` followed by a hairline `h-px flex-1 bg-sidebar-border`.
  2. Rows are a single line of title + age with nothing else. t3 rows are cards (`group/card relative rounded-md px-2.5 py-2`, active `bg-sidebar-accent`, hover `bg-sidebar-accent/60`) with a title line and a muted detail line (branch in `font-mono`, PR number coloured by state, provider glyph at a fixed right edge).
  3. PR numbers appear as a stray violet second line under some rows (`#1772`, `#1478`) because `experimental_ThreadRowMetadata` draws its own block. t3 reads `experimental_useSidebarThreadPullRequest(thread.id)` and places `#N` inline on the detail line.
  4. Left edges do not line up: the captain row has an empty gutter before the tile, thread rows are indented under the group chevron, and the status glyph slot sits at the left of thread rows while t3 keeps one fixed-width status-or-age slot at the right.
  5. The captain title repeats identity: the tile shows the logo and the title also starts with the 🧭 emoji. A pin glyph also appears in the captain row.
  6. Status glyphs are custom dots/spinner (`components/lane-glyph.tsx`). t3 deliberately reuses bb's own glyph vocabulary (`src/StatusGlyph.tsx`), so both lists speak one language.
- Owner: `components/thread-row.tsx`, `components/armada-list.tsx`, `components/captain-tile.tsx`, `components/lane-glyph.tsx`.
- Scope and affected surfaces: the whole Armada list (captain rows, worker rows, project group headers, thread rows, empty state) and the captain preview inside `components/captain-dialog.tsx`.
- Uncertainty: `experimental_useSidebarThreadPullRequest` and `PluginSidebarThreadIndicator` must exist in the installed `@get-bb/plugin-sdk` (0.6.104). t3 imports both; confirm against `node_modules/@get-bb/plugin-sdk` types.

## Design decision

Adopt t3sidebar's card language for every row and section header, and spend the one bold move on the captain: a 32px rounded-square colour tile (`rounded-[9px]`, never `rounded-full`) that anchors the captain card. Everything else stays quiet, muted, and aligned to one left edge and one right-hand status slot, using bb's own sidebar tokens so it sits inside the app's look.

Layout (sidebar is ~260px wide):

```
Captains ──────────────────────────── +
┌──────┐ Captain · cops              2m       ← title: text-sm; slot: status glyph or age
│  ⌖   │ 2 working   1 needs you              ← detail: text-2xs muted; counts as separate spans, no middle dots
└──────┘
   ╎  Fix flaky payouts test          ◌       ← worker card, aligned to captain text column, thin guide line under tile centre
   ╎  fm/fix-payouts   #1801        ✳
Threads ───────────────────────────────
cops ⌄ ──────────────────────────────         ← project group header: same shelf style, chevron shows on hover
Explain sidebar chat plugin…          ◌
bb/explain-sidebar-chat…    #1478  ✳
Add color to Discord PR notif…       9h
feat/reminder-reactions     #1772  ✳
```

## Reuse

- bb sidebar tokens already used by t3: `bg-sidebar-accent`, `bg-sidebar-accent/60`, `bg-sidebar-border`, `text-muted-foreground`, `text-foreground`, `text-2xs`, `text-destructive-text`, `text-success-foreground`, `var(--pr-merged)`.
- SDK: `experimental_useSidebarThreadPullRequest`, `experimental_useSidebarThreadSplit`, `useSidebarThreadShortcut`, `experimental_ThreadActionsContextMenu`, `ThreadTitle` (or `displayTitle`).
- Exemplars to port (MIT; credit in `THIRD_PARTY_NOTICES.md` under "t3sidebar, MIT, Copyright (c) 2026 Michael Yong"): `$T3/src/StatusGlyph.tsx` (glyph per indicator + `hasStatusGlyph`), `$T3/src/ProviderGlyph.tsx`, the card container and full-bleed-anchor pattern in `$T3/src/ThreadCard.tsx` (anchor `absolute inset-0` UNDER `pointer-events-none` content so no button nests inside an `<a>`), and the shelf header in `$T3/src/ThreadInbox.tsx`. Check whether `$T3/src/components/Icon.tsx` names map to Armada's `components/ui/icon.tsx`; use Armada's existing icon component.
- Keep Armada's existing data model (`lib/model.ts`), registry hooks, dialog, and menus. This is presentation only.

## Changes

1. `components/armada-list.tsx` `SectionHeader`
   - Change: sentence case ("Captains", "Threads"), `text-2xs font-medium text-muted-foreground/70`, followed by `h-px flex-1 bg-sidebar-border`; the `+` button sits after the rule, `size-5` ghost icon button with `aria-label="New captain"` and a tooltip/title "New captain". Same padding as t3 (`px-2.5 pb-1 pt-3`).
   - Preserve: + opens `CaptainDialog`.
   - Verify: no uppercase or letter-spacing anywhere in the list.
2. Project group headers in `components/armada-list.tsx`
   - Change: render as the same shelf header style with the project name as the label; chevron is `size-3`, hidden until hover/focus of the header (`group/shelf`), rotated when collapsed; when collapsed show the group's status glyph after the label. No indentation of the rows below.
   - Preserve: collapse state in localStorage.
   - Verify: thread rows share the captain card's left edge.
3. `components/thread-row.tsx` (the one shared row)
   - Change: become a card per t3: `group/card relative rounded-md px-2.5 py-2`, active `bg-sidebar-accent`, hover `bg-sidebar-accent/60`; full-bleed `<a>` (`absolute inset-0 rounded-md`) carrying `href`, `data-sidebar-thread-shortcut-target=""`, `data-sidebar-thread-id`, `aria-current`, `aria-label`, split pointer handler and click → open; visible content `pointer-events-none relative`.
     Line 1: title `truncate text-sm text-foreground`, `font-medium` only when unread; right slot fixed width (`w-6 shrink-0 flex justify-end`) showing the status glyph when `hasStatusGlyph(indicator)` else the age (`text-2xs tabular-nums text-muted-foreground`); the shortcut `kbd` replaces the slot content while bb shows shortcuts.
     Line 2 (`mt-0.5 flex h-4 items-center gap-1.5 text-2xs text-muted-foreground`): branch in `font-mono truncate flex-1` (host name when no branch), activity counts like t3, PR `#N` from `experimental_useSidebarThreadPullRequest` coloured by state exactly as t3, provider glyph at the fixed right edge.
     Remove `experimental_ThreadRowMetadata` and the left status-glyph gutter.
   - Preserve: context menu with inline items, inline rename (rename input replaces line 1 only), split drag, shortcuts.
   - Verify: no stray PR line; every row has the same right edge.
4. Captain card (in `thread-row.tsx` via `kind === "captain"`, plus `components/captain-tile.tsx`)
   - Change: tile `size-8 rounded-[9px]` with logo `size-[18px]`, left of the two text lines (`flex gap-2.5`, tile vertically centred on the two lines). Title = `displayTitle` with a leading emoji and following space stripped (one small pure helper in `lib/`, unit-tested). Line 2 = worker summary as separate spans: `N working` (muted), `N needs you` (`text-destructive-text` or bb's attention colour, whichever t3's waiting glyph uses), or "No workers" when none. Right slot = status glyph for the captain's lifted lane (map lane → indicator: attention → `waiting-for-input`, working → `runtime`, done → `unread-success`) else age. No pin glyph.
   - Preserve: tile colour registry, chevron toggle for workers (move it into the right slot on hover, or make the whole tile a toggle target is NOT allowed — keep a small chevron button before the slot, visible on hover/focus, `aria-expanded`).
   - Verify: tile is a rounded square at 2x zoom; title shows no emoji.
5. Worker cards
   - Change: same card at `py-1.5`, indented so their text starts at the captain's text column (`pl-[42px]`), with a 1px guide line (`bg-sidebar-border`) running down from under the tile centre beside the workers.
   - Verify: workers read as belonging to the captain without a heavier box.
6. `components/lane-glyph.tsx`
   - Change: replace with the ported `StatusGlyph`; delete `lane-glyph.tsx` and its CSS (`armada-glyph`, `armada-spinner`, `armada-dot`) from `app.css` if nothing else uses them.
7. `components/captain-dialog.tsx` preview
   - Change: the preview uses the new captain card look (tile + stripped title); no emoji duplicate. Leave the rest of the dialog as is.
8. Empty state for Captains
   - Change: one muted line "Start a captain to run a project from one chat." with the + already in the header; no extra button.

## Scope

- Inherit: captain rows, worker rows, thread rows, group headers, empty state, dialog preview.
- Verify: rename, context menu, split drag, ⌘1…9 shortcuts, collapse persistence still work.
- Exclude: data model, server, rpc, registries, dialog fields and behaviour.

## Validation

- Product: the sidebar reads as calm and aligned as t3sidebar; captains stand out by their tile only.
- Interface: dark and light mode at 1280×860; long titles and long branch names truncate; a thread with and without PR; a captain with 0 and with several workers; collapsed and open groups.
- System: no new token values where a bb token exists; one shared row component; no parallel glyph set.
- Repository: `npm run check` → typecheck, tests, and `bb plugin build` pass.

## Stop conditions

- Stop if `experimental_useSidebarThreadPullRequest` or the indicator type is missing from the installed SDK; report it instead of inventing a replacement.
- Stop if the full-bleed anchor pattern breaks the context menu trigger; report the failure.

## Design documentation

- After acceptance: record in README "Design" section that Armada follows t3sidebar's card language and that the captain tile is the only coloured element.

## Addendum: working indicator is a tiny square-grid loader

The user asked for the "working" state to use loading-ui's Square Grid loader
(https://www.loading-ui.com/docs/components/square-grid), "very small, minimal and nice looking".
Its registry source is saved verbatim at `design-plans/square-grid.reference.tsx`
(from `https://www.loading-ui.com/r/square-grid.json`; animation credited by loading-ui to shaah1d, https://x.com/shaah1d; no licence stated on the page).

9. `components/square-grid.tsx` (new, adapted from the reference)
   - Change: port the component with `size = 3` cells, sized so the whole loader is ~10-11px square inside the status slot (set the font size, e.g. `text-[6px]`, and confirm the rendered box at 2x zoom). Keep the `ch`-unit perimeter track (`░`) and the three chasing blocks (`█▓▒`). Move the `@keyframes` into `app.css` once instead of a `<style>` tag per instance. Colour = `currentColor`, muted (`text-muted-foreground`) by default.
   - Do not use an opaque mask background: the user's bb sidebar has a themed image background, so `--mask-color` squares would show. Render the moving glyphs with a transparent background and check the overlap of `▓`/`▒` over `░` still reads cleanly; if it does not, hide the track cell under the moving block another way (for example animate per-cell opacity) without any background fill.
   - Respect `prefers-reduced-motion`: show the static track with one solid block, no animation.
   - Use it for every "working" indicator in Armada (runtime, workflow, background agent/command, goal, plan mode, queued) in place of bb's spinner from the ported `StatusGlyph`; keep bb's glyphs for waiting-for-input, error, and unread-success.
   - Add a credit line to `THIRD_PARTY_NOTICES.md` for loading-ui Square Grid and shaah1d.
   - Verify: in the rendered sidebar the loader is crisp, ~10-11px, animates smoothly, and sits centred in the same fixed status slot as the other glyphs.
