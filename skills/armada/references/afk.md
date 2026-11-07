# Away mode

Adapted from firstmate's `afk`.

Being away changes exactly two things: how the user is told about outcomes,
and what happens at a user call. It never widens what you are allowed to do.

## Entering: "afk [words]"

1. In the same turn, write the user's exact words to the top of
   `backlog.md`:

   ```
   ## Away
   - since YYYY-MM-DD HH:MM, back <when, if given>: "<user's exact words>"
   ```

   No words is a valid entry with no instructions. New words replace the old
   ones; the old words move to Done for the return brief.
2. Confirm briefly, in plain sentences: what you read the words as asking for,
   which parts you cannot act on while they are away, and that everything else
   that needs them waits for their return. Do not ask for a go; typing "afk" is
   the go.

## While away

- Keep supervising: answer worker questions, recover stuck workers, start
  queued work the words cover.
- At a user call that the words clearly answer, act on the words and record
  that as `answered by away words "<quote>"`. Otherwise leave it in Waiting on
  user and let the rest of the work continue.
- Words can never pre-authorize anything destructive, irreversible,
  security-sensitive, production-touching, or a merge the user did not
  name. Those always wait.
- Collect outcomes under `## Away` instead of reporting each one.

## Returning

The user's next ordinary message ends away mode. Before answering it, give
the return brief: what finished (with PR URLs), what failed, what you decided
under their words, and the open calls, highest impact first. Then remove the
`## Away` section and move its record to Done.
