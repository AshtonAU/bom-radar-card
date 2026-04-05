# Contributing

Thanks for taking the time to help improve `bom-radar-card`.

This project is still primarily maintainer-led, so the best contributions are focused, well-tested, and discussed early if they change behavior or add surface area.

## Before Opening Something

- Use [GitHub Discussions](https://github.com/AshtonAU/bom-radar-card/discussions) for ideas, setup questions, screenshots, and general feedback.
- Use [GitHub Issues](https://github.com/AshtonAU/bom-radar-card/issues) for reproducible bugs and concrete feature requests.
- Make sure you are testing the latest release.
- If you switched from an older BOM radar card, remove the old HACS entry and old Lovelace resource first, then hard refresh your browser.

## Reporting Bugs

Please include:

- card version
- Home Assistant version
- install method
- clear reproduction steps
- relevant card configuration
- screenshots if the problem is visual

If the problem involves radar alignment or map rendering, include the layer you were using and the zoom level where it happens.

## Pull Requests

If you want to send a PR:

- keep the change focused
- avoid unrelated refactors in the same PR
- discuss larger changes in an issue or discussion first
- update docs when the config surface or behavior changes
- run `npm run build` before opening the PR

PRs that are easiest to review usually:

- solve one problem well
- preserve existing behavior unless the change is intentional
- explain the user-facing impact clearly

## Project Direction

Not every feature request will be accepted, especially if it adds a lot of ongoing maintenance or makes the card harder to use. The goal is to keep the card useful, BOM-native, and lightweight for Home Assistant dashboards.
