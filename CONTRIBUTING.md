# Contributing to snag-cli

Thanks for helping out. This CLI stays small, fast, and dependency-free on purpose.

## Ground rules

- **Two implementations, one behaviour.** Python (`snag/`) and Go (`cmd/snag/`) must expose the
  **same commands** and produce the **same JSON**. If you change one, change the other.
- **No third-party dependencies** in the Python package (standard library only). Go stays on the
  standard library too — a single static binary, no cgo.
- **Follow the conventions** already in place ([clig.dev](https://clig.dev) + the GitHub CLI):
  noun-verb commands, human-first output with `--json`/`--select`, data on stdout and logs on
  stderr, the exit codes in `output.py` (`0/2/3/4/1`).
- **Privacy first.** The CLI only reads what the Snag API already exposes (which is masked and
  redacted at capture). Never add anything that logs or transmits session contents elsewhere.

## Developing

```bash
# Python — run without installing
SNAG_ENDPOINT=http://localhost:8787 python3 -m snag issue list --json

# Go
go build -o /tmp/snag ./cmd/snag && /tmp/snag issue list
go vet ./cmd/snag
```

A local Snag instance (see the [snag repo](https://github.com/saakshigupta2002/snag)) is the
easiest thing to develop against.

## Pull requests

- Keep changes additive where possible; warn before breaking a flag or output shape.
- Update the README command table and the relevant `cli-skills/*/SKILL.md` when you add a command.
- Describe how you verified the change end to end.
