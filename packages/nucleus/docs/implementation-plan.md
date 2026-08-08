# Nucleus 0.1 Implementation Plan

## Status and authority

This document records the construction order, measurement method, and readiness
gates for the first Nucleus compiler and Z80 execution system. It is
non-normative. The Nucleus language specification governs source syntax and
semantics, and the Nucleus VM specification governs bytecode images and
execution. When this plan conflicts with either specification, the plan must be
corrected.

The compiler and target runtime are handwritten Z80 assembly. NVM remains the
normative portable execution format and the reference backend. Direct Z80 code
generation is an equally valid implementation of the native-backend contract in
the VM specification. Early implementation work measures both paths before the
project selects the primary deployment path.

## Project objective

The first implementation must demonstrate that the complete Nucleus 0.1
language can be compiled safely on a small Z80 system. The compiler core and all
immutable data required during compilation must fit in one 16 KiB bank. Compiler
workspace, generated output, the selected target runtime, and execution storage
have separate bounded accounts.

The implementation must preserve one language. A missed size target triggers an
architecture investigation supported by measurements; it does not silently
remove syntax, weaken diagnostics, or create a smaller standard profile.

The 16 KiB compiler-core gate is the acceptance limit for the first
implementation, not a language-conformance rule. Construction proceeds from
measured components rather than from an unmeasured top-down estimate. Every
module reports its code and immutable-data contribution when it first runs, and
the running total is updated before work broadens. A projected total in the
12–13 KiB range triggers an immediate representation and control-flow review
because the remaining integration margin is small.

Compact handwritten assembly may use shared tails, jump tables, overlays,
specialized entry points, and other byte-saving control flow that would be
undesirable in ordinary application code. Register contracts and executable
proofs must still make every entry, exit, clobber, and failure path explicit.
Implementers select such transformations from measured complete paths, not
from source-line count or stylistic preference. A proposed language cut remains
a redesign and requires evidence that implementation economies cannot recover
the required margin.

## Settled implementation boundary

The first implementation follows these directions unless the project owner
explicitly reopens them:

- source is consumed as an ordered multipart byte stream;
- compilation is streaming and single-pass wherever the language permits;
- the compiler builds no abstract syntax tree;
- declarations precede use, with complete forward routine signatures as the
  sole exception;
- one precedence-driven loop parses binary expressions;
- the parser completes a call before classifying `or fail` consumption;
- all routine-local variables are scalar;
- all owned aggregate storage belongs to top-level program objects and their
  inline subobjects;
- aggregate parameters and results use typed, opaque address carriers;
- aggregate assignment copies the complete fixed representation;
- the compiler emits checked semantic operations and performs no Z80 register
  allocation or peephole optimization in either initial backend path;
- every bounded compiler resource has a capacity diagnostic; and
- every runtime-dependent safety condition has the specified trap behavior.

These rules do not expose pointers in the source language. An address carrier is
compiler-managed state with an exact retained referent type, not a source value.

## Existing evidence

The repository already contains executable foundations for the implementation:

| Evidence                                    | Present role                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/grammar-analysis.ts`                   | Checks the collected grammar for recursion, reachability, productivity, and predictive conflicts.                                          |
| `src/type-metadata.ts`                      | Exercises bounded representations for every admitted source type.                                                                          |
| `src/vm-definition.ts`                      | Records the machine-readable opcode, trap, and service assignments.                                                                        |
| `src/vm-image.ts`                           | Builds and validates NVM images.                                                                                                           |
| `src/vm-reference.ts`                       | Executes the specified NVM state transitions on the host.                                                                                  |
| `asm/variant-a.asm` through `variant-c.asm` | Measure alternative Z80 dispatch and slot-addressing arrangements.                                                                         |
| `asm/native-*.asm` and `asm/nvm-*.asm`      | Compare direct templates with partial NVM execution paths for named semantic operations.                                                   |
| `test/`                                     | Checks grammar evidence, type metadata, VM images, interpreter behavior, specification synchronization, and measured assembly experiments. |

This host-side evidence is an executable design oracle. It does not count toward
the Z80 compiler or target-runtime budget, and it cannot override either
specification.

## Initial target configuration

Bring-up uses the flat 64 KiB abstraction permitted by the specifications, with
AZM and the Debug80 runtime providing the first execution environment. The
compiler core is still linked and measured as one self-contained 16 KiB bank.
This configuration exposes ordinary Z80 addressing while the implementation
measures the compiler, target runtime, and workspace independently.

The TEC-1 is the first physical proof target. Its monitor, bank-switching,
keypad, display, and storage adapters follow the portable compiler and service
boundaries. A CP/M adapter or another Z80 environment can use the same
boundaries. Target adapters must not add source syntax or enter the compiler-core
account unless compilation requires them to be resident.

Before Stage 2 begins, the implementation records a concrete memory map for:

- compiler core and immutable tables;
- compiler workspace;
- source and diagnostic adapter state;
- emitted-image staging or bulk-storage output;
- interpreter code and immutable tables;
- native runtime helpers and service adapters;
- slot and dispatch pages;
- loaded NVM code and data;
- activation storage; and
- service buffers.

Before Stage 3 begins, a small adapter contract must carry ordered source-part
events, source bytes, generated output bytes, and diagnostics. The first adapter
may use host callbacks or bulk-storage fixtures, provided it supplies the
compiler core through the same bounded event interface that a native target
adapter will implement.

## Measurement accounts

Every implementation report keeps these accounts separate:

| Account            | Recorded quantity                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Compiler core      | Z80 code plus immutable tables and constants required while compiling.                                                  |
| Compiler workspace | Peak simultaneously live writable tokenizer, parser, symbol, type, fixup, diagnostic, and emission state.               |
| Generated output   | NVM image bytes or native code, static data, relocation or fixup records, and any required startup image.               |
| NVM interpreter    | Z80 code, immutable dispatch and service data, loader or validator code, and fixed writable machine state.              |
| Native runtime     | Shared Z80 checks, arithmetic helpers, service adapters, call machinery, and fixed writable runtime state.              |
| Execution storage  | Slot page, staged arguments, completion carriers, activation arena, loaded code and data, and service buffers.          |
| Execution cost     | Executed Z80 instructions and T-states for named programs and input conditions.                                         |
| Complete system    | Compiler plus the selected target runtime and one named generated program, with mutually exclusive paths kept separate. |

A report labels each number **Measured**, **Projected**, or **Hypothesis**.
Measured entries name the assembly and harness. Projected entries give their
measured basis and arithmetic. Unknown values remain open.

## Backend decision rule

The front end produces checked semantic operations as it parses. It sends each
operation immediately to an output sink; it does not retain an abstract syntax
tree or a complete intermediate program. An NVM sink encodes the operation as
bytecode. A native sink expands it into a fixed Z80 template or a call to a
shared helper. Both sinks use the same resolved types, slot assignments, branch
fixups, source positions, and safety decisions.

This boundary prevents the backend experiment from creating two languages or
two semantic analyzers. It also avoids an unnecessary NVM serialization step in
the native path. NVM bytecode remains available as a conformance oracle and a
portable execution format even if direct code generation becomes the first
deployment path.

The decision compares complete, mutually exclusive configurations:

1. compiler core with NVM encoder, generated NVM image, loader, validator,
   interpreter, and execution state;
2. compiler core with native template emitter, generated Z80 code and data,
   shared native helpers, service adapters, and execution state.

The comparison reports compiler bytes, peak compiler workspace, emitted program
bytes, target-runtime bytes, writable execution state, instruction count,
T-states, and preserved safety behavior. It also records the trust model: NVM
accepts structurally valid images from outside the compiler and therefore needs
image validation and generic data-region checks; native code emitted and loaded
as one compiler-controlled program may discharge some structural facts during
compilation. Those are different products and must not be made to look equal by
omitting the extra guarantee from one account.

No single loop, handler, or source example selects the backend. Stage 4 supplies
a representative decision slice before implementation broadens around one
path. The project records the evidence and the selected path. The other backend
remains an oracle or an optional later target unless maintaining it has a
measured, accepted cost.

## Initial backend measurements

The current AZM and Debug80 spikes measure two native templates. They perform no
register allocation or peephole optimization.

| Program and path                                      |                                                                      Code account |                                 Execution | Status                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------: | ----------------------------------------: | ---------------------------------------------------------------------------- |
| fixed-slot sum from 0 through 99, direct Z80          |                                                                          63 bytes |   19,218 T-states; 1,310 Z80 instructions | Measured by `asm/native-slot-loop.asm` and `test/native-backend.test.ts`     |
| same loop, experimental NVM variant B                 | 162-byte interpreter core + 14-byte experimental dispatch table + 30-byte program | 100,251 T-states; 14,114 Z80 instructions | Measured by `asm/variant-b.asm` and `test/native-backend.test.ts`            |
| checked four-byte array selection, direct Z80 success |                    55-byte complete proof; 31-byte shared selection-and-trap body |         172 T-states; 15 Z80 instructions | Measured by `asm/native-checked-index.asm` and `test/native-backend.test.ts` |
| same selection, direct Z80 bounds trap                |                                                                         same code |         125 T-states; 12 Z80 instructions | Measured by the alternate proof entry                                        |
| same selection, partial NVM success                   |      185-byte interpreter core + 166-byte sparse dispatch table + 16-byte program |      1,755 T-states; 193 Z80 instructions | Measured by `asm/nvm-checked-index.asm` and `test/native-backend.test.ts`    |
| same selection, partial NVM bounds trap               |                                                                         same code |         831 T-states; 89 Z80 instructions | Measured by the out-of-range bytecode fixture                                |

The NVM loop is a seven-opcode experimental interpreter, not the complete NVM
runtime. The checked-index interpreter implements only `LDI16`, `INDEX`,
`LOAD8`, and `RET`; its generic positive-stride multiplication uses a small
repeated-add loop rather than a selected production algorithm. The native array
proof relies on a compiler-established typed base and measures the dynamic index
check. The NVM `INDEX` handler also defends the generic data-region boundary.
Neither experiment includes a loader, validator, calls, recursion, failure
propagation, services, aggregate results, aggregate copying, or a Z80-resident
compiler. The measurements justify continuing the native experiment. They do
not establish which complete system is smaller.

## Current readiness baseline

The repository is not yet at Stage 2. The present evidence establishes the
machine definition and several representative paths, but it does not yet satisfy
the complete vector obligations in the VM specification.

| Area                | Current evidence                                                                                                                       | Work before Z80 translation                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specifications      | Review found the language, VM, and reviewer authorities consistent at revision `6088a08`; the matching reading editions are published. | Treat later normative changes as explicit corrections or redesigns and review them before implementation depends on them.                                   |
| Grammar             | The collected grammar is analyzed mechanically and its three predictive conflicts are locked by tests.                                 | Preserve the result while adding the source compiler; no new grammar work is planned.                                                                       |
| Type metadata       | Compact structural metadata and alias-category separation have executable tests.                                                       | Measure inline metadata against interned ordinals in Z80 before selecting the first representation.                                                         |
| Image format        | Exact image builders, the minimal image, initializer application, and representative rejection paths have tests.                       | Complete every Chapter 19 rejection vector and every completion-shape combination.                                                                          |
| Reference execution | Scalar operations, representative layout checks, calls, failures, services, traps, and argument-mask checks execute on the host.       | Fill the Chapter 20 matrix: call extremes and recursion, all failure shapes, all services and errors, aggregate-copy cases, and atomic capacity boundaries. |
| Source corpus       | Chapter 21 records expected accepted and rejected behavior.                                                                            | Add a compiler-to-NVM harness after a source compiler exists; fixture images may cover VM behavior first.                                                   |
| Z80 evidence        | Three dispatch variants and two direct-native templates assemble and run through the measurement harness.                              | Complete the Stage 4 decision slice; the current variants are measurements, not a partial conforming interpreter or native backend.                         |

`npm test -w nucleus` is the host-evidence baseline. `npm run measure -w
nucleus` rebuilds its AZM and runtime dependencies before assembling and running
the Z80 measurement variants.

## AZM and Debug80 proof architecture

The first Z80 implementation follows the proof-driven approach established in
TECM8, with a smaller and more regular harness. A proof is an AZM source program
that includes or links the production assembly under test, runs at a declared
address in a declared memory map, and exposes a small set of named observations.
The host assembles the proof, loads it into Debug80, executes it with a finite
instruction or cycle limit, and compares those observations with the host
oracle.

Use three proof scales:

1. **Module proofs** exercise one tokenizer, parser, image, or interpreter
   boundary with minimal machine state.
2. **Boundary proofs** exercise a complete contract between two components,
   such as compiler emission followed by image loading, or service invocation
   followed by completion handling.
3. **Milestone proofs** execute one visible end-to-end program for the current
   build stage. They do not replace the smaller proofs.

Every production routine has an AZM register contract. Calls into code not
assembled from the same annotated source use a small `.asmi` interface rather
than copied declarations. Strict contract checking is part of the normal Z80
gate, not an occasional audit.

A proof reports through named symbols and bounded state, chosen from:

- a terminal pass, diagnostic, trap, or error marker;
- emitted bytes and the output cursor;
- the current source position;
- selected compiler tables and their high-water marks;
- NVM or native registers, slots, data bytes, activation state, and service
  output; and
- instruction, cycle, code-size, and writable-memory totals.

The host harness owns assembly, machine construction, step limits, symbol
lookup, oracle comparison, and failure diagnostics. Individual proof manifests
provide only the source file, memory profile, entry and stopping conditions,
fixtures, and expected observations. This keeps new proofs data-driven and
avoids a separate TypeScript runner for every assembly file. A failed proof must
report at least the program counter, stack pointer, recent program counters,
terminal marker, and the observation that differed.

Fresh AZM output is the measurement authority. Checked-in binaries and
last-run reports, if retained for inspection, are never used as the build or
size baseline. Manual Debug80 sessions supplement automated proofs; they are not
release gates by themselves.

Each stage adds its module and boundary proofs before its milestone proof. The
ordinary repository gate assembles and runs the fast proof set, checks register
contracts, and enforces hard code and memory budgets. Longer full-corpus and
target-profile proofs may run as a second named gate, but the command is
generated from the proof manifest rather than maintained as a chain of script
names.

## Build order

### Stage 0: freeze the reviewed contracts

Before implementation branches depend on the formats, complete the current
language and VM adversarial reviews. Record the accepted specification commit,
the opcode-table checksum or generated equality test, and the conformance-corpus
revision. Later normative corrections require an explicit compatibility review.

Completion evidence:

- no unresolved correctness finding remains;
- grammar and opcode synchronization tests pass;
- the authoritative documents and published reading editions are identical;
  and
- the implementation begins from one recorded specification revision.

### Stage 1: preserve the executable oracle

Complete any missing host vectors before translating the machinery into Z80.
The host suite must cover every opcode transition, image-validity rule, service,
trap, argument-mask shape, activation boundary, aggregate-copy case, and
accepted or rejected source program required by the specifications.

This stage does not require a production host compiler. Small fixture builders
may produce exact images while the Z80 front end is still absent. Any temporary
source-to-image harness must use the normative grammar and semantic rules rather
than defining a second language.

Completion evidence:

- every required VM vector has an executable host test;
- the reference interpreter passes the vectors;
- every accepted Chapter 21 program has a recorded expected behavior; and
- every rejected Chapter 21 program has a recorded rejection reason.

### Stage 2: dual execution spines

Implement the smallest complete NVM execution path in Z80:

1. fixed header and routine descriptor decoding;
2. atomic image-capacity checks;
3. initializer application;
4. slot and dispatch pages;
5. `RET`, `TRAP`, and the minimum scalar load, store, branch, and service
   handlers; and
6. terminal result reporting.

The first executable image is the canonical 43-byte minimal image from the VM
specification. The next image writes one byte through the standard service.

In parallel, implement direct native templates for the same two semantic
programs. The native path includes only the startup and service machinery that
the programs use. The templates consume the same fixed-slot semantic operations
as the NVM encoder; hand-shaped register allocation is outside this experiment.

Completion evidence:

- both NVM images validate and execute on the host model and Z80 interpreter;
- both native programs produce the same final state, service bytes, and trap
  records;
- loader, interpreter, native runtime, fixed-state, and execution costs are
  measured separately; and
- malformed NVM images fail atomically, and the native proof rejects an
  unresolved or out-of-range fixup before loading code.

### Stage 3: compiler spine and output sinks

Implement one end-to-end source path before filling out the language breadth:

```nucleus
sub main() fails
    writeOutputByte('A') or fail
end
```

The path requires multipart input, tokenization, the top-level declaration
sequence, one routine header and body, one call statement, failure propagation,
output construction, and source-positioned diagnostics. It deliberately avoids
operator expressions, locals, user routines, and data layout until the compiler
can emit and run a complete program.

The checked front end writes through a small semantic-operation sink. The NVM
sink emits the canonical image. The native sink emits Z80 templates and bounded
fixups without first creating NVM bytecode. Neither sink may change evaluation
order, failure behavior, source diagnostics, or safety checks.

Completion evidence:

- the Z80 compiler consumes the source as a byte stream and can emit a valid
  NVM image or a native Z80 program from the same semantic actions;
- the host model, Z80 interpreter, and native program all produce `A` on
  success;
- a forced service failure produces the specified unhandled-error outcome;
- malformed source produces a source-positioned diagnostic; and
- the common front end, each output sink, and peak workspace are reported as
  separate accounts.

### Stage 4: representative backend decision slice

Before either path grows into the full implementation, compile and execute the
same narrow program set through both sinks:

1. fixed-slot scalar arithmetic and a counted loop;
2. checked fixed-array selection on success and at the bounds trap;
3. a user-routine call and bounded scalar recursion;
4. a failable call on success, local handling, and propagation;
5. a standard service on success and failure;
6. aggregate parameter selection and a transient aggregate result; and
7. exact aggregate copying at a small and a larger fixed extent.

The slice implements only the operations needed by those proofs, but each
operation obeys the complete source semantics. The NVM account includes its
loader and required validator. The native account includes all shared helpers,
call machinery, safety paths, and service adapters required by the slice.

Completion evidence:

- both paths agree with the host oracle on every normal, failure, and trap
  outcome;
- the compiler reports the common front end and the two mutually exclusive
  output sinks separately;
- complete generated-program, target-runtime, writable-state, instruction, and
  T-state accounts are reported for every proof;
- the comparison records which checks are runtime operations and which facts a
  compiler-controlled native image establishes statically; and
- the project records one primary implementation path before Stage 5 begins.

### Stage 5: scalars, expressions, and structured control

Add scalar constants, program variables, scalar parameters and locals,
precedence-driven expressions, conversions, assignment, `if`, `while`, and
counted `for`. Emit branches through bounded fixup state and preserve the
specified left-to-right and short-circuit behavior.

The stage ends with scalar recursion and every scalar safety trap, including the
wide-bound `u8` counted-loop case.

Completion evidence:

- arithmetic and comparison behavior matches the host model at all width
  boundaries;
- constant folding matches runtime width and wraparound rules;
- direct and mutual recursion preserve active scalar state;
- every bounded table and nesting stack has an exercised capacity diagnostic;
  and
- compiler, selected-runtime, generated-program, activation, and timing deltas
  are recorded by feature group.

### Stage 6: aggregate layout and static images

Add nominal records, fixed arrays, bounded strings, recursive positional
program initializers, packed offsets, and initializer records. Aggregate
storage is allocated only while processing top-level program declarations.

Completion evidence:

- emitted layouts match the VM layout vectors byte for byte in both backends;
- zero and explicit initializers produce identical host, NVM, and native data
  images;
- incorrect counts, nesting, types, and string lengths produce diagnostics;
- NVM initializer application remains atomic after complete image validation,
  and native startup exposes no partially applied data image; and
- type-metadata and initializer workspace limits are measured.

### Stage 7: aggregate calls, results, and copying

Add aggregate parameter carriers, checked selection, transient aggregate
results, carrier preservation across intervening calls, and exact-type
aggregate assignment. Measure straight-line copying, a counted byte-copy loop,
and any shared native helper before selecting a lowering policy for either
backend.

Completion evidence:

- Chapter 21 caller-supplied destination and selection-forwarding programs
  produce their required output;
- no source operation can inspect, store, convert, compare, or calculate with
  an address carrier;
- every aggregate result is consumed in its containing operation;
- nested calls preserve live transient carriers; and
- copy lowering validates both complete regions before the first store.

### Stage 8: complete calls, failures, services, and validation

Complete packed activations, sixteen argument positions, early returns,
recoverable failure, local handling, propagation, all services, and all traps.
If NVM is the selected deployment path, complete its structural validator,
including completion shapes and argument-mask data flow. If native Z80 is the
selected path, complete the corresponding load, fixup, and compiler-controlled
image-integrity rules. NVM validation remains part of the reference backend.

Completion evidence:

- every applicable VM Chapter 20 vector passes on the Z80 interpreter and the
  selected execution path;
- activation byte and depth exhaustion are atomic;
- every service and failure path preserves its specified destination and
  cursor effects; and
- validator or native image-integrity cost is measured separately from
  execution code.

### Stage 9: complete corpus and final accounting

Compile every accepted Chapter 21 program with the Z80 compiler, run it through
the selected execution path, and reject every invalid program before execution.
The NVM reference path validates and runs the corresponding image for every
program. Report all resource accounts for the complete implementation.

The architecture passes only when the compiler core and immutable compilation
data fit the 16 KiB gate and every conformance program fits the published
capacities. If it fails, use the component ledger to select a semantics-
preserving representation or lowering experiment. Do not infer the cause from
source size or host measurements.

## Capacity ledger

The first implementation fixes a numeric limit before each bounded structure is
used. Each row remains open until a Z80 representation and a minimum corpus
requirement are both known.

| Resource                                  |                 Limit | Representation            | Excess diagnostic or trap                      | Evidence                 |
| ----------------------------------------- | --------------------: | ------------------------- | ---------------------------------------------- | ------------------------ |
| source part count                         |                  open | open                      | capacity diagnostic                            | open                     |
| diagnostic-name bytes                     |                  open | open                      | capacity diagnostic                            | open                     |
| identifier bytes                          |                  open | open                      | capacity diagnostic                            | open                     |
| ordinary symbols                          |                  open | open                      | capacity diagnostic                            | open                     |
| record types and fields                   |                  open | open                      | capacity diagnostic                            | open                     |
| retained forward signatures and names     |                  open | open                      | capacity diagnostic                            | open                     |
| parameters and scalar locals              |                  open | open                      | capacity diagnostic                            | open                     |
| expression and statement nesting          |                  open | open                      | capacity diagnostic                            | open                     |
| branch fixups and active loops            |                  open | open                      | capacity diagnostic                            | open                     |
| structured-initializer depth and elements |                  open | open                      | capacity diagnostic                            | open                     |
| emitted image bytes                       | 65,535 format maximum | open                      | capacity diagnostic below or at format maximum | format rule; target open |
| activation bytes                          |                  open | packed records            | `activation-capacity`                          | open                     |
| activation depth                          |                  open | counter plus packed arena | `activation-capacity`                          | open                     |
| service stream and bulk-storage extents   |                  open | target adapter            | service error or documented host capacity      | open                     |

No implementation may wrap, truncate, drop state, or change source meaning when
one of these limits is exceeded.

## Working discipline

Implementation changes follow a short evidence loop:

1. identify the governing language and VM rules;
2. add or select an executable vector;
3. implement the smallest complete semantic path;
4. assemble and measure it;
5. compare behavior with the host oracle;
6. update the cost and capacity ledgers; and
7. classify any proposed change as a correctness repair, a semantics-preserving
   economy, or a redesign requiring project-owner approval.

An implementation experiment may remain on a branch or behind a harness. It
must not alter the published language merely because it is smaller in isolation.
Measurements compare complete accounting boundaries and equivalent semantics.

## Readiness checklist

Implementation may begin when:

- the current adversarial specification review is resolved;
- the specifications, reviewer charter, and published editions agree;
- machine-readable opcodes, traps, services, and image fields are synchronized;
- the host image validator and reference interpreter pass their complete suites;
- every Chapter 21 program has a source-level expected result;
- the initial compiler input/output and diagnostic transport are selected;
- the Z80 memory map identifies the compiler bank, compiler workspace, generated
  program destination, target-runtime regions, loaded code and data, and
  activation arena without overlap; and
- the measurement harness reports compiler bytes, immutable data, peak
  workspace, target-runtime bytes, runtime state, emitted bytes, and T-states
  as separate accounts.

The first source implementation task is Stage 3 only after Stages 0 through 2
have supplied a stable machine target. Work may prepare tests and measurements
for later stages without widening the first slice.
