---
slug: phone-notifications
title: Phone notifications
status: shipped
created: 2026-10-17
---

# Phone notifications

## Summary

Claude Code should ping the human's phone when it needs something (a decision, a permission,
a STOP condition from `/implement`) and when it has finished a piece of work, so the human can
walk away from the terminal and come back only when it matters. This is the first of three
pieces split out of one larger ask. The other two, a `/yolo` autopilot and a per-task
orchestrator, are separate features and depend on this one for their "I need you" signal.

## Tech Stack / Approach

Two delivery mechanisms exist, and they differ in who triggers them:

- **Native.** The `PushNotification` tool is called by the model. It pushes to the phone only
  when Remote Control is connected (`claude --remote-control`), and it skips the ping when the
  human is actively at the terminal. `settings.json:420` already has
  `"agentPushNotifEnabled": true`.
- **Hook plus webhook.** Hooks run shell commands, so they cannot call `PushNotification`.
  A hook could call an external service such as ntfy.sh instead. Today `settings.json:380-395`
  has a `Stop` hook (`hooks/check-clean.sh check` plus a local `afplay` sound) and no
  `Notification` hook.

The first task is a spike, not a build: start a session with Remote Control, test a ping from
the phone, and find out how much of the ask works with zero code. The rest of the task list is
written after that result, so the plan stays honest about what is left to build.

Existing code and conventions to reuse:

- `hooks/` plus `settings.json` registration, if a hook is needed. A new hand-authored file
  needs a `!` line in `.gitignore`, or `just tracked` fails.
- The STOP conditions in `skills/implement/SKILL.md:14-56` are the exact "needs the human"
  moments a ping should cover. The skill would only need a one-line "ping before you stop".
- `just verify` (`shell`, `python`, `json`, `tracked`) is the gate for any script added.

Constraints from `docs/goal.md`: `CLAUDE.md` is loaded into every session, so every added line
costs tokens everywhere. Hooks are snapshotted at session start, so a hook change takes
effect next session.

## Open Questions

## Resolved

### Q1: Which delivery channel reaches the phone?

- [x] Native only: Remote Control plus the `PushNotification` tool (recommended) — no new service, no secret, already half-enabled. The cost is that the model must choose to call it, and the session must have been started with Remote Control.
- [ ] Hook plus ntfy.sh webhook — fires deterministically on `Notification` and `Stop` events whether or not the model remembers. The cost is an external service and a topic secret, which `CLAUDE.md` treats as a dependency conversation.
- [ ] Both — native for rich, model-written messages and the hook as a safety net. The cost is two systems to maintain and a risk of double pings.

### Q2: What makes Claude send a ping?

- [x] A "ping the human" line inside `/implement` (and later `/yolo`) at each STOP (recommended) — targeted at the moments that matter, costs nothing in sessions that never run those skills, and the future `/yolo` reuses the same line.
- [ ] A rule in global `CLAUDE.md` — covers ad-hoc work too, but adds a line to every session in every project, and the goal file says ad-hoc work should stay untouched.
- [ ] Hooks only (`Notification` and `Stop` events) — deterministic and no model involvement. It only works with the webhook channel from Q1, and `Stop` fires after every turn, so it is noisy unless filtered.

### Q3: Which events deserve a ping?

- [x] Needs input, plus a task or feature finished after the human has been away (recommended) — matches the original ask exactly, and `PushNotification` already skips pings while the human is at the terminal.
- [ ] Needs input only — quietest. The cost is that the human learns nothing when a long run simply finishes.
- [ ] Every Stop — never misses anything, but the human will start ignoring it within a day.

## Out of Scope

- The `/yolo` autopilot and the per-task orchestrator. Each gets its own `/feature-plan`; `/yolo` also needs a human-approved amendment to `docs/goal.md`.
- Any two-way control from the phone beyond what Remote Control already offers. This feature only sends pings out.
- Changing `check-clean.sh` or the commit guard. Those matter for `/yolo`, not for pings.
- Notifications for ad-hoc sessions that never run the spec workflow, unless Q2 picks the global rule.
