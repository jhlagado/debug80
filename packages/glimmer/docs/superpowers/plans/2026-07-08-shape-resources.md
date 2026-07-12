# Shape Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add v0.3 `shape` resources for small matrix8x8 pixel art and a generated `ShapeDraw` helper.

**Architecture:** `shape Name color green` is a top-level profile-local resource with quoted bitmap rows ending at `end`. The parser validates a rectangular 1..8 by 1..8 bitmap using `X` for filled pixels and `.` for empty pixels, while the generator emits `Shape_<Name>` tables and a matrix profile routine that draws a shape from HL at B,C. The first implementation is intentionally matrix-only; multi-rotation and larger sprite forms remain sketch-only until the Tetro/VDP milestones.

**Tech Stack:** TypeScript, Vitest, AZM strict register-contract assembly checks, Glimmer `.glim` examples and Markdown docs.

---

### Task 1: Parser And Model

**Files:**

- Modify: `src/model.ts`
- Modify: `src/parse.ts`
- Test: `test/parse.test.ts`

- [x] **Step 1: Write failing parser tests**

Add tests covering:

```ts
it('parses matrix shape resources', () => {
  const source = [
    'program P',
    'platform tec1g-mon3',
    'display matrix8x8',
    'shape Dot color green',
    '  "XX"',
    '  ".X"',
    'end',
  ].join('\n');
  const { program, diagnostics } = parseGlimmer(source);
  expect(diagnostics).toEqual([]);
  expect(program?.shapes).toEqual([
    { name: 'Dot', color: 'green', rows: ['XX', '.X'], width: 2, height: 2, line: 4 },
  ]);
});

it('validates shape resource semantics', () => {
  const genericShape = ['program P', 'shape Dot color green', '  "X"', 'end'].join('\n');
  expect(
    parseGlimmer(genericShape)
      .diagnostics.map((d) => d.message)
      .join('\n'),
  ).toContain('Shape resources require platform tec1g-mon3 with display matrix8x8.');

  const badColor = [
    'program P',
    'platform tec1g-mon3',
    'display matrix8x8',
    'shape Dot color orange',
    '  "X"',
    'end',
  ].join('\n');
  expect(
    parseGlimmer(badColor)
      .diagnostics.map((d) => d.message)
      .join('\n'),
  ).toContain('Shape Dot: unknown color "orange".');

  const ragged = [
    'program P',
    'platform tec1g-mon3',
    'display matrix8x8',
    'shape Dot color green',
    '  "XX"',
    '  "X"',
    'end',
  ].join('\n');
  expect(
    parseGlimmer(ragged)
      .diagnostics.map((d) => d.message)
      .join('\n'),
  ).toContain('Shape Dot: all rows must have width 2.');
});
```

- [x] **Step 2: Run parser tests to verify RED**

Run:

```bash
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/parse.test.ts
```

Expected: fail because `program.shapes` and `shape` parsing do not exist.

- [x] **Step 3: Implement parser/model support**

Add:

```ts
export type ShapeColor = 'red' | 'green' | 'blue' | 'yellow' | 'cyan' | 'magenta' | 'white';

export interface ShapeDecl {
  name: string;
  color: ShapeColor;
  rows: string[];
  width: number;
  height: number;
  line: number;
}
```

Add `shapes: ShapeDecl[]` to `GlimmerProgram`. Parse `shape <Name> color <Color>` followed by quoted rows until `end`; accept only `.` and `X`, require at least one row, rectangular width 1..8 and height 1..8, validate matrix profile, include shapes in shared namespace, and reserve `Shape_*`.

- [x] **Step 4: Run parser tests to verify GREEN**

Run the same Vitest command. Expected: parser tests pass.

### Task 2: Generator And ShapeDraw

**Files:**

- Modify: `src/generate.ts`
- Test: `test/generate.test.ts`

- [x] **Step 1: Write failing generator tests**

Add a generator test:

```ts
it('emits matrix shape resources and ShapeDraw support', () => {
  const sourceText = [
    'program P',
    'platform tec1g-mon3',
    'display matrix8x8',
    'shape Dot color green',
    '  "XX"',
    '  ".X"',
    'end',
  ].join('\n');
  const { program, diagnostics: parseDiags } = parseGlimmer(sourceText);
  expect(parseDiags).toEqual([]);
  const { source, diagnostics } = generateAzm(program!);
  expect(diagnostics).toEqual([]);
  expect(source).toContain('; --- shape resources ---');
  expect(source).toContain('Shape_Dot:');
  expect(source).toContain('.db     2, 2, COLOR_GREEN');
  expect(source).toContain('.db     %11000000');
  expect(source).toContain('.db     %01000000');
  expect(source).toContain('ShapePtr:');
  expect(source).toContain('@ShapeDraw:');
  expect(source).toContain('call    FbPlot');
});
```

- [x] **Step 2: Run generator tests to verify RED**

Run:

```bash
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run test/generate.test.ts
```

Expected: fail because shape tables and `ShapeDraw` are not emitted.

- [x] **Step 3: Implement generator support**

Emit shape temporary storage only when shapes exist:

```asm
ShapePtr:         .dw 0
ShapeBaseX:       .db 0
ShapeBaseY:       .db 0
ShapeWidth:       .db 0
ShapeHeight:      .db 0
ShapeColor:       .db 0
ShapeRowMask:     .db 0
ShapeRowIndex:    .db 0
ShapeColIndex:    .db 0
```

Emit resources before sound cues:

```asm
; --- shape resources ---
Shape_Dot:
        .db     2, 2, COLOR_GREEN
        .db     %11000000
        .db     %01000000
```

Emit `ShapeDraw` inside the matrix library only when shape resources exist. ABI: HL points at the shape table, B is x, C is y. The helper reads width, height, colour, and row masks, then calls `FbPlot` for every set pixel. It does no clipping; callers must keep the full shape inside the 8x8 matrix.

- [x] **Step 4: Run generator tests to verify GREEN**

Run the same generator Vitest command. Expected: generator tests pass.

### Task 3: Example And Docs

**Files:**

- Modify: `examples/slide.glim`
- Modify: `docs/manual/02-glim-format.md`
- Modify: `docs/reference/glim-grammar.md`
- Modify: `docs/plans/v0.3.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/codebase/02-compile-pipeline.md`
- Modify: `docs/glimmer.md`
- Test: `test/generate.test.ts`

- [x] **Step 1: Convert Slide to use a shape**

Change `examples/slide.glim` to declare a 2x2 green dot:

```glim
shape Dot color green
  "XX"
  "XX"
end
```

Change the slide curve to `from 0 to 6` so the 2x2 shape stays on-screen. In `DrawDot`, load `hl,Shape_Dot`, B from `DotX`, C with the row, and `call ShapeDraw` instead of plotting one pixel.

- [x] **Step 2: Update docs**

Document shape syntax, colors, generated `Shape_<Name>` symbols, `ShapeDraw` ABI, the no-clipping rule, and matrix-profile-only status. Update grammar, manual, roadmap, v0.3 plan, codebase guide, and main Glimmer guide so sound, curve, and shape all read as landed v0.3 resources.

- [x] **Step 3: Run full verification**

Run:

```bash
git diff --check
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/tsc -p tsconfig.json --noEmit
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/vitest run
PATH=/Users/johnhardy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node_modules/.bin/eslint "src/**/*.ts" "test/**/*.ts"
```

Expected: all commands exit 0, including strict AZM assembly round trips for dot and slide.

- [ ] **Step 4: Commit**

Stage only the shape-resource files and commit:

```bash
git add src/model.ts src/parse.ts src/generate.ts test/parse.test.ts test/generate.test.ts examples/slide.glim docs/manual/02-glim-format.md docs/reference/glim-grammar.md docs/plans/v0.3.md docs/roadmap.md docs/codebase/02-compile-pipeline.md docs/glimmer.md docs/superpowers/plans/2026-07-08-shape-resources.md
git commit -m "feat: add matrix shape resources"
```

### Task 4: Review Loop

**Files:**

- Inspect committed diff for the shape-resource commit.

- [ ] **Step 1: Dispatch high-effort code review**

Ask a fresh high-effort reviewer to inspect parser, generator, docs, examples, and tests for correctness, scope, strict AZM compatibility, profile constraints, register-contract risks, and roadmap consistency.

- [ ] **Step 2: Fix findings with tests**

For every finding, add or adjust tests first when the finding is behavior-related, verify RED, implement the fix, run focused tests, then run the full verification suite.

- [ ] **Step 3: Commit review fixes**

Commit fixes separately with a targeted message such as:

```bash
git commit -m "fix: tighten shape resource validation"
```

- [ ] **Step 4: Re-review until clean**

Repeat high-effort review and fixes until the reviewer reports no findings. Then mark the goal complete and move to the next roadmap goal.
