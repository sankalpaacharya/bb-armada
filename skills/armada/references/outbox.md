# Outbox

Adapted from firstmate's supervision host outcome store and its
`mark-processed` acknowledgement (`docs/supervision-host.md`).

A queued chat message is lost when the captain's chat compacts. So every
crew captain report is also a line in `outbox.md` in the home, and the captain
keeps a cursor of the lines it has handled. A report is never lost, and a
report already handled is not handled again.

## The file

Only the crew captain writes `outbox.md`. It appends lines and never edits or
deletes one. Each line is one report:

```
<n> <ISO time> <KIND> <slug> <one-line summary>
```

```
1 2026-11-07T14:02Z READY fix-login PR ready for review: https://github.com/o/r/pull/12
2 2026-11-07T15:40Z CALL cache-ttl keep the 5 minute TTL, or make it configurable?
```

`<n>` is one more than the last line's number, starting at 1. The detail lives
with the task: `tasks/<slug>/report.md` for `READY`, `FINDINGS`, and `FAILED`,
and the escalation form in `tasks/<slug>/steers.md` for `CALL`. A `LESSON`
summary is the learning itself.

## Crew captain: write, then tell

1. Write the detail file.
2. Append the outbox line.
3. Send the `[crew captain]` message to the captain.

A crash after step 2 still leaves the report for the captain. Never send a
message that has no outbox line.

## Captain: read, handle, acknowledge

The cursor is the `Outbox acked through: <n>` line at the top of `backlog.md`.
Only the captain writes it. A missing line means 0; add it on the next edit.

At the start of every turn, and after any compaction or clear, list the lines
past the cursor:

```sh
awk -v n=<cursor> '$1+0 > n' ~/.bb/captains/<project>/outbox.md
```

Handle them oldest first. A `[crew captain]` chat message only rings the bell:
handle its outbox line, not the chat text.

| KIND | Handled once |
| --- | --- |
| `READY`, `FINDINGS` | the user has been told, from `report.md`, and the In flight line is in Done |
| `CALL` | it has a line in Waiting on the user |
| `FAILED` | the user has been told, and the In flight line is marked `failed` |
| `LESSON` | it is in `learnings.md` |

Check the task's current state in `backlog.md` first. A report whose effect is
already there needs nothing more. In away mode, collecting an outcome under
`## Away` counts as telling the user.

Then set `Outbox acked through:` to the highest number in the unbroken run of
handled lines. A line you cannot handle yet stops the run, so it comes back
next turn.

`outbox.md` is not startup memory and is never trimmed.
