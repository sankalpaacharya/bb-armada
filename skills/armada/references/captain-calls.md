# User calls

Adapted from firstmate's `captain-hold-lifecycle` and `ahoy`.

A user call is a decision that only the user can make. It is a task waiting
on them, not a separate thing.

## Recording a call

Every open user call has one line in `backlog.md` → Waiting on the user:

```
- <slug>: <question>; options: <a> / <b>; recommend <a>; gates <task slug or "nothing"> (since YYYY-MM-DDTHH:MM)
```

- Put the line on the work it blocks. A review that raised several questions is
  one line that points at its report, not one line per question.
- Do not treat an investigation or review as finished until every user call
  it raised has a line. Resolved findings and recommendations that need no
  choice do not get one.
- Closing the originating task does not close its calls.
- Only a real decision gets a line: a choice between options that gates work.
  A general question to the user ("what are the priorities?") is not a call;
  ask it in chat and record what they say in `captain.md` or Now.

## Asking the user

The user watches your thread, not the workers' threads, and misses a question
buried in a long reply. So when a call opens, ask it in this thread with your
ask-user tool (in Claude Code, `AskUserQuestion`) in that same turn. A call
opens on a crew captain `CALL`, a worker blocked on a question only the user
can answer, a confirmation for anything destructive, or a login or credential
step only the user can do.

- Workers and the crew captain never use their own ask-user tool. Their
  questions come to you. Answer them yourself when you can
  (`references/crew-questions.md`); ask the user only what is really theirs.
- Record the line in Waiting on the user first, then ask. The line is the
  memory; the prompt only collects the answer.
- One question per decision, up to four in one prompt, related calls grouped.
  Give each 2-4 concrete options, your recommendation first and marked
  "(recommended)".
- Each question stands alone, so the user can decide without scrolling. Name
  the worker (`@thread:<id>`), the project, and exactly what each option does,
  for example "cops: the worker @thread:thr_abc wants to drop the stale
  `jobs_old` table in its local DB copy. Only that copy changes."
- For a step only the user can do, such as a login or pasting a secret through
  the secrets flow, say exactly what to run or open, with options like "Done"
  and "Skip it".
- A worker stuck on something in its own thread, such as a harness permission
  prompt, is still asked here. Say which worker thread is waiting, link it,
  and say what to approve there. Settle it with `bb thread interactions` when
  you can; otherwise offer "Done, I approved it there" and "Deny".
- The answer settles the call: close it and relay it as in Closing a call,
  quoting the option they picked or the text they typed. If the user dismisses
  the prompt, the call stays open.
- Fall back to plain text only when the harness has no ask-user tool or the
  prompt fails. The line in Waiting on the user stays either way.
- FYIs, progress, and general questions that are not calls stay plain text.
- In away mode, do not ask; follow `references/afk.md`. Ask the calls still
  open right after the return brief.

## Expiring a call

A call the user has not answered in four hours has gone stale. At the start of
every turn, move each line older than that out of Waiting on the user and into
`archive.md`, marked `expired: no answer after 4 hours`. A line with only a date,
or no `since`, counts as expired once it is from an earlier day or you have no
sign the user is still on it. Do not raise an expired call again unless the user
brings it up. If it gated a task, keep that task parked in Queue with a note.

## Closing a call

- Before you reply to any user message, check it against every open call. If
  it answers one, makes one moot, or gives you work that settles one, close
  that call in `backlog.md` in this same turn, then reply.
- Close a call only with what the user actually said. Move the line to Done
  with their words quoted: `answered "<user's words>"`.
- Send the user's exact words to whoever holds the worker: the crew captain,
  as `ANSWER <slug>: "<words>"`, or the worker itself when no crew captain runs.
  The words get logged in `tasks/<slug>/steers.md`.
- **"Later"** is an answer too: add `until YYYY-MM-DD` to the line and move it
  to Queue. It comes back on that date.
- **Moot**, because reality settled it (the premise was false, or it turned out
  to be a question of fact): close it with the evidence,
  `moot: <evidence>`. Never record a moot call as the user's answer.
- Merge approval releases the work to land. Record it as Done only after the
  merge actually lands.

## Ahoy: clearing decisions one at a time

When the user says "ahoy":

1. Recap only what happened since the user's last message, skipping the ones
   that "Which messages are the user's" in `SKILL.md` excludes: outcomes, landed
   work, failures, decisions made, new decisions needed, work still running.
   Keep every PR URL in full.
2. Then take every open call in Waiting on the user, including old ones, and
   ask only the one with the most impact, as in Asking the user: the decision,
   why it matters, the options, and your recommendation. Say that the order is
   your pick.
3. When they answer, close the call as above and ask the next one. Stop
   when none remain.
4. If nothing happened and nothing is open, say so in one sentence.
