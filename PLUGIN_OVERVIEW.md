Run many threads without losing the long-lived ones. Armada replaces the
sidebar thread list with captains on top and every other thread in one list
you can filter by project.

## What you get

- **Captains.** A captain is a long-lived thread for a project. It sits at the
  top of the sidebar as a rounded-square tile in the logo and colour you chose.
- **Workers underneath.** Every thread a captain starts nests under it as a
  card. The captain's row shows the most urgent thing going on among its
  workers, and opens by itself when something is going on.
- **Threads.** Every other thread is a card with its project, status, branch,
  pull request and harness. Sub-threads fold into their parent, which takes on
  the most urgent status among them. Pick a project to see only its threads.
- **One click to start.** The **+** next to Captains asks for a project, a logo
  and a colour, then starts a captain thread that sets up its own notes file.

## Make a captain from any thread

Right-click a thread and choose **Make captain…**. A captain's menu has
**Change logo…** and **Remove from captains**. Removing only forgets the
captain; the thread stays.

## Good to know

Rows behave like bb's own: click to open, cmd-click to open in a split, the
jump-to-thread shortcuts, bb's thread menu, and rename in place. Captains are
stored by the plugin on your bb server, so every device sees the same ones.
