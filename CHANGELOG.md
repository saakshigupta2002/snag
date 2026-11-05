# Changelog

## [Unreleased]

### Added
- An end-to-end test suite that runs every core command as a real process against data recorded
  from a real Snag run.
- Parity tests that hold the Python and Go versions to the same JSON output and exit codes.

### Changed
- Skills moved to `skills/snag` and `skills/snag-explore`.

### Fixed
- The Go version now rejects an unknown command with exit code 2. It used to run the default
  action, so a typo looked like success.

## [0.1.0] - 2026-07-26

First release: `auth`, `project`, `issue`, `session`, `analytics`, `explore`, `api`, `status` and
`mcp` in Python and Go, with Claude Code skills for triage and active bug hunting.
