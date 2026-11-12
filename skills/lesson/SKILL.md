---
description: Save a hard-won technical lesson to the Obsidian Lessons vault
argument-hint: [slug]
disable-model-invocation: true
model: haiku
---

Save a lesson to `~/.GoogleDrive/Documents/Obsidian/Lessons/`.

**First, check it earns a file.** All three must hold:
1. It cost real time to figure out — surprising, undocumented, or the docs were wrong.
2. It would apply again outside this repo.
3. It is not already in a project CLAUDE.md, a code comment, or git history.

**Never save:** generic language/framework facts, one-off repo trivia, or anything already in
project docs. Facts about me or my projects go to the built-in memory system instead — no
duplication. If it fails the test, say so and stop.

**Write two files in the same edit:**

`<slug>.md` — kebab-case, from `$ARGUMENTS` if given. Under 20 lines:

```markdown
---
tags: [lesson, <topic>]
created: YYYY-MM-DD
---
**Problem:** <what went wrong>
**Signal:** <how it shows up — the error, the symptom>
**Fix:** <what actually works>
**Source:** <links>
```

Add `**Why:**` only if the root cause is non-obvious.

`_index.md` — append the matching trigger line in the SAME edit:
`- [[<slug>]] — when: <the situation that makes this note relevant, not a summary of it>`

**The `Source:` line is mandatory.** Cite the issue tracker / docs / forum links that actually
resolved it, each with a few words on what it contributed — and the key claim itself where it is
load-bearing, so the note survives link rot. Only URLs actually opened during the session; never
reconstruct a URL from memory. If there was no external source, write `none — derived from <how>`.

Show me the draft and wait for approval before writing.
