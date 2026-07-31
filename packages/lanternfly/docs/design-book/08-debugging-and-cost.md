# Debugging, generated code and visible cost

Lanternfly removes register bookkeeping from source. It must still show where
memory, time and failures come from.

## Three program views

A Z80/Glimmer build has:

1. the Glimmer and Lanternfly source;
2. generated AZM, wrappers, adapters and runtime helpers;
3. machine bytes, symbols and addresses.

Source explains the algorithm. AZM explains target strategy and ABI. Machine
output gives exact placement and execution. Generated source is a maintained
artifact rather than a disposable intermediate.

## Composed provenance

```text
machine range
  -> generated AZM span and role
  -> Lanternfly node and source span
  -> Glimmer body and original file span
```

One statement can map to several machine ranges: address calculation, range
check, helper call and epilogue branch. A mapping record carries stable node
identity, generated role, bank or segment and confidence.

Private labels remain related to their source construct even when their names
are synthesized.

The AZM backend gives each generated fragment a stable label anchor. A routine
can use its entry label; a fragment inserted into a host routine uses a local
label so that it does not disturb AZM's routine scope. Every mapping inside the
fragment is recorded within its exact text, together with the anchor's position
in that text. Once the host has assembled the complete program, the anchor
supplies the fragment's final AZM position and the assembler map supplies its
machine ranges.

This borrows the dependable part of Glimmer's existing mapping scheme without
copying its verbatim-line assumption. Glimmer can recognize an unchanged AZM
body line because that line survives generation intact. Lanternfly cannot:
one assignment may become a bounds check, address calculation and store, while
a folded expression may emit nothing. Its backend therefore records the spans
as it lowers each node. The anchor finds the fragment; it does not decide which
source statement owns the code.

If a host changes the returned fragment, an anchor is absent or duplicated, or
a span escapes its fragment, the map cannot be trusted. The build reports
`E-MAP-001` instead of attaching machine code to the nearest plausible line.

## Stepping

Tools can offer:

- **Lanternfly step** to the next source statement;
- **lowering step** through generated code for that statement;
- **instruction step** through the CPU.

Stepping over:

```lanternfly
value = monsters[index].timer
```

normally treats normalization, bounds check, six-byte scaling and load as one
source action. A lowering step exposes each part when cost or backend behaviour
is under investigation.

Helpers are stepped over by default but remain debuggable runtime units.

## Typed values and storage

Debug metadata includes:

- integer width and signedness;
- Boolean canonical value;
- enum name, member and representation;
- subrange type, host and bounds;
- counted-string capacity, current length, short/long form and payload text;
- array domains, counts, strides and lower ordinals;
- record fields and offsets;
- static address and near/far storage class;
- scalar local location;
- local aggregate alias target where recoverable;
- device-space metadata attached to a near/far address binding.

An enum should display `green`, not merely 2. A subrange violation should name
the declared domain. An alias is shown as a temporary view:

```text
monster -> monsters[1]
monster.timer = 3
```

The debugger may show the hidden backend location separately, but it must not
present that carrier as a source pointer value.

## Front-end diagnostics

Messages use source vocabulary and stable conformance IDs:

```text
E-PATH-001: index type Direction is incompatible with Colour
  palette[direction]
          ^^^^^^^^^
```

```text
E-TYPE-005: constant 32 lies outside ScreenColumn
  var column as ScreenColumn = 32
                               ^^
```

Dynamic failures preserve class and source:

```text
F-BOUNDS: index 9 is outside board dimension 1 to 8
```

```text
F-RANGE: value 32 cannot enter ScreenColumn (0 until 32)
```

The same class reports a checked text operation before it changes its target:

```text
F-RANGE: 27 payload bytes cannot enter string[24]
```

The remedies differ: validate a general array index, or correct the conversion
feeding a checked type.

## Backend diagnostics

Substrate verification retains both layers:

```text
generated call violates the AZM register contract
Lanternfly: tetro.glim:184:9, checkCollisionAt(candidateX, playerY)
AZM:       build/tetro.main.asm:742
detail:    adapter reads HL after a callee that may clobber HL
```

The complete AZM diagnostic remains available, while the primary message names
the source construct and generated component.

## Cost without semantic drift

Backends may assign very different costs to the same operation. Reports can
attach:

- exact or estimated bytes;
- fixed, ranged or unknown cycles;
- helper and adapter calls;
- temporary storage;
- bank or segment switches;
- bounds and range checks;
- source construct and target assumptions.

A value reported as unknown is better than a precise number that ignores
device waits or interrupt effects.

Useful cost classes include direct/native, inline-small, inline-large, helper,
context-switch, host and unknown.

## Ordinal costs

Ordinal types add checks and can also remove them.

```lanternfly
rowPixels[column] = value
```

If `column` has type `ScreenColumn` and the array uses the same domain, the
range invariant proves the bounds check. The cost report can show:

```text
index normalization: subtract lower 0 (folded)
bounds check: removed by ScreenColumn containment
```

For `samples[index]` with domain `10 to 20`, subtraction of 10 remains even
when the index is proven safe. A dynamic general integer may add comparisons
and an `F-BOUNDS` branch.

Enum representation does not enlarge storage beyond its declared integer type.
Debug names and type checks are compile-time metadata unless a runtime
conversion requires `F-RANGE`.

## Hot regions

A host may attach a cycle or size budget to a body. Reports preserve nesting
so a helper inside a loop is multiplied by the iteration count:

```text
8 iterations × division helper (140..180 cycles each)
```

The host marks the scheduled bodies whose cycle or size budgets matter.

## Memory and layout reports

Static allocation is useful when visible. A report groups:

- Lanternfly module storage;
- Glimmer state and generated resources;
- runtime code and data;
- adapters and platform libraries;
- scalar scratch and frames;
- each bank or segment;
- remaining capacity and placement failures.

The placement artifact names the target region, planned start and end,
alignment and owner of every code, data and scratch range. The assembled
initialized-byte map, reserved-address set and symbol table appear beside it. A
difference is a backend or inline-assembly placement error, not an unexplained
linker adjustment.

Exact record and array layout appears with domains and strides. A tool may
suggest an explicit source-layout change for speed, but a backend cannot pad a
six-byte record privately when its layout is observable.

Counted strings appear with their full reserved size, header width and payload
capacity. A 24-byte short string costs 26 bytes even while empty; a 255-byte
long string costs 258. Showing reserved capacity prevents a friendly string
display from hiding the static-memory decision.

## Deterministic output

The build reproduces symbol names, helper selection, ordering, maps, reports
and diagnostics when the source, compiler version, manifest and target profile
remain unchanged. Snapshot tests and generated-code review can then expose a
real difference instead of incidental churn.

## Debug checks

Every conforming profile performs dynamic bounds and range checks that the
compiler cannot prove unnecessary. Debug profiles may add richer fault
reporting, far-mapping checks, stack instrumentation, epilogue assertions and
runtime self-tests. Constant errors remain compile-time errors in every
profile.

An explicitly unsafe unchecked-array extension is nonconforming execution, not
a release-mode interpretation of ordinary Lanternfly. Arithmetic remains
wrapping in debug and release builds.

## Required artifacts

The first Z80/AZM backend produces:

- generated `.asm`;
- assembled binary or HEX;
- machine map;
- validated placement plan and its final-map comparison;
- composed Lanternfly/AZM/host provenance;
- typed symbol and exact layout report;
- helper and adapter inventory;
- target capability report;
- optional cost report.

C and BASIC backends produce their generated source, runtime files and the
same route back to Lanternfly. Moving the obscurity into another generated
language would not solve the debugging problem.
