# Nucleus documentation

Nucleus 0.1 is a small, safe, general-purpose structured language for Z80 and other constrained systems.

- [`specification.md`](specification.md) is the working Nucleus 0.1 Language Specification and governs source-language conformance at its current revision.
- [`target-system-specification.md`](target-system-specification.md) governs
  target profiles, program images, startup, entry, and banked-program
  composition.
- [`nucleus-object-format.md`](nucleus-object-format.md) governs the binary
  append-only object stream, patch records, integrity check, and commit.
- [`z80-runtime-contract.md`](z80-runtime-contract.md) governs packed representation, generated-code integrity, services, traps, and direct Z80 execution; the language specification remains authoritative for source-language meaning.
- [`implementation-plan.md`](implementation-plan.md) records the non-normative construction order, measurement accounts, capacity ledger, and readiness gates for the first Z80 implementation.
- [`reviewers-charter.md`](reviewers-charter.md) records the settled project directions, open measurements, and evidence expected from an adversarial review. It guides review work but does not override the normative authorities.

Active implementation plans that are not yet part of the compiler live in
[`plans/`](plans/). Machine-readable grammar sources and generated LL(1) tables
live in [`../grammar/`](../grammar/) rather than under documentation.
