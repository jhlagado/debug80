# Debug80 Performance Verification

## Purpose
Track basic performance checks to ensure refactors do not regress Z80 emulation.

## Standard Command
```bash
yarn perf:z80
```

## Latest Run
- Date: 2026-01-31
- Command: `yarn perf:z80`
- Result: `decode:NOP: 237401 ops/sec (21061.37 ms)`

## Notes
- Keep this log updated when refactoring the Z80 core or decoder.
- Investigate regressions >10% or sustained changes across multiple runs.
