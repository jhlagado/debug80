# Nucleus 0.1 Implementation Plan

## Status and authority

This document records the construction order, measurement method, and readiness
gates for the first Nucleus compiler and Z80 execution system. It is
non-normative. The Nucleus language specification governs source syntax and
semantics. The former NVM specification remains a historical design record
while its source-level service, trap, layout, and activation obligations are
being extracted into a smaller direct-Z80 implementation contract. It is no
longer an active output-format requirement. When this plan conflicts with the
language specification, the plan must be corrected.

The compiler and target runtime are handwritten Z80 assembly. Direct Z80 code
generation is the sole active implementation path. The compiler's checked
semantic-operation stream remains an internal boundary between analysis and
emission; it is not a portable bytecode product. Host tests assemble and run the
generated Z80 directly, then inspect output, state, diagnostics, and traps
against the source-level expectation. Existing NVM encoders, interpreters, and
proofs are retained as archived research evidence, but new language increments
do not extend or depend on them.

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
- the compiler emits checked semantic operations into a direct-Z80 backend and
  initially uses fixed templates without register allocation or whole-program
  optimization;
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
| `src/vm-image.ts`                           | Historical NVM image construction and validation evidence.                                                                                 |
| `src/vm-reference.ts`                       | Historical executable evidence for the retired NVM design.                                                                                 |
| `asm/variant-a.asm` through `variant-c.asm` | Measure alternative Z80 dispatch and slot-addressing arrangements.                                                                         |
| `asm/native-*.asm` and `asm/nvm-*.asm`      | Preserve the completed comparison that selected direct Z80; NVM files are not an active backend.                                           |
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
- native runtime helpers and service adapters;
- slot and dispatch pages;
- generated Z80 code and program data;
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
| Generated output   | Native Z80 code, static data, relocation or fixup records, and any required startup image.                              |
| Native runtime     | Shared Z80 checks, arithmetic helpers, service adapters, call machinery, and fixed writable runtime state.              |
| Execution storage  | Slot page, staged arguments, completion carriers, activation arena, loaded code and data, and service buffers.          |
| Execution cost     | Executed Z80 instructions and T-states for named programs and input conditions.                                         |
| Complete system    | Compiler plus the selected target runtime and one named generated program, with mutually exclusive paths kept separate. |

A report labels each number **Measured**, **Projected**, or **Hypothesis**.
Measured entries name the assembly and harness. Projected entries give their
measured basis and arithmetic. Unknown values remain open.

## Backend decision rule

The Stage 3 and Stage 4 comparisons are complete: direct Z80 is the selected
backend. New vertical slices implement, measure, and optimize that path only.
No new NVM opcode, encoder, validator, interpreter, proof, or publication work
belongs to the active implementation plan.

The front end still produces checked semantic operations as it parses and
retains no abstract syntax tree or parser-specific program record. The current
proof sink records a bounded transcript and the native backend consumes it only
after parsing succeeds. This preserves diagnostic and output atomicity. The
transcript is an internal compiler representation whose ordinals and layout may
change whenever a smaller proven representation is found.

An earlier experiment emitted native code while the parser remained active. It
needed more compiler code and more simultaneously live workspace, so the
post-parse transcript remains the smaller measured arrangement. Later slices
must remeasure it when a general statement or expression dispatcher can replace
enough fixed encoder code to pay for another organization.

Host verification now has two independent layers. AZM checks the compiler and
generated-program register contracts; Debug80 runs the emitted Z80 and exposes
its output, state, trap record, and instruction count. A host-side source
expectation checks those observations directly. The archived NVM reference
implementation may still explain an old measurement, but it is not an oracle
that new code must reproduce.

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
compiler. They are retained because they contributed to the later decision;
they are not active implementation paths or evidence that future increments
must preserve NVM output.

## Current readiness baseline

Stages 2 and 3 are executable historical evidence. Stage 4 completed the
backend decision with counted-loop, checked-array, and scalar-recursion
increments. Stage 5 now has its first direct-Z80 scalar-symbol and expression
increment. These remain narrow proofs rather than a complete compiler.

| Area                 | Current evidence                                                                                                                       | Work ahead                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Specifications       | Review found the language, VM, and reviewer authorities consistent at revision `6088a08`; the matching reading editions are published. | Treat later normative changes as explicit corrections or redesigns and review them before implementation depends on them. |
| Grammar              | The collected grammar is analyzed mechanically and its three predictive conflicts are locked by tests.                                 | Preserve the result while adding the source compiler; no new grammar work is planned.                                     |
| Type metadata        | Compact structural metadata and alias-category separation have executable tests.                                                       | Measure inline metadata against interned ordinals in Z80 before selecting the first representation.                       |
| Retired NVM evidence | Image builders, validation, and representative reference execution remain tested as historical research.                               | Archive them outside the active Nucleus implementation and publication paths.                                             |
| Source corpus        | Chapter 21 records expected accepted and rejected behavior.                                                                            | Compile each applicable case to Z80 and check its direct output, state, diagnostic, or trap.                              |
| Z80 evidence         | The compiler emits and runs loop, checked-array, recursive-call, and scalar-expression programs with measured accounts.                | Generalize one bounded component at a time and reach a measured size plateau before the next increment.                   |

`vitest run test/proof-harness.test.ts` from `packages/nucleus` is the focused
assembly-proof gate. The broader Nucleus package suite runs only after that
gate passes. AZM and Debug80 dependencies are rebuilt only when their outputs
are absent or stale; an ordinary Nucleus change does not trigger a monorepo-wide
rebuild.

## AZM and Debug80 proof architecture

The first Z80 implementation follows the proof-driven approach established in
TECM8, with a smaller and more regular harness. A proof is an AZM source program
that includes or links the production assembly under test, runs at a declared
address in a declared memory map, and exposes a small set of named observations.
The host assembles the proof, loads it into Debug80, executes it with a finite
instruction or cycle limit, and compares those observations with the host
expectation for that source program.

Use three proof scales:

1. **Module proofs** exercise one tokenizer, parser, emitter, or runtime-helper
   boundary with minimal machine state.
2. **Boundary proofs** exercise a complete contract between two components,
   such as compiler emission followed by generated-code execution, or service
   invocation followed by completion handling.
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
- generated-Z80 registers, scalar storage, data bytes, activation state, and
  service output; and
- instruction, cycle, code-size, and writable-memory totals.

The host harness owns assembly, machine construction, step limits, symbol
lookup, expectation comparison, and failure diagnostics. Individual proof manifests
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

### Stage 1: preserve executable design evidence

This completed host-side stage belongs to the archived NVM investigation. Its
fixtures remain useful evidence but do not gate new direct-Z80 increments.

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

### Stage 2: historical backend comparison

This completed stage records the NVM-versus-native experiment that selected
direct Z80. Its NVM tasks are not instructions for future implementation.

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

### Stage 3: compiler spine and historical output comparison

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

For this completed comparison, the checked front end wrote through a small
semantic-operation sink. One historical sink emitted the canonical NVM image;
the selected sink emitted Z80 templates and bounded fixups without first
creating NVM bytecode.

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
direct template. Stage 4 supplied the decision slice because it introduced the
shared machinery and safety paths that can change the comparison.

### Stage 4: completed backend decision slice

This completed stage compared the first three narrow program groups through
both sinks:

1. fixed-slot scalar arithmetic and a counted loop;
2. checked fixed-array selection on success and at the bounds trap;
3. a user-routine call and bounded scalar recursion.

Those measurements were enough to select direct Z80. Failure handling,
services, aggregate parameters, transient results, and aggregate copying now
advance only through the direct backend in their later language stages.

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

Direct Z80 was the production experiment for this increment. The historical
NVM sink emitted an 89-byte comparison image; it is retained only in the
archived measurement.

| Account                    |                        Direct-Z80 path |                    Historical NVM path |
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
compiler to 2,841 bytes.

| Account                    |                        Direct-Z80 path |                    Historical NVM path |
| -------------------------- | -------------------------------------: | -------------------------------------: |
| common front-end code      |                            1,707 bytes |                            1,707 bytes |
| backend sink code          |                            1,007 bytes |                              139 bytes |
| compiler immutable data    |                              127 bytes |                              127 bytes |
| complete compiler core     |                            2,841 bytes |                            1,973 bytes |
| peak compiler workspace    |                               51 bytes |                               51 bytes |
| generated program or image |                               99 bytes |                              102 bytes |
| native runtime code        |                              196 bytes |                         not applicable |
| native writable state      |                               17 bytes |                         not applicable |
| complete proof execution   | 60,314 instructions / 594,957 T-states | 20,809 instructions / 208,414 T-states |

The first working call compiler added 913 bytes to the preceding 2,155-byte
plateau. After consolidation the difference is 686 bytes. Neither number is a
projection for arbitrary calls. The increment includes three keywords, exact
forward and parameter retention, the new routine grammar path, scalar result
flow, recursive native code generation, the first general semantic dispatcher,
activation diagnostics, and all retained names and error paths. The
call-specific parser path now occupies 338 bytes and the call backend 332
bytes; their enclosing front end and sink accounts also contain the earlier
loop and array machinery.

The historical NVM path used a 139-byte encoder to copy and patch a fixed
102-byte image. That run wrote zero and performed `activation-capacity` at depth
three; its retained trap record identifies routine ordinal one and code offset 46. The direct path reports source byte offset 201 for activation exhaustion
and byte offset 95 for output failure.
The native proof checks both locations, exact transcript consumption, the four
successful active calls, the depth-three high-water state, the untouched
fourth arena byte on rejection, empty output, and complete unwind.

#### Consolidation plateau after scalar calls

The post-call size pass retained every accepted source, diagnostic position,
semantic transcript, generated byte, runtime helper, trap, and proof outcome.
It reduced the direct compiler core from 3,068 to 2,841 bytes. Compiler code
fell by 221 bytes while immutable data shrank by six bytes, giving a net
reduction of 227 bytes. Workspace fell from 54 to 51 bytes.

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
| restore checked pointers with flag-preserving 16-bit addition            |        3 bytes |
| tail-call the two final EOF checks                                       |        6 bytes |
| remove obsolete hard-coded routine and parameter names                   |       12 bytes |
| **measured reduction**                                                   |  **227 bytes** |

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

Three cursor checks now subtract the limit and restore the original pointer
with `ADD HL,DE`. On the Z80, sixteen-bit `ADD` leaves the zero flag unchanged,
so the branch still consumes the comparison result produced by `SBC HL,DE`.
The AZM instruction-effect model distinguishes this form from `ADC` and `SBC`,
which do replace the complete public flag set. The change saves one byte and
ten T-states at each site. The final EOF checks tail-call their shared parser
routine, saving another six bytes. The retained forward signature determines
the routine and parameter identities, so the obsolete `descend` and `value`
literals and the obsolete `descend` diagnostic code were removed rather than
preserving misleading special cases.

The adversarial pass also found that one repacked emitter fixup word overlapped
the retained token offset used by emitter diagnostics. That word now occupies
diagnostic storage that is dead during emission. The proof harness checks that
the fixup word and all six retained token-position bytes are disjoint, so a
future range or capacity failure continues to report a source position rather
than a generated-code address. This correctness repair changes no byte count.

Two candidates were rejected during the pass. Preserving the original fixup
address with a stack pair reduced the handwritten sequence, but multiple exits
made its stack balance harder to verify; a single-exit form erased the saving.
A general dispatcher for the positional loop and array encoders remains
deferred until enough fixed encoder code can be removed to pay for the new
handlers and table entries. Neither rejection changes the current architecture.

The direct proof now executes 3,821 fewer instructions than the 3,068-byte
baseline and takes 3,656 fewer T-states. The punctuation scan still exchanges
cycles for resident bytes, but restoring each checked pointer with `ADD HL,DE`
more than recovers that cost across this proof. Generated code remains 99
bytes, and the native runtime remains 196 code bytes plus 17 writable bytes.

Completion evidence:

- the historical paths agreed on every normal, failure, and trap outcome used
  in the decision;
- the compiler reported the common front end and the two mutually exclusive
  output sinks separately during that comparison;
- complete generated-program, target-runtime, writable-state, instruction, and
  T-state accounts are reported for every proof;
- the comparison records which checks are runtime operations and which facts a
  compiler-controlled native image establishes statically; and
- direct Z80 is the sole active implementation path before Stage 5 begins.

### Stage 5: scalars, expressions, and structured control

Add scalar constants, program variables, scalar parameters and locals,
precedence-driven expressions, conversions, assignment, `if`, `while`, and
counted `for`. Emit branches through bounded fixup state and preserve the
specified left-to-right and short-circuit behavior.

The stage ends with scalar recursion and every scalar safety trap, including the
wide-bound `u8` counted-loop case.

#### First Stage 5 increment: bounded scalar symbols and precedence

The first increment replaces the fixed scalar names used by earlier slices with
a six-entry exact-name table. Each five-byte entry retains a pointer and length
into resident source, one class-and-type byte, and one storage ordinal. An entry
remains provisional while its initializer is checked, so a declaration cannot
refer to itself and a failed declaration never becomes visible. The seventh
name produces a positioned capacity diagnostic.

The accepted proof declares one program `u8`, two per-activation local `u8`
values, assigns through a postfix operation stream, and executes
`left + right * 4`. A single precedence-climbing routine gives multiplication
priority over addition. The generated Z80 writes byte 14, stores 14 in the
program object, and reports a forced output failure at the exact source byte.
Companion cases reject a duplicate name, an unknown name, a missing right
operand, and the seventh symbol at their exact positions. The representative
program deliberately calls its scalar `bytes`; type-suffix dispatch proves that
the old fixed array slice no longer reserves that otherwise ordinary name.

The direct compiler is now 3,883 bytes of code and immutable data with 103 bytes
of peak workspace. Its measured components are 2,369 bytes for the common front
end, including a 121-byte symbol module and 1,596-byte parser, and 1,383 bytes
for the native sink, including a 362-byte expression backend. The generated
program is 101 bytes. The shared native runtime is 204 bytes of code plus 17
bytes of writable state.

The first correct form measured 3,900 compiler bytes. Sharing retained emission
fragments reduced that to 3,866. Removing the accidental `bytes` reservation
added ten bytes of real generality, and sharing the expression push tail
recovered four. The final audit then replaced a truncated one-byte source
position with the required 16-bit operand; an execution proof places the output
call at byte 284 and checks the full trap offset. That correction adds eleven
compiler bytes and one workspace byte, producing the 3,883-byte plateau. A
proposed common indirect dispatcher for the call and expression tables was rejected because its
synthetic return stack could not satisfy strict AZM stack-contract proof. The
proven duplicated dispatch kernels remain until a different representation has
a measurable complete-path saving.

The 33-byte semantic transcript is exactly full in this proof. It is a measured
narrow-slice capacity, not a suitable general limit; the next increment must
either enlarge it with an explicit diagnostic or replace it with a smaller
general statement representation before adding operations.

Completion evidence:

- arithmetic and comparison behavior matches the source specification at all
  width boundaries;
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

- emitted layouts match the language layout rules byte for byte in generated
  Z80 data;
- zero and explicit initializers produce the required native data images;
- incorrect counts, nesting, types, and string lengths produce diagnostics;
- native startup exposes no partially applied data image; and
- type-metadata and initializer workspace limits are measured.

### Stage 7: aggregate calls, results, and copying

Add aggregate parameter carriers, checked selection, transient aggregate
results, carrier preservation across intervening calls, and exact-type
aggregate assignment. Measure straight-line copying, a counted byte-copy loop,
and any shared native helper before selecting the direct-Z80 lowering policy.

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
Complete the corresponding load, fixup, and compiler-controlled image-integrity
rules for generated Z80.

Completion evidence:

- every applicable language behavior has a direct-Z80 execution or rejection
  proof;
- activation byte and depth exhaustion are atomic;
- every service and failure path preserves its specified destination and
  cursor effects; and
- image-integrity cost is measured separately from execution code.

### Stage 9: complete corpus and final accounting

Compile every accepted Chapter 21 program with the Z80 compiler, run it through
the selected execution path, and reject every invalid program before execution.
Report all resource accounts for the complete implementation.

The architecture passes only when the compiler core and immutable compilation
data fit the 16 KiB gate and every conformance program fits the published
capacities. If it fails, use the component ledger to select a semantics-
preserving representation or lowering experiment. Do not infer the cause from
source size or host measurements.

## Capacity ledger

The first implementation fixes a numeric limit before each bounded structure is
used. Each row remains open until a Z80 representation and a minimum corpus
requirement are both known.

| Resource                                  | Limit | Representation                  | Excess diagnostic or trap                 | Evidence                                       |
| ----------------------------------------- | ----: | ------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| source part count                         |  open | open                            | capacity diagnostic                       | open                                           |
| diagnostic-name bytes                     |  open | open                            | capacity diagnostic                       | open                                           |
| identifier bytes                          |  open | open                            | capacity diagnostic                       | open                                           |
| ordinary scalar symbols                   |     6 | five-byte source-backed entries | capacity diagnostic                       | duplicate, unknown, and seventh-name proof     |
| record types and fields                   |  open | open                            | capacity diagnostic                       | open                                           |
| retained forward signatures and names     |  open | copied or interned bytes        | capacity diagnostic                       | one resident-part pair; general retention open |
| parameters and scalar locals              |  open | open                            | capacity diagnostic                       | open                                           |
| expression and statement nesting          |  open | open                            | capacity diagnostic                       | open                                           |
| semantic transcript bytes                 |    33 | flat operation buffer           | capacity diagnostic                       | exactly full in first Stage 5 proof            |
| branch fixups and active loops            |  open | open                            | capacity diagnostic                       | open                                           |
| structured-initializer depth and elements |  open | open                            | capacity diagnostic                       | open                                           |
| emitted Z80 program bytes                 |  open | bounded output cursor           | capacity diagnostic                       | 101-byte Stage 5 program in 4 KiB proof region |
| activation bytes                          |  open | packed records                  | `activation-capacity`                     | one-byte Stage 4 slice                         |
| activation depth                          |  open | counter plus packed arena       | `activation-capacity`                     | depth-three trap proof                         |
| service stream and bulk-storage extents   |  open | target adapter                  | service error or documented host capacity | open                                           |

No implementation may wrap, truncate, drop state, or change source meaning when
one of these limits is exceeded.

## Working discipline

Implementation changes follow a short evidence loop:

1. identify the governing language and VM rules;
2. add or select an executable vector;
3. implement the smallest complete semantic path;
4. assemble and measure it;
5. compare generated-Z80 behavior with the source-level expected result;
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

## Continued implementation checklist

Before a new language stage begins:

- outstanding adversarial findings for the current stage are resolved;
- the language specification, direct-Z80 contract, reviewer charter, and
  published editions agree;
- machine-readable trap and service assignments match the direct runtime
  contract;
- every Chapter 21 program has a source-level expected result;
- the Z80 memory map identifies the compiler bank, compiler workspace, generated
  program destination, target-runtime regions, program code and data, and
  activation arena without overlap; and
- the measurement harness reports compiler bytes, immutable data, peak
  workspace, target-runtime bytes, runtime state, emitted bytes, and T-states
  as separate accounts.
