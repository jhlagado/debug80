# Complete Stage 7 packed LL(1) experiment

## Measured result

This experiment is rebuilt from the exact amended Stage 7 revision
`77c0f4e2daadb7bf0e11b072a5ce5445927e4441` (`Simplify Nucleus Z80 backend
naming`). It inherits both the parser compression and the complete Native-to-Z80
file, label, proof, and state-name migration before substituting the parser
structure.

| Complete compiler account | Recursive descent | Hybrid LL(1) | Difference |
| --- | ---: | ---: | ---: |
| compiler code | 12,093 | 11,882 | -211 |
| immutable compiler data | 219 | 219 | 0 |
| **compiler core** | **12,312** | **12,101** | **-211** |
| writable compiler workspace | 1,198 | 1,276 | +78 |
| target runtime | 419 | 419 | 0 |

The amended Stage 7 prototype therefore establishes a small code-space win on
this exact language boundary: 211 bytes, or about 1.71% of the complete
compiler.
It is not a claim about Stage 8 or later. Each later comparison must be rebuilt
on the same upstream revision and must count all retained dependencies.

## Like-for-like parser account

`ParserCodeStart..ParserCodeEnd` is 8,064 bytes in the recursive-descent build
and 7,853 bytes in the LL(1) build.

| LL(1) parser component | Bytes |
| --- | ---: |
| retained precedence expressions, call/path machinery, and semantic support | 4,968 |
| generic packed interpreter | 226 |
| generated prediction/production/action tables | 654 |
| explicit semantic actions and adapters | 2,005 |
| **complete parser boundary** | **7,853** |

The 4,968-byte retained account is not free infrastructure. It includes the
typed precedence parser and the low-level Stage 7 routines needed by both
parser organizations. The handwritten syntax dispatch and declaration/control
walkers selected by the LL(1) grammar are excluded only in the candidate build.

## Grammar boundary

The machine-readable grammar has 63 productions and 34 nonterminals. Its
generator calculates nullable, FIRST, FOLLOW, and prediction sets and rejects
conflicting table cells and every packed-field overflow. The current grammar
has no LL(1) conflicts.

Expressions remain in the existing precedence component. NAME-led statements
are an explicit external island because calls, scalar assignments, aggregate
paths, and aggregate copies require symbol/type information rather than token
lookahead. The lexeme `main` is likewise resolved by one explicit semantic
action because the tokenizer intentionally represents every identifier with
`TokenName`.

The grammar covers the complete Stage 7 surface exercised by the production
proof: constants, program objects, records, bounded aggregate types, ordinary
and `main` routines, parameter and result types, local scalars, assignments,
calls, scalar and aggregate returns, fixed output, structured control, and
counted loops.

## Proof and accounting contract

The independent engine proof fills the 64-byte grammar-symbol stack exactly,
checks the adjacent canary, and proves atomic single-symbol and production
overflow failure with `DiagnosticParserCapacity`. The engine plus action state
uses 78 additional writable bytes.

The complete candidate runs the same Stage 7 aggregate-call proof source as
the recursive-descent oracle. That proof exercises successful compile/encode/
execution, exact diagnostics and offsets, call and expression capacity,
parameter/routine capacity, duplicate names, nominal aggregate mismatches,
paths and suffix failures, short-circuit control, generated traps, stack
restoration, and encode rollback. The differential test additionally compares
the complete semantic buffer, all 4 KiB of generated memory, Z80 state, and
the proof's published results byte for byte.

Generated artifacts are reproducible:

```text
77f2144bb8d6e981d90520ca99eeb78937503c8f1080e40b43b1276e5f6db176  full-hybrid-tables.asmi
101cfbce0f89961cb68ab8cdf8bd9d0f27a2cea009da54ec00ad5710f2f36fc6  full-hybrid-action-stubs.asmi
```

## Upstream synchronization

This checkout is an isolated clone on `experiment/ll1-stage7-amended`. Its only remote
is named `upstream`; it fetches from `/Users/johnhardy/projects/debug80` and its
push URL is the inert value `DISABLED`. Git rerere is enabled so repeated
conflict resolutions can be reused. The live checkout is never a worktree of
this branch and is never modified by the experiment.

The overlay is intentionally narrow:

- four new Stage 7 LL(1) source/proof files;
- the machine-readable grammar, generator, and generated tables;
- one focused differential test;
- small `HybridLL1Full` conditional seams in the six parser source files;
- one disabled-by-default selector in the Stage 7 proof source.

For every new committed upstream stage or compression pass:

1. fetch `upstream/main` without changing the live checkout;
2. record the exact upstream commit and re-run the untouched recursive-descent
   proof to establish its new complete compiler total;
3. transplant or rebase the narrow experiment overlay only inside this clone;
4. inspect every upstream change to the six shared parser files plus the Z80
   sink, emitter, runtime, state map, token definitions, and proof corpus;
5. regenerate tables, run the differential proof, full Nucleus suite,
   typecheck, register-contract assembly, and `git diff --check`;
6. report both complete totals and workspace totals from the same commit.

No local experiment commit, rebase, merge, or push has been performed in this
milestone. A normal rebaseable history requires an explicitly authorized local
experiment commit; pushing remains disabled independently.
