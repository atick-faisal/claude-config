# Server runbooks and log bundling — Tasks

| ID | Description | Complexity | Suggested Model | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| RUNBOOK-BUNDLE-01 | `skills/log-experiment/unbundle.py` (stdlib only) with round-trip `unittest`s and a hand-written bundle fixture; `just verify` parses `skills/**/*.py` and gains a `test` check | moderate | opus | done | defines the bundle format — the module docstring is the spec the template's PowerShell must match |
| RUNBOOK-BUNDLE-02 | `templates/runbook.md` — header, session setup (`$D`, `$TASK`), `Tee-Object` steps, and the inline PowerShell `## Bundle` step that writes the -01 format to the clipboard | moderate | opus | done | blocked by -01; the PowerShell half cannot run on the Mac, so the first server run is its test |
| RUNBOOK-BUNDLE-03 | `/runbook` skill — takes a task ID, instantiates the template into `runbooks/<YYYY-MM-DD>-<TASK-ID>-<what-runs>.md`, git-ignores `runbooks/` on first use | small | sonnet | done | blocked by -02 |
| RUNBOOK-BUNDLE-04 | `/log-experiment` — unbundle a `-bundle.txt` path first, write one record per bundle with every file in `Log:`, duplicate-check each file, carve the bundle out of the never-delete guardrail | small | sonnet | done | blocked by -01 |
| RUNBOOK-BUNDLE-05 | `guidelines/research.md` — Conventions bullets for runbooks and for what a run prints (keep provenance, results, warnings, per-epoch summaries; drop per-batch lines and progress-bar redraws) | small | sonnet | pending | the printing rule limits output at the source; "pasted unfiltered" stands |
