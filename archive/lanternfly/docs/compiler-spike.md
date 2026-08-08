# The compiler spike

**Goal.** Compile a micro-language to a Z80 image, run it on the bootstrap
machine, and prove that a forward jump can be back-patched through a streaming
output.

**Done.** `src/spike/micro.ts` and `test/spike.test.ts`. What follows is kept
as the record, including the part it got wrong.

## What it got wrong, and what that was worth

The spike was first built to prove a **three-pass** architecture — analysis,
layout, emission, with the emission pass checking every address against what
layout recorded. It proved it. The architecture worked on the first run.

**It was the wrong question, carefully answered.** Lanternfly is single-pass by
decision. Declaration before use and `forward` are consistent with that and are
what make it workable — but they do not prove it, and an earlier revision of
this document said they did. A multi-pass compiler can enforce declaration
before use perfectly well; language semantics do not mandate a compiler
architecture.

The measurements that followed made the cost concrete:

| | Single pass, back-patching | Three passes |
| --- | --- | --- |
| Label and call bookkeeping, **allocated** | **896 bytes** | **1,024 bytes** |
| Source walked | once | three times |

An earlier revision of this table said 54 bytes against 1,024. That compared
*live* patch entries with an *allocated* table and left call patching out
altogether. Allocated against allocated the saving is 128 bytes, not 970.

Rebuilt single-pass, the spike emits **byte-identical code** for every test
program. The architectures differ in how the compiler gets there, not in what
it produces — which is why proving one worked said nothing about whether it
was needed.

**The lesson that generalises**: an architecture inherited from a planning
document is a claim and should be tested as one. What does *not* generalise is
the reasoning I first gave for the replacement — see `level0-findings.md`
findings 34 and 35.

## What it proves now

**Back-patching works through a streaming output.** A forward jump emits a
placeholder and records where the operand sits; the target is written in when
it is reached, through the `seekCode` service. That service exists because
buffering the whole image instead does not fit — the buffer is as large as the
compiler, and at the upper code estimate it leaves negative headroom.

**Every forward reference is paid off.** A single-pass compiler has no address
agreement to check, because there is no second pass to disagree with. The
check it has instead is that the patch list is empty at the end. One entry left
over would ship as a jump to address zero, which runs.

**The image executes**, and the bytes it writes to the code port are the bytes
expected — assignment, addition, a forward jump taken and not taken, a backward
jump closing a loop, and nesting.

**Compilation is deterministic**: the same source twice gives identical bytes.

**Every encoding is checked against AZM**, and a whole compiled program is
compared byte-for-byte against the same program hand-written and assembled.

## The language

Eight productions or so — the smallest thing with a forward jump, a backward
jump and a label table. Deliberately not a subset of anything.

```
program     ::= { declaration | statement } EOF
declaration ::= "var" NAME "as" "u8" NEWLINE
statement   ::= assignment | if-statement | while-statement | emit-statement
assignment  ::= NAME "=" expression NEWLINE
expression  ::= term [ "+" term ]
term        ::= NUMBER | NAME
if-statement    ::= "if" NAME "<>" "0" "then" NEWLINE { statement } "end" NEWLINE
while-statement ::= "while" NAME "<>" "0" NEWLINE { statement } "end" NEWLINE
emit-statement  ::= "writeCodeByte" "(" NAME ")" NEWLINE
```

`writeCodeByte` exists so a compiled program has observable output: the bytes it
writes to the code port are what the test compares.

## What it proves

**Layout and emission agree on every address.** The central architectural claim
of the plan, asserted in four documents and never once executed. The emission
pass recomputes each address and fails if it differs from what layout recorded.

**The label table survives a streaming output.** A forward jump's target is
unknown when the jump is emitted, and the output cannot be seeked. Three passes
are the answer and this is the first test of it.

**The image runs.** Loaded on `BootstrapMachine`, executed, and the bytes it
writes to the code port compared against the expected bytes.

**Compilation is deterministic.** The same source compiled twice gives
byte-identical output — the fixpoint mechanics in miniature, on an artifact
small enough to debug when it fails.

## Exit criteria

1. A micro-language program compiles to a Z80 image.
2. Every forward reference is paid off, and the check is exercised — a
   deliberately dropped patch must make it fail.
3. The image loads and runs to halt on the bootstrap machine.
4. The bytes written to the code port match the expected bytes for at least:
   an assignment, an addition, a forward jump over an `if` body, a backward
   jump closing a `while`, and a nested `if` inside a `while`.
5. Compiling the same source twice produces identical bytes.
6. Every encoding is checked against AZM, and a whole compiled program is
   compared against the same program hand-assembled.

All six are met. `test/spike.test.ts` reports the layout of a representative
program: 44 bytes of code, three labels, two forward patches, **4 bytes of
patch list where a label table would have been 6**.

## Non-goals

It is not the seed and does not become one. It is not the nucleus and takes no
position on the nucleus's language design. It has no diagnostics beyond what
the spike needs, no error recovery, no symbol table beyond a flat list, and no
optimisation.

If it turns into a compiler, that is a failure of scope.

## What it has not proved

**It resolves labels, not routines.** The micro-language has no subroutines, so
the spike says nothing about call addresses, the call graph, strongly-connected
components, save-around-call stubs, or patching a `CALL` operand. Those are the
substantial part of single-pass compilation and they remain unproven.

The design for them, from `bootstrap-plan.md` and confirmed in review: collect
call edges as the bodies are read, compute the components once the source ends,
emit one save and one restore stub per routine that needs them, and patch each
fixed-size `CALL` operand to the routine or to its stub. One source scan, with
a fixup phase over recorded data afterwards.

**The single-pass experiment has therefore disproved only the need for multiple
passes to resolve local control-flow labels.**

## What it did not test

**The source is tokenized once into an array.** A real compiler streams its
input; `rewindSource` is untested here. Nothing about back-patching depends on
it, but the pass structure over a streaming *input* is a separate claim this
does not exercise.

**There are no calls**, so save-around-call and the `forward` rule that decides
it are untested. That rule — a cycle in a single-pass language must pass
through a forward declaration — is what replaced the analysis pass, and it
deserves its own slice.

**The spike patches its own byte array; `test/seek.test.ts` drives the ports.**
Those are two separate proofs, not one end-to-end proof of streamed
back-patching. Nothing yet emits through the machine's ports and patches what
it emitted.
