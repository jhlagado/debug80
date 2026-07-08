# Array State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add v0.3 byte array state so programs can keep small row-mask buffers such as trails and boards.

**Architecture:** `state Board : byte[8]` is parsed as a `StateDecl` with `type: 'byte'` and `length: 8`. The whole array is one flag-carrying state cell, so it participates in `on`, `updates`, `Changed0`, rollover, and namespace validation exactly like scalar state; indexing is ordinary Z80 in user blocks. The generator emits `.ds N, 0` storage for arrays and does not add per-element flags or initialization lists in this step.

**Tech Stack:** TypeScript, Vitest, AZM strict register-contract assembly checks, Glimmer `.glim` examples and Markdown docs.

---

### Task 1: Parser And Model

**Files:**
- Modify: `src/model.ts`
- Modify: `src/parse.ts`
- Modify: `src/index.ts`
- Test: `test/parse.test.ts`

- [x] **Step 1: Write failing parser tests**

Add tests covering:

```ts
it('parses byte array state', () => {
  const source = ['program P', 'state Board : byte[8] changed'].join('\n');
  const { program, diagnostics } = parseGlimmer(source);
  expect(diagnostics).toEqual([]);
  expect(program?.states).toEqual([
    {
      name: 'Board',
      type: 'byte',
      length: 8,
      initial: 0,
      changedOnStart: true,
      line: 2,
    },
  ]);
});

it('validates byte array state semantics', () => {
  expect(parseGlimmer('program P\nstate Board : byte[0]').diagnostics[0]?.message).toContain(
    'State Board: array length must be between 1 and 256',
  );
  expect(parseGlimmer('program P\nstate Board : byte[$1G]').diagnostics[0]?.message).toContain(
    'State Board: array length must be between 1 and 256',
  );
  expect(parseGlimmer('program P\nstate Words : word[4]').diagnostics[0]?.message).toContain(
    'State Words: only byte arrays are supported',
  );
  expect(parseGlimmer('program P\nstate Board : byte[8] = 1').diagnostics[0]?.message).toContain(
    'State Board: array initializers are not supported',
  );
});
```

- [x] **Step 2: Run parser tests to verify RED**

Run:

```bash
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/parse.test.ts
```

Expected: fail because `byte[8]` is currently an invalid state declaration.

- [x] **Step 3: Implement parser/model support**

Extend `StateDecl`:

```ts
export interface StateDecl {
  name: string;
  type: CellType;
  length?: number;
  initial: number;
  changedOnStart: boolean;
  line: number;
}
```

Update parsing to accept `state <Name> : byte[<N>] [changed]`, where `<N>` is a complete Glimmer number from 1 to 256. Reject word arrays and reject array initializers. Export the updated type through `src/index.ts`; no new dedicated exported type is needed.

- [x] **Step 4: Run parser tests to verify GREEN**

Run the same parser Vitest command. Expected: parser tests pass.

### Task 2: Generator And Change Flags

**Files:**
- Modify: `src/generate.ts`
- Test: `test/generate.test.ts`

- [x] **Step 1: Write failing generator tests**

Add tests:

```ts
it('emits byte array storage as one flag-carrying cell', () => {
  const sourceText = [
    'program P',
    'state Board : byte[8] changed',
    'pulse Tick',
    'effect TouchBoard',
    'on Tick',
    'updates Board',
    'begin',
    '    ld hl,Board',
    '    inc (hl)',
    'end',
  ].join('\n');
  const { program, diagnostics: parseDiags } = parseGlimmer(sourceText);
  expect(parseDiags).toEqual([]);
  const { source, diagnostics } = generateAzm(program!);
  expect(diagnostics).toEqual([]);
  expect(source).toContain('CHG_BOARD_BIT');
  expect(source).toContain('CHG_BOARD        .equ %00000001');
  expect(source).toContain('Board:           .ds 8, 0   ; byte array');
  expect(source).toContain('Changed0:         .db %00000001');
  expect(source).toContain('or      CHG_BOARD');
});
```

- [x] **Step 2: Run generator tests to verify RED**

Run:

```bash
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/generate.test.ts
```

Expected: fail because array storage is not emitted.

- [x] **Step 3: Implement generator support**

In the state-storage section, emit arrays as:

```asm
Board:           .ds 8, 0   ; byte array
```

Scalar state remains unchanged. No dispatch change is needed because arrays are already a state entry in `trackedCells`, `onNames`, and `updateNames`.

- [x] **Step 4: Run generator tests to verify GREEN**

Run the same generator Vitest command. Expected: generator tests pass.

### Task 3: Trail Example And Docs

**Files:**
- Create: `examples/trail.glim`
- Modify: `test/generate.test.ts`
- Modify: `docs/manual/02-glim-format.md`
- Modify: `docs/reference/glim-grammar.md`
- Modify: `docs/plans/v0.3.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/codebase/02-compile-pipeline.md`
- Modify: `docs/codebase/appendices/a-directory-file-reference.md`
- Modify: `docs/glimmer.md`

- [x] **Step 1: Add `examples/trail.glim`**

Create a matrix example that uses `state Trail : byte[8] changed`. On movement, it ORs the current dot bit into `Trail + DotY` and updates `Trail`; render copies the row masks into the green framebuffer plane and draws the current dot in white with `ShapeDraw` or `FbPlot`. Keep the example small enough to assemble strict-clean.

- [x] **Step 2: Add an assembly round-trip test for Trail**

Add a test that reads `examples/trail.glim`, runs `compileToAzm`, writes the generated source to a temp file, and assembles it with AZM `registerContracts: 'strict'`, `registerContractsProfile: 'mon3'`.

- [x] **Step 3: Update docs**

Document `state Name : byte[N]`, one change flag for the whole array, no initializers yet, legal `on`/`updates`, and ordinary Z80 indexing. Update roadmap/v0.3 status so array state is marked landed and the remaining v0.3 scale job is multiple change-flag bytes.

- [x] **Step 4: Run full verification**

Run:

```bash
git diff --check
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc -p tsconfig.json --noEmit
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint "src/**/*.ts" "test/**/*.ts"
```

Expected: all commands exit 0, including strict AZM assembly round trips.

- [ ] **Step 5: Commit**

Stage only the array-state files and commit:

```bash
git add src/model.ts src/parse.ts src/index.ts src/generate.ts test/parse.test.ts test/generate.test.ts examples/trail.glim docs/manual/02-glim-format.md docs/reference/glim-grammar.md docs/plans/v0.3.md docs/roadmap.md docs/codebase/02-compile-pipeline.md docs/codebase/appendices/a-directory-file-reference.md docs/glimmer.md docs/superpowers/plans/2026-07-08-array-state.md
git commit -m "feat: add byte array state"
```

### Task 4: Review Loop

**Files:**
- Inspect committed diff for the array-state commit.

- [ ] **Step 1: Dispatch high-effort code review**

Ask a fresh high-effort reviewer to inspect parser, generator, docs, examples, and tests for correctness, scope, strict AZM compatibility, register-contract risks, public API consistency, and roadmap consistency.

- [ ] **Step 2: Fix findings with tests**

For every finding, add or adjust tests first when the finding is behavior-related, verify RED, implement the fix, run focused tests, then run the full verification suite.

- [ ] **Step 3: Commit review fixes**

Commit fixes separately with a targeted message such as:

```bash
git commit -m "fix: tighten array state validation"
```

- [ ] **Step 4: Re-review until clean**

Repeat high-effort review and fixes until the reviewer reports no findings. Then mark the goal complete and move to the next roadmap goal.
