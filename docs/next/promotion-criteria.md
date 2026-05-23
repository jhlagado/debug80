# AZM Next Promotion Criteria

Status: promotion completed on the validated root-migration branch (2026-05-23)

AZM Next can replace the current implementation only after observable behavior
is covered and known differences are classified.

## Required Gates

| Gate                                                             | Status                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Root `src/` is the promoted AZM Next implementation              | Satisfied                                                                      |
| `npm run next:check` passes                                      | Satisfied                                                                      |
| AZM Next alpha/guardrail orchestration (`next:guardrails*`)      | Satisfied (Stage 16 Slice B)                                                   |
| Core fixture output matches current AZM for retained behavior    | Satisfied for **62** root fixtures; **25** explicitly unsupported with reasons |
| ASM80 corpus comparisons match where local corpora are available | Partial (differential + dev scripts; not blocking promotion gate)              |
| Retained AZM extension tests pass                                | Satisfied via `next:check` integration suites                                  |
| CLI behavior compatible for documented flags and output paths    | Partial (Stage 13 façade; see parity matrix)                                   |
| Public package APIs compatible or intentionally documented       | Satisfied (Stage 12/16 package smoke)                                          |
| Output artifacts compatible (BIN, HEX, listing, D8, lowered Z80) | BIN/HEX compatible; listing/D8/lowered `.z80` partial per parity matrix        |
| Historical high-level ZAX behavior not reintroduced              | Satisfied (replacement scope unchanged)                                        |

## Promotion Shape

The completed mechanical promotion mapped the scaffold into the repository root:

```text
next/src      -> src
next/test     -> test
next/scripts  -> scripts
next/docs     -> docs/next history
```

Obsolete pre-promotion implementation files were removed during cutover rather
than mixed with the promoted module structure.

## Promotion Record

1. User approved the cutover for the final promotion stage.
2. `npm run next:guardrails` passed on the promotion branch.
3. Root `npm run test:package` passed as part of `next:guardrails:package`.
4. Superseded pre-promotion `src/` modules were archived or removed during the root migration documented in `docs/next/stage-16-evidence.md`.
5. Package exports were updated to point at the promoted root implementation.

## Non-Goals

- Reimplementing ZAX functions, modules, imports, generated frames, typed
  assignment, or structured high-level control.
- Preserving internal module names from the current implementation.
- Matching current bugs unless a corpus requires compatibility and the behavior
  is documented.
