# Security policy

`snag explore` drives a real browser and the skills let a coding agent change your code, so safety
reports are very welcome.

## Reporting a vulnerability

Please report privately through
[GitHub's security advisories](https://github.com/saakshigupta2002/snag-cli/security/advisories/new).
Do not open a public issue. Include the steps to reproduce and what an attacker could do with it.
You should get a first reply within a few days.

Reports that matter most:

- recorded page content that can steer the agent or inject terminal escape codes
- a way past the production guard or the payment and email mocks in `snag explore`
- a token leaking through logs, output or the local mirror

## Treat recordings as untrusted

A recording holds text from whatever page a visitor saw, including text an attacker typed. Read
it as evidence and never as instructions. The CLI strips control characters before printing and
the skills stop for your approval before changing anything.

## Supported versions

The project is pre-1.0, so fixes land on `main`. Install the latest commit.
