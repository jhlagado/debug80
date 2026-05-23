# AZM Next Finalization Stage 1 Evidence: Truth and Gate Alignment

Status: complete (2026-05-23)

## Purpose

Stage 1 closes the ambiguity between the written file-size standard and the
actual repository guard.

Before this stage:

- `docs/reference/code-quality-standard.md` said 500 lines was the normal upper
  limit and review trigger.
- `scripts/check-source-file-sizes.mjs` only surfaced the 750 soft warning and
  1000 hard cap.
- `scripts/source-file-size-allowlist.json` recorded hard-cap ceilings but not
  the reasons those files were allowed to remain oversized.

That mismatch made review expectations and automated guard behavior drift apart.

## Changes Made

- Updated `scripts/check-source-file-sizes.mjs` to report three explicit tiers:
  - review trigger over 500 lines
  - soft warning over 750 lines
  - hard cap over 1000 lines
- Extended `scripts/source-file-size-allowlist.json` so every hard-cap
  exception carries both a ceiling and a rationale.
- Updated `docs/reference/code-quality-standard.md` to describe the three-tier
  guard and the rationale requirement for allowlisted hard-cap exceptions.

## Validation

Validated with:

```sh
node scripts/check-source-file-sizes.mjs
```

Observed result after the stage:

- guard reports `review>500, soft>750, hard>1000`
- review-trigger warnings:
  - `src/cli.ts: 716`
  - `src/assembly/expression-evaluation.ts: 653`
  - `src/syntax/parse-expression.ts: 651`
- soft-limit warnings:
  - `src/register-care/analyze.ts: 985`
  - `src/assembly/assemble-program.ts: 757`
- hard-cap allowlisted files remain explicit with reasons:
  - `src/z80/encode.ts`
  - `src/core/op-expansion.ts`
  - `src/z80/parse-instruction.ts`

No syntax or file errors were reported in the touched files.

## Outcome

The repo now has one coherent file-size policy:

- 500 lines means review attention is required
- 750 lines means the file is elevated in automated warnings
- 1000 lines means the file must either be reduced or explicitly allowlisted
  with a ceiling and reason

This stage does not reduce the large-file backlog by itself. It makes the
backlog explicit and reviewable, which is the prerequisite for the later
decomposition stages.