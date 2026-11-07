# Ownership

Adapted from firstmate's session lock (`bin/fm-lock.sh`, and the read-only rule
for a refused session in `AGENTS.md`), re-keyed to bb thread ids.

One captain owns a home, and one supervisor owns its ledger. Two writers on
the same files overwrite each other.

## The lines

`backlog.md` starts with:

```
Captain: thr_xxx
Supervisor: thr_yyy
Outbox acked through: <n>
```

`supervisor.md` starts with `Owner: thr_yyy`. The captain writes the first
two lines of `backlog.md`; the supervisor writes `Owner:`.

## Live or dead

A thread is dead when `bb thread show <id> --json` fails with
`thread_not_found`, or shows `archivedAt` or `deletedAt` set. Otherwise it is
live, even when idle: a captain sits idle between the user's messages.

## Captain: check at the start of every turn

Compare the `Captain:` line with your `$BB_THREAD_ID`.

- **Missing**: write your id. The home is yours.
- **Yours**: carry on.
- **Another live thread**: stay read-only. Do not write the home, spawn,
  steer, or message the supervisor. Tell the user that `@thread:<id>` is the
  captain for this project, that you can answer from its memory, and that you
  take over only if they say so.
- **Another dead thread**, or the user told you to take over: take over.

To take over:

1. Write your id on the `Captain:` line.
2. Add to Done: `- captain: <your id> took over from <old id>, <dead | "user's words"> (YYYY-MM-DD)`.
3. If the supervisor is live, make yourself its parent:
   `bb thread update <supervisor> --parent-thread <your id>`.
4. Say so in your reply.

A captain that was replaced while still live finds another live owner on its
next turn, and goes read-only by the same rule.

## Supervisor: check on every wake

- If `Supervisor:` in `backlog.md` names another live thread, you were
  replaced. Write nothing and end the turn.
- Otherwise the home's supervisor is you. If `Owner:` in `supervisor.md` is
  missing or names another thread, write
  `Owner: <your id> (took over from <old id>, YYYY-MM-DD)`, leaving out the
  parenthesis when there was no old owner.
- Report to the thread on the `Captain:` line, not to the id in your first
  prompt.
