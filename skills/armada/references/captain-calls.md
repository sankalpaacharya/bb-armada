# User calls

Adapted from firstmate's `captain-hold-lifecycle` and `ahoy`.

A user call is a decision that only the user can make. It is a task waiting
on them, not a separate thing.

## Recording a call

Every open user call has one line in `backlog.md` → Waiting on the user:

```
- <slug>: <question>; options: <a> / <b>; recommend <a>; gates <task slug or "nothing"> (since YYYY-MM-DD)
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
- The Armada sidebar shows every line under Waiting on the user as **Needs
  you**, so a stale line keeps nagging the user. Keep the section exact.

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
   present only the one with the most impact: the decision, why it matters, the
   options, and your recommendation. Say that the order is your pick.
3. When they answer, close the call as above and present the next one. Stop
   when none remain.
4. If nothing happened and nothing is open, say so in one sentence.
