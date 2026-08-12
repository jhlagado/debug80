# Nucleus 0.1 Implementation Plan

## Status and authority

This document records the construction order, measurement method, and readiness
gates for the first Nucleus compiler and Z80 execution system. It is
non-normative. The Nucleus language specification governs source syntax and
semantics. The [Nucleus Target System Specification](target-system-specification.md)
governs target profiles, startup, entry, and banking. The
[Nucleus Z80 Runtime and Backend Contract](z80-runtime-contract.md) governs
packed representation, generated-code integrity, services, traps, and runtime
obligations. The [Nucleus Object Stream Format](nucleus-object-format.md)
governs binary output framing, image and patch records, integrity, and commit.
When this plan conflicts with an authority, the plan must be corrected.

The compiler and target runtime are handwritten Z80 assembly. Direct Z80 code
generation is the sole active implementation path. The compiler's checked
semantic-operation stream remains an internal boundary between analysis and
emission; it is not a portable bytecode product. Host tests assemble and run the
generated Z80 directly, then inspect output, state, diagnostics, and traps
against the source-level expectation.

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
- compilation reads source once and consumes the checked semantic transcript
  once;
- output is one append-only object stream: target-addressed image records,
  resolved replacement-byte patch records, one map, and a terminal commit;
- the compiler performs no per-bank emission replay, output seek, or complete
  bank-image rollback;
- the compiler builds no abstract syntax tree;
- declarations precede use, with complete forward routine signatures as the
  sole exception;
- a packed LL(1) interpreter parses declaration and statement structure, with
  precedence expressions and bounded semantic decisions retained as explicit
  external islands;
- one precedence-driven loop parses binary expressions;
- the parser completes a call before classifying `else fail` consumption;
- all routine-local variables are scalar;
- all owned aggregate storage belongs to top-level program variables,
  aggregate constants, and their inline subobjects;
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

| Evidence                         | Present role                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/grammar-analysis.ts`        | Checks the collected grammar for recursion, reachability, productivity, and predictive conflicts. |
| `src/type-metadata.ts`           | Exercises bounded representations for every admitted source type.                                 |
| `src/runtime-contract.ts`        | Records the machine-readable direct-runtime trap and service assignments.                         |
| `asm/vertical-slice/*-z80-*.asm` | Implements and proves the active direct-Z80 compiler slices.                                      |
| `test/`                          | Checks grammar, type metadata, runtime-contract synchronization, and measured direct-Z80 proofs.  |

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
- append-only generated-object output or bulk storage;
- Z80 runtime helpers and service adapters;
- generated Z80 code and program data;
- activation storage; and
- service buffers.

Before Stage 3 begins, a small adapter contract must carry ordered source-part
events, source bytes, generated output bytes, and diagnostics. The first adapter
may use host callbacks or bulk-storage fixtures, provided it supplies the
compiler core through the same bounded event interface that a Z80 target
adapter will implement.

## Measurement accounts

Every implementation report keeps these accounts separate:

| Account            | Recorded quantity                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Compiler core      | Z80 code plus immutable tables and constants required while compiling.                                                  |
| Compiler workspace | Peak simultaneously live writable tokenizer, parser, symbol, type, fixup, diagnostic, and emission state.               |
| Generated output   | Append-only Z80 image records, resolved patch records, map, commit, and required startup bytes.                         |
| Z80 runtime        | Shared checks, arithmetic helpers, service adapters, call machinery, and fixed writable runtime state.                  |
| Execution storage  | Program data, completion carriers, activation storage, generated code, and service buffers.                             |
| Execution cost     | Executed Z80 instructions and T-states for named programs and input conditions.                                         |
| Complete system    | Compiler plus the selected target runtime and one named generated program, with mutually exclusive paths kept separate. |

A report labels each number **Measured**, **Projected**, or **Hypothesis**.
Measured entries name the assembly and harness. Projected entries give their
measured basis and arithmetic. Unknown values remain open.

## Backend decision rule

Direct Z80 is the implementation path. New vertical slices implement, measure,
and optimize that path only.

The front end still produces checked semantic operations as it parses and
retains no abstract syntax tree or parser-specific program record. The current
proof sink records a bounded transcript and the Z80 backend consumes it only
after parsing succeeds. This preserves diagnostic and output atomicity. The
transcript is an internal compiler representation whose ordinals and layout may
change whenever a smaller proven representation is found.

An earlier experiment emitted Z80 code while the parser remained active. It
needed more compiler code and more simultaneously live workspace, so the
post-parse transcript remains the smaller measured arrangement. Later slices
must remeasure it when a general statement or expression dispatcher can replace
enough fixed encoder code to pay for another organization.

Host verification now has two independent layers. AZM checks the compiler and
generated-program register contracts; Debug80 runs the emitted Z80 and exposes
its output, state, trap record, and instruction count. A host-side source
expectation checks those observations directly.

## Current readiness baseline

Stages 2 through 8 remain executable historical evidence for the direct-Z80
compiler increments. Stage 9 compiles and executes the complete Chapter 21
corpus, including ordered multipart input, and locks the final resource
accounts. Each completed increment has a correctness baseline and a measured
compression pass. The resident Stage 9 size is the current implementation
plateau.

| Area           | Current evidence                                                                                                        | Work ahead                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Specifications | The language specification, direct-Z80 contract, reviewer charter, and implementation plan define the active system.    | Review normative changes before implementation depends on them.                                     |
| Grammar        | The collected grammar is analyzed mechanically and its three predictive conflicts are locked by tests.                  | Preserve the result while adding the source compiler; no new grammar work is planned.               |
| Type metadata  | Compact structural metadata and alias-category separation have executable tests.                                        | Measure inline metadata against interned ordinals in Z80 before selecting the first representation. |
| Source corpus  | Every Chapter 21 program is byte-locked to the specification and has a direct output, state, diagnostic, or trap proof. | Extend the corpus only when a language or implementation change requires another discriminator.     |
| Z80 evidence   | The complete Chapter 21 corpus runs through the direct compiler with final measured accounts.                           | Preserve the final gate while preparing hardware and adapter evidence.                              |

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

The Stage 6 production build is 9,863 bytes of code and immutable data with
1,085 bytes of peak workspace. The structured-control program is 715 bytes,
the comprehensive typed-expression bound is 857 bytes, and the shared target
runtime is 358 code bytes. These are narrow-slice accounts, not projections for
the completed language. Historical proof configurations retain the fixed
parsers and encoders needed to rerun their original evidence; those fixtures
are excluded from the production Stage 6 account.
The detailed path-by-path measurements for the active Z80 implementation are
recorded below.

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
for the Z80 sink, including a 362-byte expression backend. The generated
program is 101 bytes. The shared Z80 runtime is 204 bytes of code plus 17
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
immutable template bytes, removes inert padding from Z80 scalar sequences,
and deletes redundant register and flag setup. One conversion refactor exposed
and repaired several error-carry propagation bugs. A later adversarial pass
found and repaired an unbalanced named-constant capacity exit before allowing
the additional size work to proceed. The malformed and capacity forms now have
discriminating proofs.

The complete pass reduces the compiler by 143 bytes without reducing the proof
surface: 7,637 code bytes plus 177 immutable bytes, for a 7,814-byte core. The
common front end is 5,185 bytes. The retained Z80 emission paths occupy 2,452
bytes, including 1,069 bytes of typed lowering. Workspace remains 505 bytes.
The accepted generated program is 799 bytes and the shared Z80 runtime is 324
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
expressions. Z80 routine frames preserve scalar parameters and locals across
recursion. Every success and trap path restores the root stack pointer and IX.

The structured parser retains at most eight ten-byte control frames. Z80
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

Z80 output publication is transactional. The encoder copies the previous
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
Z80 emission is 3,560 bytes, including 2,115 bytes for typed and structured
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
- zero and explicit initializers produce the required static-data images;
- incorrect counts, nesting, types, and string lengths produce diagnostics;
- Z80 startup exposes no partially applied data image; and
- type-metadata and initializer workspace limits are measured.

The first correctness-complete build uses eight dynamic type descriptors, five
record descriptors, twelve field entries, four active initializer levels,
thirty-two initializer nodes including the root, and a 255-byte static-image
region. The representative program defines nested records, a bounded string,
and fixed arrays. Its zero and explicit declarations produce a 52-byte packed
image. The publisher copies that image ahead of the generated entry code and
restores the previous generated image and size after a forced mid-publication
failure.

The correctness baseline measured 12,231 code bytes plus 240 immutable bytes,
for a 12,471-byte compiler core. Workspace was 1,121 bytes. The first
adversarial review found scalar use of record and aggregate symbols, duplicate
field acceptance, and a record type admitted as a counted-loop step. Each
repair gained a whole-source proof. The same review strengthened the rollback
case so the failed publication writes bytes different from the previous image,
and added exact initializer-node and metadata-capacity boundaries.

The compression pass separates historical fixed-slice parsers and encoders from
the production configuration while preserving their standalone executable
proofs. It also narrows extents, offsets, and static-image counters after the
255-byte capacity checks; compacts type and field records; shares token and
parser paths; interns structural type descriptors; and stops rewriting string
padding that the zeroed image already supplies. Fresh production assembly now
measures 9,652 code bytes plus 211 immutable bytes, for a 9,863-byte compiler
core. The common front end is 7,171 bytes, including a 6,151-byte parser. The
retained typed and aggregate Z80 sink is 2,163 bytes. Workspace is 1,085
bytes and the selected Z80 runtime is 358 bytes.

The compression pass removes 2,608 core bytes and 36 workspace bytes from the
correctness baseline. It also leaves the Stage 6 compiler 908 bytes smaller
than the reviewed Stage 5 plateau. The expanded aggregate proof executes
338,164 instructions and 3,195,501 T-states and occupies 1,075 proof bytes. It
checks lowercase and uppercase hexadecimal escapes, canonical Boolean image
bytes, nominal record identity, structural array interning, the 255-byte type
extent boundary, and atomic publication in addition to the original layout and
initializer cases.

The final size reviews found another 73 resident bytes. Four structured-control
templates now alias identical typed-expression bytes; three one-caller token
wrappers are inlined in the production configuration; and repeated diagnostic
tails share their existing implementations. The first follow-up shared Boolean
and `u8` literal emission. Its fresh census exposed the same body in numeric
literals, so the final form selects metadata once and sends all three forms
through one balanced emitter. The final census then routed named constants
through the same checked path. Its symbol byte already contains only the scalar
type, so the final form sets the constant metadata bit directly. The additional
compiler-side save and restore work changes proof timing but leaves generated
code unchanged. The figures above include all follow-ups.

### Stage 7: aggregate calls, results, and copying

Add aggregate parameter carriers, checked selection, transient aggregate
results, carrier preservation across intervening calls, and exact-type
aggregate assignment.

The initial correctness form retains four direct routine declarations, eight
parameters across those declarations, and four nested compiler call frames.
Aggregate arguments enter generated routines as canonical address words and
are copied into distinct activation storage before the routine body runs.
Aggregate results reuse the scalar result carrier but remain statically typed;
source expressions cannot convert, compare, calculate with, or store the
carrier itself. Field and array selection derive another checked carrier, while
bounded-string `length` produces a read-only scalar value.

Exact-type aggregate assignment uses the Z80 `LDIR` instruction after two
complete-region checks. Both checks finish before the first destination write.
The fixed Stage 6 extent limit of 255 bytes makes the copy count representable
in one retained extent byte and in `BC`. The proof also supplies an invalid
source carrier and an invalid destination carrier independently, then verifies
that neither case changes either destination byte.

The initial correctness draft measured 12,440 code bytes plus 219 immutable
bytes, for a 12,659-byte compiler core. The first adversarial review found
unbalanced suffix-capacity exits, two namespace omissions, a scalar suffix
escaping into aggregate metadata, and a suppressed bounds fault that still
produced a diagnostic. The repairs add exact diagnostics, stack-pointer checks,
short-circuit controls, call-shape mismatches, and an activation-capacity trap
that verifies the source position and restored root frame.

Fresh assembly after those repairs measures 12,521 code bytes plus 219 immutable
bytes, for a 12,740-byte compiler core. Workspace is 1,198 bytes. The common
front end is 9,272 bytes, including an 8,252-byte parser. The typed and aggregate
Z80 sink occupies 2,931 bytes, and the selected runtime is 419 bytes. The
four generated proof programs remain 523, 600, 341, and 239 bytes. The expanded
Stage 7 proof executes 597,738 instructions and 5,674,804 T-states and occupies
1,666 proof bytes. These figures describe the repaired correctness baseline;
the second correctness review cleared it for size work without another
production repair.

The measured compression pass removes 216 compiler-core bytes. It shares the
Z80 publication header, indexed-local emitter, control-frame field lookup,
control-label allocation and store, and constant binary preparation. Constant
multiplication consumes the values prepared by that shared path. Four trailing
generated `NOP` bytes and one no-effect compiler instruction are also gone. A
final census aliases eight byte-identical or contained Z80 templates and
inlines four single-caller reset and allocation wrappers. The OR/AND fold merge
no longer pays after the shared constant path, and spilling counted-loop
registers would trade a small remaining code saving for more workspace and a
new liveness obligation, so neither experiment is retained.

Fresh assembly after that compression measures 12,305 code bytes plus 219
immutable bytes, for a 12,524-byte compiler core. A follow-up review then
removed another 212 bytes. It shared fixed-length emission, local-declaration
parsing, call-offset reads, aggregate-region checks, branch-clause prefixes,
constant-expression preparation, and repeated identifier comparisons. One
proposed initializer shortcut was rejected because it would overwrite a live
constant result.

The adopted packed LL(1) build measures 11,656 code bytes plus the same 219
immutable bytes, for an 11,875-byte compiler core. Workspace is 1,276 bytes.
The 7,683-byte parser consists of 4,929 bytes of retained precedence and
semantic support, a 230-byte interpreter, 620 bytes of generated tables, and
1,904 bytes of semantic actions. The main Stage 7 proof executes 823,997
instructions and 7,640,666 T-states. A separate coverage program exercises
constants, default and explicit scalar locals,
`elseif`, `while`, both counted-loop directions, default, named, and signed
steps, and nearest-loop `exit` and `continue`. It compiles and runs those forms,
then checks the generated program's output and retained local values.

Prediction rows mark their final production in the production ordinal's high
bit instead of storing a separate row terminator. This caps the generated
grammar at 127 productions; Stage 7 uses 63.

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

The Stage 8 implementation includes the complete scalar and aggregate
call ABI, sixteen argument positions, direct and mutual recursion, forward
signatures including an abbreviated `main` body, direct and forward-visible
calls to `main`, early return, recoverable
failure, propagation, immediate same-line handling, and result-free call
propagation. The six standard services and four stable error constants share
one predefined-name table. Direct runtime calls preserve the specified cursor,
byte, and atomic-failure behavior, and `Reset` clears prior service failures.

The combined active-LL(1) proof exercises all five runtime traps plus
`unhandled-error`, exact trap locations, root SP/IX restoration, handler bypass,
all service success and error families, same-destination handling, sixteen
arguments, mutual forward recursion, direct and forward-visible `main`
recursion, result-free call propagation, and
predefined-name and service-signature rejections. Compiler-controlled image
integrity is checked at assembly/proof time: generated-size arithmetic, the
final publication cursor, target-map non-overlap, fixed runtime entry ranges,
bounded fixups and tables, and rollback of a divergent failed publication. A
hostile-code loader or opcode validator remains outside the selected contract.

The correctness-cleared precompression account was 14,059 core bytes. After
measured compression and the final branch-encoding pass, fresh assembly
measures 13,344 code bytes plus 368 immutable bytes, for a 13,712-byte compiler
core. Workspace is 1,398 bytes; the selected runtime is 561 bytes. The common
front end is 9,916 bytes, including an 8,904-byte parser, and the retained Z80
sink is 3,428 bytes, of which the typed and aggregate portion is 3,091 bytes.
The combined proof occupies 2,953 bytes and executes 1,515,084 instructions in
14,125,764 T-states. The compiler core is 347 bytes smaller than the
correctness-cleared baseline and remains 2,672 bytes inside the hard 16 KiB
gate. Exact test locks record these figures as the Stage 8 size plateau.

The final branch-encoding pass removes 95 resident bytes. Seventy-six direct
transfers use relative encodings; six branches to the next instruction are
deleted; one call-and-return tail becomes a direct relative transfer; and two
redundant flag operations are removed. Four transfers that fit the production
layout remain absolute because at least one historical proof configuration
places their targets outside the signed relative range. Generated programs,
workspace, immutable data, and runtime size are unchanged.

### Stage 9: complete corpus and final accounting

Compile every accepted Chapter 21 program with the Z80 compiler, run it through
the selected execution path, and reject every invalid program before execution.
Report all resource accounts for the complete implementation.

The architecture passes only when the compiler core and immutable compilation
data fit the 16 KiB gate and every conformance program fits the published
capacities. If it fails, use the component ledger to select a semantics-
preserving representation or lowering experiment. Do not infer the cause from
source size or host measurements.

The completed harness locks all twenty-four `nucleus` code fences in Chapter 21
byte for byte. It compiles and runs every accepted program, checks both
specified runtime-trap cases at their exact source offsets, and rejects all
ten invalid programs before execution with their required diagnostic class
and position. The generated terminal paths restore the root stack pointer, IX,
and activation depth. The largest generated program in this corpus is 945
bytes.

The Section 21.1 program is assembled from the literal flat manifest
`model.nu`, a blank line, and `main.nu`. The host adapter preserves written
order, gives duplicate names distinct stable identities, and maps a diagnostic
from identity 2 back to `main.nu`. The Z80 adapter accepts one through eight
five-byte source descriptors. Its proof covers counts 1, 8, and 9, a missing
physical newline, an open delimiter at a part boundary, a positioned failure
in the second part, and successful compilation after earlier multipart and
capacity failures.

The correctness-cleared build measured 13,501 code bytes plus 368 immutable
bytes, for a 13,869-byte compiler core with 1,402 bytes of workspace. The size
pass removes 51 core bytes and one workspace byte. It eliminates a redundant
descriptor-pointer sentinel, folds the pending-boundary flag into the high bit
of the remaining-part count, shares existing source-position initialization,
uses fall-through at the two compilation-entry joins, inlines the sole
multipart-initialization caller, and selects relative transfers for the new
in-range tails. Fresh assembly measured 13,450 code bytes plus 368 immutable
bytes, for a 13,818-byte compiler core. Workspace was 1,401 bytes and the
selected runtime was 561 bytes.

The inferred-constant pass removes the scalar-type phrase from constant
declarations and records integer constants as exact values while retaining
Boolean constants as Boolean. The Chapter 21 proof uses one integer constant
in both `u8` and `u16` contexts and rejects an out-of-range use rather than its
declaration. Regenerated LL(1) tables and actions reduce the active compiler by
seven code bytes. Fresh assembly measures 13,443 code bytes plus 368 immutable
bytes, for a 13,811-byte compiler core with 1,401 bytes of workspace. The
largest generated program remains 945 bytes and the selected runtime remains
561 bytes. The expanded 1,326-byte proof executes 1,141,034 instructions in
10,733,651 T-states. The core remains 2,573 bytes inside the 16 KiB gate.

The sealed-string representation caps `string[N]` at 253 and gives every
string a permanent zero byte after its payload capacity. The length byte,
payload, and sealed byte therefore occupy at most 255 bytes. Every complete
aggregate extent remains a direct, nonzero byte from 1 through 255. Runtime
length checks reject a corrupted `L = 255` before `.length` or indexing can use
it. The representative Stage 7 string program grew because generated string
operations now perform complete-region and length-invariant validation; the
permanent zero itself adds one static-data byte per string object.

The original implementation milestone, before the later 255-byte object
correction, measured 13,616 code bytes plus 368 immutable bytes, for a
13,984-byte compiler core with 1,405 bytes of workspace. The selected runtime
is 585 bytes. The unchanged 1,326-byte Chapter 21 proof executes 1,147,209
instructions in 10,800,907 T-states. Relative to the inferred-constant
baseline, the sealed-string change adds 173 core bytes, four workspace bytes,
and 24 runtime bytes. Those figures include the retired 256-byte object paths;
they are historical evidence, not the current cost of the sealed byte. The core
remains 2,400 bytes inside the 16 KiB gate.

The subsequent correctness review found that an incompatible exact constant
was diagnosed at the end of its expression rather than at the constant name.
The repaired parser retains offset, line, and column for both operands in each
pending expression entry. The Chapter 21 proof now locks the direct and nested
use positions and rejects named Boolean and integer constants in the opposite
category. Additional aggregate proofs reject a corrupted length through both
`.length` and indexing and distinguish the accepted `string[253]` boundary
from rejected capacities 254 and 255.

Before the follow-up size pass, fresh assembly measures 13,687 code bytes plus
368 immutable bytes, for a 14,055-byte compiler core with 1,509 bytes of
workspace. The selected runtime remains 585 bytes and the largest Chapter 21
program remains 1,019 bytes. The expanded 1,449-byte Chapter 21 proof executes
1,188,701 instructions in 11,211,558 T-states. These figures are the repaired
correctness baseline, not a size plateau.

A follow-up state-liveness audit found that the six-byte retained declaration
position overlapped four bytes of the retained expression position. The state
layout now gives those positions disjoint storage, and the Stage 8 proof
retains a declaration name across a nontrivial initializer before checking its
exact duplicate-name offset, line, and column.

The follow-up size pass avoids copying the left operand's six-byte position
into a second workspace cell. Each pending-expression entry already retains
that position, so the reducer now keeps a two-byte pointer to the live entry.
The range-error tail falls through to the common diagnostic path. The final
local pass inlines the single-use constant multiply and divide paths, removes
the second divisor-zero test after the first has proved a constant divisor
nonzero, folds two Boolean-suppression selectors into their call sites,
shortens the expression-entry address calculation, and uses `JR` for the final
range-qualified call-argument failure branch. Fresh assembly measures 13,649
code bytes plus 368 immutable bytes, for a 14,017-byte compiler core with 1,509
bytes of workspace. The selected runtime remains 585 bytes, and the largest
Chapter 21 program remains 1,019 bytes. The 1,449-byte Chapter 21 proof executes
1,188,358 instructions in 11,202,292 T-states.

Three arithmetically promising rewrites were rejected by executable evidence:
a shared six-byte position-copy helper disturbed the Stage 9 proof; inlining
the fixed-width `ForNext` semantic reader changed the first Chapter 21
program's runtime result; and conditional calls could not replace the two
initializer-capacity helpers because successful `CP` paths deliberately retain
carry. The proven inline copies, reader boundary, and capacity helpers remain.

The first post-Stage-9 language increment adds `$` hexadecimal and `%` binary
integer literals. Their scanners share base-dependent accumulation but retain
separate four- and sixteen-digit overflow guards; the decimal value guard is
unchanged. The Chapter 21 corpus accepts both spellings at their 16-bit
boundaries and rejects a fifth hexadecimal digit and seventeenth binary digit
at the literal position. Fresh assembly measures 13,736 compiler-code bytes
plus 372 immutable bytes, for a 14,108-byte compiler core with 1,509 bytes of
workspace. The largest generated program remains 1,019 bytes and the selected
runtime remains 585 bytes. The expanded 1,501-byte Chapter 21 proof executes
1,248,626 instructions in 11,767,489 T-states. Relative to the Stage 9 plateau,
the feature adds 87 compiler-code bytes and four immutable descriptor bytes,
for 91 compiler-core bytes in total; it changes no workspace, generated, or
runtime account.

The next increment adds integer-only `xor` at the same precedence as `or`.
The existing integer-pair resolver supplies exact-constant adoption, widening,
and Boolean rejection; the backend adds width-specific semantic operations and
direct Z80 templates, while the constant path folds both bytes. The Chapter 21
corpus proves left association, constant folding, runtime `u8` and `u16`
execution, and rejection at a Boolean `xor`. Fresh assembly measures 13,803
compiler-code bytes plus 377 immutable bytes, for a 14,180-byte compiler core
with 1,509 bytes of workspace. The largest generated program remains 1,019
bytes and the selected runtime remains 585 bytes. The 1,553-byte Chapter 21
proof executes 1,316,919 instructions in 12,402,392 T-states. Relative to the
numeric-literal commit, `xor` adds 67 compiler-code bytes and five immutable
bytes, for 72 compiler-core bytes in total; it changes no workspace, maximum
generated-program, or runtime account.

The following increment adds integer `mod` at multiplicative precedence. The
constant folder retains the remainder already produced by its division loop;
the generated backend selects a shared runtime division core whose quotient
and remainder entry points preserve the same zero-divisor trap. The Chapter 21
corpus proves constant folding, runtime `u8` and `u16` remainder, and rejection
of a constant zero divisor at that divisor. Fresh assembly measures 13,847
compiler-code bytes plus 382 immutable bytes, for a 14,229-byte compiler core
with 1,509 bytes of workspace. The largest generated program remains 1,019
bytes. The selected runtime is 596 bytes. The 1,653-byte Chapter 21 proof
executes 1,428,311 instructions in 13,446,134 T-states. Relative to the `xor`
commit, `mod` adds 44 compiler-code bytes and five immutable bytes, for 49
compiler-core bytes, and 11 runtime bytes; workspace and maximum generated
program size do not change.

The next increment changes only the target runtime. `MultiplyU16` and the
shared divide/modulo core recognize nonzero power-of-two operands whose high
byte is zero. Multiplication shifts left; division shifts the quotient right
while retaining the remainder required by `mod`. Operands at or above 256 stay
on the existing general paths, where repeated division is already bounded and
the shortcut would be slower. Direct runtime proofs cover zero, 1, 2, 255,
256, 257, and 65,535 for quotient, remainder, and wrapped product. Measured
compiler code remains 13,847 bytes, immutable data 382 bytes, compiler core
14,229 bytes, workspace 1,509 bytes, and maximum generated program 1,019
bytes. The selected runtime grows by 53 bytes, from 596 to 649. The unchanged
1,653-byte Chapter 21 proof executes 1,428,272 instructions in 13,445,707
T-states. This is a runtime-only increment: no compiler-core, workspace, or
generated-output account moves.

The final Track A increment adds top-level compile-time `assert`. The packed
grammar delegates its operand to the existing constant-expression island; one
action accepts only a constant Boolean result, rejects false with a dedicated
diagnostic at `assert`, and emits no semantic operation. The Chapter 21 proof
accepts a true relationship, rejects false and exact-integer operands at the
keyword, and compares the generated image against an equal-position comment
control byte for byte. Fresh assembly measures 13,895 compiler-code bytes plus
390 immutable bytes, for a 14,285-byte compiler core with 1,509 bytes of
workspace. The largest generated program remains 1,019 bytes and the selected
runtime remains 649 bytes. The 1,786-byte Chapter 21 proof executes 1,502,625
instructions in 14,130,034 T-states. Relative to the runtime-fast-path commit,
`assert` adds 48 compiler-code bytes and eight immutable bytes, for 56
compiler-core bytes; it changes no workspace, maximum generated-program, or
runtime account.

The subsequent segmented-output experiment separates code, read-only load
bytes, initialized RAM, and zero-initialized RAM. It widens total program-data
accounting to independent 1 KiB initialized-data and BSS regions, but does not
widen an individual aggregate object. Exact-fill proofs use four 255-byte
sealed-string objects plus a four-byte tail. The first rejected byte is
diagnosed in both regions, and startup copies or clears exactly 1,024 bytes
without changing the following canary.

The 255-byte object correction removes the retired zero-means-256 extent
encoding, 256-byte array-stride path, and special 256-byte copy and region
cases while retaining the sealed byte. Fresh production assembly measures
14,300 compiler-code bytes plus 390 immutable bytes, for a 14,690-byte compiler
core with 2,564 bytes of workspace. The selected runtime is 657 bytes. The
Stage 7 proof executes 1,359,658 instructions in 12,670,276 T-states; the
Stage 8 proof executes 1,620,565 instructions in 15,105,354 T-states; and the
Stage 9 proof executes 1,510,705 instructions in 14,226,734 T-states. Relative
to the immediately preceding segmented-output plateau, the correction removes
49 compiler-code bytes, one workspace byte, and four selected-runtime bytes.

The following aggregate-width correction supersedes that object ceiling.
Dynamic descriptors now retain a 16-bit array length and a separate 16-bit
complete extent. Record-field offsets and record extents are also words.
Selection, region validation, and exact-type copying consume those word values;
arrays use the element's complete word extent as their stride. Bounded strings
remain capped at `string[253]`, but participate in the same complete-extent,
allocation, region-checking, and copying paths as every other aggregate.

The active segmented compiler admits one complete object up to the enclosing
1,024-byte initialized-data or BSS region. This is an allocation capacity, not
a type-system ceiling: the source array bound remains 1 through 65,535, and a
later memory-map profile can enlarge the program-data regions without another
aggregate-representation change. The proof constructs and copies a 501-byte
record containing two wide arrays, indexes through its word field offset and
word stride, accepts an exact 1,024-byte array, rejects the first 1,025-byte
object, and publishes an explicit 256-byte initialized array.

Fresh production assembly measures 14,311 compiler-code bytes plus 390
immutable bytes, for a 14,701-byte compiler core. Workspace is 3,623 bytes,
including the 1,024-byte object-building scratch and 511-byte semantic
transcript. The selected runtime is 655 bytes, and the largest Chapter 21
generated program is 1,040 bytes. The expanded Stage 7 proof executes
1,701,877 instructions in 15,720,339 T-states and occupies 3,044 proof bytes.

The post-correctness compression pass saves 41 compiler-core bytes without
changing workspace, generated-program, or runtime accounts. The first measured
pass removes 23 bytes through direct word-table address arithmetic, one
explicit-initializer flag, a shared bounded-string extent reader, and compact
descriptor publication. The final 18 bytes come from folding call-offset reads
into that string reader, inlining the sole initializer-entry and field-lookup
paths, and removing two one-call wrappers and a redundant return. A shared
RD/LL(1) array-extent helper was rejected after it grew the selected production
image by five bytes. Executable proof also rejected a proposed manual
descriptor-copy loop, so the proven `LDIR` form remains.

The recoverable-error consumption redesign replaces `or fail` with same-line
`else fail`, replaces delayed `on error` attachment with immediate
`handle NAME ... end`, and makes `return` success-only. The grammar and
generated tables now keep Boolean `or` independent from propagation, while
`on` and `error` are ordinary identifiers. Handler eligibility no longer
survives a statement newline; the retained call-mode patch and control frame
are selected while `handle` is the current token.

The measured pre-change account at commit `0cc5a6f` was 14,311 code bytes plus
390 immutable bytes, for a 14,701-byte compiler core. The parser was 9,226
bytes: 230 engine, 760 tables, 2,791 actions, and 5,445 residual islands.
Workspace was 3,623 bytes; the largest Chapter 21 generated program was 1,040
bytes; and the selected runtime was 655 bytes. The Stage 7 proof occupied
3,044 bytes and executed 1,701,877 instructions in 15,720,339 T-states.

After correctness review and the focused size pass, fresh assembly measures
14,208 code bytes plus 387 immutable bytes, for a 14,595-byte core. The parser
is 9,123 bytes: 230 engine, 746 tables, 2,699 actions, and 5,448 residual
islands. Workspace is 3,622 bytes; the largest Chapter 21 generated program
remains 1,040 bytes; and the selected runtime remains 655 bytes. The Stage 7
proof occupies 3,046 bytes and executes 1,698,773 instructions in 15,699,547
T-states. The expanded Stage 8 proof occupies 3,575 bytes and executes
1,960,585 instructions in 18,249,735 T-states. The Chapter 21 proof remains
1,883 bytes and executes 1,516,312 instructions in 14,282,612 T-states.

The exact compiler-core saving is 106 bytes: 103 code and three immutable
keyword bytes. Keyword retirement contributes the three immutable bytes, and
the grammar tables contribute 14 code bytes. Semantic actions fall by 92
bytes overall. Within that action total, success-only return removes 104 bytes
and obsolete delayed-handler state removes 22 bytes plus one workspace byte;
the immediate-consumer checks and lowering add back 43 bytes. The final size
pass removes another nine action bytes by relying on the already-proved
pending-call entry invariant and converting three in-range absolute branches
to relative branches. The expression island adds three bytes to reject a
pending failable call before Boolean `or`. These component changes sum to the
measured 103-byte code reduction. Generated output and runtime size do not
move; proof execution changes reflect the new spellings and stronger accepted
and rejected coverage.

Source-defined routines and predefined services now publish and lower through
one completed-call path. A service selector packs the dense target, its fixed
zero-or-one-argument signature, successful-result category, and keep/discard
choice into one byte. Source calls retain their variable parameter metadata,
while both kinds share scalar-argument validation, call publication, failure
selection, retained-carrier cleanup, and successful-result handling. Only the
activation-backed source invocation and fixed-runtime service invocation tails
remain distinct. The source language, runtime bytes, and four-call nesting
capacity are unchanged. The only generated/diagnostic difference corrects a
pre-existing nested-call source offset, as recorded below.

The clean baseline at `04f83233` measured 14,208 code bytes plus 387 immutable
bytes, for a 14,595-byte core and 3,622 bytes of workspace. The unified path
measures 14,083 code bytes plus 393 immutable bytes, for a 14,476-byte core and
3,613 bytes of workspace. The parser removes 88 bytes and the callable backend
removes 37; the six-byte immutable service-selector table makes the exact net
core saving 119 bytes. Eight workspace bytes come from four eight-byte call
frames and one from folding service keep/discard into the selector. Source call
records shrink from 11 to 10 transcript bytes and service records from eight to
seven. The parser is 9,035 bytes: 230 engine, 746 tables, 2,699 actions, and
5,360 residual islands. The selected runtime remains 655
bytes and the largest Chapter 21 generated program remains 1,040 bytes. A
temporary comparison matched 81 of 83 baseline generated publications exactly.
The remaining two keep the same size and differ only in one immediate source-
offset byte: a failable service whose argument contains an infallible source
call now correctly records the outer service call rather than the nested call.
This diagnostic correction is deliberate; every other generated byte matches.
The Stage 7 proof remains 3,046 bytes and executes 1,696,273 instructions in
15,674,472 T-states; Stage 8 grows to 3,692 bytes for the nested-call failure
position and four-frame service-argument discriminators and executes 2,025,763
in 18,849,650; Chapter 21 remains
1,883 bytes and executes 1,513,884 in 14,258,168.

The packed action dispatcher now groups three measured families behind
parameterised physical handlers while preserving all 71 logical action names
and their `$80..$C6` ordinals. The existing two-byte direct action directory
remains the smallest representation: a second physical-handler directory
would cost more than the few profitable groups save. The dispatcher already
leaves the zero-based action ordinal in A, so the shared handlers need no
engine instructions, parameter table, or writable state.

The clean baseline at `bcfccd19` measured a 230-byte engine, 746 bytes of
tables, and 2,699 bytes of action code. The tables comprise an 80-byte row
directory, 210 prediction-row bytes, 77 production-directory bytes, 237
production-body bytes, and the 142-byte action directory. The seven retained
`x:` entries occupy 213 bytes within the action extent; the other retained
parser islands occupy 5,360 bytes. The three scalar-type entries shrink by
eight bytes, `exit`/`continue` by five, and `to`/`until` by three. Engine, tables,
directory, external entries, and residual islands do not move. The resulting
parser is 9,019 bytes: 230 engine, 746 tables, 2,683 actions, and 5,360 residual
islands. Compiler code is 14,067 bytes plus 393 immutable bytes, for a
14,460-byte core; workspace remains 3,613 bytes.

Other audited families do not pay. The declaration, parameter, local, and
result type-retention actions have different saved-state and failure-unwind
contracts. Initializer and control-frame actions differ before their already
shared tails. Fixed-operation and flow actions are either singletons or
already share their complete profitable suffix. The substantial `x:` islands
retain distinct parser/result contracts and remain direct entries.

All existing semantic-buffer hashes and active generated-program hashes match
the baseline, as do the selected runtime bytes. The largest generated program
therefore remains 1,040 bytes and the selected runtime remains 655 bytes. The
Stage 7 proof remains 3,046 bytes and executes 1,696,205 instructions in
15,673,656 T-states; Stage 8 remains 3,692 bytes and executes 2,025,638 in
18,848,156; Chapter 21 remains 1,883 bytes and executes 1,513,817 in
14,257,361.

A subsequent current-core compression pass shares the segmented startup-entry
tail with the ordinary program-header emitter, tail-enters the existing exact
1 KiB aggregate-capacity check from program-segment allocation, removes one
zero-displacement branch, and converts one terminal call/return to a tail
jump. The header merge saves 16 bytes after pricing its required two-byte
bridge; the capacity-tail merge saves 15; and the two local tails save three.
Compiler code is therefore 14,033 bytes plus 393 immutable bytes, for a
14,426-byte core. The parser is 9,001 bytes: 230 engine, 746 tables, 2,665
actions, and 5,360 residual islands. The typed/aggregate sink is 3,243 bytes.
Workspace remains 3,613 bytes, the largest generated program remains 1,040
bytes, and the selected runtime remains 655 bytes. Baseline/current comparison
keeps complete semantic buffers, active generated publications, and runtime
bytes identical. The Stage 7 proof executes 1,696,249 instructions in
15,674,079 T-states; Stage 8 executes 2,025,638 in 18,848,024; and Chapter 21
executes 1,513,833 in 14,257,474.

The next semantics-preserving compression pass removes another 105 code bytes.
Three declaration lookups share one LL(1)-action prelude, saving 11 bytes;
overlapping Z80 templates share their existing immutable bytes, saving 16;
ordinary and forward routine publication share one routine-table writer,
saving 23; and three routine-end sites share selection and semantic emission,
saving 29. The string length and index checks share their generated-code tail,
saving 19 bytes. A scalar-path tail saves four more bytes, and unary negation
and complement share their emission setup for two; the resulting scalar-path
transfer is then relative, saving the final byte.

Fresh assembly measures 13,928 code bytes plus 393 immutable bytes, for a
14,321-byte core. The parser is 8,931 bytes: 230 engine, 746 tables, 2,602
actions, and 5,353 residual islands. The typed/aggregate sink is 3,208 bytes.
Workspace remains 3,613 bytes, the largest generated program remains 1,040
bytes, and the selected runtime remains 655 bytes. The Stage 7 proof remains
3,046 bytes and executes 1,696,451 instructions in 15,676,452 T-states; Stage
8 remains 3,692 bytes and executes 2,025,934 in 18,851,465; and Chapter 21
remains 1,883 bytes and executes 1,514,048 in 14,259,956.

The next measured compression pass removes 200 compiler-code bytes, 13
workspace bytes, and 73 selected-runtime bytes. Shared retained-name
comparison and publication account for 65 compiler bytes; source-position
copying saves eight; tokenizer token and escape paths save 22; and interning
ten duplicate grammar productions saves 12 table bytes. Configuration-specific
reset inlining saves 11 bytes. Root-frame, trap, failable-call, aggregate
carrier, arithmetic, and routine-frame sharing remove 77 bytes, and five newly
reachable relative transfers remove the last five. The parser is 8,844 bytes:
230 engine, 734 tables, 2,573 actions, and 5,307 residual islands. The
typed/aggregate sink is 3,133 bytes.

Fresh assembly therefore measures 13,728 code bytes plus 393 immutable bytes,
for a 14,121-byte compiler core. The LL(1) action scratch now overlays inactive
aggregate-initializer staging, reducing workspace from 3,613 to 3,600 bytes.
Runtime reset, activation-capacity, index/length checks, and byte-service reads
reduce the selected runtime from 655 to 582 bytes. The largest generated
program remains 1,040 bytes. Baseline comparison keeps every semantic
transcript identical. Generated publications keep the same sizes and bytes
except for absolute `CALL` operands relocated to the same named entries in the
smaller runtime. The Stage 7 proof remains 3,046 bytes and executes 1,702,331
instructions in 15,737,944 T-states; Stage 8 remains 3,692 bytes and executes
2,032,759 in 18,918,203; and Chapter 21 remains 1,883 bytes and executes
1,520,260 in 14,322,659.

A focused helper pass removes another 116 compiler-code bytes. Five repeated
compiler operations—exact `main` comparison, Boolean-left classification,
declaration-type extraction, expected-type publication, and emitted `POP
HL`—account for 76 bytes. Shared opcode-and-push, comparison-emission, and
control-frame-label tails remove 32 more. The two validation helpers save only
seven bytes: their diagnostic exits require a caller-side carry return, a cost
that the initial byte estimate omitted. A newly reachable relative transfer
removes the final byte. This leaves the parser at 8,765 bytes:
230 engine, 734 tables, 2,510 actions, and 5,291 residual islands. The typed
and aggregate sink is 3,096 bytes.

Fresh assembly measures 13,612 code bytes plus 393 immutable bytes, for a
14,005-byte compiler core. Workspace remains 3,600 bytes, the largest generated
program remains 1,040 bytes, and the selected runtime remains 582 bytes. A
temporary baseline comparison keeps generated publications and selected
runtime bytes identical. The Stage 7 proof remains 3,046 bytes and executes
1,702,823 instructions in 15,743,156 T-states; Stage 8 remains 3,692 bytes and
executes 2,034,307 in 18,936,135; and Chapter 21 remains 1,883 bytes and
executes 1,521,339 in 14,334,990.

The aggregate-constant increment adds explicitly typed record, fixed-array,
and bounded-string constants. Initialized program data remains the prefix of
the generated read-only segment; constant bytes form a suffix, and symbols
retain offsets relative to that suffix. Declaring initialized data after a
constant shifts the suffix without changing those offsets. Startup still
copies only the initialized-data prefix. Direct constant-rooted assignments
are rejected, while an ordinary aggregate alias deliberately carries no
read-only marker.

The correctness form measured 13,851 compiler-code bytes. A focused pass
removed 40 bytes by sharing root emission and alias-load tails, computing the
combined published length directly, simplifying constant commit, and moving
the data-length update out of its temporary stack lifetime. A shared two-region
runtime predicate removes 12 bytes from the first correct region-check form.

Fresh final assembly measures 13,811 compiler-code bytes plus 393 immutable
bytes, for a 14,204-byte compiler core. The parser is 8,943 bytes: 230 engine,
755 tables, 2,627 actions, and 5,331 residual islands. The typed/aggregate sink
is 3,117 bytes. Workspace is 3,602 bytes, the largest generated program remains
1,040 bytes, and the selected runtime is 596 bytes. The Stage 7 proof is 3,501
bytes and executes 2,171,678 instructions in 20,115,678 T-states; Stage 8 is
3,692 bytes and executes 2,035,400 in 18,945,941; and Chapter 21 is 1,935 bytes
and executes 1,655,345 in 15,585,591. Relative to the preceding plateau, the
feature adds 199 compiler-core bytes, two workspace bytes, and 14 selected
runtime bytes; immutable compiler data and the largest generated program do
not change.

## Target-system implementation increment

The [target-system specification](target-system-specification.md) defines the
approved shape for target profiles, startup, runtime vectors, and one-program
banking. The [object-stream format](nucleus-object-format.md) defines the exact
NOBJ 0.1 wire representation. This section records implementation order,
budget, and unresolved compiler representations only. It does not amend either
specification or the Z80 runtime contract.

The `d611a696` baseline is 13,811 compiler-code bytes plus 393 immutable bytes,
for a 14,204-byte core. Workspace is 3,602 bytes and the selected runtime is
596 bytes. The 16 KiB gate leaves 2,180 compiler-core bytes. Aggregate constants
measured 199 compiler-core bytes against an earlier 80–150-byte estimate, so
the target-system increment must not rely on the earlier optimistic ranges.

The present bottom-up projection is 405–780 compiler-core bytes before that
estimation correction. Plan around approximately 700 bytes, test feasibility
against a 1,000-byte increment, and stop for design and compression review when
the measured increment reaches 600 bytes. Every retained step reports compiler
code, immutable data, core, workspace, generated output by bank, runtime,
instruction count, and T-states separately.

The multi-bank representation is settled. The compiler submits image bytes to
one sequential operating-layer spool and resolved replacement bytes to another.
Image records carry bank ordinals and target addresses. The compiler retains
only currently unresolved fixup sites and releases each site after the patch
spool accepts its final bytes. The sink serializes the image spool before the
patch spool, then appends the map and terminal commit. The compiler does not
retain complete bank images or generated routines, replay the semantic
transcript per bank, or ask the consumer to resolve symbols or branch kinds.

The target layout places generated read-only data before generated code. The
parser publishes initialized-data and per-bank aggregate-constant lengths before
emission; startup and runtime lengths are also fixed. The backend can therefore
derive read-only bases, code bases, aggregate-constant addresses, and the ROM
copy-source address without patching them. Remaining patches cover generated
control-flow sites, genuine routine forwards, and the entry transfer to `main`.

NOBJ 0.1 uses a three-byte record header, dense record tags, little-endian
fields, a fixed versioned begin record, one variable map, and a CRC-16-covered
terminal commit. The compiler-facing logical calls may be smaller than the wire
encoder, because the storage sink supplies profile-only fields, framing, and
the running CRC. Patch calls may arrive while image emission continues and in
an address order determined by target resolution. The sink preserves that order
in its patch spool and places the complete spool after all image records.

The storage adapter owns atomic generations. An aborted or truncated pair of
spools has no commit and cannot replace the preceding committed object. This
removes the compiler-side generated-image and rollback buffers while preserving
the separate external-storage account. TEC-FS needs two sequential temporary
spools and atomic commit, not random writes. It may copy the patch spool after
the image spool or join their storage chains. A RAM loader or host ROM utility
materializes the committed stream and applies its byte patches later.

The current proof memory map reserves 4,096 bytes for generated output and
4,096 bytes for its rollback copy. Streaming makes both regions unnecessary, a
projected release of 8,192 Z80 address-space bytes before any small transport
state is measured. This is not a compiler-core saving. The current structured
fixup capacity remains 32 three-byte unresolved-site records, or 96 compiler
workspace bytes. NOBJ adds six framing bytes around each patch payload, so a
one-byte patch occupies seven external bytes and a word patch occupies eight.

The target-system specification settles runtime layout independently of that
experiment: every bank carries one complete 596-byte selected helper image.
This costs device-image bytes rather than compiler-core bytes and preserves one
runtime identity and helper-offset table. Per-bank helper subsetting is not a
candidate for this increment.

Every bank also reserves a three-byte entry slot. Only the entry bank emits
`JP startup`; all selected runtime images begin at `bankWindowBase + 3`. Record
the three-byte capacity cost in every bank and the emitted-byte cost in the
entry bank separately.

Implementation proceeds in measured increments:

1. add the compact target descriptor and runtime-identity rejection without
   changing generated bytes;
2. derive loaded and ROM layouts with read-only data before code and report
   first-free image addresses;
3. merge runtime vectors, initialized variables, and BSS into the upward
   writable allocation;
4. add inherited and top-of-writable established stack modes, proving incoming
   `SP` restoration on success, unhandled failure, and traps;
5. add the two-spool append-only NOBJ sink with deliberately unequal compiler
   and target addresses, plus byte-exact image, arbitrary-order patch, spool
   serialization, map, CRC, commit, and abort proofs;
6. install and call the RAM-resident service and terminal vectors;
7. implement source-part bank mapping, bank-tagged output records, and one
   entry pair, including entry-bank source ordering and exact bank-capacity
   diagnostics, with the uniform three-byte bank-entry slot;
8. implement local versus far-call lowering and all three cross-bank aggregate
   restrictions;
9. force a divergent late failure after image output and prove that the new
   stream has no commit while the previous committed generation remains
   current; separately reject a missing commit and an invalid patch; and
10. obtain a read-only correctness review, perform measured compression, and
    obtain a final correctness-and-size review before commit.

No target-system implementation begins until the specification text is
approved. The object-sink increment must be measured before later banked work
depends on it; a 600-byte cumulative target-system increase still triggers the
existing stop-and-review gate.

## Capacity ledger

The first implementation fixes a numeric limit before each bounded structure is
used. Each row remains open until a Z80 representation and a minimum corpus
requirement are both known.

| Resource                                |      Limit | Representation                                                                        | Excess diagnostic or trap                                                        | Evidence                                                                          |
| --------------------------------------- | ---------: | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| source part count                       |          8 | external five-byte descriptors plus three compiler-workspace bytes                    | capacity diagnostic                                                              | accepted 1- and 8-part units; rejected ninth part                                 |
| diagnostic-name bytes                   |   external | retained by the host manifest adapter, not by the compiler core                       | packaging diagnostic                                                             | exact `model.nu` and `main.nu` mapping                                            |
| identifier bytes                        |        255 | source-backed name plus one-byte length                                               | lexical diagnostic                                                               | scanner wrap guard                                                                |
| ordinary scalar symbols                 |         16 | six-byte source-backed entries                                                        | capacity diagnostic                                                              | duplicate, unknown, and seventeenth-name proof                                    |
| direct routine declarations             |          4 | eight-byte source-backed entries                                                      | capacity diagnostic                                                              | rejected fifth routine                                                            |
| retained direct parameters              |         16 | four-byte source-backed entries                                                       | capacity diagnostic                                                              | accepted sixteen-position call and rejected seventeenth parameter                 |
| nested compiler call frames             |          4 | eight-byte parser frames                                                              | capacity diagnostic                                                              | rejected fifth nested call                                                        |
| LL(1) grammar symbols                   |         64 | byte stack; thirteen bytes of action scratch overlay inactive initializer state       | parser-capacity diagnostic                                                       | exact-fill and atomic internal-overflow engine proof                              |
| dynamic types, records, and fields      | 8 / 5 / 12 | four-byte type, two-byte record, and six-byte field entries                           | capacity diagnostic                                                              | accepted nested layout and metadata exhaustion proofs                             |
| fixed-array element count               |     65,535 | retained word; allocation is bounded separately by complete extent                    | program-data capacity diagnostic when the object cannot fit                      | accepted and indexed `u8[1024]`; rejected allocated `u8[1025]`                    |
| bounded-string capacity                 |        253 | descriptor byte; object extent is capacity plus two                                   | `bounded-string-capacity`; use `u8[N]` plus a scalar length for constructed text | accepted 253 and rejected 254/255; zero payload and sealed-byte proof             |
| complete aggregate type extent          |     65,535 | retained word shared by records, arrays, and bounded strings                          | program-data capacity diagnostic when an allocated object cannot fit             | 501-byte nested record; exact 1,024-byte object; rejected 1,025-byte object       |
| retained forward signatures and names   |          4 | shared eight-byte routine entries plus one main-forward flag                          | capacity diagnostic                                                              | mutual recursion, incomplete forward, and forward-main proofs                     |
| scalar parameters                       |         16 | shared four-byte retained-parameter entries                                           | capacity diagnostic                                                              | accepted sixteen-position call and rejected seventeenth parameter                 |
| expression nesting                      |         16 | thirteen-byte metadata entries retaining operand value, type, and position            | capacity diagnostic                                                              | seventeen-deep pending-expression proof                                           |
| semantic transcript payload bytes       |        511 | counted variable-width stream                                                         | capacity diagnostic                                                              | widened assignment-exhaustion proof                                               |
| semantic transcript operations          |        255 | one-byte published operation count                                                    | capacity diagnostic                                                              | pre-append operation-count guard                                                  |
| Boolean fixups                          |         16 | two-byte generated addresses                                                          | capacity diagnostic                                                              | exhaustion and underflow boundary proofs                                          |
| active control frames                   |          8 | ten-byte parser frames                                                                | capacity diagnostic                                                              | nested structured-control proofs                                                  |
| dynamic labels                          |         27 | byte ordinals; 27 reserved for callable `main`, 28–31 for retained routines           | capacity diagnostic                                                              | exact allocation boundary and callable-main proofs                                |
| branch fixups                           |         32 | three-byte absolute records                                                           | capacity diagnostic                                                              | bounded resolver and generated branch proofs                                      |
| object-stream total records             |     65,535 | NOBJ `COMMIT.recordCount` word                                                        | output-service failure or capacity diagnostic before count wrap                  | exact framing and count boundary required before target work                      |
| object-stream patch records             |     65,531 | external sequential patch spool; exact maximum when one required image record is used | output-service failure or total-record capacity diagnostic before partial record | resolution-order submission, image-before-patch serialization, and count boundary |
| object-stream image or patch bytes      |     65,532 | one NOBJ record with a word payload length and three-byte bank/address prefix         | output-service failure or target-capacity diagnostic                             | 1/65,532/65,533-byte framing boundaries; interrupted-write proof                  |
| committed object generations            |          1 | storage-layer current-generation reference; incomplete generation remains uncommitted | output-service failure; previous commit remains current                          | divergent late-failure, missing-commit, and successful replacement proofs         |
| structured-initializer depth            |          4 | recursive parser state; total nodes are streamed and not retained                     | capacity diagnostic                                                              | exact nesting boundary and wide 256-element initializer                           |
| initialized program-data bytes          |      1,024 | prefix of the private compiler image plus a retained word length                      | program-data capacity diagnostic                                                 | exact four-string-plus-tail image and rejected following byte                     |
| aggregate-constant bytes                |      1,024 | private-image suffix, one shared length word, and relative-offset symbol payloads     | read-only-data capacity diagnostic                                               | record/array/string constants; exact 1,024-byte suffix and rejected next byte     |
| total generated read-only-data bytes    |      1,024 | initialized-data prefix followed by aggregate-constant suffix                         | diagnostic for the declaration class that first exceeds the combined region      | mixed data/constant shifting and exact separate boundary proofs                   |
| zero-initialized program-data bytes     |      1,024 | retained word length; no stored image bytes                                           | capacity diagnostic                                                              | exact four-string-plus-tail BSS and rejected following byte                       |
| emitted Z80 program bytes               |      4,096 | bounded output cursor                                                                 | capacity diagnostic                                                              | 857-byte Stage 5 bound and rollback proof                                         |
| activation bytes                        |      3,840 | reserved machine-stack region; frame size is bounded by retained declarations         | `activation-capacity` or fixed memory-map rejection                              | memory-map proof, sixteen-position call, and depth boundary                       |
| activation depth                        |          8 | counter plus generated hardware-stack frames                                          | `activation-capacity`                                                            | recursive handler-bypass and root-frame trap proof                                |
| service stream and bulk-storage extents |          4 | proof adapter byte arrays with independent cursors                                    | stable service error                                                             | success, end, configured failure, overwrite, append, rewind, and seek proofs      |

No implementation may wrap, truncate, drop state, or change source meaning when
one of these limits is exceeded.

## Working discipline

Implementation changes follow a short evidence loop:

1. identify the governing language and direct-runtime rules;
2. add or select an executable proof case;
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

Use `JR` for a direct transfer whenever the Z80 has the required relative form
and every supported assembly configuration places the target within the signed
eight-bit displacement range. Use `JP` when the condition has no relative form
or any supported configuration exceeds that range. After a layout change, run
the branch census and the complete scoped proof set again; newly reachable
relative transfers may be converted, while an AZM range failure requires the
affected transfer to fall back to `JP`.

## Continued implementation checklist

Before a new language stage begins:

- outstanding adversarial findings for the current stage are resolved;
- the language, target-system, NOBJ, and direct-Z80 authorities, reviewer
  charter, and published editions agree;
- machine-readable trap and service assignments match the direct runtime
  contract;
- every Chapter 21 program has a source-level expected result;
- the Z80 memory map identifies the compiler bank, compiler workspace, generated
  program destination, target-runtime regions, program code and data, and
  activation arena without overlap; and
- the measurement harness reports compiler bytes, immutable data, peak
  workspace, target-runtime bytes, runtime state, emitted bytes, and T-states
  as separate accounts.
