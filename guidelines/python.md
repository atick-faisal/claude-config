# Python

<!-- when: the repo has a `pyproject.toml` -->

## Stack & tooling

- `uv` for everything: `uv add`, `uv sync`, `uv run`. Not `pip`, not a hand-rolled venv.
- `ruff` to lint, `ruff format` to format, `pyright/mypy` to type-check. All three, after a feature —
  and all three are what a repo's `just verify` should be running.

## Conventions - Enforced for Production Codebase Optional for Research Projects

- Strong typing throughout. Avoid bare dictionaries: `TypedDict`, dataclasses, or Pydantic
  `BaseModel` instead.
- `logging`, never `print`. Levels chosen on purpose.
- Use Google flavored pydocstring.

## Things that will trip you up
