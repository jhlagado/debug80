# Candlemoth bootstrap — plan, second draft

Goal: a Z80 program that reads level-0 Lanternfly source and writes Z80
machine code, written in level-0 Lanternfly, which compiles its own source
byte-identically.

This draft incorporates three rounds of review. The load-bearing
corrections: the source does not fit in the machine; an append-only output
stream cannot be backpatched, and the passes that fix that also settle the
call graph, which forward declarations cannot; and seed–Candlemoth byte equality
was never needed and buying it would have cost the independence the
validation rests on.

The budget, the RST saving and the source size are estimates unmeasured from
generated Lanternfly, and Phase 3 replaces them
with results. The three measured so far are marked as such.

## Existing components

`createZ80Runtime(program, entry, ioHandlers, { romRanges })` in
`packages/debug80-runtime/src/z80/runtime.ts` — flat 64K, steppable CPU,
full sixteen-bit IN/OUT hooks, no platform. `parseIntelHex` in
`src/z80/loaders.ts`. AZM's `compile()` returning `bin`, `hex` and a `d8m`
symbol table, and its `.routine out … clobbers …` contracts enforced under
`registerContracts: 'strict'`.

No platform-neutral headless session exists: `runUntil`, budgets and traces
live only on `Tec1gHeadlessSession`, which drags in the whole TEC-1G. No
Lanternfly code exists at all.

## The machine

Flat 64K. Code from `0x0000`, writable store above it, stack descending
from `0xFFFF`. `HALT` ends the run. No interrupts, no timer, no devices.

**Input.** `IN A,(0x00)` consumes and returns the next source byte. **End
of input is `0xFF`**, not zero. Zero cannot serve: section 12.4.1 defines
`pollCharacter` as returning zero when no byte is *waiting*, which is a
not-ready answer rather than a finished one, and says outright that an
end-of-file result is outside this edition. On a serial line the two are
different situations and conflating them is a hang. `0xFF` never appears in
level-0 source, which is ASCII, and the test module asserts that. The test
is `IN A,(0) / CP $FF / JR Z,eof` — 25 T-states, six bytes.

`OUT (0x05),A` rewinds the input to offset zero. The compiler does not use
it — one walk is enough — but a driver comparing two compilations of the same
source does.

`OUT (0x06),A` and `OUT (0x07),A` seek the code output, low byte then high.
Writing the high byte commits the seek, and a write past the emitted end is a
fault rather than an append.

**Candlemoth is a single-pass compiler**, in the Pascal tradition, and the
language says so itself: **declaration before use** and **`forward`** are
single-pass features. A compiler that read the whole program before emitting
anything would need neither. Their presence in Lanternfly states the design's
shape.

A forward jump emits a placeholder and records where its operand sits;
`placeLabel` writes the target in when it is reached, through the seek
service. That is back-patching, and it is what `forward` exists for.

Two earlier drafts of this section are worth recording because each was
answering a real difficulty in the wrong way.

The first had the compiler emit an append-only stream plus a fixup list the
host applied afterwards, which delegated completion of the image to something
outside the compiler. The seek service keeps that inside.

The second was a three-pass design — analysis, layout, emission — reached
through a circularity: call lowering depends on whether caller and callee
share a recursive component, that changes the call's byte length, and the
component information seemed complete only after every body had been read.
**The circularity is broken by the stub, not by a pass.** A save and a restore
stub are emitted per routine that needs them, so every call site is a fixed
three-byte `CALL` whatever the answer turns out to be. Its operand is patched
to the routine or to its stub once the components are computed, which is after
the source ends and before the image is finished. One source scan, with a
fixup phase over recorded data afterwards.

A revision of this document briefly claimed that `forward` supplies the
component membership instead. It does not — see the paragraph headed
*Save-around-call is settled by analysis, not by declarations*, which already
recorded that an earlier draft proposed the same thing and why it fails.

The three-pass design also cost a label table sized by the whole program: 512
entries and 1,024 bytes, holding every label whether or not anything was still
waiting for it. Against it, the label pool and both patch lists allocate 896
bytes.

| Port | Intrinsic | Direction |
| --- | --- | --- |
| `0x00` | `readSourceByte() as u8` | next source byte, `0xFF` at end |
| `0x05` | `rewindSource()` | return the input to offset zero |
| `0x01` | `writeCodeByte(b as u8)` | the emitted image; **emission only** |
| `0x03` | `writeDiagnostic(b as u8)` | diagnostic text and listing |
| `0x02` | `setExitStatus(b as u8)` | zero for success |

Every port has an intrinsic. The previous draft added ports for fixups and
rewind that Level 0 had no way to reach, since it has no assembly and no
external routines — Candlemoth could not have implemented its own protocol.

**End of input is `0xFF`, and framing is the producer's job.** Section
12.4.1 defines `pollCharacter` as returning zero when no byte is *waiting*,
which is a not-ready answer and not an end-of-file one, and says explicitly
that an end-of-file result is outside this edition. Borrowing that name for
different semantics implies a compatibility that does not exist, so the
bootstrap operation is `readSourceByte`.

`0xFF` is **framing and is never delivered as source data**. The transport
producer, whether the test module or the code that feeds a real machine, validates
that the source is ASCII before delivery and appends the terminator. That
removes an ambiguity the earlier draft carried: a compiler cannot both treat
`0xFF` as the end and diagnose an embedded `0xFF` as bad source, because at
its boundary the two are the same byte, and it would silently accept a
truncated prefix. Rejecting non-ASCII is a validation step outside the
compiler, and the diagnostic for it belongs to the producer.

Handlers must switch on `port & 0xff`. The emulator presents `(A << 8) | n`
on `OUT (n),A` and `IN A,(n)`, so a handler written against `port === 0x01`
never fires — a day-one bug that would look like the compiler producing no
output at all.

`RST 08` is the fault service, with the class in `A` and a distinguishable
halt status, since section 13.1 requires non-returning bounds, range and
arithmetic faults and the machine otherwise gives them no home.

**The `RST` vectors are worth using, and their cost is not zero.** Code
starts at `0x0000`, so all eight are available, and `RST n` is 11 T-states
in one byte against `CALL nn` at 17 in three. Against that, the vectors
occupy reserved locations in the first 64 bytes and each usually needs a
jump to its implementation. The budget report counts the table, the helper
bodies and the call-site saving together rather than claiming the saving
alone.

## The bootstrap profile

Level 0 requires a target that grants recursion, so declaring the bootstrap
machine to have no profile at all was incoherent. It has a minimal one:
flat 64K, recursion enabled, no interrupts, the five stream operations
above, and the non-returning fault service. What it does not claim —
placement classes, cost reporting, address classes, banked storage — is
recorded as an unclaimed obligation rather than a blanket exemption, so the
seed and Candlemoth can hold the same contract.

**The six operations are profile intrinsics, not core language.** They are
not permanent operations every Lanternfly implementation must accept, and
Candlemoth's source is not portable to a target that lacks them. A profile
declares a set of intrinsic names with fixed signatures and fixed lowerings;
the compiler pre-binds those names in the global scope before parsing
begins. That is a table inside the compiler rather than a binding mechanism
in the language, so it restores none of the external-routine machinery Level
0 exists without. A program naming an intrinsic the selected profile does
not declare reports `E-TARGET-001`, which is the same answer the language
already gives for any absent target facility.

The Level 0 conformance contract states their availability and that
diagnostic.

## Memory architecture

The first draft said identifiers are byte ranges into the source buffer
*and* that the source buffer is a sliding window. Those contradict:
offsets into a moving window are not stable. Candlemoth's own source will
be several thousand lines, on the order of 100,000 bytes of text, so it cannot be
resident at all.

- **Source streams** through a window of a few hundred bytes, enough for
  one token plus lookahead.
- **Identifiers are interned** into a name arena of 4–8K. A new identifier
  is compared against the arena once, by content; thereafter it is an
  offset and length into the arena. Interning uses hash buckets holding
  `u16` arena indices.
- **Case folding happens at intern time** and the original spelling is
  discarded. Candlemoth has no strings and cannot echo a name, so the
  spelling is dead weight, and folding once removes case comparison from
  the hottest loop in the compiler.
- **Every local gets its own static slot.** Overlay colouring is dropped
  from level 0: roughly sixty routines at five locals of two bytes is
  about 600 bytes of store, which is affordable, and it deletes a whole
  class of divergence between the two implementations along with a
  subsystem from each.
- **Branch form is fixed, not relaxed: always `JP`, forward and backward
  alike.** An earlier version of this rule allowed `JR` for a backward branch
  in range, which conflicted with the lowering table and with itself. `JR` is
  two bytes whichever displacement it carries, so instruction length was never
  the difficulty; **reachability** is. A backward branch beyond ±127 needs
  `JP`, so allowing `JR` makes the branch form depend on a distance, and a
  distance that two implementations measure differently is a divergence in
  emitted bytes. One shape everywhere costs a byte per backward branch and
  removes the question. `docs/level0-lowering.md` states the same rule and is
  the canonical statement of it.
- **Tables of 256 entries or fewer are page-aligned**, which turns an index
  into `LD H,high(t) / LD L,A` and halves the cost of every lookup. The
  compiler's own record types are **padded to a power of two**, because a
  stride of eight is `ADD HL,HL` three times at 33 T-states and three bytes
  where a stride of six costs 73 and twelve.
- **`IX` and `IY` stay off the hot paths.** Every indexed form costs 60 to
  170 per cent more than its `HL` equivalent, and the static-frame model
  needs no frame pointer, so their one virtue is unused. The tokenizer's
  hot operation is `LD A,(HL) / INC HL` at 13 T-states, against 29 for the
  `IX` form — over 200K of source that is 3.2 million T-states.
- **The shadow registers are released to the allocator.** Section 8.1
  reserves them for an interrupt level, and this machine declares no
  interrupts.

## The budget

### One host, one map

`docs/abstract-machine.md` is the governing statement and this section
follows it. **Candlemoth is a loaded program, and the bootstrap host is the
`flat` profile**: page zero reserved, the runtime at `$0100`, compiler code
and tables above it, stack from the top. Free memory is a little over 63K, and
source and object code stream through services rather than occupying any of
it. Every measurement below is against that map.

The TEC-1 map that follows is **orientation for a profile nobody has built**.
It constrains nothing today. An earlier revision of this section treated it as
the live constraint while the rest of the documents described the loaded
model, so a figure measured against one map was compared with a limit taken
from the other.

### The TEC-1 map, for a future profile

```
0000..1FFF   monitor, and page zero: reset, restarts, NMI     8K
2000..7FFF   RAM: user code, object code, user data          24K
8000..BFFF   the compiler                                    16K
C000..FFFF   shadow ROM                                      16K
```

Bulk storage is an SD card, so a compiler running here streams its source in
and its object code out rather than holding either resident.

If a compiler were ever made resident there, it would face two budgets: a
sixteen-kilobyte code window at `$8000`, which is the expansion ROM's size and
a physical page boundary rather than a target anyone chose, and twenty-four
kilobytes of RAM at `$2000` shared with user data. The TEC-1 banks ROM, so
exceeding the window would cost a bank switch rather than failing.

**None of that applies to Candlemoth as designed.** A loaded compiler is not
resident in the window; it is a file placed in RAM, and the figures below are
against the `flat` map above.

### Arrays, measured

Generated from the declarations by `test/capacity.test.ts`, which fails when
these figures no longer match the source. Two categories, kept apart because
they land in different places: writable arrays are RAM the loaded image
allocates, constant arrays are bytes in the image itself.

<!-- generated:capacity -->
**Writable arrays** — RAM the loaded image allocates.

| Array | File | Bytes |
| --- | --- | --- |
| `callSiteAt` | statement.lafy | 2048 |
| `nameHashA` | tokenizer.lafy | 1280 |
| `nameHashB` | tokenizer.lafy | 1280 |
| `nameNext` | tokenizer.lafy | 1280 |
| `symbolName` | symbols.lafy | 1280 |
| `symbolAddress` | symbols.lafy | 1280 |
| `symbolLength` | symbols.lafy | 1280 |
| `symbolEnum` | symbols.lafy | 1280 |
| `callSiteFrom` | statement.lafy | 1024 |
| `callSiteTo` | statement.lafy | 1024 |
| `symbolType` | symbols.lafy | 640 |
| `symbolFlags` | symbols.lafy | 640 |
| `routineIndex` | symbols.lafy | 640 |
| `bucket` | tokenizer.lafy | 512 |
| `routineAddress` | statement.lafy | 386 |
| `patchAt` | statement.lafy | 128 |
| `patchLabel` | statement.lafy | 128 |
| `labelAddress` | statement.lafy | 64 |
| `keywordName` | tokenizer.lafy | 48 |
| `labelPlaced` | statement.lafy | 32 |
| `labelInUse` | statement.lafy | 32 |
| `helperAddress` | expression.lafy | 28 |
| `loopBreakLabel` | statement.lafy | 16 |
| `loopContinueLabel` | statement.lafy | 16 |
| **Total** | | **16366** |

**Constant arrays** — bytes in the image itself.

| Array | File | Bytes |
| --- | --- | --- |
| `runtimeImage` | runtime.lafy | 262 |
| `characterClass` | tokenizer.lafy | 256 |
| `keywordText` | tokenizer.lafy | 95 |
| `keywordStart` | tokenizer.lafy | 48 |
| `runtimeAddress` | runtime.lafy | 28 |
| `keywordSize` | tokenizer.lafy | 24 |
| `typeText` | statement.lafy | 15 |
| `binaryPrecedence` | expression.lafy | 13 |
| `punctOperator` | expression.lafy | 10 |
| `typeTextStart` | statement.lafy | 8 |
| `typeTextSize` | statement.lafy | 4 |
| **Total** | | **763** |
<!-- /generated -->

Three sizes were wrong before this was measured, and two would have stopped
the compiler compiling itself: the arena was 4,096 bytes against 5,186 needed,
and the label table was 2,048 slots against 416 — four times too large.

**These are measurements of the current source, not of a finished compiler.**
The front end still lacks several forms Candlemoth itself uses — calls in
expressions, conversions, `enum`, `select`, constant array literals and
bitwise word operators — and the code generator is unwritten. The capacity
measurement is re-run after each of those lands. What it says today is that
the arrays are a small fraction of a 63K image, not that the compiler fits.

### The code estimate

Three estimates by different methods, and all three are estimates: the code
generator that would produce the bytes is unwritten.

Bottom-up, summing tokenizer, names, symbol and type tables, declaration and
statement and expression parsing, path lowering, call lowering, the emitter,
diagnostics and helpers gives fourteen to twenty-four kilobytes.

Top-down, Turbo Pascal 1.0's compiler was in the low-to-mid teens for a larger
language, written in hand-tuned assembly over years; a compiler written in a
bounds-checked high-level language with memory-to-memory static slots runs two
to three times that.

A construct census of the current source puts it above the bottom-up figure.
Costing the 3,071 non-blank, non-comment lines against the measured lowering
table — expression leaves, binary operators, call sites, subscripts, control
flow, assignments and returns — gives roughly thirty-one kilobytes, about ten
bytes per source line, with perhaps forty per cent uncertainty either way. The
bottom-up figure predates two things: static frames, which turned every
argument into a store at the call site, and the source reaching three thousand
lines.

Thirty-one kilobytes of code beside sixteen of writable arrays is about
forty-seven, and that figure omits static frames and stack, so a complete
image lands nearer forty-eight to fifty-five.
`docs/candlemoth-size-discipline.md` sets forty to forty-five as what it
accepts for a first correct image and asks for the low-to-mid thirties to be
investigated, so the census sits above that target and inside the machine,
which has a little over 63K free on the `flat` host.

None of these figures ranks individual language cuts. A census carrying that
much uncertainty cannot separate a six-hundred-byte saving from a nine-hundred
byte one, and a more elaborate estimator would be another model that tests
only itself. The vertical slice — enough of the seed to compile one real
Candlemoth routine, run it on the bootstrap machine, and report bytes by
routine and exact static storage — replaces all three with a measurement.

**The peepholes the budget leans on are not all unconditionally legal, and
that makes the budget itself an estimate.** Narrowing byte arithmetic to
its destination width turns an eighteen-byte sequence into nine — some 24K
across roughly two thousand statements — but section 3.1 gives intermediate
expressions defined types, and truncating early can change a later
comparison, division or shift. General application would reduce compiler size
by changing program semantics.

So the **canonical lowering table carries the full-width conforming
sequence**, and narrowing is applied only where range or modular-arithmetic
analysis proves the truncation preserves the specified result. The first
budget gate measures legal lowering, not universal narrowing, and the
twenty-four-kilobyte figure stands or falls on that measurement. Keeping the accumulator in `HL` across an expression chain,
rather than routing every node through a static temporary at twelve bytes
and 59 T-states, saves comparably. And eliding the bounds check on a loop
induction variable whose domain is provably inside the array — which
section 6 permits — recovers around 2.8K across some four hundred sites.
Phase 2's gate is therefore a **bytes-per-construct table with ratchet
limits**, not merely a suite that produces correct output.

Small multipliers must be folded into shift-and-add chains. The sixteen-bit
multiply helper is about 1,020 T-states against eleven for `ADD HL,DE`, so
`x * 10` as four shifts and two adds is 52 T-states and six bytes where the
helper is 1,020. Symbol-table hashing uses a power-of-two mask, never a
remainder.

**Save-around-call is settled by analysis, not by declarations.** The
protocol applies to routines inside a strongly-connected component of the
call graph. An earlier draft proposed requiring every routine to be
forward-declared so the graph would be known up front — but a declaration
carries a name and a signature, and the call edges live in the bodies. The
prologue would not have completed the graph. The edges are collected as the bodies are read, and the components are
computed once the source ends — before any call operand is written, which is
the moment that matters now that there is no layout pass.

The cost itself is real: about 195 T-states and 34 bytes at a call site
with two sixteen-bit and two byte values live, and a parser has a few
hundred such sites — a kilobyte of pure save and restore before any parsing
logic. Emitting one save stub and one restore stub per routine, called
rather than inlined, collapses each site from 34 bytes to six and recovers
most of it for about 54 T-states a call. For a size-bound compiler that is
the right trade, and the stub must lift the return address off the stack
first. **Bounds checks**: every
dynamic index carries one, and Candlemoth is index-heavy, so several
hundred sites at a dozen bytes each.

## Phases

**`docs/bootstrap-ladder.md` supersedes this sequence.** The seed targets the
nucleus rather than level 0, the fixpoint arrives at the first generation
rather than the last phase, and the correctness burden is carried per rung
rather than in one phase. The machine, the memory model, the budget
accounting, the single-pass architecture and the fixpoint mechanics below are
unchanged and remain authoritative.

Phases are vertical slices, not layers. Nothing waits for a layer below it
to be complete.

### Phase 0 — the test module and determinism

- One test module: assemble, load, run to halt with a budget, resolve a
  symbol, assert. Not seventeen copies.
- A platform-neutral session over `createZ80Runtime` supplying the four
  streams.
- TECM8's proof conventions — `PROOF_PASS 0x42`, `PROOF_FAIL 0xE0`, a
  result marker, a trace array asserted with prose names — **for the
  hand-written AZM gate and the Phase 2 runtime helpers only**. They are
  wrong for Candlemoth itself: every in-program assertion byte comes out
  of the budget the plan turns on, and from Phase 3 the assertion code
  would have to be compiled by the thing under test. Assertions live on
  the host, which already has full memory through `hardware.memory`,
  symbol lookup through `D8Symbols.address()`, and the output streams. The
  one in-program marker Candlemoth carries is a `u8` stage variable it
  bumps at phase boundaries, five bytes a stage, read by the host on
  failure.
- **A determinism contract**: store zeroed before every run, defined
  padding, deterministic label numbering, deterministic table iteration.
  Without it, fixpoint failures are unreproducible.
- **The corrections the emulator forces**, two of them now confirmed by
  measurement rather than by reading. `OUT (0x01),A` with `A = 0x41`
  presents port **`0x4101`**: a handler written against `port === 0x01`
  never fires, and the compiler would appear to produce no output at all
  with nothing visibly wrong. Every handler masks with `& 0xff`. A halted
  CPU reports `PC` **one past** the `HALT` — confirmed with `HALT` at
  `0x06` reporting `0x07` — so diagnostics report `pc - 1`. `initCpu`
  leaves `SP` at `0xdff0`, in the middle of the working store, so the
  session sets it and the seed emits `LD SP,$0000`. `step()` on a halted
  CPU returns zero cycles forever, so the loop tests `halted` before any
  predicate.
  `runUntil` on the TEC-1G session *throws* when a program halts, which is
  exactly inverted for a compiler whose success condition is halting — so
  `runToHalt` is written, not adapted. `D8Symbols.address()` already exists
  and is already platform-neutral: export it rather than rewriting it.
- **A stack-depth check** every few thousand instructions, which is free
  and turns the characteristic recursion failure from mystifying wrong
  output into a named error.
- **Trace off by default**, and when on, a preallocated ring rather than
  the per-instruction allocation and 24-element shift the TEC-1G session
  uses. A fixpoint run is tens of millions of instructions.
- **A budget report on every artifact** — bytes emitted and where they
  went — from the first day.
- **A lockstep execution differ, for matching images only.** Stepping two
  images together to the first divergent memory write localises a bug far
  better than a diff of their output — but only when the two are expected
  to be identical. That means **B against C**, where a divergence is the
  bug. It is useless between seed output and Candlemoth output, whose
  layouts, temporaries and tables differ from the first instruction even
  when both are correct. For those, compare emitted-stream prefixes and
  named semantic checkpoints.
- **Throughput: two measurements, and the distinction between them
  matters.** A bare CPU loop with no port traffic runs at **30.3 million
  instructions a second**, 63× realtime against a 4 MHz Z80. A
  representative proxy — a JavaScript callback per source byte and an output
  byte every four — runs at **10.1 million instructions a second**. Port
  callbacks cost roughly threefold, which is why the bare figure must not be
  used for projections.

  The proxy was written when the plan called for three passes and reads its
  input three times. A single-pass compiler reads it once, so the compile
  figures below are **three times pessimistic** until the proxy is rewritten.
  They are left as they are rather than divided, because the density they rest
  on is unmeasured and dividing an estimate by three does not make it a
  measurement.

  Everything past that rate is arithmetic over an **assumed instruction
  density**, which is not yet established. The proxy itself spends 7.8
  instructions per source byte, and a compiler that tokenizes, parses,
  looks up symbols and emits will spend far more. Over 100K of source, at the
  three-pass proxy's rate:

  | assumed instructions per source byte | one compile | A→B→C fixpoint |
  | --- | --- | --- |
  | 50 | 1.5s | 3.0s |
  | 200 | 6.1s | 12.2s |
  | 500 | 15.2s | 30.5s |

  So the earlier "about three seconds, fixpoint about ten" was wrong on two
  counts: it used the callback-free rate and it counted one pass rather than
  three. Phase 3 replaces the density assumption with a measurement from
  Candlemoth's own tokenizer, and only then is the fixpoint's cost known.

  The likely range still puts the fixpoint in tens of seconds rather than
  minutes, which is probably enough to keep it in the ordinary edit loop
  along with randomised differential testing and delta-debugging — but that
  is a projection, and it is labelled one until Phase 3.

  Both figures hold only with tracing off. The TEC-1G session allocates an
  object per instruction and shifts a 24-element array, which is precisely
  the pattern that would spend this margin.

Gate: a hand-written AZM program that echoes input doubled, asserted end to
end, with a size reported. Throughput and the two emulator corrections are
already measured and recorded above.

### Phase 1 — Candlemoth's front end, as text

Write Candlemoth's tokenizer and expression parser **in level-0 Lanternfly**,
uncompiled. Level 0 is then defined by what that source actually uses,
which makes its boundary falsifiable instead of asserted.

Deliverables: the level-0 grammar and type rules; **a byte-granularity
lowering table** giving the exact instruction sequence for every construct,
without which byte-identity between two implementations rests on nothing; and the
memory architecture above, confirmed against real parser routines.

### Phase 2 — the seed, written independently

**The seed is implemented against the Level 0 grammar, semantics and the
canonical lowering table — not transliterated from Candlemoth.** An earlier
draft proposed transliteration so the two would agree byte for byte. That
was solving a problem the plan does not have: the fixpoint compares **B**
against **C**, both produced by Candlemoth, and **A** against **B** is
already accepted as different. Seed and Candlemoth byte-equality was never
needed, and buying it by transliteration would have made the seed reproduce
Candlemoth's algorithmic mistakes, destroying the independence the whole
validation argument rests on.

So the two agree where agreement is meaningful and are free to differ
elsewhere. **Exact bytes are required** for the small hand-specified
lowering vectors and for the B/C fixpoint. **For the general corpus the
comparison is behavioural** — final storage, the ordered stream of service
calls, faults raised and diagnostics produced. An encoding difference is
recorded for investigation rather than treated as a failure.

The seed must also **reject everything outside level 0**, with a test per
excluded construct. If it accepts a superset, Candlemoth's source can use a
construct Candlemoth does not implement, and the fixpoint fails at step B
with a maximally confusing symptom.

Runtime helpers for multiplication, division and comparison are hand-written in AZM,
carry register contracts, and are covered by proofs. **The `const u8[N]`
arrays that Candlemoth emits are generated from that AZM source at build
time**, so the two copies cannot drift.

### Phase 3 — the vertical slice

Tokenizer, expression parser, expression codegen and one statement form,
compiled by the seed and run under it. Not the tokenizer alone: a
tokenizer is a dispatch over character classes and its density resembles
nothing else in the compiler, so extrapolating from it underestimates,
probably twofold. The slice exercises save-around-call, forward references and back-patching
through the seek service, and the emitter. Its byte cost extrapolates, and so
does its **instruction density**, which is what turns the fixpoint's cost from
a projection into a number.

Gate: the measured byte cost of the slice, against the twenty-four
kilobyte budget.

### Phase 4 — the rest, with the correctness burden

Parser, checker and emitter grown together, with correctness carried by
four things the first draft lacked:

- **A level-0 conformance corpus** owned by neither implementation:
  source, expected bytes or behaviour, expected diagnostics, expected
  runtime faults.
- **A semantic oracle** — the typed-IR interpreter already specified as M3
  in `implementation-plan.md`.
- **Randomised differential testing**: generate level-0 programs, compile
  with both, run both, compare. This is how codegen bugs a hand-written
  corpus misses are found.
- **Resource-limit tests**: symbol table full, arena full, nesting too
  deep, image too large. A fixed table that silently overruns produces a
  wrong binary that compiles a wrong binary, and the fixpoint may still
  pass. That is the nightmare case and it is cheap to prevent.

### Phase 5 — the fixpoint

Seed compiles Candlemoth to **A**; **A** compiles the same source to **B**;
**B** compiles it to **C**. **B** and **C** must be byte-identical; **A**
and **B** need not be.

On the projections above the fixpoint costs tens of seconds, which would
make it part of the ordinary edit loop rather than a release gate — and that
matters, because a fixpoint failure caught the day it appears is a small
diff to search and one caught a month later is not. The figure is a
projection until Phase 3 measures the density it rests on.

**The fixpoint proves stability, not correctness.** Two identically wrong
compilers are a perfectly good fixpoint, and Candlemoth's own source is by
construction a valid program, so the fixpoint exercises no diagnostic, no
runtime fault, and none of level 0 that Candlemoth happens not to use. It
is the last check, not the main one. Phase 4 carries the correctness.

When it fails: the listing artifact maps a byte range to a source
construct, the lockstep differ localises the first divergent write, and
delta-debugging on the host shrinks the input to the smallest source that
still reproduces it.

## Conventions outside the language

The host handles includes by **concatenating files into one stream**,
with a side table mapping global line back to file and line for
diagnostics. Candlemoth implements no include mechanism, so the feature costs
no compiler bytes. Both implementations omit it.

A known-good `candlemoth.bin` is checked in, so a clean build does not
depend on the seed continuing to work.

## Excluded scope

Level 1, level 2, tasks, derivations, the books, hardware. The fixpoint is
the end of it.
