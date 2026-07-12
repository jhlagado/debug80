# Example Corpus

Real TEC-1G programs copied into this repo as reference source and as the
raw material for Glimmer's central experiment: rewriting them in the
Glimmer paradigm to shake out the shortcomings of the format.

The headline goal: **`tetro.glim` should generate an AZM file that
assembles into a playable Tetro.**

## Contents

- `tetro/` — the TEC-1G Game Suite (Tetro and Pacmo, 8x8 RGB matrix games
  under MON-3), copied from `~/projects/tetro`. Includes the codebase tour
  docs and its own `debug80.json`. License: 0BSD (see `tetro/LICENSE`).
- `tms9918/` — the three TMS9918 demo programs (sanity, video test,
  8-sprite demo), copied from `~/projects/debug80-tec1g-mon3/src`. These
  are the reference idioms for the future TMS9918 profile.

These are snapshots, not submodules: they are working material for
adaptation, and may drift from their upstream repos. When an upstream
game changes in a way that matters here, re-copy deliberately.

## How to use the corpus

1. Read a subsystem (input, render, sound, mode dispatch).
2. Ask: which parts are hardware-shaped (profile library), which are
   generated-glue-shaped (Glimmer's output), and which are game-shaped
   (the user's `.glim` fragments and resources)?
3. When Glimmer can't express something the games actually do, that is a
   format shortcoming — record it in the roadmap and fix the format.
