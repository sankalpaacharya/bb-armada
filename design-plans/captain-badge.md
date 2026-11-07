# Threads launched by a captain show that captain's face

The user: "we should also show a captain logo in threads which are launched by the captain".

## Decision (lead)

**Every thread appears once, in Threads.**
- A captain's workers move out of the deck and into the flat Threads list with the other threads, in the same order (pinned, then latest activity), filtered by the same project scope, and parked onto the same shelves.
- The deck keeps only the captain rows. Each row shows:
  - the avatar
  - the name
  - the model-counted summary ("2 working · 1 needs you" / "Idle")
  - the age or the working grid
- Remove the nested worker list from the deck, along with its chevron toggle, its "N more" row and its persisted toggle state.
- The user may ask for the nesting back later, so keep the change local to the sections and the model.

## Card change

On a worker's card (a thread whose nearest captain ancestor exists), line 1 starts with the captain's avatar before the project name.
- The avatar is `size-3.5` in a `rounded-[4px]` tile, using the same `CaptainTile` owner at a new small size.
- Line 1 reads: avatar, captain name, a muted "·", project name. For example: "[face] cops · cops". If the captain's name equals the project name, show the name once: "[face] cops".
- When the project scope hides the project line, the avatar and the captain name stay.
- The avatar has `alt=""`. Line 1 gets an accessible label, "Launched by <captain name>", e.g. via an `aria-label` on the line or visually hidden text.

## Model

- `ThreadEntry` gains `captain: { threadId: string; name: string; avatar: Avatar } | null`, the nearest captain ancestor via the existing single tree policy. Workers become ordinary root entries in `threads` with `captain` set.
- `CaptainEntry` keeps its summary counts, computed over all its descendants as now, but no longer carries a `workers` list for rendering. If nothing else needs the list, drop it.
- Tests:
  - a captain's child appears in `threads` with `captain` set
  - a grandchild folds into its root card, which carries the captain
  - a non-captain thread has `captain: null`
  - the deck counts still reflect workers
