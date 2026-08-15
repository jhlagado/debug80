# Nucleus documentation reading copy

Nucleus 0.1 is a small, safe, general-purpose structured language for Z80 and other constrained systems.

These files mirror the standalone
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) documentation at
commit `0382f73fe3bc29e86496b92334287139c2de92f1`. The standalone repository is
authoritative; this directory is a reading copy retained beside Debug80.

- [`specification.md`](specification.md) is the working Nucleus 0.1 Language Specification and governs source-language conformance at its current revision.
- [`host-api.md`](host-api.md) defines the supported Node, project-file, and
  command-line interfaces.
- [`d8-source-maps.md`](d8-source-maps.md) defines conditional compiler tracing,
  validation, and D8 sidecar production.
- [`host-integration.md`](host-integration.md) records the implemented boundary
  between the standalone compiler and Debug80.
- [`target-system-specification.md`](target-system-specification.md) governs
  target profiles, program images, startup, entry, and banked-program
  composition.
- [`nucleus-object-format.md`](nucleus-object-format.md) governs the binary
  append-only object stream, patch records, integrity check, and commit.
- [`z80-runtime-contract.md`](z80-runtime-contract.md) governs packed representation, generated-code integrity, services, traps, and direct Z80 execution; the language specification remains authoritative for source-language meaning.
- [`implementation-plan.md`](implementation-plan.md) records the non-normative construction order, measurement accounts, capacity ledger, and readiness gates for the first Z80 implementation.
- [`reviewers-charter.md`](reviewers-charter.md) records the settled project directions, open measurements, and evidence expected from an adversarial review. It guides review work but does not override the normative authorities.
- [`oddities.md`](oddities.md) records deliberate first-time surprises and the
  language-finish backlog without overriding the specification.

Active implementation plans that are not yet part of the compiler live in
[`plans/`](plans/). Machine-readable grammar sources and generated LL(1) tables
live in [`../grammar/`](../grammar/) rather than under documentation.
