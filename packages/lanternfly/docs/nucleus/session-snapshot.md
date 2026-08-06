# Nucleus V2: a costed architecture hypothesis

## Status

This paper is an architecture hypothesis, not a language specification. It defines the programming model that a Nucleus implementation must preserve, the budget boundaries it must measure, and the experiment that should decide the first compiler architecture. Syntax, bytecode encodings, stack layouts, and byte counts remain open until an implementation measures them.

Nucleus is the smallest safe, practical language intended for routine programming on the TEC-1. Self-hosting and bootstrap work are important uses, but they do not justify reducing the source language to a notation that is unsuitable for ordinary programs.

## Governing constraint

The Nucleus compiler core, including every constant table required while compiling, must fit in one 16 KiB bank or page. Code or tables placed in another bank do not make an oversized compiler core acceptable.

Other resources have separate budgets and may use other RAM or banks when the platform permits:

| Resource                  | Accounting rule                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Compiler core             | Count executable code and required immutable data together against the 16 KiB gate.                         |
| Writable workspace        | Report peak live bytes, including lexer, parser, symbol, lowering, and emission state.                      |
| Generated output          | Report emitted program bytes separately from compiler storage.                                              |
| Bytecode interpreter      | Give the VM its own code, constant-data, and writable-state totals. It may reside in another bank.          |
| Direct and later backends | Measure each backend independently and state whether it replaces or supplements another resident component. |
| Execution cost            | Measure representative instruction counts or cycles; do not fold speed into the compiler-size result.       |

For each tested compiler configuration, count the front end, its active emitter, and all constants they require against the compiler-core gate. A mutually exclusive or later backend may have a separate budget, but its placement must not hide code needed by the tested compiler.

The flat approximately 63 KiB address-space profile described in `../abstract-machine.md` may still govern other Lanternfly or Candlemoth experiments. It does not govern Nucleus V2. Treating TEC-1 banking as future work would postpone the constraint that this design exists to satisfy.

## Evidence and admission

Every size or performance claim must carry one of these labels:

- **Measured:** produced by an identified build or run, with the measurement method recorded.
- **Projected:** calculated from measured components under stated assumptions.
- **Hypothesis:** a design expectation that an implementation has not yet tested.

Do not present source-line count, host executable size, or an opcode sketch as a target byte count. Report ranges only when the assumptions that produce the range are explicit.

The minimum programming model in this paper is a requirement. Formal arguments, named local variables, a typed result, and the safe data forms below do not have to earn admission against a deliberately unusable global-register baseline. Only measurements showing that a required feature is infeasible may reopen that requirement. If a faithful implementation cannot meet the compiler-core gate, the architecture hypothesis has failed or needs redesign; silently deleting part of the programming model is not a successful result.

Apply the measured cost-versus-saving rule to optional conveniences and later expansion. For each optional construct, measure its incremental compiler-core bytes, constant data, peak workspace, interpreter or backend cost, emitted-program effect, and any reduction it permits elsewhere. Admit it only when that evidence justifies the total-system trade. Exclude optional syntax and machinery by default, then add one measured construct at a time.

## Minimum source-language model

Nucleus source should resemble a small, typed, structured BASIC. The first useful implementation must provide:

- scalar types `u8`, `u16`, and Boolean, including Boolean conditions and results;
- subroutines with formal arguments, named local variables, and one typed return result where a routine returns a value;
- fixed-size arrays with bounds-checked access;
- records whose field layout and offsets are fixed at compile time;
- bounded strings or string views whose accessible extent is known;
- assignment, calls, `if`/`else`, `while`, and `return`;
- static rejection of unsafe operations where the compiler has enough information, and checked operations that trap when safety depends on runtime values.

These are semantic requirements, not commitments to a spelling or grammar. The first grammar should implement no more syntax than these requirements need.

The source language exposes neither raw pointers nor pointer arithmetic. After type checking, lowering may represent an array or string argument as a hidden address-and-length pair. It may represent a fixed array or record as a base plus compile-time offsets. Those addresses and offsets belong to the IR or backend representation; they are not source values and cannot be fabricated or arithmetically manipulated by a Nucleus program.

Heap allocation, resizable strings, generics, exceptions and unwinding, arbitrary casts, advanced type machinery, and unrestricted dynamic data are outside the first design. Other familiar control constructs remain candidates for measured expansion rather than assumptions in the initial compiler.

Recursion is not required in the first vertical slice. This is implementation staging, not a permanent language prohibition. A later recursion experiment must account for activation storage, call depth, re-entry of temporaries, safety checks, and failure behavior before an implementation commits to supporting it.

## Front-end and lowering boundary

The front end should type-check names, calls, results, field accesses, indices, and string extents before it emits raw storage operations. Parameters and locals may then receive fixed virtual slots. Record fields and fixed-array elements may lower to typed base-and-offset operations; array and string views may lower to hidden base-and-length values.

Lowering should regularize source constructs when doing so reduces downstream cases. A small vocabulary of typed semantic operations is preferable to carrying source-specific variations into every backend. This principle does not require the source programmer to write one operation per statement or to manage the compiler's temporaries.

## IR as the semantic emission interface

The IR is primarily the contract between the checked front end and a backend. It is an operation vocabulary, not necessarily a stored intermediate file or in-memory graph.

The first implementation path serializes these operations as compact bytecode for a separate interpreter. A direct backend may instead consume the same operations as they are emitted and produce Z80 code without retaining an IR artifact. If interpretation loses on total cost, the type-checked operation boundary can therefore remain useful rather than being discarded with the bytecode format.

Keep this interface target-neutral where neutrality has no material cost against the TEC-1 constraint. A direct Z80 backend is the first comparison. Possible 6502 or x86-class backends are reasons not to embed Z80 accidents in the semantic operation set, but portability does not outrank the one-bank compiler-core gate.

## VM design hypothesis

The VM should first be easy and regular for the compiler to target. Compiler simplicity outranks VM execution speed. The bytecode must not inherit context-dependent Z80 exceptions. It is neither a clone of a historical processor nor an attempt to expose the Z80 through different mnemonics.

Candidate bytecode designs should prefer:

- a small number of uniform instruction families;
- consistent operand order and operand widths;
- predictable instruction lengths;
- explicit byte and word forms rather than context-dependent width;
- a regular call and result convention;
- checked indexing and other safety operations where centralizing them reduces total compiler code;
- structured call setup or region save and restore when these replace repeated front-end or generated-code machinery.

Source parameters and locals may map to fixed virtual slots. Any VM registers are memory-backed implementation locations, not source-language globals. They must not recreate the former `b` and `w` global arrays as the programming model.

This paper does not choose a pure stack machine, a register machine, or a hybrid. The present preference is for memory-backed virtual registers, with explicit stacks only where expression nesting, calls, or re-entry require them. The vertical slice must compare the code, tables, writable state, emitted output, and execution cost before fixing that choice.

PIC, TMS9900, AVR, RCA 1802, 6502, CHIP-8, and SWEET16 are useful precedents for operand regularity, interpreter structure, and compiler trade-offs. None is a compatibility target.

## Calls, storage, and safety

A routine may have typed formal arguments, named locals, and at most one typed result. A regular VM ABI may assign arguments, locals, and the result to fixed slots or to equally regular frame positions. The first implementation should choose the representation that minimizes the measured combination of compiler core, interpreter, writable state, and emitted programs.

Fixed-size values may use statically assigned storage when lifetime analysis proves that sufficient. Re-entry and recursion require distinct activation storage; deferring recursion permits an initial implementation to defer that machinery, but not to describe re-entry-unsafe storage as a permanent language rule.

Bounds checking is part of array and bounded string semantics. Elide a check only when the compiler proves the access safe. Otherwise emit a checked VM operation, a checked helper call, or equivalent backend code. Record field selection uses compile-time layout and does not expose the underlying offset to source.

The source compiler should reject type errors, inaccessible storage operations, invalid constant bounds, and other statically knowable safety violations. It may stop at the first diagnostic in the initial implementation. Runtime bounds failures and similar dynamic safety failures may trap. Full exception handling and unwinding remain deferred.

## Native compiler machinery excluded from the primary path

The primary architecture avoids compiler features whose main purpose is producing hand-shaped native Z80:

- physical register assignment and spilling;
- irregular native operand constraints;
- instruction selection across Z80 special cases;
- short-versus-long branch selection;
- general relocation and link-time fixups;
- native stack-frame and calling-convention optimization;
- native peephole passes.

A direct Z80 backend may need a measured subset of this work. Its cost belongs to that backend comparison, not to the bytecode front end by assumption.

## Cost ledger

The implementation must maintain a reproducible ledger rather than a narrative estimate. At minimum, record:

| Component                       | Compiler core bytes | Required constants | Peak writable bytes | Output bytes | Execution cost | Evidence |
| ------------------------------- | ------------------: | -----------------: | ------------------: | -----------: | -------------: | -------- |
| Lexer and token contract        |                     |                    |                     |          n/a |            n/a |          |
| Parser and declarations         |                     |                    |                     |          n/a |            n/a |          |
| Type and name checking          |                     |                    |                     |          n/a |            n/a |          |
| Semantic-operation emission     |                     |                    |                     |              |                |          |
| Bytecode backend                |                     |                    |                     |              |                |          |
| Bytecode interpreter            |            separate |           separate |            separate |          n/a |                |          |
| Direct Z80 backend              |                     |                    |                     |              |                |          |
| Diagnostics and recovery policy |                     |                    |                     |          n/a |            n/a |          |
| Safety checks and trap support  |                     |                    |                     |              |                |          |

State whether components are resident together, overlaid, generated, or mutually exclusive. Report shared tables once and identify their owner. Report maximum live workspace, not the sum of buffers that never coexist. The compiler-core total must include required immutable tables even if the linker places them in a different section.

The paper contains no byte or cycle projections because no compliant vertical slice has yet produced them. Existing VM experiments may inform candidate designs, but their measurements apply only when their language semantics, component boundary, and accounting rules match this paper.

## Required vertical slice

Build one small program and the minimum compiler path needed to process it. The program must exercise:

- a subroutine with at least one formal argument;
- a named local variable;
- a typed return result and a call that consumes it;
- access to a record field;
- a bounds-checked fixed-array read or write;
- one bounded string or string-view operation;
- forward and backward control flow using the initial control floor;
- observable output.

Keep the program small enough that every emitted semantic operation can be audited. Add focused negative inputs for a type mismatch, an invalid field, and an out-of-bounds access not provable safe. These tests distinguish compile-time rejection from an emitted runtime trap.

For the bytecode path, report:

1. compiler-core code and required constant bytes against the 16 KiB gate;
2. peak compiler writable workspace;
3. bytecode interpreter code, constants, and writable state;
4. emitted bytecode size;
5. execution instruction count or cycles under a stated method;
6. the semantic-operation trace that produced the bytecode.

If practical, feed the same semantic-operation trace to a direct Z80 backend. Report that backend's resident bytes, peak workspace, emitted native size, and execution cost under the same workload. Do not infer a winner from host-language implementation size or from an unimplemented opcode table.

## Decision gate

The slice decides whether compact bytecode plus a separate interpreter is the first implementation architecture. Compare it with direct emission on total resident components, the hard compiler-core result, writable pressure, output size, and execution cost. Record which result is measured, which is projected from shared measurements, and which remains a hypothesis.

Do not expand the language or settle the VM organization before this gate. After the gate, add optional constructs one at a time and retain each only after measuring its marginal cost and system-level saving. Required programming-model features may be staged within the slice implementation, but the decision report must show that the final measured path supports all of them.

## Open decisions for the slice

The experiment must resolve, rather than assume:

- stack, memory-backed register, or hybrid VM organization;
- slot widths, frame or region layout, and the regular call/result ABI;
- the first bounded-string representation and operation;
- which checks and call operations belong in bytecode versus shared helpers;
- whether a direct Z80 backend is small enough to justify retaining alongside or instead of the interpreter;
- the activation-storage change required before recursion can be admitted;
- exact component residency and overlays without moving compiler-core code or required constants outside the one-bank gate.

No source syntax, opcode encoding, or numerical saving in this list is settled by this paper. The implementation and ledger must supply the evidence.
