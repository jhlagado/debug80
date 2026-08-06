# The bootstrap ladder

How the compiler gets from the nucleus to a Lanternfly worth writing programs
in, and where it stops climbing.

Normative. It supersedes the phase sequence in `docs/bootstrap-plan.md` where
the two differ; that document's machine, budget, three-pass architecture and
fixpoint mechanics stand unchanged, and the differences are named at the end.

## The shape

**One compiler that grows, not a compiler per level.**

The earlier plan read as a series of compilers — a seed for level 0, then
Candlemoth, then something for level 1. That is more artifacts than the work
needs. There is one compiler. Its source is written in whatever subset it
already accepts, and it gains features one at a time.

## Generations

**Generation 0.** The seed, written in TypeScript against the nucleus grammar
and `nucleus/lowering.md`, compiles the compiler's nucleus source to **A**.

**Generation 1.** **A** compiles the same source to **B**. **B** compiles it to
**C**. **B** and **C** must be byte-identical; **A** and **B** need not be.

That is the fixpoint, and reaching it is the nucleus's entire purpose. It
proves the three-pass architecture, the agreement between the layout and
emission passes, and the label table surviving a streaming output — on 29
productions rather than 45, with no parameters, no locals and no static
frames. **If the architecture is wrong, it is wrong cheaply.**

After generation 1 the seed is retired for the nucleus. It stays in the
repository as the independent implementation the fixpoint argument rests on,
and it is re-run when the nucleus changes.

## The two-step rule

Every feature after generation 1 costs two generations.

**Step one, accept.** Write the code that implements the feature, in the
language the compiler already accepts. Compile with the previous binary. The
compiler now accepts more than its own source uses.

**Step two, adopt.** Rewrite parts of the compiler using the new feature.
Compile with the binary from step one. The source shrinks and the next feature
is easier to write.

Both steps end with a fixpoint check, so validation is continuous rather than a
single event. A feature that breaks byte-identity is caught in the generation
that introduced it, which is a small diff to search.

The two steps must not be merged. Source that uses a feature the compiling
binary does not accept cannot be compiled, and discovering that halfway through
a rewrite is a bad afternoon.

## The rungs

Ordered by what the compiler's own source gains. Nothing here is scheduled by
specification section.

### 1. Parameters and locals, without recursion

The nucleus's sharpest pain. Hand-allocated registers mean two routines can
collide silently, which is the bug class a compiler can least afford, and it is
what makes nucleus source large.

The cheap form comes first: **the compiler assigns each routine's storage
instead of the programmer**, with every routine getting its own permanent slots
and no sharing. That removes the collision hazard entirely. Storage sharing
between routines that cannot be simultaneously active is an optimisation for
later, once there is a call graph and a measurement.

### 2. Routine results

Small once parameters exist, and it removes a great deal of register shuffling
at call sites. A result is one scalar, as section 11.1 already states.

### 3. Enumerations

Admitted for correctness rather than size. A compiler is full of token kinds,
symbol classes and node kinds, and integers in that role are a bug source that
no amount of care removes.

### 4. `and` and `or`

Last of the cheap rungs, and **on evidence from written nucleus source rather
than from argument.** Short-circuit lowering emits the same code as nested `if`
in the common case; the question is how often the compiler's own conditions
carry an `else` on a compound test, and that is answered by having written
them.

### Recursion, which may never be a rung at all

Save-around-call and the strongly-connected-component analysis are the
expensive part of parameters, and **the compiler may never need them.** A
table-driven parser keeps its recursion in an explicit stack rather than in
routine nesting. If nothing in the compiler recurses, the whole subsystem is
deferred until a user program requires it.

This is worth checking early, because it is the difference between a large
piece of machinery on the critical path and one that is not on it at all.

## Where the ladder stops

**After the rungs above, the compiler stops climbing.** The estimate is three
or four rungs, not a level per specification section, because after parameters,
locals, results and enumerations the compiler's own source is comfortable and
nothing further compounds.

At that point the two things separate:

- **The language the compiler is written in freezes** at that small subset.
- **The language the compiler accepts keeps growing** — tasks, state cells,
  pulses, derivations, modules, strings, error handling, `i16`, records.

Everything in the second list is implemented in the compiler and never used by
it. That is how compilers ordinarily work, and it is why the ladder is short:
it only has to reach the height at which writing the compiler is pleasant.

So the answer to "how do we reach the full language" is that you stop climbing
and start building.

## What the ladder is evidence about

It is evidence about the **ladder**, not about Lanternfly.

"The compiler does not need it" is not "Lanternfly does not need it." Tasks and
state cells exist for user programs on small machines, and the compiler will
never exercise one. Nothing the bootstrap discovers bears on them.

Where the bootstrap *is* strong evidence about the language is when a feature
was justified **by** the compiler's needs. `level0.md` argued range cases in on
the grounds that a tokenizer without them is markedly larger; the tokenizer was
then written with a character-class table and wanted neither range cases nor
multi-value cases. That justification is refuted, and the feature has to find
another one or stay out.

The same test applies to every candidate the exercise has produced:

| Candidate | Status |
| --- | --- |
| Records | Zero uses in 4,000 lines of front end. Justified by compiler need; refuted. |
| Range and multi-value cases | Justified by tokenizer need; refuted by the tokenizer. |
| `for … to` | Every loop in the front end is `until`. Refuted. |
| `i16` | The nucleus tests whether a compiler needs signed arithmetic at all. Open. |
| Save-around-call recursion | Open, and settled by whether the compiler recurses. |
| `mod`, integer `xor` | Never used, never justified by compiler need. Out. |

A feature refuted as a compiler need may still be justified as a user need.
That argument has to be made separately and recorded, not assumed.

## What this changes in `bootstrap-plan.md`

The plan's machine, memory model, budget accounting, three-pass architecture
and fixpoint mechanics are unchanged. Three things move:

**The seed targets the nucleus, not level 0.** The plan's Phase 2 describes a
seed implemented against the level-0 grammar and lowering table. It is
implemented against the nucleus grammar and `nucleus/lowering.md` instead, and
is roughly half the size. The independence requirement is unchanged: the seed
is written against the specification, not transliterated from the compiler's
source.

**The fixpoint arrives at generation 1 rather than at Phase 5.** The plan
treats it as the last check before release. It becomes the first milestone,
and it is re-run at every generation thereafter. What the plan says about what
a fixpoint proves is unchanged and worth repeating: **it proves stability, not
correctness.** Two identically wrong compilers are a perfectly good fixpoint.

**Phase 4's correctness burden moves to the rungs.** The plan carries
correctness in one large phase after the compiler exists. It is carried
per-rung instead, because each rung ends with a fixpoint and a corpus run, and
a defect introduced by one feature is found in the generation that introduced
it.

## What waits for evidence

- Whether the compiler recurses at all, which decides whether save-around-call
  is on the critical path.
- Whether `and` and `or` earn rung 4, from written nucleus source.
- Whether `i16` is needed anywhere in the compiler.
- The size of the nucleus-written compiler, which is estimated at 1.5 to 2×
  the same compiler written in level 0 and is not measured.

None of these is decidable from here, and `candlemoth-size-discipline.md` is
explicit that source appearance is not the measurement.
