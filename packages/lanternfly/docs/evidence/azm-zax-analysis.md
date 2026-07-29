# AZM and ZAX evidence for Lanternfly

This study separates three related but different sources:

- current AZM 0.3, which is Glimmer's immediate Z80 substrate;
- ZAX's normative main-branch specification and implementation;
- the later exact-size ZAX design line and the current ZAX book.

They do not form one internally consistent language snapshot. The differences
matter because Lanternfly should inherit useful ideas, not accidental historical
constraints.

## Current AZM

AZM is a structured assembler. It knows enough about layout, modules, inline
operations and routine contracts to support generated Glimmer programs, but
the body remains Z80 assembly.

### Exact assembler-time layouts

AZM records and unions describe byte layout:

```asm
Sprite .type
x      .field byte
y      .field byte
tile   .field byte
flags  .field byte
       .endtype
```

Arrays compose with those types, and `sizeof`, `offset` and layout casts
calculate addresses. Fields advance by their declared byte sizes. AZM does not
insert semantic power-of-two padding into this model.

This is important but limited. A cast such as:

```asm
ld a,(<SpriteArray>Sprites[3].tile)
```

performs an assembler-time calculation because `3` is constant. AZM's
documentation explicitly leaves runtime indexing to Z80 instructions. A Lanternfly
backend must supply the missing runtime address algebra.

### Ops are inline substrate operations

An AZM `op` matches typed operand shapes and expands to instructions. It is not
a textual macro and it has no call frame. Glimmer uses ops for compact
generated idioms and imports routines for reusable services.

Lanternfly should not expose this distinction in ordinary source. The same source
call:

```text
mask = MxMask(x)
```

may become an inline AZM op, a routine call, a native instruction sequence, a C
expression or a BASIC helper. The backend manifest records the implementation
kind.

### Routine contracts are backend verification

AZM `.routine` declarations describe inputs, outputs, clobbers, preserved
carriers and no-return control flow. They are valuable checks on generated
Z80, but registers and flags are not Lanternfly semantics.

The Lanternfly-to-AZM backend should emit or retain strict contracts for generated
routines and imported helpers. A contract failure is evidence of a backend or
manifest error. Lanternfly diagnostics should translate the failure back to a source
call or generated epilogue rather than ask the programmer to understand a
register collision.

### AZM consequences

Current AZM provides:

- exact static layout and constants;
- assembler-time field and constant-index calculation;
- hygienic inline ops;
- import visibility;
- routine-boundary verification;
- source artifacts suitable for inspection.

Lanternfly must add:

- runtime expressions;
- typed loads and stores independent of Z80 registers;
- runtime indexing and stride multiplication;
- structured control flow;
- scalar temporaries and, later, formal routines;
- portable address-space types.

## ZAX's stack-frame precedent

ZAX functions pass every argument in a 16-bit stack slot. A framed routine
anchors its frame at `IX`; parameters have positive offsets and scalar locals
have negative offsets. A byte occupies the low lane of a slot. Word transfers
may need several instructions because Z80 `IX+d` forms are byte-oriented.

Lanternfly should inherit the semantic separation, not this ABI:

- a scalar argument passes a value;
- an aggregate argument passes a reference with a known shape;
- a scalar local owns automatic storage;
- an aggregate local may alias existing storage without owning a copy.

The Z80 backend may choose an IX frame, static scratch allocation, registers,
another software stack convention, or a mixture. A 6502 backend will make a
different choice. A C backend should use ordinary C locals when that preserves
the Lanternfly widths and lifetime.

## Aggregate parameters and local aliases

The ZAX specification supplies a particularly useful constraint.

Non-scalar parameters occupy one address-sized slot and retain their declared
array or record type. A fixed array may be passed to an unsized array-view
parameter. Non-scalar local storage is rejected; a local aggregate name must be
an alias:

```text
localPlane = BoardPlane[planeIndex]
```

The alias allocates no frame slot for the array. It gives a shorter typed path
to existing storage.

Lanternfly adopts the underlying rule:

1. scalar locals may own call-local storage;
2. aggregate parameters are references;
3. aggregate local aliases do not allocate or copy;
4. aggregate value copying is not implicit;
5. the first language has no variable-size stack allocation.

Lanternfly need not copy ZAX's syntactic distinction between inferred and typed alias
forms. In a pseudocode language, an explicit reference declaration may be
clearer:

```text
DIM plane AS REF TO BYTE[8]
plane = BoardPlane[planeIndex]
```

Whether inference is also allowed remains a source-design question.

## The power-of-two history

The user's recollection is directionally correct, with an important repository
qualification.

ZAX's older normative specification deliberately rounds arrays, records and
unions to power-of-two storage sizes. Runtime indexing then uses only repeated
doubling. The current main-branch implementation at baseline
`8b7d4a9f` still contains checks that reject non-power-of-two runtime element
sizes in parts of the lowering path.

A later implementation line at commit `e40b75a2` adds exact
non-power-of-two indexed scaling. Its lowering:

1. preserves the base;
2. retains the original index;
3. decomposes the constant stride into binary;
4. emits a shift-and-add multiply;
5. adds the restored base.

For a three-byte element, the essential calculation is:

```text
offset = index * 3
       = (index * 2) + index
address = base + offset
```

The current ZAX book presents this later design as the programming model:
records have no hidden padding, `sizeof(Entry)` may be 3, and indexing an
`Entry[5]` generates shift-and-add scaling. The older normative spec and parts
of main-branch lowering have not been fully reconciled with that account.

This history answers the design question without pretending the repository is
already uniform:

- yes, ZAX moved conceptually from semantic power-of-two rounding toward exact
  layouts with generated constant multiplication;
- the exact-size lowering exists and is tested on a later branch;
- the inspected main baseline still retains older power-of-two restrictions in
  some implementation paths.

Lanternfly should take the later design. Storage layout is a program contract.
Backend convenience is a cost choice. The Z80 backend may still recommend
power-of-two strides in hot paths and report the cheaper lowering, but it must
not silently change a three-byte record into four bytes.

## Address expressions

ZAX models an effective address as a base plus typed path segments:

- a field contributes a constant offset;
- an array index contributes `index * elementSize`;
- nested arrays contribute row-major strides;
- a scalar path becomes a load or store in a value context;
- an aggregate path remains addressable storage.

This is the right conceptual core for Lanternfly.

ZAX also limits the complexity of some runtime address expressions. Its design
work describes a runtime-atom budget: complicated dynamic paths should be
staged into aliases or temporaries. That constraint arose partly from Z80
register pressure.

The Glimmer corpus argues for a more user-facing rule. Direct
`screen[row][column]` is too ordinary to reject. Lanternfly can admit multiple
indices semantically and let a backend stage the calculation. Cost reporting
can reveal when a two-index access is expensive. A deliberately constrained
first implementation may support one dynamic index and issue a clear
capability diagnostic, but the language should not define the common
two-dimensional case as meaningless.

## Pointers and static structures

Later ZAX material demonstrates typed record pointers, static linked lists and
trees. Even there, nodes may be allocated in a fixed pool and linked with
compile-time addresses; heap allocation is not logically required.

Lanternfly's first corpus does not need general pointer structures. It needs:

- references to global arrays and records;
- arrays of references;
- references to array elements and record fields;
- reference equality;
- near/far address classes;
- opaque platform address spaces.

General pointer-following can be staged after these facilities. It should not
distort the initial language toward heap-oriented programming.

## Source mapping lesson

ZAX recognises that one source line may lower to many instructions and that a
compiler must emit explicit high-confidence mappings. Lanternfly adds another layer:

```text
Lanternfly source -> generated AZM -> machine bytes
```

The mappings must compose. An emitted AZM instruction needs both its immediate
AZM origin and its Lanternfly origin. Generated labels and helper calls should retain
the Lanternfly statement or expression that caused them. Copying line numbers
verbatim is insufficient once an expression expands into a shift-and-add
sequence.

## What Lanternfly inherits

Lanternfly inherits these principles:

- exact, compositional layouts;
- typed storage paths;
- fixed arrays and records;
- scalar automatic locals;
- aggregate reference parameters and zero-storage local aliases;
- compiler-generated constant-stride multiplication;
- visible lowering and source maps;
- a strict verified native boundary.

Lanternfly does not inherit:

- Z80 registers as source values;
- flags as the ordinary Boolean model;
- mandatory IX frames;
- every argument occupying a 16-bit source-level slot;
- power-of-two semantic padding;
- the one-runtime-atom limit as a permanent language law;
- raw instruction syntax as the main computational surface.
