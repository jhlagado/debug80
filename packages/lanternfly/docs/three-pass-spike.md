# The three-pass spike

**Goal.** Compile a micro-language to a Z80 image with three passes, run the
image on the bootstrap machine, and prove that the layout pass and the emission
pass agree on every address.

This is the first thing in the project that compiles and executes. Everything
so far — four thousand lines of level-0 source, three lowering documents, a
grammar analyzer — rests on documents, and the last several reviews found
errors in documents that running the code would have caught immediately.

## Why a throwaway language

The nucleus exists to make the architecture risk cheap to test. A micro-language
makes it cheaper, and it **decouples two risks that are currently tangled**:

- is the three-pass architecture sound?
- is the nucleus the right subset?

A failure in either currently looks like a failure in both. Proving the
architecture on a language nobody has to agree on lets the nucleus be settled
on its own merits, and lets this start before the nucleus freezes.

It also wastes nothing. The seed is blocked because writing it against a moving
language throws the work away; a harness has nothing to throw away.

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
2. The emission pass asserts address agreement with layout at every label and
   every instruction boundary, and the assertion is exercised — a deliberately
   broken lowering must make it fail.
3. The image loads and runs to halt on the bootstrap machine.
4. The bytes written to the code port match the expected bytes for at least:
   an assignment, an addition, a forward jump over an `if` body, a backward
   jump closing a `while`, and a nested `if` inside a `while`.
5. Compiling the same source twice produces identical bytes.
6. The lowering sequences used come from the existing manifests and are
   **executed**, not only assembled.

## Non-goals

It is not the seed and does not become one. It is not the nucleus and takes no
position on the nucleus's language design. It has no diagnostics beyond what
the spike needs, no error recovery, no symbol table beyond a flat list, and no
optimisation.

If it turns into a compiler, that is a failure of scope.

## What a failure would mean

If layout and emission cannot be made to agree, or the label table cannot work
against a stream, the three-pass architecture changes and every document
downstream changes with it. **That is the largest finding still available and
it is currently unguarded.** Finding it here costs a few hundred lines; finding
it after the seed costs the seed.
