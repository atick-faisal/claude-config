<!-- TEMPLATE — delete this block when instantiating.

     Copy to docs/features/<feature-slug>/tasks.md, written by /feature-plan
     once the plan's Open Questions are resolved and the human has approved.

     ID — <FEATURE-SLUG>-NN, the directory slug upper-cased, then 01, 02, 03,
     numbered inline as rows are drafted. There is no external counter and no
     cross-feature ordering: uniqueness comes from the feature slug being
     unique under docs/features/. Once written, an ID is never reused within
     this feature — gaps left by abandoned drafts are expected and fine.

     Complexity      trivial | small | moderate | complex
     Suggested Model haiku | sonnet | opus — advisory only. Nothing enforces
                     it; it is a hint to the human at /implement time.
     Status          pending | in-progress | done | blocked — the vocabulary
                     /task-status writes. Nothing else belongs in the column.
     Notes           blockers, task IDs this one depends on, ADR references.
                     Short. Anything long belongs in plan.md.

     One row per task. A task is a unit that ends green on `just verify` — not
     a unit of typing. Keep rows ordered by dependency where one exists.

     Delete the example row along with this block.

     Body placeholder after this block is deleted: <feature-title> only.
-->

# <feature-title> — Tasks

| ID | Description | Complexity | Suggested Model | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| AUTH-ROTATION-01 | Add `refresh_tokens` table + migration | small | sonnet | done | example row — delete |
| AUTH-ROTATION-02 | Rotate refresh token on each `/token` call | moderate | opus | pending | blocked by -01; see ADR-01 |
