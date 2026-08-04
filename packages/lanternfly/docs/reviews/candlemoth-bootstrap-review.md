# Candlemoth bootstrap review

Status: current review

Reviewed: 5 August 2026

Targets: `level0.md`, *Lanternfly Level 0 — draft for review*;
`bootstrap-plan.md`, *Candlemoth bootstrap — plan, second draft*

This review checks whether the proposed Level 0 language, bootstrap machine,
seed compiler and validation plan describe one implementable system. It is
non-normative. The 0.7 decisions and reconciled specification remain the
authority.

## Decisions already strengthened

The current drafts make four useful commitments:

- Level 0 contains no inline assembly, placed executable arrays or external
  routine mechanism.
- The harness separates generated code, diagnostics and exit status.
- Size reporting begins with the Phase 0 harness.
- The final fixpoint proves stability only; the conformance corpus and
  differential tests carry the correctness argument.

## Blocking findings

### 1. Forward declarations do not complete the call graph

**Status:** Resolved — Candlemoth becomes a two-pass compiler. Pass one reads
the bodies and collects the call edges, settling cycle membership before pass
two emits. The universal-forward-declaration requirement is withdrawn from
`level0.md`.

**Evidence.** The bootstrap plan requires every routine to be forward-declared
and states that this makes recursive strongly connected components available
before the compiler emits any body. A forward declaration supplies a routine
name and signature. Calls are edges in the graph, and those edges occur inside
the bodies that the compiler has not read yet.

**Consequence.** A single-pass compiler still cannot select recursive
save-around lowering before it emits the first routine body. The proposed
declaration prologue does not solve that problem.

**Smallest credible repair.** Choose one mechanism before Phase 1:

1. parse the complete program once to collect call edges, then rewind and emit;
2. apply the recursive save protocol conservatively to every call; or
3. add explicit source information that identifies recursive groups.

The first option also provides a possible solution to forward output fixups.

### 2. The input intrinsic has two incompatible end conditions

**Status:** Resolved — the operation is renamed `readSourceByte` with `0xFF` as
its terminator, `0xFF` rejected inside source, and the same definition used in
Level 0, the plan, the seed and the corpus.

**Evidence.** `level0.md` defines `pollCharacter()` as returning zero at the
end of input. The bootstrap plan uses `0xFF` because the higher-level standard
operation uses zero for “no character is waiting” and defines no end-of-file
result.

**Consequence.** The seed, Candlemoth and harness can disagree on when source
ends. Reusing the standard operation's name also suggests compatibility that
the proposed end-of-input semantics do not provide.

**Smallest credible repair.** Give the bootstrap operation a distinct name,
such as `readSourceByte`, and define `0xFF` as its end marker. Reject `0xFF`
inside Level 0 ASCII source. Use the same definition in Level 0, the harness,
the seed and the conformance cases.

### 3. The bootstrap plan uses ports that Level 0 cannot address

**Status:** Resolved — the fixup port is removed with the fixup stream, and
`rewindSource` is added as an intrinsic. Level 0 now has one intrinsic per
port.

**Evidence.** Level 0 exposes four intrinsics for input, code output,
diagnostic output and status. The bootstrap plan additionally requires the
fixup stream on port `0x04` and input rewind on port `0x05`. Level 0 has no
assembly or external routine escape through which Candlemoth could reach
either port.

**Consequence.** Candlemoth source cannot implement the bootstrap protocol
described by the plan.

**Smallest credible repair.** Either define explicit Level 0 intrinsics for
every required operation or remove the corresponding port from the design. If
the compiler becomes a two-pass emitter, it needs rewind but may not need the
fixup stream.

### 4. The fixup stream delegates completion of the output image

**Status:** Resolved — the second architecture is taken. Pass one fixes every
address, pass two emits the final image in order, and Candlemoth stays a
complete machine-code-producing filter.

**Evidence.** The plan's goal says that Candlemoth writes Z80 machine code.
The machine section instead has Candlemoth write an append-only code stream
and patch records which the host later applies.

**Consequence.** The host-side fixup applier becomes a required compiler
stage. On hardware, some other program must perform that stage. The stated
character-in, bytes-out filter is therefore not the whole compiler unless the
contract defines its output as a code-and-fixup pair.

**Smallest credible repair.** Decide explicitly between two architectures:

- retain fixups and define the compiler product, bootstrap comparison and
  hardware workflow in terms of both streams; or
- use the existing rewind operation for an address-discovery pass followed by
  an append-only emission pass that produces the final image.

The second form preserves Candlemoth as the complete machine-code-producing
filter at the cost of another source pass.

### 5. Seed transliteration creates a common-mode validation risk

**Status:** Resolved — transliteration is withdrawn. The seed is implemented
independently against the grammar and the canonical lowering table. Exact
bytes are required only for hand-specified lowering vectors and the B/C
fixpoint; the general corpus is compared behaviourally.

**Evidence.** Phase 2 proposes a TypeScript transliteration of Candlemoth so
the seed and Candlemoth can make matching lowering choices. Phase 5 correctly
states that images A and B need not be byte-identical, and the validation plan
relies on two implementations to reveal errors.

**Consequence.** A transliterated seed can reproduce the same algorithmic
mistake as Candlemoth. Exact seed/Candlemoth byte equality is unnecessary for
the fixpoint and weakens their value as independent checks.

**Smallest credible repair.** Implement the seed independently against the
Level 0 grammar, semantics and canonical lowering tables. Require exact bytes
for small hand-specified lowering vectors and for the B/C fixpoint. For the
general corpus, compare behaviour, final storage, ordered services, faults and
diagnostics; record encoding differences for investigation without treating
every difference as a language failure.

### 6. Instruction lockstep cannot compare unrelated compiler images

**Status:** Resolved — lockstep is scoped to B against C, where the images are
expected to match. Seed and Candlemoth output is compared by emitted-stream
prefix and semantic checkpoint.

**Evidence.** Phase 0 proposes stepping two images together until their first
different memory write. Independently implemented compilers have different
code layouts, temporaries and symbol tables even when they implement the same
language correctly.

**Consequence.** Their internal writes diverge almost immediately, before the
comparison reaches a useful semantic difference.

**Smallest credible repair.** Compare emitted-stream prefixes and named
semantic checkpoints for different compiler implementations. Retain
instruction or memory-write lockstep only for images whose lowering and layout
are expected to match.

### 7. Destination-width arithmetic needs a semantic proof

**Status:** Resolved — the canonical lowering table carries the full-width
conforming sequence. Narrowing applies only where analysis proves truncation
preserves the result, and the budget gate measures legal lowering.

**Evidence.** The budget depends on narrowing byte arithmetic to the
destination width. Lanternfly gives intermediate expressions defined types;
premature truncation can change a later comparison, division or shift.

**Consequence.** Applying this lowering generally would make the compiler
smaller by changing program meaning. The current twenty-four-kilobyte estimate
therefore depends on an optimisation whose legal domain is not yet stated.

**Smallest credible repair.** Put the full-width conforming sequence in the
canonical lowering table. Add narrowing only when range or modular-arithmetic
analysis proves that truncation preserves the specified result. Base the first
budget gate on measured legal lowering rather than universal narrowing.

### 8. The bootstrap needs a minimal target profile

**Status:** Resolved — a minimal bootstrap profile is defined: flat 64K,
recursion enabled, no interrupts, the five stream operations and the
non-returning fault service, with unclaimed obligations recorded individually.

**Evidence.** Level 0 requires a target that grants recursion. The bootstrap
plan instead declares that the bootstrap machine has no target profile and is
deliberately non-conforming in several respects.

**Consequence.** The seed and Candlemoth cannot both claim the same conformance
contract while their recursion, memory and fault facilities remain outside a
profile.

**Smallest credible repair.** Define a minimal bootstrap profile: flat 64K
memory, recursion enabled, no interrupts, the bootstrap stream operations and
the non-returning fault service. Record which full Level 0 obligations it does
not claim rather than declaring the entire bootstrap outside conformance.

## Follow-up findings after the third revision

### 9. Call-graph discovery and address layout require separate passes

**Status:** Resolved — three rewindable passes are adopted as recommended:
analysis collects declarations, types and call edges and computes the
recursive components; layout runs the real lowerer against a counting sink and
fixes every address; emission runs the same lowerer against the code stream
and asserts each address agrees with layout.

**Evidence.** The revised plan assigns two jobs to pass one: collecting the
complete call graph and fixing every emitted address. The selected call
lowering depends on whether the caller and callee belong to a recursive
strongly connected component. That component information is complete only
after pass one has read all routine bodies. Changing a call from ordinary to
save-around form changes its byte length and therefore changes subsequent
labels and routine addresses.

**Consequence.** A streaming first pass cannot generally calculate final
addresses while it is still discovering the information that determines
instruction widths. Two source passes suffice only if the compiler retains
enough per-call and per-label layout information to recompute every affected
address after graph analysis, which conflicts with the plan's low-memory
reason for streaming.

**Smallest credible repair.** Use three rewindable source passes:

1. analysis collects declarations, types and call edges, then computes the
   recursive components;
2. layout runs the real lowerer against a counting sink and fixes every
   address with recursion decisions already available; and
3. emission runs the same lowerer against the code stream and asserts that
   every recorded address agrees with the layout pass.

If the plan retains two passes, it must specify the compact intermediate data
that lets pass one recompute layouts after the graph closes and include that
data in the memory budget.

### 10. Reconciliation remnants contradict the revised architecture

**Status:** Resolved — the intrinsic count reads five, the obsolete
non-conformance section is removed in favour of the bootstrap profile, Phase 3
now exercises layout/emission agreement rather than backpatching, and the type
forms are listed explicitly instead of counted.

**Evidence.** Three statements still describe earlier drafts:

- `level0.md` says that Level 0 supplies four intrinsics, but its table lists
  five.
- The bootstrap plan defines a minimal bootstrap profile, then its
  `Deliberate non-conformance` section says that the machine has no target
  profile.
- Phase 3 says that the vertical slice exercises backpatching, although the
  two-pass design removed backpatching and emits a completed image.

The Level 0 seed-effort paragraph also still counts six type forms after the
addition of `i16` and conversions; the intended counting scheme is no longer
clear.

**Consequence.** An implementation agent can follow a superseded rule even
though the main architectural decision has been corrected.

**Smallest credible repair.** Perform one reconciliation pass over both files:
change the intrinsic count, replace or remove the obsolete non-conformance
section, describe Phase 3 as exercising analysis/layout agreement rather than
backpatching, and state the type forms explicitly instead of giving a stale
count.

### 11. A sentinel byte cannot also be diagnosed as source data

**Status:** Resolved — `0xFF` is framing and is never delivered as source
data. The transport producer validates ASCII before delivery and appends the
terminator; rejecting non-ASCII is a producer diagnostic, not a compiler one.

**Evidence.** `readSourceByte` returns `0xFF` to signal end of input. The drafts
also say that an embedded `0xFF` is invalid source and is rejected. At the
compiler boundary those cases have the same byte value, so Candlemoth cannot
distinguish an embedded byte from the transport terminator.

**Consequence.** The compiler will accept a truncated prefix if a producer
places `0xFF` inside the stream, unless another component validates or frames
the input first.

**Smallest credible repair.** Make the transport producer responsible for
validating ASCII before delivery and for appending the reserved terminator.
State that `0xFF` is framing and is never delivered as source data. If
Candlemoth itself must diagnose arbitrary non-ASCII input, use a separate EOF
signal, a length, or an escaped transport instead of an in-band sentinel.

### 12. The five bootstrap operations need a language-level home

**Status:** Resolved — they are bootstrap-profile intrinsics, not core
language. A profile declares intrinsic names with fixed signatures and
lowerings, which the compiler pre-binds in the global scope before parsing — a
table inside the compiler rather than a binding mechanism in the language.
Naming one the profile does not declare is `E-TARGET-001`, and the Level 0
conformance contract states availability and that diagnostic.

**Evidence.** The Level 0 draft describes `readSourceByte`, `rewindSource`,
`writeCodeByte`, `writeDiagnostic` and `setExitStatus` as Level 0 intrinsics.
Level 0 is also defined as a nested subset of Lanternfly whose programs a
Level 2 compiler accepts unchanged. The documents do not yet say whether these
names are permanent core-language operations or facilities supplied only by
the bootstrap profile.

**Consequence.** A later compiler cannot determine whether it must accept
these operations on every target, accept them only when the bootstrap profile
provides them, or reject Candlemoth source outside the bootstrap environment.

**Smallest credible repair.** Define them as bootstrap-profile intrinsics with
fixed signatures and lowering, and state how profile-specific intrinsics enter
name resolution without restoring the general external-binding machinery.
Add their availability and diagnostics to the Level 0 conformance contract.

## Follow-up findings after the first measurements

### 13. Emulator stepping speed is not yet compiler throughput

**Status:** Resolved — a representative proxy now reads 24K of source three
times through the real port handler and halts through `runToHalt`. It
measures **10.1M instructions a second** against the bare loop's 30.3M, so
port callbacks cost roughly threefold. The plan records both rates, states
that everything past them is arithmetic over an unknown instruction density,
and tabulates compile and fixpoint times at 50, 200 and 500 instructions per
source byte — 3.0s to 30.5s for a fixpoint. Phase 3 measures the density.

**Evidence.** The recorded benchmark measures 30.3 million instructions and
254 million emulated T-states per wall-clock second over a tight loop of
sixteen-bit additions and memory accesses with tracing disabled. The plan then
combines that result with an estimated real-hardware compiler rate of 500
source bytes per second to project a three-second self-compile and a ten-second
fixpoint.

Candlemoth now reads the source three times, not once. Its workload also adds
branch-heavy tokenisation, table probes and a JavaScript callback for every
input and output operation. None of those costs appears in the measured loop.

**Consequence.** The 63-times-realtime emulator result is measured, but the
three-second compile and ten-second fixpoint are still estimates. Treating
them as measurements may put the fixpoint and thousands of randomised cases
into the ordinary test loop before their actual cost is known.

**Smallest credible repair.** Keep the measured instruction and T-state rates.
Label the compiler and fixpoint times as projections until Phase 0 runs a
representative proxy that reads a large source stream three times, performs a
tokenizer-shaped branch and table workload, emits bytes through the real port
handler and halts through `runToHalt`. Use that result to decide which checks
run on every compiler edit and which run in a larger gate.

### 14. Three-pass terminology is not reconciled throughout the plan

**Status:** Resolved — the passes are named analysis, layout and emission
throughout, numbering is used only in the defining list, layout is stated to
emit nothing, and only emission calls `writeCodeByte`.

**Evidence.** The machine section defines analysis, layout and emission as
three passes, but later text still says:

- `writeCodeByte` is used in “pass two only”;
- two passes remove the resident image; and
- cycle membership is settled before pass two emits.

The emission pass is now pass three, and the layout pass emits only to a
counting sink.

**Consequence.** An implementation agent could emit code during layout or
build a harness around the obsolete pass numbering.

**Smallest credible repair.** Replace numbered references outside the
three-pass definition with the stable names `analysis`, `layout` and
`emission`. State that only emission calls `writeCodeByte`.

## Follow-up findings after the Phase 0 harness

The committed Phase 0 suite passes all eight tests. It verifies assembly,
deterministic image construction, the five bootstrap operations, bounded
execution, the halted-PC correction, port masking, source rewind, selectable
read-only ranges, size reporting and byte comparison. The following gaps are
in the tested contract rather than in those implementations.

### 15. The source producer does not enforce the ASCII framing contract

**Status:** Resolved — `BootstrapMachine` validates every source byte at
construction and throws `SourceFramingError` outside printable ASCII, tab,
newline and carriage return. Tests cover an embedded `0xFF`, a non-ASCII
string and accepted whitespace.

**Evidence.** The plan assigns ASCII validation to the transport producer and
states that `0xFF` never arrives as source data. `BootstrapMachine` is that
producer in the test harness, but its `source` option accepts either a string
or an arbitrary byte array. Strings pass through `TextEncoder`, which encodes
non-ASCII text instead of rejecting it, and a byte array containing `0xFF` is
delivered unchanged. The framing test supplies the ASCII string `"Z"`; it
does not exercise either invalid case.

**Consequence.** The harness can present input that violates the boundary on
which Candlemoth's end-of-input rule depends. An embedded `0xFF` truncates the
compiler's view of the source, while other non-ASCII bytes reach a compiler
that the plan says need not diagnose them.

**Smallest credible repair.** Validate every source byte before the machine
runs and reject values outside ASCII, including `0xFF`. Add tests for a
non-ASCII string and for an explicit byte array containing `0xFF`. Keep the
synthetic terminator produced only after the validated input is exhausted.

### 16. Read-only code protection is optional in the bootstrap machine

**Status:** Resolved — `imageOf` records the loaded extent and the machine
protects it by default, so a run gets the memory contract without asking.
An explicit empty range remains as a deliberate opt-out, and both cases are
tested.

**Evidence.** The plan defines code as read-only and writable store above it.
`BootstrapMachine` makes `romRanges` optional and supplies an empty list when
the caller omits it. The gate run omits the option. A separate test proves
that the runtime blocks writes when a caller supplies the range, but no test
proves that a normal compiler run protects its actual code image.

**Consequence.** A Candlemoth test can accidentally run with writable code
and still pass. The current test establishes that the emulator supports ROM
protection; it does not yet establish the bootstrap machine's memory contract
or prove that Candlemoth never writes into its own image.

**Smallest credible repair.** Make the occupied code range mandatory or derive
it from an image type that retains the loaded extent. Run the gate with that
range enabled, then retain the deliberate-write test as proof that the guard
detects a violation while permitting writes to the store.

### 17. The stack-depth watch cannot measure a stack descending from zero

**Status:** Resolved — depth is the modular distance below the configured
initial pointer, sampled every instruction rather than every 4,096, with the
corresponding pointer reported alongside it. A nested-call test asserts a
depth of at least fourteen bytes and a program that never touches the stack
reports zero.

**Evidence.** The harness sets `SP` to `0x0000`, so the first push wraps it to
the top of memory. `runToHalt` initialises `stackFloor` to zero and updates it
only when a later non-zero stack pointer is numerically smaller. No unsigned
sixteen-bit stack pointer is smaller than zero, so `stackLow` remains zero at
every depth. The suite has no recursive or stack-use case that checks the
reported value.

**Consequence.** Budget exhaustion still prevents a hang, but the promised
named recursion clue carries no stack-depth information. A runaway recursive
compiler and an ordinary infinite loop produce the same useful evidence from
this field.

**Smallest credible repair.** Measure modular distance from the configured
initial stack pointer, retain the greatest observed distance and report the
corresponding stack pointer. Add a small call sequence or push loop whose
expected depth crosses at least one sampling point.

## Measurements to retain as hypotheses

**Status:** Partially resolved — port composition, halted-PC behaviour and raw
emulator stepping speed are measured. Candlemoth throughput and fixpoint time
remain projected; see finding 13. The RST entry counts the vector table and
helper bodies alongside the call-site saving.

The proposed twenty-four-kilobyte budget, RST-site savings, source size,
throughput and bytes-per-construct estimates are useful planning numbers. None
has yet been measured from generated Lanternfly. Label them as estimates until
the Phase 0 harness and Phase 3 vertical slice replace them with results.

In particular, the RST vectors occupy reserved locations in the first 64
bytes. They reduce call-site size, but they are not free: the image needs a
vector layout and usually a jump from each vector to its implementation. The
budget report should count the table, helper bodies and call-site savings
together.
