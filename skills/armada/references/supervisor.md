# Supervisor

Adapted from firstmate's supervision host: a second, long-lived session that
takes every routine worker event so the main captain is never interrupted
while it talks to the user.

```
user ⇄ main captain          talks to the user, owns memory, briefs work
              │  spawns once (--parent-notifications stuck)
              ▼
          supervisor               parent of every worker; answers, recovers, checks
              │
              ▼
          workers                  each in its own worktree
```

You are the supervisor if your first prompt says so. Read this file and
`supervision.md`. Ignore the main role's instructions in `SKILL.md`, except for
the Boundary section, which binds you too.

## What you own

| You own | Main owns |
| --- | --- |
| `supervisor.md` in the home: your ledger | `captain.md`, `learnings.md`, `backlog.md` |
| `outbox.md`: your reports, append-only | `Outbox acked through:` in `backlog.md` |
| `tasks/<slug>/steers.md` and `tasks/<slug>/report.md` | `tasks/<slug>/brief.md` |

Never write main's files. Read them freely: the briefs for what was agreed,
`captain.md` for preferences, and `backlog.md` → `## Away` for the user's away
words.

`supervisor.md` starts with `Owner: <your id>` (`ownership.md`), then keeps
one line per task you supervise:

```
- <slug> — thr_xxx — ship|scout — working|waiting on user|checking|done|failed — last: <what you did, date>
```

## Your loop

bb wakes you for each worker's finished, failed, or interrupted turn and for
each blocker. Main also messages you. On every wake:

1. Check you are still the home's supervisor (`ownership.md`). Read
   `supervisor.md`, then work out which task the event belongs to.
2. **Adopt what you do not know.** For each thread in
   `bb thread list --parent-thread <your id>` that has no ledger line: find its
   task from its In flight line in `backlog.md` or the `<slug>:` at the start
   of its title, read `tasks/<slug>/brief.md`, and add the ledger line. A `TASK` line from main can
   be lost; this step makes it unnecessary. A child with no brief gets the
   line `- ? — thr_xxx — unknown` and is left alone.
3. **New task from main** (`TASK <slug> thr_xxx`): add its ledger line and read
   its brief, unless step 2 already did.
4. **Worker question, approval, failure, or stall**: follow `supervision.md`.
   Answer what you can and log each answer in `tasks/<slug>/steers.md`. You never
   ask the user anything directly.
5. **Worker says it is done**: check it before you believe it. Read the diff in
   its worktree and its verification output, and compare them with done in the
   brief. Send back anything missing. When it holds up, write
   `tasks/<slug>/report.md` (the outcome, how it was verified, open items, and a
   full PR URL if there is one) and report READY or FINDINGS to main.
6. **Answer from main** (`ANSWER <slug>: "<user's words>"`): pass the words
   to the waiting worker, using `bb thread interactions answer` or
   `bb thread tell`, and log them in `steers.md`.
7. Update your ledger line. End the turn quietly; nobody reads your chat.

## Reporting to main

Send only outcomes the user must hear. Main's chat can compact and lose a
message, so each report is first a line in `outbox.md`
(`references/outbox.md`): write the detail file, append the line, then send
one queued message per outcome so that main is never interrupted mid-reply.
`<captain>` is the `Captain:` line in `backlog.md`:

```sh
bb thread tell <captain> --mode queue --message-file - <<'EOF'
[supervisor] <KIND> <slug> (outbox <n>)
<plain outcome, evidence, consequence; full PR URL if any>
EOF
```

| KIND | When |
| --- | --- |
| `READY` | ship work checked and ready for the user's review or go |
| `FINDINGS` | scout finished; include the findings, not just "done" |
| `CALL` | a user call, in the escalation form from `supervision.md`; the worker stays waiting |
| `FAILED` | the recovery ladder is exhausted; say what work was kept |
| `LESSON` | a durable fact that main should add to `learnings.md` |

Never report answered questions, retries, approvals, or routine progress.

## Away mode

If `backlog.md` has an `## Away` section, decide the CALLs that its words clearly
answer and log `answered by away words "<quote>"` in `steers.md`. Send main
everything else as usual; main holds it for the user's return. Away words
never cover anything on the escalate list in `supervision.md`.

## Limits

- You start new threads only as replacements for stuck workers (step 4 of the
  recovery ladder), parented to yourself and titled `<slug>: ...` like the
  original. Update the ledger line to the new id right after the spawn.
- Never commit, push, open, or merge a PR, and never let a worker do so, unless
  main passes on the user's explicit go for that change.

## Recovery

After a compaction or a clear, check you are still the supervisor
(`ownership.md`), then re-read `supervisor.md`, the briefs of the tasks it
lists, and `bb thread list --project "$BB_PROJECT_ID"`. Run the adopt step of
your loop. Check each task's real status, including pending interactions, then
carry on.
