# `~/.claude`

Version control for my Claude Code configuration.

## What's tracked

This directory is mostly machine state — session transcripts, file history, caches, locks, and
cloned plugin marketplaces — with a small amount of hand-written config mixed in. Only the
hand-written part is tracked:

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | Global operating rules applied to every project |
| `settings.json` | Permissions (allow/deny), hooks, model and TUI settings |
| `hooks/*.sh`, `hooks/*.py` | Scripts wired up by `settings.json` (`hooks/state/` is runtime state, ignored) |
| `skills/` | Skills, including local edits to installed ones — see each skill's `.source` |
| `guidelines/`, `templates/` | Per-stack guidelines and spec/ADR/plan scaffolding |
| `agents/`, `commands/` | Subagents and slash commands (`commands/` empty for now) |
| `plugins/*.json` | Marketplace + installed-plugin manifests, enough to restore the set |

## The `.gitignore` is an allowlist

`.gitignore` ignores **everything** (`*`) and then opts paths back in by name. This is deliberate:
the noise outweighs the signal roughly 14:1, and Claude Code adds new state directories across
releases — a blocklist would silently start committing each new one.

**So: a new hand-authored file needs a `!` line in `.gitignore`, or git will never see it.**

To find anything currently invisible to git:

```sh
git status --porcelain --ignored | grep '^!!'
```

## Not tracked, on purpose

- **`.credentials.json`** — holds a live OAuth token. Never commit it. It is ignored twice over,
  so staging it requires an explicit `git add -f`. Don't.
- **`projects/*/memory/`** — durable per-project memory notes. They name client work, internal
  servers and unpublished research, so they stay local-only (this repo is public).
- `projects/` transcripts, `file-history/`, `history.jsonl`, `cache/`, `paste-cache/`,
  `shell-snapshots/`, `sessions/`, `telemetry/`, `tasks/`, `debug/` — machine state.
- `plugins/marketplaces/` — cloned third-party repos that carry their own `.git` directories.
- `plans/` — generated plan files; they churn and grow on their own.
- `*.bak` snapshots — git supersedes them.

## Phone notifications

`/implement` pings the phone right before it stops for input and when a task finishes. To receive
the pings, start the session with Remote Control and connect the Claude app on the phone:

```sh
claude --remote-control
```

The ping is silent while the terminal is in use, so it only fires when you have walked away. A
session started without `--remote-control` has nowhere to send it. `agentPushNotifEnabled` is
already `true` in `settings.json`.

## Restoring on a new machine

```sh
git clone <this-repo> ~/.claude
```

Then log in with `claude` (credentials are intentionally not in the repo). The two marketplaces in
`plugins/known_marketplaces.json` are re-added by `claude plugin marketplace add <repo>`; note that
`settings.json` already declares `caveman` under `extraKnownMarketplaces`.

`CLAUDE.md` references a lessons index in an Obsidian vault under `~/.GoogleDrive/` — that lives
outside this repo and syncs separately.

## This repo is public

Nothing tracked here is a credential, and nothing names a client or an internal machine. Keep it
that way:

- Never opt `projects/` back in to `.gitignore`.
- Scan before every push:

```sh
gitleaks git -v .
```
