# Nucleus 0.1 Implementation Plan

## Status and authority

This document records the construction order, measurement method, and readiness
gates for the first Nucleus compiler and Z80 execution system. It is
non-normative. The Nucleus language specification governs source syntax and
semantics, and the Nucleus VM specification governs bytecode images and
execution. When this plan conflicts with either specification, the plan must be
corrected.

The compiler and target runtime are handwritten Z80 assembly. Direct Z80 code
generation is the primary deployment path. NVM remains the normative portable
execution format and the host-side reference oracle; the first implementation
does not grow a resident NVM interpreter beyond the completed comparison
spikes. Both sinks continue to consume the same checked semantic operations so
that the host validator and reference VM can test the native path independently.

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
- the compiler emits checked semantic operations and initially uses fixed Z80
  templates without register allocation or whole-program optimization;
- each working increment then receives a proof-preserving size pass that may
  share tails and prefixes, exploit fall-through and live flags, or replace
  repeated inline sequences with calls when the measured byte trade is
  favorable;
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

Physical proof begins on constrained Z80 hardware. A TEC-1 adapter is an early
adapter rather than an architectural target; CP/M and other Z80 environments
use the same compiler and service boundaries. Target adapters must not add
source syntax or enter the compiler-core account unless compilation requires
them to be resident.

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

The current Stage 4 front end produces checked semantic operations as it parses
and retains no abstract syntax tree or parser-specific program record. The
present proof sink records a bounded semantic transcript: eleven bytes for the
loop program, fourteen for the array program, and sixteen for the scalar call
program. The selected backend consumes that transcript after parsing succeeds.
This is a deliberate narrow-slice economy, not the intended final buffering
policy. A measured sink that emitted native code while the parser was still
active required more code and simultaneously live state; the rejected
experiment is recorded below. The
separate Stage 3 proof remains a historical narrow slice and is not linked into
the current compiler spine. It shares the current source adapter, so reductions
to that common module still update its measured account.

An NVM sink encodes the checked transcript as bytecode. A native sink emits Z80
instructions, fixed fragments, and calls to shared helpers. Both sinks use the
same resolved types, slot assignments, branch fixups, source positions, and
safety decisions. Later slices must remeasure direct sink emission when a
general semantic dispatcher can replace enough fixed encoder code to pay for
it.

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

The Stage 3 and early Stage 4 measurements selected direct Z80 as the primary
implementation path. New vertical slices therefore implement and optimize the
native sink first. The NVM sink remains a host-validated comparison oracle and
portable output experiment; no new Z80-resident interpreter handler is required
unless later measurements reopen that decision.

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

Stages 2 and 3 are executable, and Stage 4 now includes counted-loop, checked
array, and scalar-recursion increments. These remain narrow proofs rather than
a complete compiler. The repository does not yet satisfy the complete vector
obligations in the VM specification.

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

#### First completed compiler slice

The first Stage 3 path is executable. `test/proof-harness.test.ts` assembles the
Z80 compiler and both target paths with AZM, runs them through Debug80, and
checks the emitted NVM image again with the host validator and reference VM.
The accepted program produces `A`. Forced output failure produces
`unhandled-error` with `outputFailure` and no output byte. A source with its
closing `end` removed is rejected at source part 9, byte offset 50, line 3,
column 1.

These are measured narrow-slice accounts, not projections for the completed
language:

| Account                                             |                             NVM path |                      Direct-Z80 path |
| --------------------------------------------------- | -----------------------------------: | -----------------------------------: |
| common front-end code                               |                            941 bytes |                            941 bytes |
| common keyword and name bytes                       |                             36 bytes |                             36 bytes |
| backend sink code                                   |                             25 bytes |                             25 bytes |
| backend template bytes retained by the compiler     |                             58 bytes |                             37 bytes |
| complete compiler core for this path                |                          1,060 bytes |                          1,039 bytes |
| peak compiler workspace                             |                             55 bytes |                             55 bytes |
| generated program                                   |                             58 bytes |                             37 bytes |
| target runtime code                                 |                            487 bytes |                             51 bytes |
| target runtime immutable data                       |                             57 bytes |                              0 bytes |
| target writable state                               |                             22 bytes |                              6 bytes |
| shared service state                                |                              3 bytes |                              3 bytes |
| complete compile, success, and forced-failure proof | 6,298 instructions / 63,632 T-states | 4,754 instructions / 49,562 T-states |

The NVM proof includes validation and loading before each run; the direct path
executes compiler-controlled output and therefore has no corresponding image
loader. A separate malformed-image proof takes 447 instructions and 4,909
T-states and confirms that NVM rejection leaves runnable state unchanged. The
source-compiler proof uses 977 core bytes and 55 workspace bytes and exercises
both accepted and malformed input in 8,825 instructions and 90,816 T-states.

This result does not choose a backend. The program has no expressions, locals,
user calls, data layout, or general control flow, so it strongly favors a
direct template. Stage 4 remains the decision slice because it introduces the
shared machinery and safety paths that can change the comparison.

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

#### First Stage 4 increment: scalar local and counted loop

The first Stage 4 increment compiles this program through both sinks:

```nucleus
sub main() fails
    var index as u8 = 0
    for index = 0 until 3
        writeOutputByte('A') or fail
    end
end
```

Both executions produce `AAA`. Companion proofs cover a zero-iteration loop,
exclusive-bound termination, failure on the second service call, source
rejection when the body assigns to the active counter, and a positioned
diagnostic when an `end` is missing. The emitted NVM image also passes the host
validator and produces the same output on the reference VM. Both target proofs
also leave `index` at `2`, showing that an exclusive loop exits without storing
the crossed bound.

The sinks construct their output byte by byte. The NVM sink retains and patches
three word branch targets. The native sink retains three forward relative
fixups, patches the backward edge, and checks that every relative displacement
fits. The 80-byte workspace account includes those bounded fixup addresses.

| Account                                         |                               NVM path |                        Direct-Z80 path |
| ----------------------------------------------- | -------------------------------------: | -------------------------------------: |
| common front-end code                           |                            1,304 bytes |                            1,304 bytes |
| common keyword and name bytes                   |                               56 bytes |                               56 bytes |
| backend sink code                               |                              453 bytes |                              455 bytes |
| backend immutable bytes retained during compile |                               42 bytes |                                0 bytes |
| complete compiler core                          |                            1,855 bytes |                            1,815 bytes |
| peak compiler workspace                         |                               80 bytes |                               80 bytes |
| generated program                               |                               96 bytes |                               54 bytes |
| target runtime code                             |                              797 bytes |                               85 bytes |
| target runtime immutable data                   |                               96 bytes |                                0 bytes |
| target writable state                           |                               32 bytes |                                6 bytes |
| shared service state                            |                                7 bytes |                                7 bytes |
| complete proof execution                        | 43,759 instructions / 415,315 T-states | 35,245 instructions / 336,248 T-states |

The 96-byte NVM output consists of a 42-byte image envelope and 54 bytes of
bytecode. The direct program is also 54 bytes. The generated instruction
payloads are therefore equal in this increment; the NVM image is larger because
it carries its portable header, routine descriptor, and empty initializer
section.

The source-only proof uses a 1,360-byte core and the same 80-byte workspace. It
checks four sources in 38,939 instructions and 376,553 T-states. Relative to
the first source-only compiler, decimal byte literals, five additional
keywords, one fixed local binding, nested-loop parsing, the counter-write rule,
and the larger semantic stream add 377 core bytes and 25 workspace bytes. The
complete backend cores add 789 bytes on the NVM path and 770 bytes on the native
path relative to the first Stage 3 executables.

This increment recognizes one fixed `u8` local named `index`, byte constants,
one positive unit-step `until` loop, and the existing output call. It has no
general symbol table, expressions, arbitrary statements, `to`, `step`, wide
bounds, or loop-range path. The result measures the first control-flow growth;
it does not complete item 1 or select a backend.

#### Second Stage 4 increment: initialized array and checked selection

The second increment adds one program-scope initialized array, failable input,
a checked dynamic selection, and failable output:

```nucleus
var bytes as u8[4] = [65, 66, 67, 68]

sub main() fails
    var index as u8 = readInputByte() or fail
    writeOutputByte(bytes[index]) or fail
end
```

Input byte `1` produces `B`. Input byte `4` performs `bounds` before any array
read or output. Empty input propagates `endOfInput`, and a forced output failure
propagates `outputFailure` without publishing a byte. The compiler also proves
the exact four-byte static image, rejects a missing initializer comma at its
source position, and reports output capacity without publishing a partial
program or changing runnable state.

Direct Z80 is the production experiment for this increment. The NVM sink emits
an 89-byte comparison image that the host validator and reference VM execute;
the Z80-resident NVM interpreter is unchanged.

| Account                    |                        Direct-Z80 path |                   Host-only NVM oracle |
| -------------------------- | -------------------------------------: | -------------------------------------: |
| common front-end code      |                            1,680 bytes |                            1,680 bytes |
| backend sink code          |                              772 bytes |                              801 bytes |
| compiler immutable data    |                               74 bytes |                              114 bytes |
| complete compiler core     |                            2,526 bytes |                            2,595 bytes |
| peak compiler workspace    |                               90 bytes |                               90 bytes |
| generated program or image |                               74 bytes |                               89 bytes |
| native runtime code        |                              122 bytes |                         not applicable |
| native writable state      |                               20 bytes |                         not applicable |
| complete proof execution   | 50,326 instructions / 478,188 T-states | 15,370 instructions / 146,120 T-states |

Relative to the preceding direct compiler, the new source and backend behavior
adds 711 compiler-core bytes and 10 workspace bytes. That delta includes three
new delimiters, the array declaration and initializer path, input service
state, static-data emission, checked address formation, three distinct failure
paths, and their diagnostics. It is not a projection for arbitrary arrays or
expressions.

The first correct direct implementation occupied 2,939 compiler-core bytes.
The size pass reduced it by 413 bytes without changing the accepted source,
semantic stream, 74-byte generated program, or proof outcomes:

| Transformation                            |     Front end |   Native sink |         Total |
| ----------------------------------------- | ------------: | ------------: | ------------: |
| shared token-expectation and parser tails |     219 bytes |             — |     219 bytes |
| shared opcode-plus-operand emission tails |             — |     141 bytes |     141 bytes |
| shared success and trap emission suffixes |             — |      53 bytes |      53 bytes |
| **measured reduction**                    | **219 bytes** | **194 bytes** | **413 bytes** |

The smaller compiler executes 554 more Z80 instructions and 5,301 more
T-states in the complete direct proof because several inline parser and emitter
sequences became calls or compact loops. This is an accepted compile-time trade:
resident compiler bytes are the binding constraint, generated execution is
unchanged, and every safety and atomicity proof remains green. TECM8's shared
save paths and the repository's existing common Boolean return tails provide
local precedent for the same control-flow style.

#### Consolidation plateau before the next feature

A second pass replaced the parser's fixed parsed-value record and whole-program
semantic replay with semantic operations emitted as each construct completes.
It then measured the repeated structures exposed by the loop and array paths.
The accepted changes reduce the 2,526-byte direct compiler by another 371 bytes:

| Transformation                                                                              | Core reduction |
| ------------------------------------------------------------------------------------------- | -------------: |
| streaming semantic operations; remove ten parsed-value bytes                                |       77 bytes |
| compact variable-length keyword table                                                       |       93 bytes |
| shared delimiter and logical-newline tails                                                  |       53 bytes |
| shared routine-ending and propagation tails; one initializer loop                           |       28 bytes |
| increment the semantic-operation count in place                                             |        3 bytes |
| shared emitter lifecycle, current-position patching, placeholders, and initializer emission |       94 bytes |
| shared generated success and trap ending                                                    |       14 bytes |
| inline two emitter wrappers with one caller each                                            |        6 bytes |
| shared simple-punctuation token tail                                                        |        3 bytes |
| **measured reduction**                                                                      |  **371 bytes** |

Each row is the difference between two complete passing proof builds. At every
checkpoint the harness measured compiler core, peak workspace, generated
output, instructions, and T-states. The loop and array outputs remained 54 and
74 bytes respectively; the final plateau values below replace the intermediate
measurements as the locked baseline.

An opcode-plus-operand wrapper reaches byte break-even at three callers. The
current emitter retains wrappers with at least three sites and inlines the two
one-site cases. Future emitter work repeats this census instead of adding a
wrapper before its shared tail pays for the call site.

The workspace fell from 90 to 44 bytes. Ten parser-owned value bytes
disappeared with semantic streaming. The semantic transcript was then bounded
to its measured fourteen-byte maximum. Emitter scratch overlays source,
tokenizer, diagnostic, and sink fields whose lifetimes have ended; the six
token-position bytes required for an emitter diagnostic remain untouched. The
live sink cursor and count reuse diagnostic fields that an error overwrites
before returning.

The final direct compiler account is:

| Subsystem                         |     Bytes |
| --------------------------------- | --------: |
| source adapter                    |       106 |
| tokenizer                         |       558 |
| semantic transcript sink          |        60 |
| parser                            |       679 |
| native output sink                |       658 |
| keyword, name, and immutable data |        94 |
| **compiler core**                 | **2,155** |
| peak writable workspace           |        44 |

These boundaries are labels in `array-native-slice-proof.asm`; the proof
manifest and test lock every extent independently. A later reduction cannot be
credited to the wrong subsystem or hidden by movement across an account
boundary.

The complete direct proof now executes 411 more compiler and proof instructions
than the 2,526-byte baseline, but takes 2,811 fewer T-states. Keyword ordering
puts the most frequent names first, offsetting the calls introduced by shared
tails. Generated native code remains 74 bytes and has identical runtime
behavior.

Two measured alternatives were rejected:

- A fixed-width keyword table containing pointers reduced the then-current core
  by 70 bytes. The variable-length table reduced it by 93 bytes and avoided IX
  traffic, so only the smaller representation remains.
- Sending semantic operations directly into the native sink during parsing
  raised the then-current direct compiler from 2,178 to 2,327 bytes and raised
  workspace from 44 to 54 bytes. It reduced the complete array proof to 49,137
  instructions and 460,626 T-states, but compile speed does not justify 149
  resident bytes at this stage. The experiment preserved the 74-byte output,
  exact diagnostics, and atomic publication. Remeasure it after general
  statements or expressions can replace the fixed encoders with a shared
  dispatcher.

Simple punctuation first shared one tail. The post-call pass replaces its three
separate comparisons with a three-entry character-to-token table; the complete
compiler is smaller despite the six immutable table bytes. Sparse delimiters
retain their specialized paths. The loop and array encoders remain positional.
They should move to the general dispatcher only when replacing the fixed
encoders produces a measured net reduction.

#### Third Stage 4 increment: scalar calls and bounded recursion

The third increment adds one retained forward signature, one scalar parameter
and result, an abbreviated forward completion, direct call fixups, and bounded
recursion:

```nucleus
forward sub descend(value as u8) as u8

sub main() fails
    var result as u8 = descend(3)
    writeOutputByte(result) or fail
end

sub descend
    if value = 0
        return value
    end
    return descend(value - 1)
end
```

The native program writes byte zero. Four active `descend` calls fit; a proof
with a depth limit of three performs `activation-capacity` before the fourth
activation begins. Both outcomes restore the packed activation arena to empty.
The parser retains the forward and parameter names as source pointer-and-length
pairs, checks the call and abbreviated body by exact identity, and rejects a
mismatched completion at its source position.

Those retained pointers are an economy of this one-part slice, whose source
buffer remains resident until emission finishes. A general multipart compiler
must copy or intern every retained forward and parameter name under a published
capacity. The slice also admits only one retained forward and one unresolved
call fixup. Before a second forward or unresolved call is accepted, the
implementation must replace those cells with bounded collections and report a
capacity diagnostic rather than overwrite either entry. Emission remains a
separate post-parse pass while emitter scratch overlays the retained signature;
an interleaved emitter would require disjoint live state or a different
retention scheme.

The direct backend now walks a variable-width semantic transcript through a
dense ordinal dispatcher. An isolated AZM census measured the eight-operation
word-table selector at 37 bytes and an equivalent comparison chain at 42 bytes.
A one-byte page-offset selector needs only 23 bytes when every handler entry
shares one 256-byte page. The current handlers occupy more than one page; eight
page-local jump trampolines raise that alternative to 47 bytes. The 37-byte
word table therefore remains the smallest applicable form. It destroys the
operation ordinal in `A`; none of the current handlers needs that value, and a
future handler that does must trigger a new complete-path measurement.

Forward declarations and entry markers do not enter the transcript because
they emit no target operation. Removing those two no-ops and sharing repeated
parser and emitter tails reduced the first working call compiler from 3,135 to
3,068 bytes. The packed one-byte activation slice derives its arena position
from its depth counter; this reduced the native runtime from 216 to 196 bytes
and writable native state from 18 to 17 bytes while retaining an independent
arena-capacity guard. The consolidation pass described below reduces the same
compiler to 2,862 bytes.

| Account                    |                        Direct-Z80 path |                   Host-only NVM oracle |
| -------------------------- | -------------------------------------: | -------------------------------------: |
| common front-end code      |                            1,715 bytes |                            1,715 bytes |
| backend sink code          |                            1,008 bytes |                              139 bytes |
| compiler immutable data    |                              139 bytes |                              139 bytes |
| complete compiler core     |                            2,862 bytes |                            1,993 bytes |
| peak compiler workspace    |                               51 bytes |                               51 bytes |
| generated program or image |                               99 bytes |                              102 bytes |
| native runtime code        |                              196 bytes |                         not applicable |
| native writable state      |                               17 bytes |                         not applicable |
| complete proof execution   | 61,921 instructions / 611,019 T-states | 21,342 instructions / 213,740 T-states |

The first working call compiler added 913 bytes to the preceding 2,155-byte
plateau. After consolidation the difference is 707 bytes. Neither number is a
projection for arbitrary calls. The increment includes three keywords, exact
forward and parameter retention, the new routine grammar path, scalar result
flow, recursive native code generation, the first general semantic dispatcher,
activation diagnostics, and all retained names and error paths. The
call-specific parser path now occupies 341 bytes and the call backend 332
bytes; their enclosing front end and sink accounts also contain the earlier
loop and array machinery.

The NVM path is deliberately a host oracle, not a production sink comparison.
Its 139-byte encoder copies and patches a fixed 102-byte image, which the host
validator and reference VM execute independently. Both runs write zero and
perform `activation-capacity` at depth three. The NVM trap record identifies
routine ordinal one and code offset 46. The native path reports source byte
offset 201 for activation exhaustion and byte offset 95 for output failure.
The native proof checks both locations, exact transcript consumption, the four
successful active calls, the depth-three high-water state, the untouched
fourth arena byte on rejection, empty output, and complete unwind.

#### Consolidation plateau after scalar calls

The post-call size pass retained every accepted source, diagnostic position,
semantic transcript, generated byte, runtime helper, trap, and proof outcome.
It reduced the direct compiler core from 3,068 to 2,862 bytes. Compiler code
fell by 212 bytes while immutable data grew by six bytes for the punctuation
table, giving a net reduction of 206 bytes. Workspace fell from 54 to 51 bytes.

| Transformation                                                           | Core reduction |
| ------------------------------------------------------------------------ | -------------: |
| remove parser wrappers with one caller                                   |       28 bytes |
| encode ordinary expected-token diagnostics from the token ordinal        |       72 bytes |
| table-drive simple punctuation and shorten character scanning            |       11 bytes |
| remove redundant EOF and token-finalization state                        |       18 bytes |
| preserve the array initializer counter only at its one required site     |        2 bytes |
| retain the semantic-operation count in a register during dispatch        |        4 bytes |
| replace repeated cursor-limit branches with compact subtraction tests    |        3 bytes |
| use native emitter tail calls and proven flag-preserving returns         |        6 bytes |
| classify ASCII letters by case folding and one range comparison          |       11 bytes |
| share nearby lexical-error trampolines                                   |       12 bytes |
| reuse zero during source setup and copy diagnostic positions with LDIR   |        7 bytes |
| remove the unread stored token kind                                      |       12 bytes |
| return numeric and character payloads in C                               |        9 bytes |
| test relative-fixup range by comparing sign extension with the high byte |       11 bytes |
| **measured reduction**                                                   |  **206 bytes** |

The three removed workspace bytes were `TokenizerEofPending`, `TokenKind`, and
`TokenValue`. The remaining state records only values read after the operation
that creates them. At physical EOF, clearing `SourceLineHasToken` while
returning the implicit final newline is enough to make the following request
return EOF. The tokenizer returns the token kind in `A` and a byte literal in
`C`; the parser consumes both directly. Ordinary token diagnostics reserve bit
7 and store the expected token ordinal in the low seven bits. Context-specific
name and semantic diagnostics retain distinct codes.

The relative-fixup check uses the two's-complement invariant directly. A
displacement fits in a signed byte exactly when its high byte equals the sign
extension of bit 7 in its low byte. This replaces separate positive and
negative range branches without weakening the fixup diagnostic.

Two candidates were rejected during the pass. Preserving the original fixup
address with a stack pair reduced the handwritten sequence, but multiple exits
made its stack balance harder to verify; a single-exit form erased the saving.
A general dispatcher for the positional loop and array encoders remains
deferred until enough fixed encoder code can be removed to pay for the new
handlers and table entries. Neither rejection changes the current architecture.

The direct proof now executes 2,214 fewer instructions than the 3,068-byte
baseline and takes 12,406 more T-states. The punctuation scan and compact
sixteen-bit equality checks exchange cycles for resident bytes. Generated code
remains 99 bytes, and the native runtime remains 196 code bytes plus 17 writable
bytes.

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

| Resource                                  |                 Limit | Representation            | Excess diagnostic or trap                      | Evidence                                       |
| ----------------------------------------- | --------------------: | ------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| source part count                         |                  open | open                      | capacity diagnostic                            | open                                           |
| diagnostic-name bytes                     |                  open | open                      | capacity diagnostic                            | open                                           |
| identifier bytes                          |                  open | open                      | capacity diagnostic                            | open                                           |
| ordinary symbols                          |                  open | open                      | capacity diagnostic                            | open                                           |
| record types and fields                   |                  open | open                      | capacity diagnostic                            | open                                           |
| retained forward signatures and names     |                  open | copied or interned bytes  | capacity diagnostic                            | one resident-part pair; general retention open |
| parameters and scalar locals              |                  open | open                      | capacity diagnostic                            | open                                           |
| expression and statement nesting          |                  open | open                      | capacity diagnostic                            | open                                           |
| branch fixups and active loops            |                  open | open                      | capacity diagnostic                            | open                                           |
| structured-initializer depth and elements |                  open | open                      | capacity diagnostic                            | open                                           |
| emitted image bytes                       | 65,535 format maximum | open                      | capacity diagnostic below or at format maximum | format rule; target open                       |
| activation bytes                          |                  open | packed records            | `activation-capacity`                          | one-byte Stage 4 slice                         |
| activation depth                          |                  open | counter plus packed arena | `activation-capacity`                          | depth-three trap proof                         |
| service stream and bulk-storage extents   |                  open | target adapter            | service error or documented host capacity      | open                                           |

No implementation may wrap, truncate, drop state, or change source meaning when
one of these limits is exceeded.

## Working discipline

Implementation changes follow a short evidence loop:

1. identify the governing language and VM rules;
2. add or select an executable vector;
3. implement the smallest complete semantic path;
4. assemble and measure it;
5. compare behavior with the host oracle;
6. inspect any structure that now occurs twice and select a consolidation
   candidate;
7. assemble the candidate and retain it only when the complete resident account
   or another declared binding account improves;
8. repeat the proof and measurement pass until no remaining structural
   candidate has credible evidence of a net saving;
9. update the cost and capacity ledgers; and
10. classify any proposed change as a correctness repair, a
    semantics-preserving economy, or a redesign requiring project-owner
    approval.

The next feature does not begin until the current increment reaches this local
plateau. Micro-optimizations may remain in the ledger for a later pass, but a
known duplicated representation, fixed-program scaffold, or avoidable lifetime
overlap must be measured before the compiler grows around it.

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
