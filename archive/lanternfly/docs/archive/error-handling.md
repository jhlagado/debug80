# Error handling

This document records the design for recoverable error handling in
Lanternfly: error sets as enums, failable routine signatures, a carry-flag
failure convention, word-based propagation and handling syntax, and `defer`
as the cleanup mechanism the syntax requires. The design is **drafted into
the specification**: it entered the working specification as sections 11.8
and 11.9 of the 0.6 edition, marked Provisional there until the evidence
step of section 10 completes, with matching conformance rows and
lowering-contract obligations. The specification is the normative statement
of these rules; this paper remains the design rationale — why exceptions
were rejected, where the carry convention comes from, and what each
construct costs. One status distinction runs through the whole paper: the
abstract failure channel — a completion discriminant plus a `u8` code — is
the normative lowering obligation, while the carry/A convention shown in
the sketches is its provisional Z80 realization, candidate ABI like every
other register choice in the lowering contract.

The document is kept in step with the working specification and the
conformance contract.
Every claim about the current language cites its source, and a change to a
cited section obligates a review here. Baseline: specification 0.6 and the
conformance contract as of this document's last revision. Assembly sketches
follow the AZM convention: local labels carry a leading underscore.

## 1. Two kinds of failure

Lanternfly already has half of a modern error system. The conformance
contract (conformance section 4) requires nine runtime faults — `F-BOUNDS`,
`F-RANGE`, `F-DIV-ZERO` and the rest — that are non-returning and preserve
their class and source location. That is the panic system of a modern
systems language, in doctrine and in mechanism: a violated contract stops
the program with a report, and no program code intercepts it. The fault
tier needs nothing from this document.

What 0.5 lacked is the other tier: expected failure. A tape block that does
not verify, a line that does not parse, a buffer that is full — outcomes
that occur routinely in a correct run and must be handled as part of its
ordinary logic. The doctrine this document adopts, shared with Rust and
Zig, keeps the tiers strictly apart:

- **Faults are for bugs.** A fault marks a contract violation. Program
  code cannot intercept one, and the target profile defines what a fault
  does — on the TEC-1G, returning control to the monitor with the fault
  class displayed is the natural contract.
- **Errors are values, for expected failure.** An error is an enum code,
  produced and consumed by ordinary control flow, checked during
  compilation like every other value.

## 2. Exceptions, rejected

Unwinding exceptions — `try`/`catch` regions with automatic propagation up
the call stack — were the 1990s answer, and the languages of the last
fifteen years have withdrawn from them: Go returns errors, Rust returns
`Result`, Zig returns error unions, and Swift compiles `throws` into an
extra return value with no unwinder. The reasons they withdrew are
Lanternfly's founding doctrines applied to control flow.

First, hidden control flow. Under exceptions every call is a potential exit
from the enclosing routine, which conflicts with the effect contracts of
specification section 13.2, with the single-meaning rule of section 1.1,
and with reading a routine and pointing at its exits.

Second, the machinery. Unwinding walks a stack of frames, and Lanternfly
frames are static (section 11.7): there is nothing to walk. The direct Z80
implementation of a caught region is setjmp-shaped — save SP and a resume
address at the region entry, and a throw reloads SP and jumps. That costs
only a few bytes and is worth knowing about, because it is the right
mechanism for exactly one customer: a target's top-level fault contract,
where abandoning every in-flight routine is the desired meaning. As a tool
for recoverable errors it abandons routines mid-body, leaves static
temporaries torn and skips cleanup; it is a nonlocal goto.

The cooperative-tasks paper ([cooperative-tasks.md](cooperative-tasks.md))
established the test this design must pass: surface syntax is admissible
when it lowers to visible, local 0.5 code that could be written by hand.
Exceptions fail that test — their control flow is nonlocal, so no
hand-written equivalent exists for the sugar to abbreviate. Error values
pass it completely, as section 8 shows by writing the pattern in 0.5.

A terminology note with design weight. Zig kept the words `try` and
`catch` while discarding the machinery: its `try` is a one-word
conditional return and its `catch` a one-word conditional branch.
Lanternfly does not keep the words. They drag exception connotations
behind them, and the language has plainer ones, split by part of speech:
`fail` is the verb — `fails` in a signature, `fail` to raise, `or fail` to
propagate all name the routine's own act of failing — and `error` is the
noun, appearing exactly where a failure arrives as a value: `on error`.
The teaching rule is one sentence — fail is what a routine does, an error
is what its caller gets — and the handler form is BASIC's `ON ERROR`,
structured.

## 3. The model

An error set is an enum — kernel machinery from specification section 3,
nothing new:

```lanternfly
enum ParseError as u8
    emptyLine
    badDigit
    tooLarge
end
```

A failable routine names its error set in the signature, after the result
type. `fail` raises a member:

```lanternfly
// Syntax of the provisional 0.6 draft.
sub parseHex(line as string[8]) as u16 fails ParseError
    if length(line) = 0 then
        fail emptyLine
    end

    // digit loop, failing with badDigit or tooLarge
    return value
end
```

The candidate Z80 failure convention: carry set means failure with the
error code in A; carry clear means success with the result in the ordinary
result register. Carry is the one flag with a dedicated set instruction
(`SCF`), every conditional call, jump and return exists in carry-tested
form (`RET C`, `JR C`, `JP C`), and using a flag as the discriminant
leaves A free for the code — the tag costs no register. The local Tetro and Pacmo corpus already returns carry as the
Boolean result of its predicate routines, so the convention extends an
in-house habit with a code register rather than importing a foreign one.
What the language requires is only the abstract channel — a discriminant
and a code; carry/A is the provisional realization the sketches below
assume. `fail badDigit` is three instructions:

```azm
        LD   A, 1        ; badDigit's ordinal
        SCF
        RET
```

and a success return clears carry on the way out — often at no cost,
because the final arithmetic operation already left it clear.

One detail modern languages pay for and this platform gets from hardware:
the carry flag is the union's tag. Zig must encode "is this an error?"
somewhere in the value's representation; here the discriminant is a flag
bit, the value and the code never share space, and error code 0 is usable
like any other.

The error code is an ordinary enum value. It can be stored in a record
field, passed to a routine, selected over, compared. Errors are data;
only the combined value-or-error result of a call is special, and it is
special only long enough to be propagated, handled or replaced.

## 4. Surface syntax

Five forms, all words, all statement-local:

| Form | Meaning |
| ---- | ------- |
| `as T fails E` / `fails E` | signature: may fail with a member of enum `E` |
| `fail member` | return failure with that code |
| `call(...) or fail` | on failure, return the same failure to the caller |
| `call(...) or expression` | on failure, use this value instead |
| `on error name ... end` | handler block bound to the preceding failable statement |

`or fail` is legal only inside a routine whose own signature says `fails`
with a compatible error set; propagation is visible in every signature it
passes through. `on error` names the code as a read-only binding scoped to
its block, and its body is ordinary statements — `continue` inside a loop,
`return`, retry logic, or a further `fail` when the routine's signature
permits one. Like `type`, `error` is a contextual word, recognized only
after `on`, so it stays available as an ordinary identifier. `or` with a
default expression requires the expression's type to match the call's
result type. The first edition binds `on error` to exactly one preceding
statement; a form covering a region is deliberately absent, because a
region form is a caught block and section 2 already rejected those.

## 5. Scenarios

### 5.1 Handling at the top: the monitor prompt

A command loop is where propagation stops and handling starts, because the
human at the keypad is the only agent who can fix a typo:

```lanternfly
var entry as string[8]      // module storage; locals cannot own
                            // aggregates (specification section 11.4)

sub commandLoop()
    var address as u16      // locals precede statements, so the
                            // loop body assigns rather than declares

    while true
        readLine(entry)

        address = parseHex(entry)
        on error code
            showParseError(code)
            continue
        end

        runFrom(address)
    end
end
```

A declaration initializer may carry a handler too — `var address as u16 =
parseHex(entry)` followed by `on error` — but locals precede every
statement, so that handler can have no enclosing loop and must leave the
routine through `return` or `fail`; the assignment form above is the one
that composes with a loop.

The lowering is one conditional branch:

```azm
        CALL parseHex
        JR   C, _handler     ; 2 bytes: the entire cost of handling
        LD   (address), HL
        ...
_handler:                    ; A holds the code, ready to use
        CALL showParseError
        JP   _loopTop
```

Because the code is an enum, a handler can select over it, and the
exhaustiveness rule of specification section 9.2 — already in the language
— checks that every declared error is covered:

```lanternfly
on error code
    select code
    case emptyLine
        continue
    case badDigit, tooLarge
        showParseError(code)
        continue
    end
end
```

### 5.2 Propagating through the middle

A routine that cannot fix a problem passes it down, and its signature
states the possibility:

```lanternfly
sub loadProgram() as u16 fails TapeError
    var header as u16 = readBlock(headerBuffer) or fail
    readBlock(bodyBuffer) or fail
    return header
end
```

Each `or fail` lowers to one byte:

```azm
        CALL readBlock
        RET  C               ; the entire cost of propagation
```

In tail position the cost falls to zero. `return parseHex(entry) or fail`
lowers to:

```azm
        CALL parseHex
        RET
```

because the final `RET` returns both outcomes unchanged — success value in
HL with carry clear, or code in A with carry set. Propagation chains cost
nothing at the end of a routine, which is where they usually sit.

### 5.3 A default instead of a handler

Where the response to failure is a sensible substitute, `or` takes a
value:

```lanternfly
var speed as u8 = parseDigit(key) or 1
```

The line reads as English: parse the digit, or 1. With a `u8` result in A, the lowering
is four bytes:

```azm
        CALL parseDigit
        JR   NC, _keep
        LD   A, 1
_keep:
```

### 5.4 Rejected programs

The enforcement rules cost bytes in the compiler and none in the
program. Both of the following are compile errors:

```lanternfly
parseHex(entry)              // failure ignored: no handler, no
                             // propagation, no default

sub updateClock()
    frame = parseHex(entry) or fail
end                          // updateClock declares no 'fails', so it
                             // may not propagate
```

The second rejection carries the visibility guarantee: failability cannot
cross a signature silently, so a call site's possible outcomes are
readable from the signatures alone. The ignorable `-1` of C is not
writable in this design.

### 5.5 Cleanup: `defer` and the exits the compiler writes

Before propagation sugar exists, every exit from a routine is a `return`
the programmer wrote, and cleanup can be placed by hand before each one.
`or fail` changes that: it inserts exits the programmer never wrote, one
per failable call, and hand placement stops being possible in principle.
`defer` is therefore a dependency of this design, and it becomes necessary
the day `or fail` exists:

```lanternfly
sub copyFromTape(bank as u8) fails TapeError
    mapBank(bank)
    defer unmapBank()

    readBlock(buffer) or fail    // must unmap on this exit too
    storeBlock(bank)
end
```

`defer` registers a statement to run on every exit from the routine —
ordinary returns, `fail`, and the exits `or fail` inserts. Multiple
defers run in reverse declaration order. A deferred statement must be
infallible and must not contain a `return` statement; cleanup that can
itself fail is a design smell, and the first edition does not legislate
for it.

The lowering reroutes exits through a shared cleanup tail, and the
propagating exit must preserve the failure state across it:

```azm
        CALL readBlock
        JR   C, _cleanupFail     ; propagation, via cleanup
        ...
_cleanupFail:
        LD   (savedCode), A      ; unmapBank may clobber A and flags
        CALL unmapBank
        LD   A, (savedCode)
        SCF
        RET
```

That is the whole price of `defer`: in routines that defer something,
one-byte propagation grows to a branch plus a shared tail plus code
preservation around the cleanup call. Still small, still visible, and
charged only to routines that use it.

On the target resources are hardware state — a mapped bank, disabled
interrupts, a display mode — rather than allocations, so deferred
statements are expected to be short calls that restore state. Whether
real programs defer often enough to justify the word is a corpus
question; its answer arrives with the section 10 examples.

## 6. Lowering summary

| Construct | Z80 lowering | Cost |
| --------- | ------------ | ---- |
| `fail member` | `LD A, n` / `SCF` / `RET` | 4 bytes |
| success return | clear carry in epilogue | 0–1 bytes, often free |
| `or fail` | `RET C` | 1 byte |
| `or fail`, tail position | folds into the final `RET` | 0 bytes |
| `or default` | `JR NC` over a load | ~4 bytes |
| `on error` | `JR C, _handler` | 2 bytes |
| `defer` interaction | exits reroute through shared cleanup tail | per section 5.5 |

Costs assume the static-frame profile, where a routine has no epilogue to
skip and a bare `RET C` is safe. A recursion-capable profile with real
stack frames lowers propagation as a conditional jump to the epilogue
instead — a few bytes more — and the difference appears in that profile's
cost report like every other profile cost (specification section 11.7).

No table, no runtime helper, no unwinder appears anywhere in the column.
Every construct is an instruction, a branch or a shared tail, which is the
section 2 admissibility test passed at the instruction level.

## 7. Interaction with cooperative tasks

The two designs compose without adjustment. A task step routine may be
failable like any routine; a task that fails permanently records the code
in its own record and enters a reserved error state that the owning
routine reads on the next turn — the natural extension is state 254, beside the
cooperative-tasks convention's fresh 0 and done 255. An awaiting task
whose await ends in an error simply stores it and advances state; errors
are values, so
they cross turns by sitting in a record field.

Exceptions would have broken tasks outright — a throw across a yield has
no frame to unwind into. That the value model composes with the task
model for free, while the rejected model destroys it, is corroborating
evidence for both.

## 8. The pattern in Lanternfly 0.5

Everything above is expressible today, and teaching material can use the
manual form immediately. The convention mirrors the cooperative-tasks
paper: a strict shape, so that every example written under it becomes a
test case for the syntax — the sugar is correct exactly when it emits
what these examples already prescribe by hand.

1. An error set is an enum with `u8` representation whose first member is
   `ok` with ordinal zero.
2. A failable routine returns the status enum as its declared result.
3. A failable routine with a result value delivers it through an
   aggregate `out` parameter the caller owns.
4. Callers consume the status with `select`, handling `ok` first.

```lanternfly
enum ParseStatus as u8
    ok
    emptyLine
    badDigit
    tooLarge
end

record ParseOut
    value as u16
end

sub parseHex(line as string[8], out as ParseOut) as ParseStatus

// caller:
select parseHex(entry, result)
case ok
    runFrom(result.value)
case emptyLine
    // ...
case badDigit, tooLarge
    showParseError()
end
```

The manual form carries every property of the design — enum codes,
exhaustive handling, failability visible in the signature — at the cost
of boilerplate at every call site. That distribution of boilerplate is why this
syntax is scheduled ahead of the task syntax: the generator pattern's
boilerplate is confined to one routine body, while status-checking spreads
through every routine that touches an error.

## 9. Open questions

- **Error-set compatibility.** The first edition permits `or fail` when
  the callee's error set is the same enum as the caller's declared set.
  Zig-style set inclusion — propagation legal when the caller's set
  contains every member of the callee's — is the likely relaxation, and
  needs a rule for code renumbering or a shared-hosting convention before
  it is sound. Until then, crossing sets means handling.
- **`fails` on external routines.** Native routines that already report
  status in carry — the corpus predicate routines are the local examples —
  fit an `extern sub` carry/A contract with little or no adapter. The
  binding syntax of specification section 12.4 should admit `fails`
  naturally; the effect-contract wording needs a pass.
- **Result registers.** The sketch assumes u16 results in HL and u8
  results in A; a u8 result and the error code then share A, disambiguated
  by carry. The lowering contract must fix these choices per profile.

The `on error` binding grammar and the word choices, open questions in
earlier drafts, are settled by the 0.6 draft: sections 11.8, 14 and 15 of
the specification state the binding rules, the one-consumer-per-failure
restriction and the spellings, with `error` contextual after `on`.

## 10. Path into the specification

This design is drafted into the provisional 0.6 revision, and it adds
enough surface area — five words, a signature clause, a statement form, a
binding clause and a calling-convention extension — that it is a language
version bump. The touched documents, as drafted:

1. **Specification.** Section 11.8 for failable signatures, `fail`,
   `or fail`, failure defaults and `on error`; section 11.9 for `defer`;
   `defer`, `fail`, `fails` and `on` in the section 14 inventory with
   `error` as a contextual word; grammar productions and disambiguation
   notes in section 15; and new section 16 queue entries for error-set
   inclusion, `fails` on external routines and the extended
   `on error`/`defer` forms.
2. **Conformance.** New rejection codes for ignored failure, undeclared
   propagation, error-set mismatch, a failable `defer` body and a
   malformed `on error` binding; positive programs exercising each
   scenario of section 5; fault-trace vectors confirming that faults and
   errors stay in separate tiers.
3. **Lowering contract.** The failure convention as a backend obligation:
   flag and register assignments per result type, tail-position folding,
   epilogue interaction on recursion-capable profiles, and the
   defer-rerouting rule of section 5.5.
4. **Evidence — still owed.** The manual pattern of section 8 goes into
   the same example bodies the cooperative-tasks paper targets — Tetro
   input handling first — and the conformance fixtures follow the first
   compiler. The specification marks sections 11.8 and 11.9 Provisional
   until both exist; blessing the 0.6 draft as final is gated on this
   step, not the other way around.

The sequencing is deliberate: the cooperative-tasks direction is deferred
until a working compiler exists because it is an application of the
language, while this design is scheduled for the language itself, because
error handling shapes every signature in every library, and retrofitting
it after libraries exist is a mistake with a long record — each language
section 2 surveys added its error discipline late, against an installed
base, and the cost of those retrofits is well documented.
