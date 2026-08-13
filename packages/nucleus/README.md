# Nucleus

A small typed language compiled directly to machine code for sixteen-kilobyte
Z80 systems.

Nucleus is an autonomous standalone project. This Debug80 workspace package is
a pinned integration snapshot, not a second source of language or runtime
authority. Current authorities live in the
[standalone Nucleus repository](https://github.com/jhlagado/nucleus).

## Layout

|            |                                                                      |
| ---------- | -------------------------------------------------------------------- |
| `docs/`    | language and runtime authorities, implementation plan, and charter   |
| `grammar/` | machine-readable Stage 7 grammar, generator, and packed LL(1) tables |
| `asm/`     | direct-Z80 compiler, runtime, and executable AZM proof fixtures      |
| `proofs/`  | bounded memory profiles and proof-harness manifests                  |
| `src/`     | host-side grammar, manifest, runtime, and metadata support           |
| `test/`    | grammar, contract, measurement, and direct-Z80 proof gates           |

This snapshot retains pinned copies of these documents for integration checks.
They may trail the standalone repository and are not current-language
authorities:

- [Nucleus 0.1 Language Specification](docs/specification.md)
- [Nucleus Target System Specification](docs/target-system-specification.md)
- [Nucleus Object Stream Format](docs/nucleus-object-format.md)
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
The flat-manifest adapter preserves ordered source-part identities and
diagnostic names outside the compiler core.

The host NOBJ boundary encodes, validates, and materializes the strict
append-only object stream. Image and patch records use independent sequential
spools, while an atomic generation reference prevents an aborted or corrupted
object from replacing the last committed artifact. A machine-readable runtime
identity selects the canonical source revision, ABI, link rules, and expected
layout; the operating-layer provider deterministically links fully resolved
bytes for each validated target context.

Proof manifests may opt into a second, NOBJ-aware execution. The runner commits
the producer's bounded logical sink calls, validates and materializes the
object into fresh memory, and enters only its committed target entry. A small
package-local bank-window hook supports synthetic multi-bank runner evidence
without moving NOBJ policy into the general Debug80 runtime.

Aggregate constants use the same complete record, fixed-array, and bounded-
string initializers as program variables. Their direct named roots are
read-only; ordinary aggregate aliases deliberately carry no transitive
read-only qualification.

Recoverable errors remain explicit and local: `else fail` propagates one
failable call, same-line `handle NAME ... end` handles it, and `return` denotes
success only. These forms lower to ordinary Z80 conditional control flow, not
exceptions or stack unwinding.

```bash
npm run proof -w nucleus
npm run measure -w nucleus
npm test -w nucleus
```
