# Multi-Bank Change Flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Glimmer programs to declare up to 32 flag-carrying cells by generating `ChangedN`/`RaisedN`/`NextN` banks.

**Architecture:** Flag-carrying cells keep the existing declaration order: states, pulses, ramps, then `FrameCount` if used. Cell index `0..31` maps to bank `Math.floor(index / 8)` and bit `index % 8`; `CHG_<NAME>` remains an 8-bit mask within its bank. Dispatch emits per-bank trigger masks and tests only the banks a block depends on, while wrappers, input, timers, ramps, merge, and frame rollover raise into the bank that owns the target cell.

**Tech Stack:** TypeScript, Vitest, AZM assembly checks, Glimmer docs.

---

### Task 1: Tests

**Files:**
- Modify: `test/generate.test.ts`

- [x] **Step 1: Replace the old 8-cell rejection test with multi-bank tests**

Add tests covering:

```ts
it('emits multiple change-flag banks', () => {
  const states = Array.from({ length: 9 }, (_, i) =>
    i === 0 ? `state S${i} : byte changed` : `state S${i} : byte`,
  ).join('\n');
  const sourceText = [
    'program Big',
    states,
    'effect TouchHigh',
    'on S0',
    'updates S8',
    'begin',
    '    ld a,1',
    '    ld (S8),a',
    'end',
    'render DrawHigh',
    'on S8',
    'begin',
    'end',
  ].join('\n');
  const { program, diagnostics: parseDiags } = parseGlimmer(sourceText);
  expect(parseDiags).toEqual([]);
  const { source, diagnostics } = generateAzm(program!);
  expect(diagnostics).toEqual([]);
  expect(source).toContain('CHG_S8_BIT       .equ 0');
  expect(source).toContain('Changed0:         .db %00000001');
  expect(source).toContain('Changed1:         .db %00000000');
  expect(source).toContain('Raised1:          .db 0');
  expect(source).toContain('Next1:            .db 0');
  expect(source).toContain('GlimDep_DrawHigh__B1 .equ CHG_S8');
  expect(source).toContain('ld      a,(Changed1)');
  expect(source).toContain('and     GlimDep_DrawHigh__B1');
  expect(source).toContain('ld      a,(Raised1)');
  expect(source).toContain('or      CHG_S8');
  expect(source).toContain('ld      (Raised1),a');
});

it('rejects more than 32 tracked cells', () => {
  const decls = Array.from({ length: 33 }, (_, i) => `state S${i} : byte`).join('\n');
  const { program } = parseGlimmer(`program Big\n${decls}\n`);
  const { source, diagnostics } = generateAzm(program!);
  expect(source).toBe('');
  expect(diagnostics[0]?.message).toContain('Change flags are full');
});
```

- [x] **Step 2: Run generator tests to verify RED**

Run:

```bash
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/generate.test.ts
```

Expected: fail because the generator still rejects the ninth tracked cell.

### Task 2: Generator

**Files:**
- Modify: `src/generate.ts`
- Test: `test/generate.test.ts`

- [x] **Step 1: Implement bank metadata**

Replace the single `chgBit` map with `chgInfo: Map<string, { bank: number; bit: number }>` and `bankCount`, capped at 4 banks / 32 tracked cells. Keep `CHG_<NAME>_BIT` as the bit within the bank and `CHG_<NAME>` as the bank-local mask.

- [x] **Step 2: Emit per-bank storage**

Emit `Changed0..ChangedN`, `Raised0..RaisedN`, and `Next0..NextN`. Initial `changed` state flags go into their owning bank.

- [x] **Step 3: Emit per-bank trigger masks and dispatch**

For bank 0, keep `GlimDep_<Effect>` as the mask name for compatibility. For higher banks, emit `GlimDep_<Effect>_<bank>`. Single-bank blocks use the old dispatch shape; multi-bank blocks test each bank and call the block if any mask matches.

- [x] **Step 4: Route all raises into the owning bank**

Replace hardcoded raises to `Changed0`, `Raised0`, and `Next0` with bank-aware raises:

- bindings and timers/ramps raise target cells into `Changed<bank>`
- block wrappers raise same-frame cells into `Raised<bank>`
- block wrappers raise deferred cells into `Next<bank>`
- `__MergeRaised` merges every generated bank
- `__EndFrame` clears pulses, clears all `RaisedN`, copies every `NextN` to `ChangedN`, then clears all `NextN`

- [x] **Step 5: Run generator tests to verify GREEN**

Run:

```bash
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/generate.test.ts
```

Expected: generator tests pass.

### Task 3: Docs

**Files:**
- Modify: `docs/manual/02-glim-format.md`
- Modify: `docs/reference/glim-grammar.md`
- Modify: `docs/plans/v0.3.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/codebase/02-compile-pipeline.md`
- Modify: `docs/glimmer.md`

- [x] **Step 1: Update docs**

Document the new limit: up to 32 flag-carrying cells in four banks. Explain that bank assignment follows declaration order and that a block can depend on cells in multiple banks.

- [x] **Step 2: Run full verification**

Run:

```bash
git diff --check
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc -p tsconfig.json --noEmit
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint "src/**/*.ts" "test/**/*.ts"
```

Expected: all commands exit 0.

- [ ] **Step 3: Commit**

Stage only multi-bank flag files and commit:

```bash
git add src/generate.ts test/generate.test.ts docs/manual/02-glim-format.md docs/reference/glim-grammar.md docs/plans/v0.3.md docs/roadmap.md docs/codebase/02-compile-pipeline.md docs/glimmer.md docs/superpowers/plans/2026-07-08-multi-bank-change-flags.md
git commit -m "feat: add multi-bank change flags"
```

### Task 4: Review Loop

**Files:**
- Inspect committed diff for the multi-bank flag commit.

- [ ] **Step 1: Dispatch high-effort code review**

Ask a fresh high-effort reviewer to inspect generated control flow, rollover semantics, timer/binding/ramp raises, public docs, and tests.

- [ ] **Step 2: Fix findings with tests**

For every finding, add or adjust tests first when the finding is behavior-related, verify RED, implement the fix, run focused tests, then run the full verification suite.

- [ ] **Step 3: Commit review fixes**

Commit fixes separately with a targeted message such as:

```bash
git commit -m "fix: route high-bank raises correctly"
```

- [ ] **Step 4: Re-review until clean**

Repeat high-effort review and fixes until the reviewer reports no findings. Then mark the goal complete.
