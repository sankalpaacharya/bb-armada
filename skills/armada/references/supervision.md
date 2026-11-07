# Supervision

Adapted from firstmate's `ask-user-authority` and `stuck-crewmate-recovery`.

Workers never wait on the user directly. When a worker asks something, you
pick it up and either answer it or escalate it. The user hears only about
decisions that really are theirs.

## How a worker's question reaches you

Spawn workers with the default `--parent-notifications auto`. bb then wakes you
for every finished, failed, or interrupted turn, and for every blocker on an
approval or a question.

- **Blocked on an interaction** (the worker used its ask-user tool or needs an
  approval): `bb thread interactions list <id>`, then
  `bb thread interactions show <interaction-id> <id>`.
- **Turn ended with a question in its final message**: `bb thread output <id>`.
- **Turn failed or was interrupted**: `bb thread show <id>` and
  `bb thread log <id>`.

## Decide or escalate

Rebuild what was agreed first: the user's words in the brief, the user's
later words, `captain.md`, and the project's `AGENTS.md`/`CLAUDE.md`. A worker's
own framing cannot change that agreement.

**Decide it yourself** when the answer follows from what was agreed:

- The brief, memory, or project rules already answer it.
- It restores agreed behavior, completes an already-approved design, or is a
  straight in-scope bug fix, even when it is technically hard.
- It is a small follow-on change needed to keep agreed behavior correct: a
  test, a doc fix, or a caller update outside the named files.
- An approval for a reversible, local, in-scope action, such as running tests,
  reading files, or editing inside its worktree.

**Escalate to the user** when:

- Answering would expand the task: a new guarantee, subsystem, abstraction,
  compatibility surface, or broader architecture that the ask did not need.
- It is a product or architecture call that nothing agreed settles.
- The same kind of problem keeps coming back and each fix props up a
  questionable design instead of closing a separate defect.
- It is destructive, irreversible, security-sensitive, touches production or
  shared data, or is a commit, push, PR, or merge without the user's go.
- It needs a credential or login.

Labels such as "critical", "security", or "required" are evidence about the
question. They do not give anyone authority to widen the task.

## Answering

- Question interaction:
  `bb thread interactions answer <interaction-id> <id> --choice <qid>=<value>`
  or `--text <qid>=<text>`.
- Approval: `bb thread interactions approve <interaction-id> <id>` or `deny`.
  Never approve anything on the escalate list.
- Question in a final message: `bb thread tell <id> '<one-line answer>'`. A
  message to a thread that is waiting on an interaction gets queued until the
  interaction settles; that is not a failure, so do not resend.
- Answer in one line with the decision and the reason it follows from what was
  agreed. Log each answer in `tasks/<slug>/steers.md`.

When you escalate, leave the worker waiting and put the call in the escalation
form below. As the supervisor, write it to `tasks/<slug>/steers.md` and report
it to main as `CALL`. As main with no
supervisor, add it to `backlog.md` → Waiting on the user (see `captain-calls.md`)
and ask the user. Once the user answers, send the worker their exact words.

### Escalation form

One concise message that stands alone:

1. What was originally asked.
2. What the worker wants to add or decide.
3. The smallest option that stays inside the original ask.
4. What happens if the user accepts, and what happens if they decline.
5. Your recommendation and why.

## Stuck workers

Go up this ladder one step at a time:

1. **Read before you act.** `bb thread show`, `bb thread log`, and
   `bb thread interactions list`. If the worker says it is waiting on
   something, check that thing yourself. If it has already cleared, tell the
   worker to read the result and carry on.
2. **The brief already answers its question.** Answer in one line.
3. **Confused or looping.** `bb thread stop <id>`, then
   `bb thread tell <id> --mode auto '<one corrective line>'`.
4. **Still wedged** (it loops, does not respond, or keeps hitting the same
   obstacle): start a replacement in the same environment so its work is kept.
   Use `bb thread spawn --parent-self --environment <same env id>` with the
   brief plus a short progress note, then archive the old thread. A low
   context reading is not wedging; threads compact and keep going.
5. **A second replacement also fails**: report the plain failure, what work was
   kept, and what it means. As the supervisor, send `FAILED` to main. As main,
   mark the backlog line `failed` and tell the user.

A worker that claims some tool or service is dead is guessing until you check.
A timed-out command is not the same as a dead service. Never restart shared
services (dev servers, databases, daemons) because a worker said so; that is
an escalation.
