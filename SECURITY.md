# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in Hachimi, please report it privately — do NOT file a public issue.

**Contact**: [jacejacejia@gmail.com](mailto:jacejacejia@gmail.com)

Please include:
- A detailed description of the vulnerability
- Steps to reproduce (proof-of-concept if possible)
- Affected versions (if known)
- Any potential mitigations you've identified

### What to Expect

1. **Acknowledgment**: You'll receive a response within 48 hours confirming receipt.
2. **Investigation**: We'll investigate the issue and determine its scope and severity.
3. **Resolution**: We'll develop and test a fix, then release a patch.
4. **Disclosure**: We'll publish a security advisory once the fix is available. Credit will be given to the reporter (unless you prefer to remain anonymous).

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| main    | ✅ Active development |
| < 0.1.0 | ❌ Pre-release — no security guarantees |

## Security Model

Hachimi is a **local-first** application. Key security boundaries:

- **Daemon server (C5)**: When running `pnpm dev:server`, always use `HACHIMI_API_SECRET` to enable Bearer Token authentication. Without it, the daemon listens on localhost only (127.0.0.1) but has no authentication layer.
- **Tool sandbox (C7)**: Tools marked as `dangerous` run in an isolated sandbox with a 30-second timeout and 1MB stdout buffer cap.
- **Credentials**: API keys are stored locally in `~/.hachimi/`. Never commit them to version control.

## Scope

Vulnerabilities in the following areas are in scope:
- Daemon server authentication bypass
- Tool sandbox escape
- Prompt injection leading to unintended tool execution
- Memory/disk exhaustion attacks via the API
- Local file access beyond intended boundaries

Vulnerabilities caused by user misconfiguration (e.g., exposing the daemon to the internet without auth) are not considered security issues.
