# Candlemoth size discipline

This document instructs the Candlemoth coding agent. Candlemoth is the Level
Zero Lanternfly compiler: a self-hosting compiler written in Lanternfly,
compiled initially by an independent TypeScript seed, and ultimately executed
as Z80 machine code.

Design Candlemoth as a Z80 program expressed in Lanternfly. Do not begin with a
conventional host-language compiler architecture and rely on later
optimisation. Source structure is useful only when its generated code and
storage remain appropriate for the target.

Correctness and specification conformance remain mandatory. Smallness governs
the choice between correct implementations.

## Authority and boundary

- The Lanternfly specification governs language semantics.
- Level Zero is empirical. It contains the features Candlemoth's own source
  uses and no speculative additions.
- Candlemoth is a loaded program on the flat 64K bootstrap host. Source streams
  in and object code streams out; neither is resident.
- Most allocation is static and must be known before execution.
- The TypeScript seed implements the same source language and lowering, but its
  internal architecture does not govern Candlemoth.
- Never edit a generated Candlemoth binary by hand. Every size improvement must
  arise from Lanternfly source, lowering, runtime generation, or a reproducible
  optimisation pass.
- Preserve analysis, layout and emission as observable compiler passes. They
  may share parsing code, tables and workspace.

## Z80-first working model

Think in bytes, registers, addresses and lifetimes before introducing
high-level structure. For each routine and data structure, work out the likely
instruction sequence and static storage while designing it.

Prefer these forms:

- one declared memory map rather than separately allocated subsystem state;
- shared scratch regions for values whose lifetimes do not overlap;
- byte ordinals and byte indices where the declared capacity permits them;
- page-aligned tables when alignment removes address arithmetic;
- packed tables laid out in the order the hot path reads them;
- fixed state machines and small dispatch tables for closed sets of cases;
- direct streaming from token to checked operation to emitted bytes;
- shared cold exits for faults, diagnostics and resynchronisation;
- fall-through and shared continuations where structured duplication would
  emit repeated branches and returns;
- explicit compact stacks containing only state that must survive nesting.

Avoid these host-language defaults unless measurement establishes a saving:

- an abstract syntax tree;
- a general intermediate representation;
- heap-allocated objects or linked structures;
- a routine for every conceptual operation;
- recursion when a small explicit stack stores less state;
- generic containers and visitors;
- duplicate parser, checker and emitter representations;
- storage owned permanently by one subsystem when another phase can reuse it;
- abstractions whose parameter stores, calls and register restoration exceed
  the code they replace.

Structured Lanternfly syntax does not require a conventionally structured
implementation. A state variable plus `select`, a compact stack, a shared
continuation, or a table-driven dispatch may produce less code than a deep tree
of subroutine calls. Use the source form that gives the clearest small lowering.

## Cost sheet before implementation

Before accepting a design, record:

1. emitted instruction bytes for the common path;
2. emitted instruction bytes for cold paths;
3. static writable bytes;
4. constant bytes;
5. stack or recursive save-around bytes;
6. registers used and clobbered;
7. calls made on the common path;
8. storage that another phase can reuse;
9. the largest valid capacity, not only the current test input.

An estimate is sufficient before the seed exists, provided the document labels
it as an estimate and shows the assumed lowering. Replace estimates with
measurements as soon as the seed emits a real image.

## Candidate compact architecture

The current front end is an empirical draft, not a structure that later work
must preserve. Examine the following alternatives before adding more grammar.

### Tokenizer and names

- Keep tokenization streaming and retain only the current token plus the
  smallest required lookahead.
- Continue using a character-class table if its 256 bytes replace more scanner
  code than they cost.
- Store fixed keywords as packed bytes with offsets and lengths. Do not pass
  them through a general installation path unless that path is smaller.
- Compare chained hashing with open addressing. The latter may remove bucket
  chains and their sixteen-bit links.
- Separate permanent global names from routine-local names if that lets the
  local table reset per routine or use byte indices.
- Discard spelling data once no later diagnostic or lookup needs it.

### Expressions

The current recursive-descent ladder allocates a routine and call protocol for
each precedence level. Compare it with a compact precedence loop driven by an
operator table.

An explicit expression stack can store only the token, type, value state and
emission state needed at each nesting level. Compare that cost with recursive
save-around-call storage and repeated static frames. Preserve short-circuit
Boolean semantics and the specification's exact and typed arithmetic rules in
either form.

Do not build an expression tree. Fold constants and emit operations as soon as
their required operands and destination type are known.

### Statements and declarations

- Dispatch fixed statement forms by keyword ordinal rather than repeated name
  comparisons.
- Share token expectation, fault and resynchronisation tails.
- Use one compact state machine where several small parsing routines would
  repeat prologues, parameter stores and returns.
- Keep locals in a reusable per-routine region. Keep only declarations that
  later routines must address in persistent storage.
- Represent control labels by the smallest per-routine identity that survives
  layout and emission. Do not reserve a program-wide width merely because the
  total program has more than 255 labels.

### Symbols

Do not give every symbol storage for every possible property. Separate or pack
entries by class: routines, parameters, locals, constants and types require
different fields.

Test a split between persistent global declarations and reusable local slots.
This may allow local indices, depths and field selectors to remain one byte
even when the complete program has more than 255 symbols.

Choose parallel arrays or fixed records from their Z80 access sequences rather
than from high-level taste. Parallel arrays can avoid field-offset arithmetic;
power-of-two records can make a complete entry cheap to address. Price both.

### Passes and workspace

Analysis, layout and emission read the same source and should reuse one parser
and one lowering path. The pass selects whether an operation records facts,
counts bytes or writes bytes.

Place pass-specific tables in overlapping memory when their contents are dead
before the next table becomes live. Draw this overlay in the memory map. A
separate allocation for every conceptual phase is not acceptable without a
lifetime conflict that requires it.

### Emitter and runtime

- Use a small set of byte and word emission primitives.
- Keep the current output address in a register or one fixed cell rather than
  passing it through many routines.
- Inline tiny hot emission sequences when call setup costs more than their
  bodies.
- Share large or cold sequences through routines.
- Keep the hand-written arithmetic and comparison runtime separate. It is
  already small; work on it only when the complete map shows that it matters.
- Consider one-byte `RST` calls for sufficiently hot helpers only when vector
  ownership permits them and the saved call bytes exceed the dispatcher cost.

## Immediate design review

Pause expansion of the existing front end long enough to price its current
shape. Produce a source-level estimate even before the seed exists:

- number of routines and call sites;
- parameter-store bytes and `CALL` or `RET` bytes;
- static frame bytes per routine;
- recursive save-around bytes per expression nesting level;
- bytes occupied by name, symbol and label tables;
- repeated fault, expectation and dispatch sequences;
- projected cost of the recursive precedence ladder;
- projected cost of a table-driven expression parser.

Use that comparison to decide whether to compress the existing front end or
replace a subsystem before adding the missing language forms. Do not preserve
three thousand lines of draft source merely because they already exist.

## Language work still required

Whichever compact architecture wins must implement and test:

- calls in expressions;
- integer and enum conversions;
- enum declarations;
- `select` and `case`;
- constant array literals;
- integer bitwise operations;
- short-circuit Boolean semantics;
- typed constant-folding rules;
- symbol-table lifetime and visibility;
- declaration placement.

The complete concatenated Candlemoth source must pass the real front end. A
name-resolution scan alone is insufficient.

Current infrastructure repairs also remain required:

- reject an emitted image that exceeds 64K;
- reject a designated entry outside compiled code;
- reject unknown capacity element types instead of assuming one byte;
- remove obsolete 16K and relative-branch claims from `level0.md`.

## Level Zero reduction

Audit each construct against the complete Candlemoth source. Current removal
candidates are:

- records;
- integer `xor`;
- `byteSize` and `offset`;
- `lower` and `upper`;
- `clear` and `fill`;
- multi-value cases;
- range cases.

When Candlemoth does not use one, remove its parser, type-checker, lowering,
diagnostics and tests from Level Zero. Ordinary Lanternfly retains the feature;
this decision narrows only the bootstrap subset.

## Measurement after the seed

Once the seed compiles Candlemoth, generate a report containing:

- each routine's address, length, call count and static-frame size;
- all constant and writable regions;
- maximum recursive or explicit-stack depth;
- instruction counts for representative self-compilation;
- the largest routines, tables and common-path sequences;
- total image and runtime memory;
- remaining address-space headroom.

Measure each optimisation separately. Record the baseline, new size, timing
effect, tests, assumptions and decision. Keep one optimisation per commit when
practical.

## Later instruction-level work

After the architecture and real map are known, examine:

- call-graph-based frame overlays;
- dead-code elimination;
- redundant loads, stores, conversions, exchanges and flag setup;
- tail merging and shared epilogues;
- specialised calling conventions for hot internal routines;
- code layout based on call frequency;
- deterministic `JR` relaxation;
- additional whole-program peepholes.

Branch relaxation must produce identical decisions in layout and emission and
remain reproducible through self-compilation.

## Acceptance rule

Retain a design or optimisation only when:

- language semantics remain conformant;
- all tests and generated-artifact checks pass;
- self-compilation remains reproducible;
- the size report establishes a saving or an accepted speed and size trade-off;
- the machinery needed to obtain the saving does not consume it;
- the self-hosted source remains maintainable.

Prefer a direct, target-shaped implementation to a general framework. Prefer a
modest measured saving to a clever mechanism with hidden tables and state.

## Planning targets

Treat these figures as goals rather than claims:

- Accept approximately 40 to 45K for the first correct image only if the
  Z80-first design review cannot remove obvious structural cost beforehand.
- Investigate the low-to-mid 30K range through compact parsing, split symbol
  storage, shared workspace and direct lowering.
- Investigate whether more aggressive overlays and instruction work can
  approach 30K.
- Do not restore a 16K requirement without measurements that establish a
  credible design for it.

Begin by pricing the current front-end architecture against the compact
alternatives in this document. The next missing grammar feature should not be
added until that comparison is recorded.
