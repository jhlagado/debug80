# Sound Cues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add v0.3 `sound` resources that generate non-blocking matrix-profile beep/click routines.

**Architecture:** `sound Name len N div N` is a top-level resource declaration parsed into `SoundDecl`. The TEC-1G matrix generator emits `@Snd_<Name>` wrappers that load A with duration row ticks, load C with divider, and jump to the existing non-blocking `SndStart` service. Generic programs reject sound resources because the current sound backend is profile-local to `tec1g-mon3` + `matrix8x8`.

**Tech Stack:** TypeScript, Vitest, AZM compile API, existing Glimmer parser/generator.

---

### Task 1: Parser And Model

**Files:**
- Modify: `src/model.ts`
- Modify: `src/parse.ts`
- Test: `test/parse.test.ts`

- [x] **Step 1: Write the failing parser test**

Add a test that parses:

```glim
program P
platform tec1g-mon3
display matrix8x8
sound Arrive len 24 div 3
sound Click len 2 div 10
```

Expected model:

```ts
expect(program?.sounds).toEqual([
  expect.objectContaining({ name: 'Arrive', len: 24, div: 3 }),
  expect.objectContaining({ name: 'Click', len: 2, div: 10 }),
]);
```

Also add validation cases: invalid `len`, invalid `div`, generic-profile sound rejection, duplicate-name collision, and reserved `Snd_` prefix rejection.

- [x] **Step 2: Run the parser test to verify RED**

Run:

```sh
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/parse.test.ts
```

Expected: fail because `program.sounds` and `sound` parsing do not exist.

- [x] **Step 3: Implement the model and parser**

Add:

```ts
export interface SoundDecl {
  name: string;
  len: number;
  div: number;
  line: number;
}
```

Add `sounds: SoundDecl[]` to `GlimmerProgram`, parse `sound <Name> len <N> div <N>`, validate numeric ranges as byte values from 1 to 255, reject sounds outside `tec1g-mon3` + `matrix8x8`, include sounds in duplicate-name checks, and reserve `Snd_*` for generated sound wrappers.

- [x] **Step 4: Run the parser test to verify GREEN**

Run the same Vitest command. Expected: parser tests pass.

### Task 2: Generator

**Files:**
- Modify: `src/generate.ts`
- Modify: `src/index.ts`
- Test: `test/generate.test.ts`

- [x] **Step 1: Write the failing generator test**

Add a test that compiles a sound resource and expects generated wrappers:

```ts
expect(source).toContain('@Snd_Arrive:');
expect(source).toContain('ld      a,24');
expect(source).toContain('ld      c,3');
expect(source).toContain('jp      SndStart');
```

Update the Slide example test to expect `@Snd_Arrive:` and `call Snd_Arrive`.

- [x] **Step 2: Run the generator test to verify RED**

Run:

```sh
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/generate.test.ts
```

Expected: fail because wrappers are not emitted and Slide still calls `SndStart` directly.

- [x] **Step 3: Implement generation**

Emit each sound wrapper before the matrix profile library:

```asm
; --- sound cues ---
@Snd_Arrive:
        ld      a,24
        ld      c,3
        jp      SndStart
```

Export `SoundDecl` from `src/index.ts`. Keep AZM contract inference as the source of truth for final `;!` contracts.

- [x] **Step 4: Run the generator test to verify GREEN**

Run the same Vitest command. Expected: generator tests pass.

### Task 3: Example And Docs

**Files:**
- Modify: `examples/slide.glim`
- Modify: `docs/manual/02-glim-format.md`
- Modify: `docs/reference/glim-grammar.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/codebase/02-compile-pipeline.md`
- Modify: `docs/glimmer.md`

- [x] **Step 1: Convert Slide to a sound resource**

Add:

```glim
sound Arrive len 24 div 3
```

Replace the inline cue:

```asm
ld a,24
ld c,3
call SndStart
```

with:

```asm
call Snd_Arrive
```

- [x] **Step 2: Update docs**

Document sound cues as low-fidelity, non-blocking row-tick cues for the matrix profile only. State that one cue is active at a time, starting a new cue replaces the old cue, and this is not a music/tune system.

- [x] **Step 3: Run all verification**

Run:

```sh
git diff --check
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc -p tsconfig.json --noEmit
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint "src/**/*.ts" "test/**/*.ts"
```

Expected: all pass.

- [x] **Step 4: Commit**

```sh
git add src/model.ts src/parse.ts src/generate.ts src/index.ts test/parse.test.ts test/generate.test.ts examples/slide.glim docs/manual/02-glim-format.md docs/reference/glim-grammar.md docs/roadmap.md docs/codebase/02-compile-pipeline.md docs/glimmer.md docs/superpowers/plans/2026-07-08-sound-cues.md
git commit -m "feat: add matrix sound cue resources"
```

### Task 4: High-Effort Review Loop

**Files:**
- No direct ownership; reviewer inspects the committed diff.

- [ ] **Step 1: Request high-effort subagent review**

Ask a reviewer to compare the feature commit against this plan and the existing v0.2 runtime.

- [ ] **Step 2: Fix Critical and Important findings**

Use TDD for behavior changes, run verification, and commit fixes.

- [ ] **Step 3: Repeat review until no findings**

Do not start the next roadmap goal until review is clean.
