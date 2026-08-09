# Nucleus 0.1 Implementation Plan

## Status and authority

This document records the construction order, measurement method, and readiness
gates for the first Nucleus compiler and Z80 execution system. It is
non-normative. The Nucleus language specification governs source syntax and
semantics. The [Nucleus Z80 Runtime and Backend Contract](z80-runtime-contract.md)
governs packed representation, generated-code integrity, services, traps, and
runtime obligations. When this plan conflicts with an authority, the plan must
be corrected.

The compiler and target runtime are handwritten Z80 assembly. Direct Z80 code
generation is the sole active implementation path. The compiler's checked
semantic-operation stream remains an internal boundary between analysis and
emission; it is not a portable bytecode product. Host tests assemble and run the
generated Z80 directly, then inspect output, state, diagnostics, and traps
against the source-level expectation. Retired NVM material is preserved under
`archive/nucleus-nvm/`; it is not an active dependency or test gate.

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

| Evidence                            | Present role                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/grammar-analysis.ts`           | Checks the collected grammar for recursion, reachability, productivity, and predictive conflicts. |
| `src/type-metadata.ts`              | Exercises bounded representations for every admitted source type.                                 |
| `src/runtime-contract.ts`           | Records the machine-readable direct-runtime trap and service assignments.                         |
| `asm/vertical-slice/*-native-*.asm` | Implements and proves the active direct-Z80 compiler slices.                                      |
| `test/`                             | Checks grammar, type metadata, runtime-contract synchronization, and measured direct-Z80 proofs.  |

This host-side evidence is executable design evidence. It does not count toward
the Z80 compiler or target-runtime budget, and it cannot override either
authority.

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
- generated-program staging or bulk-storage output;
- native runtime helpers and service adapters;
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
| Execution storage  | Program data, completion carriers, activation storage, generated code, and service buffers.                             |
| Execution cost     | Executed Z80 instructions and T-states for named programs and input conditions.                                         |
| Complete system    | Compiler plus the selected target runtime and one named generated program, with mutually exclusive paths kept separate. |

A report labels each number **Measured**, **Projected**, or **Hypothesis**.
Measured entries name the assembly and harness. Projected entries give their
measured basis and arithmetic. Unknown values remain open.

## Backend decision rule

The Stage 3 and Stage 4 comparisons are complete: direct Z80 is the selected
backend. New vertical slices implement, measure, and optimize that path only.
No NVM opcode, encoder, validator, interpreter, proof, or publication work
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
expectation checks those observations directly. Archived NVM results may still
explain an old measurement, but they are not an oracle that new code must
reproduce.

## Retired backend comparison

The completed NVM-versus-native experiments selected direct Z80 on compiler
size, target-runtime size, generated-program size, and execution cost. Their
full measurements, source, proofs, and contemporary plan text are preserved in
`archive/nucleus-nvm/`. They are not repeated here because they no longer guide
active implementation work.

## Current readiness baseline

Stages 2 and 3 are executable historical evidence. Stage 4 completed the
backend decision with counted-loop, checked-array, and scalar-recursion
increments. Stage 5 now covers typed scalar declarations and expressions,
structured control, and one retained recursive scalar routine. Each increment
has passed correctness review and a measured compression pass. This remains a
bounded proof increment rather than a complete compiler. Its resident size is
the current plateau from which the next feature must grow.

| Area                 | Current evidence                                                                                                        | Work ahead                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Specifications       | The language specification, direct-Z80 contract, reviewer charter, and implementation plan define the active system.    | Review normative changes before implementation depends on them.                                         |
| Grammar              | The collected grammar is analyzed mechanically and its three predictive conflicts are locked by tests.                  | Preserve the result while adding the source compiler; no new grammar work is planned.                   |
| Type metadata        | Compact structural metadata and alias-category separation have executable tests.                                        | Measure inline metadata against interned ordinals in Z80 before selecting the first representation.     |
| Retired NVM evidence | The specification, models, Z80 experiments, tests, proofs, and prior plan are preserved under `archive/nucleus-nvm/`.   | No active implementation or publication work remains.                                                   |
| Source corpus        | Chapter 21 records expected accepted and rejected behavior.                                                             | Compile each applicable case to Z80 and check its direct output, state, diagnostic, or trap.            |
| Z80 evidence         | The compiler emits and runs loop, checked-array, recursive-call, and scalar-expression programs with measured accounts. | Generalize one bounded component at a time and reach a measured size plateau before the next increment. |

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

### Completed foundation: direct compiler spine

The completed foundation consumes source through the bounded adapter, tokenizes
and parses it, records checked semantic operations, emits Z80, and runs the
generated program through Debug80. Success, malformed source, output failure,
checked array access, counted loops, forward calls, bounded recursion, and typed
scalar expressions have executable proofs.

The current measured build is 10,771 bytes of code and immutable data with 704
bytes of peak workspace. The structured-control program is 715 bytes, the
comprehensive typed-expression bound is 857 bytes, and the shared target
runtime is 358 code bytes. These are narrow-slice accounts, not projections for
the completed language.
The detailed path-by-path measurements and every retired NVM comparison are
preserved in `archive/nucleus-nvm/docs/implementation-plan-at-retirement.md`.

Before each new stage, the current increment reaches a measured size plateau,
passes its direct-Z80 proofs, and receives adversarial review.

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

The 33-byte semantic transcript is exactly full in this proof. It records the
limit that forced the next representation change; it is no longer the active
capacity.

#### Second Stage 5 increment: typed scalar expressions

The correctness build generalizes scalar constants, program variables, and
locals to `u8`, `u16`, and `boolean`. Decimal literals cover 0 through 65,535.
The parser applies the specified literal resolution, implicit `u8` widening,
checked explicit narrowing, conversions, unary operations, arithmetic,
comparisons, Boolean operations, and short-circuit evaluation. Constant folding
uses the same selected width, wraparound, division, and narrowing rules as
runtime evaluation. A folded fault in an unevaluated short-circuit operand is
suppressed; the corresponding evaluated operation still produces its required
diagnostic or trap.

Every emitted runtime expression uses a canonical 16-bit carrier. Declared
storage remains one byte for `u8` and `boolean` and two bytes for `u16`. A dense
semantic-operation table selects the direct-Z80 lowering. The pre-review build
deliberately retained explicit type metadata, a seven-byte expression-stack
entry, and repeated legacy paths so the first adversarial review could assess
semantics before representation changes obscured them. The compression pass
keeps the explicit metadata while sharing only paths proved equivalent.

The active transcript contains one operation-count byte and at most 255 payload
bytes. A proof with 52 assignments reaches its capacity diagnostic. Expression
metadata has sixteen seven-byte entries. Each entry retains the type and value
state, suppression state, pending operator, and that operator's 16-bit source
offset. A seventeen-deep pending expression
reaches its separate capacity diagnostic. Failed compilation publishes neither
a partial symbol nor a successful transcript.

Boolean-fixup exhaustion has a distinct capacity diagnostic. A retired
operation, an unbalanced Boolean transcript, a Boolean-fixup underflow, or an
expression-reduction underflow reports an internal-operation diagnostic rather
than attributing the failure to transcript capacity. Direct boundary proofs
exercise each defensive path.

The accepted proofs cover default initialization, both integer widths, Boolean
values, all comparison families, conversions, width-specific wraparound,
operator precedence, short-circuit suppression, static folding, named constants,
unary plus, and direct output. Separate programs prove positioned dynamic
narrowing and division traps without changing their destinations. Every
generated return path checks the exact stack pointer and an IX sentinel, so a
trap cannot appear to succeed after returning through local storage or a saved
frame word. Nested division and narrowing cases check that the outer trapping
operator retains its own source offset. Rejected programs cover implicit
narrowing, Boolean and integer mixing, chained comparisons, a constant-zero
divisor with a dynamic dividend, out-of-range unary operands, malformed decimal
adjacency, lexical overflow, transcript exhaustion, and expression-stack
exhaustion. Suppressed divide and narrowing proofs also require the skipped
operation to retain its statically selected `u8` result type. Missing closing
parentheses and a tokenizer failure after a complete left operand must propagate
through every stacked parser exit. A direct near-capacity case makes a default
local's first literal operand fail, proving that default initialization cannot
mask transcript exhaustion. A named-constant capacity case also proves that
saved symbol metadata is unwound before the failure returns. The existing call
proof exercises preservation of one-byte scalar state across recursive
activations; typed-local recursion remains an integration obligation for the
call and structured-control increment.

Before compression, fresh assembly measured 7,780 compiler-code bytes plus 177
immutable bytes, for a 7,957-byte core with 505 bytes of workspace. The first
adversarial review found incorrect trap-frame exits, incomplete constant-zero
division checking, width leaks in unary operations and conversions, unstable
nested trap positions, malformed decimal adjacency, and a suppressed-fault type
leak. Each repair gained a discriminating proof before compression began.

The retained compression pass shares conversion parsing, Boolean reduction and
fault paths, expression-stack address calculation, generated address and trap
position helpers, and equal-width binary-handler tails. It overlaps identical
immutable template bytes, removes inert padding from native scalar sequences,
and deletes redundant register and flag setup. One conversion refactor exposed
and repaired several error-carry propagation bugs. A later adversarial pass
found and repaired an unbalanced named-constant capacity exit before allowing
the additional size work to proceed. The malformed and capacity forms now have
discriminating proofs.

The complete pass reduces the compiler by 143 bytes without reducing the proof
surface: 7,637 code bytes plus 177 immutable bytes, for a 7,814-byte core. The
common front end is 5,185 bytes. The retained native emission paths occupy 2,452
bytes, including 1,069 bytes of typed lowering. Workspace remains 505 bytes.
The accepted generated program is 799 bytes and the shared native runtime is 324
bytes. The complete proof driver executes 943,921 instructions and 8,796,591
T-states across its accepted, rejected, capacity, and trap cases. The higher
proof count comes from stronger correctness cases and shared compiler helpers,
not from generated-program growth.

The follow-up began at the reviewed 7,854-byte plateau. Balancing the
named-constant failure exit added two bytes. Immutable-template overlap, dead
register and flag setup, and the five- and six-byte binary-handler tails removed
28 bytes. Sharing the three trap-position readers removed another 14 bytes.
The net follow-up reduction is therefore 40 bytes. Larger shared trap tails and
a table-driven comparison-token recognizer remain unmeasured hypotheses and are
not included in the current account.

Completion evidence:

- the representative arithmetic, comparison, conversion, and width-boundary
  vectors produce the specified values or diagnostics;
- paired constant and runtime vectors exercise the selected width and
  wraparound rules;
- success and trap returns preserve the generated frame and report the trapping
  operator's source offset;
- direct and mutual recursion preserve active one-byte scalar state;
- every bounded table and nesting stack has an exercised capacity diagnostic;
  and
- compiler, selected-runtime, generated-program, activation, and timing deltas
  are recorded by feature group.

#### Third Stage 5 increment: structured control and scalar recursion

The third increment integrates typed expressions with `if`, `elseif`, `else`,
`while`, immutable-local counted `for`, nearest-loop `exit` and `continue`, and
one complete forward-declared scalar value routine. Boolean, `u8`, and `u16`
parameters and results use the same canonical scalar carriers as ordinary
expressions. Native routine frames preserve scalar parameters and locals across
recursion. Every success and trap path restores the root stack pointer and IX.

The structured parser retains at most eight ten-byte control frames. Native
emission reuses that storage for 31 dynamic labels, with ordinal 31 reserved for
the retained routine, and 32 three-byte absolute fixups. A label allocation
that would collide with the routine label fails during parsing. The counted
loop lowering retains the bound once, rejects source writes to an active local
counter, and traps before storing a continuing `u8` value that does not fit.

Routine flow summaries are structural. A value routine is complete when its
statement sequence cannot fall through. An `if` has that property only when it
has an `else` and every clause is non-fallthrough; loops remain conservative.
Statements following an unconditional return do not change the summary.
Routine terminators require `end`, so an outer `else` or `elseif` cannot close a
routine. The retained forward name, its parameter, `main`, and scalar
declarations share the required ordinary-namespace collision checks.

Native output publication is transactional. The encoder copies the previous
published image to a dedicated 4 KiB backup region before writing
`GeneratedBase`. Every retained encoder restores the complete prior image and
size after a failed emission; successful fixup completion publishes the new
size. The bounded-array boundary proof forces a failure after the first write
and compares every restored byte with the backup.

The correctness-complete form measured 10,597 code bytes plus 224 immutable
bytes, for a 10,821-byte compiler core with 704 bytes of workspace. The size
pass replaced the six-way comparison-token chain with a dense pair table,
inlined two one-caller namespace checks, and shared the identical `while`/`for`
completion tail. It also groups the four transactional encoder wrappers around
one result-and-rollback tail. Those changes remove 50 bytes. The current
plateau is 10,547 code bytes plus 224 immutable bytes, for a 10,771-byte core.
The common front end is 6,987 bytes, including a 6,099-byte parser; retained
native emission is 3,560 bytes, including 2,115 bytes for typed and structured
lowering. Workspace remains 704 bytes. The structured proof executes 296,855
instructions and 2,906,759 T-states across its accepted, trap, namespace,
capacity, and publication cases.

The proof set covers all-return Boolean conditionals, unreachable statements,
recursive scalar calls, activation capacity, exact root-frame restoration,
wide-bound `u8` loop range, active-counter assignment, outer stray branch
tokens, forward and `main` name collisions, label capacity, and complete-image
rollback. The representative accepted program combines nested selection,
loops, transfers, descending iteration, recursion, scalar storage, and output.

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

| Resource                                  | Limit | Representation                 | Excess diagnostic or trap                 | Evidence                                       |
| ----------------------------------------- | ----: | ------------------------------ | ----------------------------------------- | ---------------------------------------------- |
| source part count                         |  open | open                           | capacity diagnostic                       | open                                           |
| diagnostic-name bytes                     |  open | open                           | capacity diagnostic                       | open                                           |
| identifier bytes                          |  open | open                           | capacity diagnostic                       | open                                           |
| ordinary scalar symbols                   |     6 | six-byte source-backed entries | capacity diagnostic                       | duplicate, unknown, and seventh-name proof     |
| record types and fields                   |  open | open                           | capacity diagnostic                       | open                                           |
| retained forward signatures and names     |  open | copied or interned bytes       | capacity diagnostic                       | one resident-part pair; general retention open |
| scalar parameters                         |  open | open                           | capacity diagnostic                       | one recursive-parameter proof                  |
| expression nesting                        |    16 | seven-byte metadata entries    | capacity diagnostic                       | seventeen-deep pending-expression proof        |
| semantic transcript payload bytes         |   255 | counted variable-width stream  | capacity diagnostic                       | 52-assignment exhaustion proof                 |
| Boolean fixups                            |    16 | two-byte generated addresses   | capacity diagnostic                       | exhaustion and underflow boundary proofs       |
| active control frames                     |     8 | ten-byte parser frames         | capacity diagnostic                       | nested structured-control proofs               |
| dynamic labels                            |    31 | byte ordinals; 31 reserved     | capacity diagnostic                       | thirty-first allocation boundary proof         |
| branch fixups                             |    32 | three-byte absolute records    | capacity diagnostic                       | bounded resolver and generated branch proofs   |
| structured-initializer depth and elements |  open | open                           | capacity diagnostic                       | open                                           |
| emitted Z80 program bytes                 | 4,096 | bounded output cursor          | capacity diagnostic                       | 857-byte Stage 5 bound and rollback proof       |
| activation bytes                          |  open | packed records                 | `activation-capacity`                     | one-byte Stage 4 slice                         |
| activation depth                          |  open | counter plus packed arena      | `activation-capacity`                     | depth-three trap proof                         |
| service stream and bulk-storage extents   |  open | target adapter                 | service error or documented host capacity | open                                           |

No implementation may wrap, truncate, drop state, or change source meaning when
one of these limits is exceeded.

## Working discipline

Implementation changes follow a short evidence loop:

1. identify the governing language and direct-runtime rules;
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
