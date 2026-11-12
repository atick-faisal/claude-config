# Research Workflow Guideline + Experiment Record Skill — Tasks

| ID | Description | Complexity | Suggested Model | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| RESEARCH-WORKFLOW-01 | Fill `guidelines/research.md`: two-machine split, Mac-side verification boundary, on-demand `uv` extras, results/console/W&B contract | moderate | opus | done | Source paths in plan.md's Approach. Q5: mandate the `cmreg` pattern. Q4: state what Mac-side verify structurally cannot cover |
| RESEARCH-WORKFLOW-02 | Add `templates/experiment.md` — the per-run record shape | small | sonnet | done | Header fields mirror `=== CMREG RESULT ===`; body carries findings + wall clock + W&B group |
| RESEARCH-WORKFLOW-03 | Add `templates/experiments-index.md` — the run ledger and the `F<NN>` findings ledger | small | sonnet | done | Q1 + Q2. One file, two tables; findings carry status and a back-reference |
| RESEARCH-WORKFLOW-04 | Write `skills/log-experiment/SKILL.md` | complex | opus | done | Depends on -02, -03. Takes a log *path* (Q3). Open detail: nothing else scaffolds `docs/experiments/`, so this skill creates it on first use — worth an ADR |
| RESEARCH-WORKFLOW-05 | Add `/log-experiment` to `CLAUDE.md`'s "On demand:" list | trivial | haiku | done | Depends on -04. One clause — this file loads in every session |
