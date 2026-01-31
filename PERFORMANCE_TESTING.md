---
title: Debug80 Performance Testing
---

# Debug80 Performance Testing

This document describes the lightweight performance checks used for Debug80.
The goal is to catch large regressions in decode speed and runtime loops without
turning perf runs into a heavy benchmark suite.

## Quick Start

Run the Z80 decode micro-benchmark:
```
yarn perf:z80
```

This executes a tight loop of NOP opcodes against the built runtime in `out/`.

## What It Measures

- Instruction decode throughput (ops/sec)
- Basic callback overhead (memory reads, no IO)

The benchmark is intentionally simple and repeatable. It does not simulate full
platform IO or UI rendering.

## When To Run

- After refactoring `src/z80/decode.ts`
- After changes to opcode helpers or callback patterns
- Before and after large platform updates

## Result Interpretation

Use these checks as regression signals:
- >10% drop in ops/sec: investigate
- >20% drop in ops/sec: treat as a regression and bisect

## Extending the Benchmark

If you need more coverage:
- Add variants for common opcodes (LD, JP, INC, etc.)
- Add IO-heavy loops (IN/OUT) for platform runtimes
- Capture results in CI for trend tracking

## Notes

The benchmark expects `yarn build` output in `out/`.
If you run `perf:z80` without a build, it will fail to load the module.
