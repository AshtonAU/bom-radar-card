# Security Policy

## Supported Versions

Security and privacy-related fixes are most likely to land on:

- the latest published release
- the current `main` branch

Older releases may not receive follow-up fixes.

## Reporting a Vulnerability

If you believe you have found a security issue, please do **not** post full exploit details in a public issue or discussion.

Instead:

1. Use GitHub private vulnerability reporting for this repository if it is available in the issue/reporting UI.
2. If private reporting is not available, contact the maintainer privately before sharing sensitive details publicly.
3. If you need to open a public issue first, keep it minimal and avoid including secrets, exploit steps, private endpoints, or anything that would make the issue unsafe to leave public.

This is a Home Assistant frontend card, so likely concerns are things like:

- unsafe handling of third-party API keys
- XSS or HTML/script injection
- exposing sensitive config values in logs, UI, or release assets

Please allow reasonable time for investigation and a fix before public disclosure.
