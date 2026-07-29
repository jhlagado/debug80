# Debugging, generated code and visible cost

Lanternfly removes register bookkeeping from source. It must not remove the
programmer's ability to understand where bytes, time and failures came from.

## Three views of one program

A Z80/Glimmer build has at least three useful views:

1. the Glimmer/Lanternfly source the programmer wrote;
2. generated AZM, including host wrappers and runtime helpers;
3. machine bytes and addresses.

Each view answers a different question.

- Source explains intention.
- AZM explains target strategy and ABI.
- machine output explains exact execution and placement.

The toolchain should preserve all three rather than treat generated AZM as a
temporary file nobody can inspect.

## Composed source maps

A source map entry needs provenance through each layer:

```text
machine range
  -> generated AZM span
  -> Lanternfly expression or statement
  -> containing Glimmer body and source span
```

A single Lanternfly statement may produce several non-contiguous machine ranges: an
inline address calculation, a call adapter and an epilogue branch. Several
generated instructions may share the same source span.

The mapping record should carry:

- original source file, line and column range;
- host block identity;
- Lanternfly node kind and stable node identifier;
- generated substrate file and line range;
- machine address range and bank;
- mapping role: direct, prologue, epilogue, helper, adapter or synthetic;
- confidence, normally high for compiler-emitted mappings.

Generated labels retain a relationship to the source construct even when their
display names are compiler-private.

## Stepping policy

Source stepping should offer levels:

- **Lanternfly step:** move to the next source statement;
- **lowering step:** expose generated AZM for the current statement;
- **instruction step:** ordinary CPU stepping.

Stepping over:

```lanternfly
value = Monsters[index].timer
```

normally treats the address calculation and load as one Lanternfly action. A user
investigating cost or a backend bug can descend into its lowering.

Runtime helper calls are stepped over by default but remain debuggable source
units in the runtime package.

## Variables and aliases

Debug metadata should describe:

- static scalar address and type;
- array shape and element type;
- record fields and offsets;
- near/far reference representation;
- current location of scalar locals;
- local alias target where recoverable;
- optimized-out values honestly.

An alias should display as a view:

```text
plane -> BoardGreen
plane[3] = $18
```

If the target is selected dynamically, the debugger can show its current
reference value and resolved symbol. It should not invent a copied local array.

Far references display both logical object and physical representation:

```text
Asset -> bank 3:$8120
```

Device addresses display their address-space name:

```text
NAME_TABLE = VRAM:$0800
```

## Diagnostics before emission

Type and control diagnostics should use source vocabulary:

```text
KJ0214: cannot assign LONG to BYTE without narrowing
  EnemyY = distance
           ^^^^^^^^
suggestion: BYTE(distance) if wrapping is intended
```

Addressing diagnostics should explain capability and remedy:

```text
KJ0412: this Z80 backend stage cannot lower two runtime indices in one path
  NameShadow[row, column]
suggestion: bind NameShadow[row] to a local ALIAS, then index the alias
```

That second case is explicitly a backend-stage limit, not a claim that the
language disallows two-dimensional indexing.

## Diagnostics after substrate verification

An AZM error needs layered context:

```text
KJZ003: generated call violates the AZM register contract
Lanternfly:   tetro.glim:184:9, call CheckCollAt(candidateX, PlayerY)
AZM:    build/tetro.main.asm:742
detail: generated adapter reads HL after a callee that may clobber HL
```

The full AZM diagnostic remains available. The primary message identifies the
source action and likely backend component.

## Cost is not part of semantics

Two correct backends may give an operation very different costs. The compiler
therefore reports cost without making source semantics depend on it.

A report can attach:

- emitted byte estimate or exact size;
- cycle estimate as fixed, range or unknown;
- helper calls;
- temporary storage;
- bank switches;
- bounds-check overhead;
- source construct;
- confidence and target assumptions.

Cycle estimates on branchy code are ranges. Device wait states and interrupt
effects may make a number unknown. False precision is worse than an honest
category.

## Cost classes

An initial portable vocabulary is enough:

| Class          | Meaning                                                    |
| -------------- | ---------------------------------------------------------- |
| native         | one or a few direct target instructions                    |
| inline-small   | short generated sequence                                   |
| inline-large   | substantial generated sequence                             |
| helper         | runtime call                                               |
| context-switch | bank/segment or device mapping change                      |
| host           | delegated to substrate runtime; target cost model required |
| unknown        | no reliable estimate                                       |

Examples on Z80:

```text
Board[row]                 inline-small (stride 1)
Framebuffer[row].green     inline-small (stride 4)
Monsters[index].timer      inline-large (stride 6 shift/add)
a / b                      helper
farAsset.field             context-switch + load helper
```

On C, the same expressions may be `native` or `host`, but a cache or system
call is outside Lanternfly's basic model.

## Hot regions

The source or host can mark a body as cost-sensitive:

```text
REM illustrative annotation
COST REGION scanRow MAX 120 CYCLES
```

Glimmer already knows which blocks are renders and how scheduling works, but
Lanternfly cannot assume every render is hard real-time. The host may pass a budget
for a body. The backend reports whether its upper bound fits.

A helper call inside an eight-row scan loop deserves attention even if the
whole program is small. Cost reports preserve nesting so multiplied costs are
visible:

```text
8 iterations × division helper (140..180 cycles)
```

## Generated-source annotations

Readable AZM can include restrained comments:

```asm
; lanternfly tetro.glim:184 candidateX = PlayerX - 1
```

Comments should mark statement boundaries, not repeat every expression in
prose. Generated private symbols use stable prefixes and body identifiers so
diffs remain intelligible.

The output should favour canonical AZM formatting and exact `.routine`
contracts. It is an artifact developers may inspect and test.

## Memory reports

Static allocation is a feature only if it is visible. The linker report should
group:

- Lanternfly-owned globals;
- Glimmer-generated state and resources;
- runtime helper code/data;
- platform library code/data;
- scalar scratch;
- each bank or segment;
- unused capacity and placement failures.

Exact records make wasted padding easy to avoid. A cost hint may still say
that changing a private six-byte record to an explicit eight-byte stride makes
hot indexing cheaper, but such a change must be a source or layout decision.

## Deterministic output

The same source, compiler version, manifest and target configuration should
produce stable:

- generated symbol names;
- helper selection;
- ordering;
- maps;
- cost reports;
- diagnostics.

Stable output makes snapshot tests useful and lets developers review a change
to lowering without noise.

## Debug-build checks

A debug target profile may enable:

- array bounds checks;
- far-reference mapping checks;
- uninitialized local traps;
- narrowing warnings promoted to errors;
- stack-depth instrumentation;
- host-body epilogue assertions;
- runtime helper self-tests.

Release builds can remove checks according to explicit configuration. Lanternfly
does not change ordinary arithmetic from wrapping to trapping merely because
debug mode is active unless checked arithmetic was requested.

## Required artifacts

The first Z80/AZM backend should produce:

- generated `.asm`;
- assembled binary/HEX;
- Debug80-compatible machine map;
- Lanternfly-to-AZM provenance map or equivalent composed data;
- symbol/layout report;
- imported/runtime helper list;
- optional cost report.

A C or BASIC backend should produce its source plus the Lanternfly provenance map and
runtime files. Source generation without a route back to Lanternfly would repeat the
current problem at a higher layer.
