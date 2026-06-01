---
name: get-changes
description: Read the Obsidian "Active Changes" note for this project, clear it, then implement the captured changes
disable-model-invocation: true
---

> **User-specific.** This skill reads the queue from Ben's personal Obsidian
> vault via the `Obsidian-Personal` MCP server. It will not work for other
> users without that MCP configured and the note in place.

The queue note is **`Efforts/On/Ulti Game Tracker/Active Changes.md`** in the
`Obsidian-Personal` vault.

1. Read the note with `mcp__Obsidian-Personal__read_note` at path
   `Efforts/On/Ulti Game Tracker/Active Changes.md`. The note body is the
   queued changes.

2. If the note is missing, empty, or contains only whitespace, tell the user
   there are no pending changes and stop.

3. Clear the queue — overwrite the note with empty content using
   `mcp__Obsidian-Personal__write_note` (mode `overwrite`, content `""`) at the
   same path, so the user can queue new changes while you work. Do this
   immediately after capturing the contents and before doing any other work.

4. /commit any existing uncommitted changes to the current branch.

5. Echo the captured changes in chat and implement everything described. Work
   through all items before reporting back.
