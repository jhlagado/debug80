# Lanternfly 0.7 — decisions

What was decided in conversation. This is the authority; the
specification is reconciled to it, not the other way round.

## Program shape

1. A program is a root module, the modules it imports, and a start.
2. A **declared start** is the program's task instances.
3. A **designated start** is an exported subroutine named by the build
   manifest — the **prologue**: called once, runs to completion, before
   any instant.
4. The manifest may name a second subroutine as the **epilogue**, run
   after the last instant on both exit paths, quiescence and unhandled
   failure. It exists because no body can ask what else is scheduled, so
   nothing else can express "when everything has finished".
5. Prologue, epilogue and task instances combine. Any may be absent.
6. Blocking calls are legal only in the prologue and epilogue.
7. `auto task Name()` declares a task type and one instance.
8. Termination: success at quiescence, status zero. An unhandled `fail`
   in a prologue, epilogue or task ends the program immediately with that
   error's status; the failing body's deferred statements run, other
   tasks are abandoned.

## The instant

9. Two phases: **settle**, then **effect**. `effect` survives as the name
   of a phase, not as a construct.
10. **Settle** recomputes derived cells in dependency order. Within
    settling, values propagate immediately — it is a spreadsheet
    recalculation, not a delivery.
11. The **effect** phase advances every task whose trigger occurred, in
    source order:
    import order between modules, declaration order within a module.
12. Writes made during the effect phase **queue**. They become the next
    settling pass's input. So every task reads the same settled snapshot,
    and nothing a task does is visible to another task in the same
    instant.
13. Each task advances at most once per instant, so an instant always
    terminates.
14. Between one suspension point and the next, no other task observes
    what a task writes. No locks, no atomics. A protocol spanning a
    suspension point has no such protection.

## Derived cells

15. A derivation is a **single line, one cell**:
    `derive name as T from expression`. Not a block.
16. Blocks were rejected because a block writes several cells from
    unrelated inputs, so the dependency graph can only be built at block
    granularity, which reports cycles in programs whose cells are
    acyclic. One cell per line gives an exact graph.
17. Dependencies are the cells the expression reads. The compiler
    computes the order; it spans all modules; the programmer cannot get
    it wrong.
18. Circular references are **banned** — exactly detectable at cell
    granularity.
19. A derivation is an ordinary expression. It gains a **ternary
    conditional**, which the language did not have.
20. A derivation may call routines. **A routine reachable from a
    derivation writes no module storage** — only its own locals and
    parameters. It may read anything it can see, and may do I/O; only
    writing is barred, because a write during settling lands after cells
    that depend on it have already settled.
21. That rule is inferred, not declared: one bit per routine — writes
    module storage, directly or transitively — rooted at the routines
    derivations actually call. Two hundred routines is twenty-five bytes.
    A `pure` marker stays available if the inferred diagnostics read
    badly; the compiler knows the call path and can name it.
22. Outside the settle phase there is no such restriction. A subroutine
    called from a task, prologue or epilogue may write state cells and
    module variables freely — the write site sees the cell by name, so
    the compiler emits the notification there. This is the whole
    difference between the two phases: in settle, a routine reads; in
    effect, it does as it likes.

## Tasks

23. Effects are **deleted**. Everything that runs is a task. An effect
    was always a task with one standing trigger and no memory.
24. A task's shape carries what keywords used to: locals; code before the
    loop is per-instance initialization; waits anywhere; code after the
    loop is normal-path cleanup.
25. The loop shape is the lifecycle. No loop is a one-shot; a counted
    loop runs N times; `while true` is perpetual; `while condition` stops
    on its own terms. This is why no start, stop, restart or kill
    operation is needed — the schedule stays static.
26. `changed` is **deleted**. Work before the wait runs at startup; wait
    before the work does not. The loop shape expresses it.
27. `render` and `effect` are deleted as keywords. Drawing is what a task
    does. Render was a web-framework import: there it is declarative and
    pure and the framework owns the mutation, none of which is true here.
28. Nearly every reactive program is therefore non-terminating.
    Quiescence is for batch programs. Shutdown is a state cell tested in
    the loop condition and waited on alongside the real triggers.
29. Known cost: a task's triggers are scattered across its waits rather
    than declared on one line, so "what wakes this?" needs a
    compiler-generated dependency report. Accepted.
30. Deferred: sugar integrating the wait into a loop head or tail. Let
    the patterns fall out of use first, then codify.

## State and pulses

31. `state var` is a qualifier on `var`, beside `volatile` and `static`.
    A write to a variable is invisible; a write to a state cell schedules
    whatever watches it.
32. A cross-module write to an exported state cell is legal and notifies
    exactly as a local write does. Modules are visibility, nothing more.
33. A pulse is raised by any module that can see it.
34. State writes and pulse raises are legal in a prologue, an epilogue, a
    task body, and any subroutine those call. They are barred only in the
    settle phase, under decisions 20 to 22.
35. Tasks have no caller, no result and no value channel.
36. `after(n)` counts instants. Nothing converts instants to time. A
    profile may declare an instant rate; where it does not, a program
    needing real time uses a profile-supplied clock or does not build.
37. A diagnostic's identifier is the contract; its message text is not. A
    self-hosting compiler carries numeric codes and takes text from its
    environment.

## Expressions, parameters, waits

38. A conditional expression is added: `if condition then a else b`, the
    same ordering as the `if` statement, so there is one conditional
    shape to learn. Lowest precedence, extending as far right as it can;
    parenthesise to stop it.
39. **Read-only aggregate parameters** are added. An aggregate state cell
    can then be handed to a routine for reading, which is the only thing
    a routine ever wants from one. This also retires the special case
    that lets `writeText` accept a string of any capacity.
40. A multi-trigger `wait on a, b` is a **disjunction** — any one of them
    wakes the task.
41. A pulse is **readable as a boolean during the instant it is
    delivered**, so a task can test which trigger woke it with no new
    syntax. The bit is already set and already cleared at the instant's
    end.

## Documents

42. **Hosted bodies are deleted**, not moved. Candlemoth must implement
    the full language rather than a cut-down one, so the milestone they
    existed to serve is gone. Most of the host-manifest schema goes with
    them — manifest constants and types, provider address bindings,
    `resource`, and the `Callable`, `ScalarParameter`, `CallableAbi` and
    `CallableCostMetadata` records. `externalBindings` and the ABI
    adapter machinery stay, because `extern sub` uses them.
43. The remaining toolchain schema moves to a separate `toolchain.md`,
    versioned separately, leaving the language document readable end to
    end. Value-invariant obligations at the native boundary stay in the
    language document, being semantics rather than schema.
44. The K-stage scheme stops describing language subsets. A stage is
    compiler maturity: it may reject what it has not implemented and must
    say so as a stage diagnostic, but it is not a smaller language.
45. Bare `end` is settled, not provisional. Named endings would add five
    keyword pairs to restate what indentation and the formatter already
    show, and switching later would cost every code sample in four books.
46. The edition is **0.7** everywhere: the conformance contract's title,
    section 1's feature list, and the design queue's heading.

## Aggregate parameters and measurement

47. An aggregate parameter may omit its capacity — `as u8[]`, `as string[]`
    — making it **generic**. This is the ordinary case for
    one-dimensional arrays and strings. Records and multidimensional
    arrays keep exact types, because their shape is their type.
48. Without routine values there is no map or fold, so every traversal is
    a loop and every reusable loop is a routine that takes an array.
    Capacity-locked parameters would mean one copy per size, which is why
    generic is the common case and not a utility-library nicety.
49. A generic aggregate parameter's hidden carrier holds the payload
    address **and the size, as `u16`**. The caller supplies the size as a
    compile-time constant, which it always knows; a routine forwarding
    its own generic parameter passes the value it received, so
    composition works to any depth.
50. This is not a pointer. The carrier already existed and already held
    the payload location; it gains one field. It still has no source
    syntax and cannot be stored, returned, compared or converted.
51. Generic parameters may be **writable as well as `read`**, because the
    carrier's size makes bounds checking possible. This retires most of
    the queued "output and in/out parameters" item.
52. A generic array's index domain is zero-based over its size.
53. **`size(x)`** — how many slots or elements. A compile-time constant
    for an exact type, a carrier read for a generic parameter. Legal on
    arrays, strings, ranges, subranges and enums, so it is one idea
    rather than an array feature.
54. **`length(s)`** — occupied characters of a string, read from byte
    zero. Runtime, strings only. Both numbers are needed: a routine that
    appends to a generic string uses `length` for where the characters
    end and `size` for where the storage ends, and cannot be written with
    either alone.
55. **`byteSize(x)`** — storage bytes, including the length byte and the
    terminator. Deliberately long: it is a library writer's tool for
    handing a byte count to a native routine. It is also the answer for a
    record, and `size(record)` is an error, a record having no item
    count.
56. **`count` retires and stays unspent.** `capacity` is not added — the
    short intuitive words go to the common cases.
57. Section 8.5's claim that the layout queries are compile-time
    operations is amended: on a generic parameter, `size` and `byteSize`
    are runtime reads.
58. Decision 39's second clause is void. `read` alone does not retire the
    `writeText` special case, because a `read` parameter still stated an
    exact capacity. **Generic parameters retire it properly**:
    `writeText(read text as string[])` is an ordinary signature anyone
    could write.
59. `until` already exists — exclusive upper bound in counted loops,
    subranges, array domains and `select` ranges. Nothing to add. The
    unsigned-wrap trap it avoids is already avoided.
60. **No tuples.** A tuple's purpose is returning several values, which
    needs aggregate returns; the language rejects those, and on a Z80
    they mean either copying into caller-supplied space — an output
    parameter with ceremony — or a static return buffer that breaks under
    recursion. A caller-owned record parameter already does the job.

## Notification timing

61. A state cell's changed bits are raised **once per body, at each
    suspension point and at body exit**, from a compile-time constant
    mask of the cells that body wrote — not at each compiled write.
    Observably identical, because run-to-completion means no other body
    can read the bit between a body's suspension points.
62. The reason is cost. A write to an aggregate state cell raises one bit
    for the whole cell, so a loop over a 768-byte buffer would set the
    same bit 768 times: about 19,200 T-states, 27% of a 50 Hz frame on a
    3.5 MHz Z80, all but one of them waste. Under decision 61 the cost is
    proportional to suspension points rather than to writes, and the
    scalar write penalty falls from roughly five times a plain store to
    nothing. Without this, aggregate state cells punish the use they
    exist for.

## Storage classes and parameter direction

63. An aggregate parameter is **read-only unless marked `write`**. Reading
    is what most routines do; an unmarked parameter can never clobber a
    caller's storage; and constants, which live in ROM on these machines,
    become passable without a rule saying so. `read` is deleted — it was
    a marker reaching the common case.
64. Notation is unavoidable regardless of the default, because an
    `extern sub` has no body to inspect and a `forward sub` states its
    contract before its body exists. Given it must exist for those, it is
    written everywhere rather than inferred sometimes.
65. **Unqualified aggregate parameters take the profile's default storage
    class everywhere, exported or not.** The rule that exported
    parameters must state `near` or `far` is deleted: far storage is a
    target capability, so a flat profile has one class and the annotation
    says nothing, and with no linker the profile is known when the
    program is built, so it bridges no boundary. `near` and `far` are
    written only to override, which on a flat target means never.
66. `near`/`far` as a parameter's storage class and `near address` /
    `far address` as opaque types are **one distinction, not two
    meanings** — which memory space — applied to where storage lives and
    to what an address refers to. The specification states it once.
67. There is no address arithmetic in the language. Opaque addresses
    support no indexing, dereference or arithmetic; `byteSize` covers the
    one case that genuinely needs a byte count.

## Levels and bootstrap

68. Lanternfly has **three levels**, nested subsets of one language rather
    than dialects. **Level 0** is what a compiler can be written in:
    integers, arrays, records, subroutines, control flow, `extern`,
    `asm`. **Level 1** is full structured programming, comparable to
    Pascal or C. **Level 2** adds tasks, state cells, pulses, derivations
    and the instant, and is what is published and discussed as
    Lanternfly.
69. A level-2 compiler accepts all three. A level-0 program is a
    Lanternfly program that uses fewer features; nothing is translated
    and nothing is a separate language.
70. Two axes, not one: the level a compiler is **written in** and the
    level it **accepts**. Each level suffices to write a compiler for the
    level above it, so Candlemoth's source stays at level 0 permanently
    while what it accepts grows. **The 16K budget is therefore a budget
    for a level-0 program**; the cost of tasks and derivations falls on
    what the compiler accepts, not on what it is made of.
71. Level 0's boundary is empirical — whatever Candlemoth's own source
    turns out to need. Writing the compiler defines it.
72. The K0–K2 stage vocabulary folds into levels. A compiler's maturity
    is which level it accepts yet.
73. **Honeydew retires as a name.** The task and reactive surface is
    level 2 of Lanternfly, not a dialect over it.

## Bootstrap path

74. A **seed** compiler in JavaScript accepts level 0 and emits Z80. It
    runs on the host, so it may allocate freely and be slow: its only
    obligation is correctness.
75. Candlemoth is written in level-0 Lanternfly and compiled by the seed.
    Lanternfly's own rules — no heap, no closures, no routine values,
    static storage — enforce the discipline a Z80 needs, so it is not a
    matter of remembering to restrict oneself.
76. Candlemoth runs in the browser as a Z80 binary under debug80's
    emulator. No JavaScript port of the compiler is needed or wanted; a
    third implementation would only have to be kept in step.
77. Candlemoth is a **filter**: characters in, bytes out, no file system.
    Identical under emulation, over serial to hardware, and piped on a
    desktop. Its whole I/O surface is `standard.textOutput.writeCharacter`
    and `standard.characterPoll.poll`, which on a Z80 bind to a reserved
    port — `OUT` hands a byte to the host, `IN` takes one and yields zero
    when none waits, which is the nonblocking contract already specified.
78. Candlemoth is a prologue-only program: a designated subroutine, no
    scheduler, blocking legal because nothing else needs the processor. It
    exercises none of level 2.
79. The bootstrap test is a fixpoint. The seed compiles Candlemoth's
    source to binary A; A compiles that same source to B; B compiles it to
    C. A and B may differ, having come from different compilers. **B and C
    must be byte-identical.** After that the seed is needed only to
    rebuild from nothing.
80. Two implementations risk drifting on semantics. The conformance
    contract is the guard: both must pass the same vectors, so a
    disagreement is a bug rather than an opinion.
81. First milestone is **the tokenizer**, written in level-0 Lanternfly
    and run under the emulator, because its compiled size is the first
    real evidence about the 16K budget, which until now has been
    estimated.

## Machine code

82. **Inline assembly is deleted.** `asm` blocks, `E-ASM-001` and
    `W-ASM-001` go with it, along with the module-versus-statement block
    distinction and the rule that a derivation may contain none.
83. A machine-code routine is a **placed constant byte array called
    through an `extern sub`**. Both mechanisms already existed, so this
    is a deletion rather than a substitution. The bytes place, report and
    validate like any other constant, and the routine's reads, writes,
    blocking class and fault behaviour come from the ordinary `extern`
    contract instead of a blanket conservative assumption.
84. The reason is the bootstrap. An `asm` block needs an assembler at
    compile time, and a self-hosted Candlemoth has none; building a Z80
    assembler into it would cost kilobytes against a level-0 budget for a
    feature used a few times per program.
85. Nothing relocates, so such a routine is either placed at the address
    it was written for or written to be position-independent. It obeys
    the calling convention and the value invariants at the native
    boundary.
86. The cost, stated plainly: no assembly inside a routine, only calls
    out to one — 27 T-states for a call and return where inline code
    would have cost nothing. A tight inner loop is written as the placed
    routine entire.
87. **AZM moves to the toolchain.** A build may assemble source into the
    byte array a program includes, so the mnemonics stay readable and the
    assembler stays off the small target. Recorded in `toolchain.md`
    section 7.
88. Rejected: letting a hosted compiler accept assembly source while
    Candlemoth accepts only bytes. That would make a program's legality
    depend on which compiler compiled it, which is what the level
    structure exists to prevent.

## Open

Nothing outstanding. Remaining work is reconciliation: the
specification, the conformance contract, the book plan, and the four
white papers, all of which describe constructs this list deletes.
