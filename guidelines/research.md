# Research

<!-- when: the work is notebooks, experiment grids, or turning a paper into code -->

`python.md` still applies in full; everything here is in addition to it.

## Stack & tooling

- **Two machines, one repo.** This Mac (CPU/MPS) writes and verifies the code. A Windows
  Server 2022 VM with 2x A100 and CUDA 13.0 runs anything needing a GPU. There is no WSL GPU
  passthrough, so the environment has to exist natively on Windows.
- **Nothing but text crosses between them.** Code goes over by `git pull`; results come back
  as a pasted console log. No step of an experiment may depend on copying a file back.
- **One `uv.lock` serves both.** Conflicting `cpu` / `gpu` extras under `[tool.uv] conflicts`,
  with `[tool.uv.sources]` routing `torch` and `torchvision` to explicit `pytorch-cpu` and
  `pytorch-cu130` indices. `uv sync --extra cpu` here, `--extra gpu` there. A bare `uv sync`
  failing is the design working — it is what keeps 2.3 GB of CUDA off a CPU-only machine.
- **Heavy optional subsystems get their own extras**, orthogonal to `cpu`/`gpu` and
  deliberately outside the conflict set, so `--extra cpu --extra <subsystem>` stays a valid
  Mac invocation. Every extra carries an inline comment naming its **failure mode**: what
  silently goes missing from the results when it is not installed.
- Docker is available. Datasets may be downloaded and explored here while they fit on disk.
- **W&B runs on the training box**, self-hosted, not on this machine. Per-run opt-in and a
  no-op when off. It is also the stakeholder-facing channel months later, so anything a figure
  might eventually need is logged the first time, not backfilled.

## Conventions

- **Every experiment emits both** a copy-pasteable console block and a machine-readable
  results file. The block is the only transfer channel; the file is the source of truth.
- **Per-row results are local Parquet with a declared Arrow schema.** Declared, never
  inferred — see below for what inference costs.
- **The metric-key schema is frozen before the first real run** and lives in one module. Runs
  do not invent key names. Adding a key is free; renaming one migrates every prior run.
- **One module formats results and nothing else does.** Its console block goes to stdout on
  purpose — that is not an exception to `python.md`'s "`logging`, never `print`", it is the
  single deliberate exception living in one place.
- **A `report` subcommand re-renders that block from a results file** without re-running
  anything. Numbers get re-read far more often than they get produced.
- **Run identity is columns, not a name.** Every axis varied — dataset, split, method,
  preprocessing, estimator, seed — is its own column, so aggregation groups by them directly
  instead of parsing a run string. Alongside them: the resolved config hash, and the git SHA
  suffixed `-dirty` / `-untracked`. A result from an uncommitted tree is traceable to nothing,
  so the flag belongs *in* the identifier rather than in a field that can be dropped.
- **W&B receives summaries and at most a sampled table**, never the per-row truth — its Tables
  degrade past a few tens of thousands of rows. Datasets, checkpoints and the aggregated
  results file are Artifacts, so every figure traces back to a version.
- **Telemetry must not take down a run.** A tracker that cannot reach its server disables
  itself and warns; it never raises.
- **Every experiment entrypoint prints a provenance block first**, to stdout, between
  `=== PROVENANCE ===` and `=== END PROVENANCE ===`. The pasted console log is the only thing
  that crosses back from the server, so anything not printed there is lost. The block is
  `key: value` lines: start time with timezone and hostname; OS, CPU, total RAM, and each GPU's
  name, memory and driver; CUDA, Python and torch versions; `git_sha` with its `-dirty` /
  `-untracked` suffix; working directory and the full command line. A matching footer at the
  end prints the finish time and wall clock. Every probe is best-effort: it prints
  `unavailable` and never raises. It uses the standard library, torch and `nvidia-smi` only, so
  no new dependency, and lives in or next to the one results-formatting module.
- **Server logs are saved to `logs/<YYYY-MM-DD>-<task>-<what-ran>.txt`**, git-ignored, and
  pasted back **unfiltered**.
- **Negative results are recorded.** A flat ablation row is a finding.
- **Every long run takes a `--limit` / `--dry-run`**, so the first thing run on the server is a
  two-minute version of the real command.

## Things that will trip you up

- **`just verify` runs on this machine only.** It cannot cover CUDA kernels, device-specific
  numerics, multi-GPU, bf16/fp16, OOM at a real batch size, Windows path and
  `num_workers`/spawn semantics, or whether a wheel exists on the cu130 index. Everything else
  is verifiable here and should be: keep code device-agnostic, put tiny synthetic tensors
  through the full path on CPU/MPS, and make the GPU-only surface as thin as it can be. What
  is left is what the server is for.
- **Not every cu130 `win_amd64` wheel is installable.** download.pytorch.org has shipped
  releases whose sha256 fragment is missing from the index; uv's hash verification then fails
  on the server and nowhere else. Pin a pair confirmed good on both, and re-check on every bump.
- **`uv run` re-syncs and reverts your extras.** See the `uv-run-reverts-extras` lesson.
- **A filtered log is a destroyed record.** Stripping INFO and tracker lines for readability
  also removes the run's wall clock and its W&B group names — nothing else records either.
- **pyarrow infers `null` dtype for an all-failed run's measurement columns.** The file then
  refuses to concatenate at aggregation time, months later, as a type error nobody can trace
  back to the run that caused it. Declare the schema.
- **W&B silently drops a `step=` that goes backwards.** Its counter only increases, so a step
  restarting per stage logs into the past. Log the stage or epoch as a value.
- **A resume that skips an existing run directory must refuse a stale one** — comparing what
  the stored rows were produced under against what the cell now asks for, and raising with the
  directory name and the command to delete it. Silently reusing it prints old numbers under a
  new banner, and silently re-running it burns GPU hours.
