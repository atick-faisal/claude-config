<!-- TEMPLATE — delete this block when instantiating.

     Copy to docs/experiments/index.md — one per repo, not one per feature.
     Created by /log-experiment on the first run it records; nothing else
     scaffolds docs/experiments/.

     Two tables. The run ledger carries one line per file in
     docs/experiments/; the findings ledger carries one line per F-number
     across all of them.

     THIS FILE ALLOCATES BOTH COUNTERS. Runs are 001, 002, 003 and findings
     are F01, F02, F03 — both global to the repo, both taken from the highest
     already in the table below. An ID is never reused and rows are never
     renumbered. Gaps are expected and fine.

     THE MUTABLE HALF. A run record states a claim and the evidence for it,
     is written once, and is never edited afterwards. This ledger is where a
     claim's fate gets recorded instead: the status moves, the record does
     not. An edited record is not evidence of anything.

     Finding status — open | confirmed | refuted | superseded.

     Overturning a finding edits TWO cells: the old row's Status, and the new
     row's cross-reference. Written from both ends, the chain reads from
     whichever end you arrive at, which is the entire reason the column is
     there. A finding that acts on nothing leaves the cell empty.

     Headline is the one number someone would actually cite, not a summary of
     the run. A run whose headline is "no change" still gets a row — a flat
     result is a result, and the ledger is where that stays visible.

     NO-RUN ROWS. A record written from code rather than from a run takes its
     number from the same counter and gets an ordinary row, with `Machine`
     reading `—`. What ran names what was being authored when the finding
     surfaced; Headline is the claim itself, there being no number to cite. The
     dash is the whole of what marks the row, and deliberately so — splitting
     these into their own table is how a finding chain stops being followable
     from one end to the other.

     Delete the example rows along with this block.

     Body placeholder after this block is deleted: none.
-->

# Experiments

## Runs

| Run | Date | What ran | Task | Machine | Headline | Findings |
| --- | --- | --- | --- | --- | --- | --- |
| [001](001-baseline.md) | 2026-01-05 | Baseline model, 4 datasets | FEATURE-04 | gpu-01 | 61.2% accuracy | F01, F02 |
| [002](002-candidate-preproc.md) | 2026-01-07 | Candidate model, 3 preprocessing variants | FEATURE-06 | gpu-01 | 74.8%, normalization flat | F03, F04 |
| [003](003-candidate-seeds.md) | 2026-01-11 | Candidate model, 5 seeds, normalization on/off | FEATURE-06 | gpu-01 | ±0.4pp across seeds | F05, F06 |
| [004](004-library-limit.md) | 2026-01-13 | authoring the solver module | FEATURE-09 | — | The library's solver lacks the method the plan assumed | F07 |

## Findings

| ID | Claim | Run | Status | Acts on / acted on by |
| --- | --- | --- | --- | --- |
| F01 | Baseline falls below 20% accuracy on the hardest dataset | 001 | confirmed | confirmed by F05 |
| F02 | Runtime is dominated by data loading, not compute | 001 | open | |
| F03 | Normalization gives no lift over raw inputs | 002 | refuted | refuted by F06 |
| F04 | Candidate beats baseline on every dataset by ≥10pp | 002 | superseded | superseded by F05 |
| F05 | Candidate's margin over baseline is 14pp on the hardest dataset, 3pp elsewhere | 003 | open | supersedes F04; confirms F01 |
| F06 | Normalization lifts one dataset by 6pp; elsewhere within seed noise | 003 | open | refutes F03 |
| F07 | The solver accepts only two of the three methods its docs list | 004 | confirmed | |
