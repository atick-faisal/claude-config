<!-- TEMPLATE — delete this block when instantiating.

     Copy to docs/experiments/<NNN>-<slug>.md — one file per run, numbered 001,
     002, 003 across the whole repo. Written by /log-experiment from a log the
     human saved on the training machine and passed by path.

     One run, one file. The size of this file is bounded by the size of one run,
     which is the entire point: an append-per-run journal is how a task board
     reaches 3,000 lines and stops being readable.

     A run is worth a record when it produced numbers someone might cite, argue
     with, or try to reproduce. A crashed run gets one too when the crash is the
     finding. A run that only proved the code starts does not.

     NO-RUN RECORDS — the variant for a finding that came out of writing the
     code rather than running a grid: a dependency's hard limit, a default that
     silently does nothing, an ordering that matters. It earns a record on the
     same bar — someone might cite it, argue with it, or re-derive it the
     expensive way — and it lives here rather than in a feature's pitfalls.md
     so the finding sequence stays readable end to end.

     It takes <NNN> from the same counter as a run, so docs/experiments/ stays
     one chronological sequence with one place to look.

     What changes, and nothing else does:

       header    collapses to Date, Task and git_sha. Machine, Wall clock, W&B
                 and Log are deleted, not left blank — there was no run to
                 carry them, and a blank field reads as one nobody filled in.
       Command   deleted.
       Environment  deleted, for the same reason as the header fields.
       Results   replaced by `## Evidence`: the code that demonstrates the
                 claim, cited by path and line, and the behaviour actually
                 observed — an error quoted verbatim, a value that came back, a
                 branch that never fired. Evidence that is a reading of the
                 source rather than an observation of it is a hypothesis, and
                 the record has to say which it is.
       caveats   still mandatory, and here it carries what was NOT checked: the
                 version the behaviour was observed under, and whether it was
                 executed or reasoned about.

     Findings, Provenance caveats and Next are unchanged. A no-run record is
     not a lesser record and shares both counters, because a finding's weight
     does not depend on whether a GPU was involved.

     Body placeholders for the no-run form: <NNN>, <what-was-found>,
     <yyyy-mm-dd>, <TASK-ID>, <git-sha>, <evidence>, <NN>, <claim>, <caveat>,
     <next>.

     FINDINGS — the division of labour with docs/experiments/index.md:

       this file      the claim and the evidence for it, written once, never
                      edited after it is committed
       index.md       the F-number, its status (open | confirmed | refuted |
                      superseded), and what later finding acted on it

     A record is a dated statement of what was believed on the strength of one
     run. When a later run overturns it, the ledger records the refutation and
     this file stays as it was written — an edited record cannot be trusted as
     evidence of anything.

     Findings are numbered F01, F02, ... globally across docs/experiments/, not
     per file. /log-experiment allocates the next number from the ledger.

     PROVENANCE — fill the caveats section or write "None." Never leave it
     blank. A number carrying `-dirty`, a column composed from an earlier run,
     a cell a resume skipped: each makes a result mean less than it appears to,
     and each is invisible three weeks later.

     Body placeholders after this block is deleted: <NNN>, <what-ran>,
     <yyyy-mm-dd>, <TASK-ID>, <hostname>, <wall-clock>, <git-sha>, <wandb-path>,
     <log-path>, <command>, <provenance-block>, <config>, <console-block>,
     <report-command>, <NN>, <claim>, <evidence>, <caveat>, <next>.

     ENVIRONMENT — <hostname> in the header is the `hostname` line of the
     provenance block, and `## Environment` holds the whole block pasted
     verbatim, the same way Results holds the console block. See
     guidelines/research.md for what the block contains.
-->

# <NNN> — <what-ran>

**Date:** <yyyy-mm-dd> · **Task:** <TASK-ID> · **Machine:** <hostname> · **Wall clock:** <wall-clock>
**git_sha:** <git-sha> · **W&B:** <wandb-path> · **Log:** <log-path>

## Command

```
<command>
```

## Environment

```
<provenance-block — pasted verbatim from the log, between the PROVENANCE markers>
```

## Configuration

<config — the axes that varied and the resolved config hash. What the command
line does not already say. Omit nothing that would change a number.>

## Results

```
<console-block — pasted verbatim, not retyped and not tidied>
```

Re-render from the results file without re-running: `<report-command>`

## Findings

### F<NN> — <claim>

<evidence — the numbers, and what they are being compared against. A finding
that cannot name the comparison it beats is an observation, not a finding.>

## Provenance caveats

- <caveat>

## Next

<next — the experiment this one makes obvious, and any falsifiable prediction it
posts. A prediction written down before the next run is what makes the next
record able to confirm or refute something.>
