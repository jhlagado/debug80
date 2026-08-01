# Cooperative tasks and generators

This document records an exploratory direction: cooperative multitasking for
Lanternfly programs, built from state-machine records that are already legal
under specification 0.5 and unchanged by 0.6, with a possible later surface
syntax for generators and awaiting. The pattern in section 3
compiles under the current specification; the syntax in section 6 is
**Deferred**; the scheduling layer in section 7 is **Open**.

The document is kept in step with the working specification. Every claim
about the language cites a specification section, and a change to any cited
section obligates a review here. Baseline: specification 0.6 as of this document's last revision;
the pattern uses only facilities already present in 0.5.

## 1. The problem on the target

A TEC-1G program runs on one Z80 with no operating system. Input arrives by
polling, the display is refreshed by the program, and interrupts carry at most
a timer tick. The platform has no threading tradition because it has no
threads.

Games still need several activities in flight at once: the play field
advances, a cursor blinks, the keypad is watched, a melody plays. Today each
activity is flattened into one main loop by hand — every routine that would
naturally pause must instead be split into flag checks and counters
spread through the loop body. The program works, and the structure of each
activity is gone: reading the cursor-blink logic means reassembling it from
fragments interleaved with everything else.

Cooperative multitasking restores that structure. Each activity keeps its own
small state and advances one step each time the main loop calls it. No
preemption, no stacks to switch, no operating system — a discipline for
organizing what the polling loop already does.

## 2. Position among the language documents

**Direction.** This is an application of the language, recorded so the design
survives until a working compiler exists to test it. It is deliberately
sequenced behind implementation: the manual pattern goes into example programs
and teaching material first, and the surface syntax is considered only if
those programs demonstrate that the pattern is common enough to justify
it. The
decision mirrors the evidence rule of specification section 16: a feature
enters on the evidence of translated programs, not on anticipation.

The presentation rule for this material, everywhere it appears, comes from
one observation about JavaScript — working experience of that ecosystem,
not a measured corpus. Direct use of generators (`function*`, `yield`) is
rare in everyday JavaScript, while `async`/`await`, which is built on the
same mechanism, is routine. The lesson, if that experience holds: readers adopt
this pattern when it is framed as *running several activities on one Z80*,
and pass it by when it is framed as lazy sequences. Teaching material should
lead with the cooperative-task reading; the generator reading is a closing
observation.

## 3. The pattern in Lanternfly 0.5

A task is a record plus a step routine. The record holds a state field and
whatever must survive between turns. The step routine is a `select` on the
state field (section 9.2): each case is one segment of the activity, the code
between two pauses. Advancing the state and returning is the pause.

A cursor blinker on a timer tick:

```lanternfly
const blinkRate as u8 = 25

volatile var tickFlag as u8 at $8400

record BlinkState
    state as u8
    countdown as u8
end

sub blinkStep(blink as BlinkState)
    select blink.state
    case 0
        blink.countdown = blinkRate
        blink.state = 1
    case 1
        if tickFlag = 0 then
            return
        end

        tickFlag = 0
        blink.countdown = blink.countdown - 1

        if blink.countdown = 0 then
            toggleCursor()
            blink.countdown = blinkRate
        end
    end
end
```

The address `$8400` is illustrative. State 0 initializes; state 1 waits for
the tick and counts down. Each call to `blinkStep` runs exactly one segment
and returns, so a call costs microseconds whether or not the tick has
arrived.

A value-producing task — a generator in the JavaScript sense — returns a
value from each segment. A melody player that yields the next note on every
call:

```lanternfly
const melody as u8[8] = [0, 4, 7, 12, 7, 4, 0, 0]

record MelodyState
    state as u8
    position as u8
end

sub nextNote(player as MelodyState) as u8
    select player.state
    case 0
        player.position = 0
        player.state = 1
        return melody[player.position]
    else
        player.position = player.position + 1

        if player.position = 8 then
            player.position = 0
        end

        return melody[player.position]
    end
end
```

The scheduler is the main loop: one module-declared record per task, and
one call to each step routine per pass:

```lanternfly
var blinker as BlinkState
var player as MelodyState

sub runFrame()
    blinkStep(blinker)
    updateSound(nextNote(player))
    updatePlayfield()
end
```

Every piece of this is ordinary 0.5 Lanternfly: records (section 5), `select`
(section 9.2), aggregate parameters aliasing caller storage (section 11.3),
volatile flag bytes (section 4.4). Two instances of the same task are two
records passed to the same step routine. All storage is static and sized
during compilation.

## 4. The fit with existing language decisions

Three 0.5 decisions, made for other reasons, combine to make this the natural
multitasking shape for the language.

**Static frames (section 11.7).** In a stack language, a suspended routine's
frame dies when it returns, so coroutines must capture stacks or allocate on
a heap. Lanternfly locals may live in static temporaries and aggregates are
static always, so a frame that outlives its call is a small variation on how
frames already work. The task record *is* the persistent frame, placed like
any other record.

**Routine names are not values (section 11.7).** A task cannot carry a resume
pointer, and needs none: the specification already permits a backend to lower
a dense `select` to a jump table without exposing code addresses to the
program. Dispatch on the state field is that mechanism, written by hand.

**Aggregate parameters alias caller storage (section 11.3).** The caller's
declaration fixes where each task's record lives — module storage, an array
of tasks, a `far` region. Instantiation is declaration; there is no
allocation to design.

One consequence of section 4.5 is worth adopting as doctrine: zero-initialized
storage of the record types above is a fresh task, because state 0 is the
fresh state. A task array in zeroed RAM is a pool of ready tasks with no
initialization pass.

The stackful alternative — one machine stack per task, switched by swapping
SP — is rejected despite being classically cheap on the Z80. Static
temporaries are invalid wherever overlapping invocations can reach them
(section 11.7); with stack switching, any routine reachable from two tasks
is overlapping, which forces the whole call graph onto stack frames and
abandons the static-frame model. The state-machine form is the coroutine
variant consistent with the language, and it is also the one whose memory
cost is visible in the source: the task record.

## 5. The convention

The convention below is the deliverable of this document. It is strict on
purpose: every example, test and book chapter that follows it becomes a
mechanical test case for the deferred syntax of section 6, because that
syntax is correct exactly when it emits what the convention already prescribes
by hand.

1. A task type is a record whose first field is `state as u8`.
2. State 0 is the fresh state. Zero-initialized storage is therefore a
   fresh task.
3. A task that terminates reserves state 255 as the done state. Its step
   routine returns immediately in that state, so driving a finished task is
   harmless. Perpetual tasks (the blinker, the melody) omit it.
4. Each task type has exactly one step routine, taking the record as its
   first parameter. Additional parameters carry per-turn inputs.
5. Each `case` arm is one segment. A segment ends by assigning the next
   state and returning, or by returning with the state unchanged to wait.
6. A value-producing step routine declares a result and returns a value on
   every path; its wait states return a designated idle value, or the
   calling code reads the state field before the call.
7. Interrupt handlers and hardware communicate with tasks only through
   `volatile` module storage (section 4.4). A step routine reads flags; it
   never busy-waits on them.
8. A step routine calls ordinary routines freely, but only the step
   routine's own body reads or writes the state field. Pausing inside a
   callee is not expressible, which is the stackless restriction of
   section 6 arriving early.

## 6. Deferred surface syntax

**Deferred.** If the convention proves common in real programs, the compiler
can write the boilerplate. A marked routine — the working placeholder is a
word such as `task sub`, since Lanternfly marks every construct with words
and a JavaScript-style `*` sigil fits nothing else in the language — would be
written as a straight-line body with `yield` statements, and the compiler
would derive the record, the state numbering and the `select` skeleton:

```lanternfly
// Hypothetical syntax, not part of 0.6.
task sub blink()
    var countdown as u8 = blinkRate

    while true
        yield

        if tickFlag = 1 then
            tickFlag = 0
            countdown = countdown - 1

            if countdown = 0 then
                toggleCursor()
                countdown = blinkRate
            end
        end
    end
end
```

The semantic contract of the marked form, stated precisely because it
differs from the manual pattern underneath it: `yield` suspends the routine,
it does not return from it. Every local variable retains its value across
the suspension — the `countdown` above is initialized once and survives
every yield — exactly as a JavaScript generator's locals survive its
yields. In the manual pattern of section 3 the same pause is spelled
`return`, which ends the invocation and its locals with it; that is why the
convention requires all cross-turn state in the record. The sugar delivers
persistence by making the same move mechanically: locals of a marked
routine are hoisted into the synthesized frame record, so each becomes a
per-instance field, distinct between two instances and alive between turns.
Where JavaScript pays for this with a runtime-managed generator object, here
the caller-declared record is that object, and each persistent local's cost
is visible as bytes in every instance's record, reportable per task type
during compilation.

The transformation is a rewrite after name and type resolution, inside the
reference compiler rather than a preprocessing stage: it requires resolved
types to build the record and resolved control structure to place resume
points. Its output is not structured source but the compiler's control-flow
form — the lowering contract's IR, where a resume point is an ordinary
block label whatever loop it sits inside. That is the reason the
transformation lives after parsing, and the reason no structured
source-to-source rewrite could express it. Its budget therefore counts
against the reference-compiler size gate. Two decisions keep that budget
small:

- **Frame contents.** The precise rule hoists into the record only locals
  live across a `yield`, which requires liveness analysis. The conservative
  rule hoists every local of the marked routine. The conservative rule costs
  a few bytes of RAM per task and no compiler analysis, and is the intended
  first implementation; a later compiler may shrink frames without changing
  any program's meaning.
- **Resume dispatch.** Each `yield` site becomes a labelled resume block in
  the control-flow form, and the routine's entry dispatches on the state
  byte to the matching label. The obligation is backend-neutral. A backend
  may realize the dispatch as a jump table — the section 9.2 permission
  applied to compiler-owned dispatch, roughly a dozen bytes per task type
  on the Z80 — or as a compare chain where a table pays worse.

`yield` would be legal only in the marked routine's own body, never in a
callee — the restriction rule 8 already imposes on the manual form, and the
same restriction Rust spells "await only inside async fn". Lifting it
requires capturing nested frames, which reintroduces everything section 4
rejected.

**Instance identity — Open.** The sketch above declares a routine and
nothing else, yet this section promises per-instance records; the
connecting contract is deliberately unresolved. A full design must state:
how an instance is declared and where its generated record type gets a
name — the routine's own name cannot simply be recased, because a type and
a callable sharing a case-insensitive name is the collision of section 2.1
— how a resume call names the instance it advances, what a completed
instance reports and how the owning code reads it, and how an instance is
reset for reuse. The manual convention already answers initialization and
reset — state 0 means fresh, so zero-initialized storage is a ready
instance and `clear` on the record is a reset — and any sugar must
preserve those answers. Until this contract is written, `task sub` is a
lowering sketch, not a proposable syntax.

By the section 1.1 criteria the feature is kernel-shaped: it selects no
runtime helper, places no bytes in programs that do not use it, and has one
meaning everywhere. Whether it enters the kernel is still an evidence
question, and the reference-compiler size budget is the deciding constraint.

## 7. Awaiting and scheduling

**Open.** `async`/`await` is this pattern plus a scheduler. An awaiting
routine is a task whose yields mean *waiting on a condition* rather than
*here is a value*; `await keypress()` records what is awaited, yields, and on
resume checks the flag, yielding again if it is still clear. The manual form
of section 3 already expresses this — the blinker's state 1 is an await of
the tick flag.

The scheduler for a closed-world language is small. The set of tasks is
known during compilation, so the scheduler is a static task table driven by
a loop that calls the step routine of each entry whose ready flag is set.
Routine names are not values, so the dispatch is a `select` over task
identifiers — hand-written in the library form, compiler-synthesized in the
full form. Interrupt handlers and polled device reads set the volatile ready
flags; the loop clears them as tasks run.

The precedent is Rust on microcontrollers: the Embassy executor runs
compiler-generated state machines in statically allocated task frames, with
a poll loop and interrupt-set wake flags, on machines with a few kilobytes
of RAM and no heap. That architecture transplants to the Z80 directly, and
at TEC-1G scale the executor is tens of bytes.

Two specification interactions are worth recording before this layer firms
up:

- **Overlap.** This model creates none. A step routine runs to completion
  before the loop calls another, suspension inside a callee is not
  expressible under convention rule 8, and interrupt handlers only set
  flags. Two live task records that call the same ordinary routine
  therefore call it at different times, so the static temporaries of
  section 11.7 stay valid with no new analysis. An overlap check becomes
  necessary only if a later edition admits nested suspension or preemptive
  resumption, and its cost belongs to whichever edition proposes them.
- **Interrupt resumption.** Everything above resumes tasks from the main
  loop only; interrupt handlers set flags and return. Resuming a task from
  an interrupt handler is preemption and is out of scope for this
  direction.

## 8. Consequences for Glimmer

Glimmer currently hosts Z80 assembly bodies inside a preprocessed page
structure. A Lanternfly with cooperative tasks inverts that relationship: the
framework becomes a library — task records, step conventions, a scheduler
routine — and a game becomes ordinary Lanternfly importing it, the way a
JavaScript application imports React rather than being preprocessed by it.
Pages, animations and input watchers are tasks; the Glimmer preprocessor's
sequencing role is absorbed by the scheduler.

This is the most speculative claim in the document and the one with the
largest payoff: it would retire a whole toolchain stage. It becomes testable
only after the compiler exists, by rewriting one real Glimmer program —
Book 2's Skyfall or Rushlight are the right size — in library form.

## 9. Evidence plan

In order, each step gated on the one before:

1. Example programs under the section 5 convention, compiled by the first
   working compiler: Tetro's input handling and one Glimmer-style animation
   are the candidate bodies.
2. A teaching chapter presenting the manual pattern as cooperative tasks on
   the TEC-1G, per the framing rule of section 2.
3. If the examples show the boilerplate dominating real task bodies, a
   design decision on the section 6 syntax, tested by compiling the
   existing examples and comparing emitted code against the hand-written
   form.
4. Only after that, the section 7 scheduler as a standard service module,
   and the section 8 Glimmer experiment.

Findings that would close this direction: task records proving too large
for real programs at TEC-1G RAM budgets, or the manual pattern proving so
workable in the books that the syntax would save too little. The second
outcome would still be a success — the pattern, not the syntax, is the
substance of this document.
