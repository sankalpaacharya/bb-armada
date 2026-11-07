# Captain avatars from DiceBear "Adventurer"

The user wants captain avatars like Capy's character avatars, generated with DiceBear (https://www.dicebear.com), style **Adventurer**. They picked it from a preview of eight styles.

## Data shape (decided)

`CaptainRecord` drops `logo` and `color` and gains `avatar: { style: "adventurer"; seed: string }`.
- `style` is a literal union of one member today. Don't build a style picker.
- The seed is a short random string.

The stored-registry parser at the KV boundary migrates old records. A record with `logo`/`color` and no `avatar` gets `avatar = { style: "adventurer", seed: threadId }`. The rpc contract becomes strict on the new shape (`captains_create` / `captains_adopt` / `captains_update` take `avatar`).
- Delete `lib/logos.ts`, `lib/colors.ts`, the logo/colour registries, their tests, the 24 icon SVGs in `assets/icons/`, and their `bb.branding.experimental_icons` manifest entries.
- Keep the plugin's own branding icon (`bb.branding.icon`). The Hugeicons credit goes only if no Hugeicons asset remains.

## Rendering

- Generate the SVG **locally** with `@dicebear/core` and the Adventurer style package: `@dicebear/adventurer` if v9 ships it standalone, otherwise `@dicebear/collection`, importing only `adventurer` so the bundle stays small. Check the bundle size after `bb plugin build`, and report the `dist/app.js` size before and after.
- No network requests. Memoise per (style, seed).
- Render it as a data-URI `<img alt="">` (decorative; the row title names the captain) inside the rounded-square tile: `size-[18px] rounded-[5px]` in rows, `size-10 rounded-[10px]` in the dialog preview. Use `overflow-hidden` with a neutral `bg-sidebar-accent` behind the transparent avatar. `CaptainTile` keeps being the one owner of avatar rendering.

## Dialog

- `captain-dialog.tsx` replaces the logo grid and colour swatches with a grid of 12 Adventurer avatars from 12 random seeds.
- A **Shuffle** button regenerates the 12, and picking one selects its seed. The preview shows the selected avatar and title.
- "Change logo…" in the captain menu becomes "Change avatar…", using the same dialog in edit mode.

## Licences

DiceBear's code is MIT. Look up the **Adventurer** artwork's licence and author on the DiceBear licence page or in the package metadata (expected: Lisa Wischofsky, CC BY 4.0), and credit both in `THIRD_PARTY_NOTICES.md` with the exact required wording.

## Verification

- Parser migration test: an old logo/colour record becomes an adventurer avatar seeded by threadId.
- Rendering test: a captain row shows an `img` inside the tile.
- Dialog test: Shuffle changes the offered seeds; creating sends the selected avatar.
- `npm run check` passes.

## Captain names (user)

The user: "it should be just cops, not called a cops captain". The Captains section already says what these rows are.
- `captainTitle(projectName)` returns the project name alone, with no emoji and no "Captain ·" prefix. That's the thread title a new captain gets.
- Captain rows show `thread.displayTitle` unchanged, so a user's rename shows.
- Delete `withoutLeadingEmoji` and its test, since nothing needs it.
- The dialog preview title is the project name.
- The existing captain thread has already been renamed to "cops" by the lead.
