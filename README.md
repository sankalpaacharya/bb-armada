# bb-plugin-armada

A sidebar for people who run many bb threads. Long-lived **captain** threads sit
at the top, each with a logo in a rounded-square tile and its workers nested
underneath. Every other thread is grouped by project below.

- `app.tsx` registers the thread list (`app.slots.experimental_threadList`).
- `server.ts` owns the captain registry in plugin KV and exposes it over RPC.
- `PLUGIN_OVERVIEW.md` is the store listing text.

## How it works

The server keeps one record per captain in `bb.storage.kv` under `captains`:
the thread id, a logo, a colour, and when it was made. It is the only writer,
and it publishes the registry on the `captains` realtime channel after every
write. The sidebar loads it over RPC on mount and again whenever the realtime
connection comes back.

`lib/model.ts` turns the sidebar's threads, projects and the registry into what
the list draws. It is pure and unit-tested.

- A captain's workers are all its descendants, through `parentThreadId` or
  `lifecycleOwnerThreadId`, newest activity first. A captain nested under another
  captain keeps its own workers.
- A captain's status is the most urgent one among itself and its workers.
- Captains and their workers never appear under a project. Other threads show
  only as roots, and their children fold into them.
- Registry records whose thread is archived, hidden or gone are ignored. The
  record stays until you remove it.

### RPC

| method            | input                                       | output         |
| ----------------- | ------------------------------------------- | -------------- |
| `captains_list`   | none                                        | registry       |
| `captains_create` | `projectId`, `projectName`, `logo`, `color` | captain record |
| `captains_adopt`  | `threadId`, `logo`, `color`                 | captain record |
| `captains_update` | `threadId`, optional `logo`, `color`        | captain record |
| `captains_remove` | `threadId`                                  | none           |

`captains_create` spawns a thread titled `🧭 Captain · <project>` whose first
prompt tells the agent to follow the `/captain` skill and keep notes in
`~/.bb/captains/<project>.md`.

## Logos and colours

Logos are the icons declared under `bb.branding.experimental_icons` in
`package.json`; `lib/logos.ts` lists the same names, and a test keeps the two
in step. To add one, drop the SVG in `assets/icons/`, declare it in the
manifest, and add its name to `LOGOS`. Colours are the table in `lib/colors.ts`.

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
server.ts             captain registry and RPC handlers
lib/                  model, registry types and schemas, logos, colours, status
hooks/                registry loading and live updates
components/           list, shared thread row, create and edit dialog
components/ui/        vendored bb components (dialog, button, icon)
test/                 model, server and rendered-list tests
```

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for what is adapted from
other projects.
