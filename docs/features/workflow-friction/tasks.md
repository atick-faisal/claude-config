# Workflow Friction Fixes — Tasks

| ID | Description | Complexity | Suggested Model | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| WORKFLOW-FRICTION-01 | Closing block: reword `CLAUDE.md` "How I like answers" and "Next step", and end every workflow skill's Report step with it | moderate | opus | done | Q4; skill list in plan.md P1 |
| WORKFLOW-FRICTION-02 | Provenance: add the console provenance-block rule to `guidelines/research.md`; hostname `Machine` + verbatim `## Environment` section in `templates/experiment.md` | small | sonnet | done | Q2 |
| WORKFLOW-FRICTION-03 | `/log-experiment`: read the provenance block by anchor, `not recorded` fallback, drop the pre-write STOP, "never edited" means after commit | moderate | opus | done | depends on -01, -02; Q3 |
| WORKFLOW-FRICTION-04 | `/implement`: one-turn protocol that stops only for needed input or a destructive action; define "destructive" | moderate | opus | done | depends on -01; Q3 |
| WORKFLOW-FRICTION-05 | `/audit-feature`: `agents/auditor.md` + `skills/audit-feature/SKILL.md`; name it as a row owner in `task-status` | moderate | opus | done | depends on -01; Q5, Q6, Q7 |
| WORKFLOW-FRICTION-06 | Housekeeping: add `/ask` and `/audit-feature` to `CLAUDE.md`'s command list; fix stale comments in `check-clean.sh:30`, `guard-task-commit.py:4` | trivial | haiku | done | depends on -05 |
| WORKFLOW-FRICTION-07 | Remove project-specific content from shared files: point `hooks/test_guard_task_commit.py` at a neutral git repo instead of the client project path; replace the thermal-registration example rows in `templates/experiments-index.md` with generic placeholders | small | sonnet | done | from audit |
| WORKFLOW-FRICTION-08 | Trim repeated rules: `/audit-feature` points to `/task-plan`'s ID rules and `/task-status` §4 instead of restating them; `/log-experiment` keeps the no-provenance "Needs your input" rule in one place | trivial | haiku | done | from audit |
