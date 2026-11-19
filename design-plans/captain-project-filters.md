# Filter captains using their existing project groups

Written against: 59be9e7fb2ebbc0da069d065959628e98267743a and the current local filter implementation.

## Design language

- Audited surface: Armada's captain filter row, directly above Captains.
- Design sources: the user's reference and current sidebar screenshots; `README.md`; `components/captains-section.tsx`; `lib/styles.ts`.
- Documented decisions: captains belong to projects, and a project can have several captains. The user selected project groups and explicitly removed the blue dots.
- Governing owners and consumers: `ArmadaList` passes live projects and captain records into `CaptainsSection`, which owns the selected filter and renders `CaptainFilters`.
- Explicit exceptions: None documented.

## Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | The row includes an Attention category and blue dots that the user did not want. | The supplied sidebar screenshot shows both; the user explicitly selected existing project groups and requested removal of the dots. `CaptainsSection` renders these choices through `CaptainFilters`. | Render All plus the existing project groups, with captain counts and no dots. | Captain filter row only | High |

## Improve first

Use the actual captain project groups. This gives each chip an explicit relationship to the list it filters.

## Evidence chain

- Surface: the screenshot showing eleven captains below All, Attention, cops, and content chips.
- Problem: the filter taxonomy includes a status category while the requested grouping is by project.
- Design evidence: the user's accepted groups are Personal (2), GymSide (2), cops (3), content, portal, goodluck, and gaia. These were verified against live captain records, thread project IDs, and project names.
- Owner: `components/captain-filters.tsx`.
- Scope and affected surfaces: the captain filter row and filtered captain list in the Armada sidebar.
- Uncertainty: none about the selected grouping; all names and counts must remain data-driven.

## Design decision

Keep one compact, horizontally scrolling row of pills. Use All as the reset and one chip per project represented in the visible captain list. Put project chips in first-captain order, so they follow the list the user arranged. Show the number of captains in each group. Remove Attention and the blue dots. Retain the existing section headings, avatars, row layout, thread project picker, shelves, and usage card.

## Reuse

- `CaptainFilters`, `CaptainsSection`, `useStoredState`, and `FOCUS_RING`.
- Existing sidebar theme tokens for active and inactive pill states.
- Exemplar: the user's horizontal filter-chip reference; the existing `SectionHeader` stays unchanged.
- No new shared primitive is required.

## Changes

1. `components/captain-filters.tsx`: derive project groups and counts from the complete captain list, using project IDs rather than captain names. Render All and those groups without dots.
2. `lib/captain-filter.ts`: support only All and a project selection. Invalid or retired saved categories fall back to All.
3. `components/captains-section.tsx`: filter captains while retaining the existing create, navigation, and reorder actions.
4. `components/armada-list.tsx`: pass the live project names into the captain section.

## Scope

- Inherit: the Armada sidebar on desktop and mobile.
- Verify: project selection, All, captain counts, persistence, stale saved selections, and existing captain actions.
- Exclude: Crew tab headings, avatar design, thread and shelf filters, and the Beautiful bb usage card.

## Validation

- Product: selecting GymSide shows both GymSide captains; selecting cops shows its three captains, including Researcher (cops). All restores the complete captain list.
- Interface: one scrolling row; selected chip is distinct; long names truncate; no blue dots or Attention chip.
- System: the groups use live project IDs and names, with no hardcoded user categories.
- Repository: `node node_modules/.bin/tsc --noEmit`, `node node_modules/.bin/vitest run`, and `bb plugin build .`.
- Live: build the installed local plugin and reload Armada.

## Stop conditions

- Stop if the user requests broader categories or if project identity is unavailable. Do not infer new categories from captain titles.

## Design documentation

- After acceptance and validation: none.
