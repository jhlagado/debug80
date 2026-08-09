# Nucleus

A small typed language compiled directly to machine code for sixteen-kilobyte
Z80 systems.

Nucleus is an autonomous project. Its language, grammar, direct compiler,
runtime contract, and conformance rules are defined here. Material outside this
package does not govern Nucleus.

## Layout

|            |                                                                      |
| ---------- | -------------------------------------------------------------------- |
| `docs/`    | language and runtime authorities, implementation plan, and charter   |
| `grammar/` | machine-readable Stage 7 grammar, generator, and packed LL(1) tables |
| `asm/`     | direct-Z80 compiler, runtime, and executable AZM proof fixtures      |
| `proofs/`  | bounded memory profiles and proof-harness manifests                  |
| `src/`     | host-side grammar analysis, runtime assignments, and metadata models |
| `test/`    | grammar, contract, measurement, and direct-Z80 proof gates           |

The current authorities are:

- [Nucleus 0.1 Language Specification](docs/specification.md)
- [Nucleus Z80 Runtime and Backend Contract](docs/z80-runtime-contract.md)
- [Nucleus 0.1 Implementation Plan](docs/implementation-plan.md)
- [Nucleus reviewer's charter](docs/reviewers-charter.md)

## Method

Bottom up. Every claim about Z80 bytes or timing is produced by AZM and the
Debug80 Z80 runtime from a test in `test/`, or is labelled an estimate in the
document that makes it.

The specification grammar analyzer checks the grammar printed in the language
specification. The packed parser uses the machine-readable Stage 7 grammar in
`grammar/`; its generated tables are reproducible and conflict-free. Trap and
service assignments are checked against the direct-Z80 contract. The
type-metadata model covers every Nucleus type, including arrays of records and
bounded strings, without turning aggregate aliases into runtime types.

```bash
npm run proof -w nucleus
npm run measure -w nucleus
npm test -w nucleus
```
