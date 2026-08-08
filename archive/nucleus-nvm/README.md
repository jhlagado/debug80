# Archived Nucleus Virtual Machine research

This directory preserves the retired Nucleus Virtual Machine specification,
executable model, Z80 interpreter experiments, encoders, proofs, and backend
comparisons. The material records the investigation that preceded selection of
direct Z80 emission.

It is historical evidence, not an active Nucleus authority or implementation
path. New Nucleus work does not extend these opcodes, images, validators,
interpreters, or proofs. The active authorities live in
`packages/nucleus/docs/` and define direct Z80 as the sole implementation path.

The files retain their former package-relative organization where practical.
Some archived tests and assembly sources refer to paths that existed while the
material was active; use repository history when reproducing an old build.

The archive is intentionally outside `packages/`, so workspace test and build
commands do not treat it as current product code.
