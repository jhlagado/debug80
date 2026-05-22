# AZM Next Stage 15 Evidence: Retained Language Parity Closeout Slice A

Status: in progress

## Scope and Evidence

- `test/integration/stage-15-evidence.test.ts`
- `next/src/outputs/write-asm80.ts`
- `next/src/api-compile.ts` (source expansion + asm80 emission integration)
- `next/src/cli.ts` (artifact output pathing for `.z80`)
- current `AZM` lowered-source fixture behavior used as baseline
- `next/test/integration/minimal-assembler.test.ts` (layout casts + op-local-label fixtures)

## Proven Current AZM Behavior Used

- `--asm80` currently requests `.z80` lowered output from a successful compile.
- ASM80 lowering behavior is file-based and should be emitted for entry + includes
  reachable from include graph expansion.
- Source provenance is useful for diagnosing errors, so file boundaries are kept
  in the emitted lowering output.

## Implemented Slice Boundary

- Added a Stage-15 lowering writer (`next/src/outputs/write-asm80.ts`) that
  emits a headered ASM80 artifact from source text.
- Wired compile API assembly to emit `asm80` artifacts when `emitAsm80` is true
  using expanded source text from the loader's `sourceTexts` map.
- Ensured CLI writes `.z80` output when an `asm80` artifact is present.
- Added integration evidence test:
  - `next/test/integration/stage-15-evidence.test.ts`
  - Asserts successful diagnostics for includes and constants.
  - Verifies emitted `asm80` artifact contains header, source markers, and emitted
    source lines from entry + include files.
  - Verifies output is no longer the previous empty-header stub text.

## Deferred / Out of Scope in this Slice

- Canonical instruction-level lowering transformations and normalization passes.
- `--asm80` output parity assertions against current assembler golden fixtures.
- Any lowered-text rewriting beyond expanded source passthrough.

## Additional parity items closed in this slice

- Layout casts are proven compatible for constant folding and runtime-rejected paths:
  - `next/test/integration/minimal-assembler.test.ts`
    - `folds Stage 7 layout casts to constant instruction addresses`
    - `folds Stage 7 layout casts through array fields`
    - `uses Stage 7 layout terms inside larger constant expressions`
    - `rejects Stage 7 layout casts without an explicit path`
    - `parses quoted byte constants inside Stage 7 layout-cast indexes`
    - `reports Stage 8 runtime register indexes in layout casts clearly`
    - `reports Stage 8 layout declaration diagnostics at declaration time`
- Op expansion local labels are proven compatible:
  - `next/test/integration/minimal-assembler.test.ts` (`renames Stage 9 op-local labels per invocation`)
