# AZM Next Archive

Status: archived scaffold after root promotion

The AZM Next implementation has been promoted into the repository root. The
active production and test surfaces now live in `src/`, `test/`, and `scripts/`.

The remaining `next/` directory is archival only. It keeps scaffold-era support
files such as fixtures and local package metadata that were useful during the
replacement track, but it is no longer the active implementation root.

Current implementation history and parity records live under `docs/next/`.

Use the repository root for development and verification:

```sh
npm run next:check
npm run next:guardrails
```
