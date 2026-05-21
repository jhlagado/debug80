# AZM Next Promotion Criteria

Status: initial gate

AZM Next can replace the current implementation only after observable behavior
is covered and known differences are classified.

## Required Gates

- `next/src/` production code imports no root `src/` production modules.
- `npm run next:check` passes.
- The current AZM alpha guardrail has an AZM Next equivalent.
- Core fixture output matches current AZM for retained behavior.
- ASM80 corpus comparisons match where local corpora are available.
- Retained AZM extension tests pass: directive aliases, enums, layout
  constants, visible `op` expansion, AZMDoc, and register-care.
- CLI behavior is compatible for documented flags and output paths.
- Public package APIs are either compatible or have documented intentional
  changes.
- Output artifacts are compatible where they are public contracts: BIN, HEX,
  listing, D8, and lowered Z80.
- Historical high-level ZAX behavior is not reintroduced.

## Promotion Shape

`next/` is laid out as a future root. Promotion should be mechanical:

```text
next/src      -> src
next/test     -> test
next/scripts  -> scripts
next/docs     -> docs or docs/next history
```

Before promotion, archive or remove obsolete current implementation files rather
than mixing old and new module structures.

## Non-Goals

- Reimplementing ZAX functions, modules, imports, generated frames, typed
  assignment, or structured high-level control.
- Preserving internal module names from the current implementation.
- Matching current bugs unless a corpus requires compatibility and the behavior
  is documented.
