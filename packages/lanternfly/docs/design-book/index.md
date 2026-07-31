# The Lanternfly language design book

Lanternfly is a compiled, statically typed language for fixed-memory systems.
Its storage and native-code model belongs in the territory of C or Pascal;
its word-oriented surface comes from structured BASIC. Glimmer bodies are the
first expected use, but the language and compiler stand on their own.

This book has room for the reasoning that the specification must compress. It
connects source rules to game code, memory layout, backend work and debugging,
showing why the language has its particular shape. It is a handbook and design
rationale rather than a tutorial, and assumes that the reader can follow
ordinary typed code.

All examples use the current 0.4 surface. The
[working specification](../specification.md) remains normative, the
[conformance contract](../conformance.md) defines required tests and
diagnostics, and the [implementation plan](../implementation-plan.md) governs
coding order.

## Reading order

1. [Language and boundaries](01-language-and-boundaries.md) establishes the
   territory between assembly, structured BASIC and systems languages.
2. [Numbers, truth and expressions](02-numbers-and-expressions.md) defines the
   scalar and ordinal model.
3. [Static storage and ordinal domains](03-storage-and-addressing.md) explains
   records, arrays, ranges, paths and aliases.
4. [Control flow and routines](04-control-and-routines.md) covers structured
   execution and the single `sub` form.
5. [Services, native code and the runtime](05-services-and-native-code.md)
   separates language operations from platform facilities and helpers.
6. [Lowering across unlike targets](06-lowering-and-portability.md) follows
   one meaning through AZM, other CPUs, C and BASIC.
7. [Hosting Lanternfly inside Glimmer](07-glimmer-hosting.md) defines the typed
   boundary around a hosted body.
8. [Debugging, generated code and visible cost](08-debugging-and-cost.md)
   describes maps, diagnostics and cost evidence.
9. [Translations from the game corpus](09-translation-studies.md) tests the
   language against the programs that motivated it.
10. [Language stages and decisions](10-stages-and-decisions.md) records what
    is chosen, provisional, open and deferred.

The first four chapters build the language from values through routines.
Chapters 5 through 8 follow those rules across runtime, backend, host and
debugging boundaries, and also work as reference material for implementers.

## Topic index

| Topic                                      | Main discussion                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| integers, Boolean values and conversions   | [Numbers, truth and expressions](02-numbers-and-expressions.md)                               |
| characters and strings                     | [Numbers, truth and expressions](02-numbers-and-expressions.md#byte-characters-and-strings)   |
| enums, subranges and array domains         | [Static storage and ordinal domains](03-storage-and-addressing.md#array-index-domains)        |
| records, paths and aggregate aliases       | [Static storage and ordinal domains](03-storage-and-addressing.md)                            |
| initialization, placement and volatility   | [Static storage and ordinal domains](03-storage-and-addressing.md#initialization-and-startup) |
| loops, routines, modules and program entry | [Control flow and routines](04-control-and-routines.md)                                       |
| platform services, faults and native code  | [Services, native code and the runtime](05-services-and-native-code.md)                       |
| backend rules and ABI lowering             | [Lowering across unlike targets](06-lowering-and-portability.md)                              |
| Glimmer manifests and hosted return        | [Hosting Lanternfly inside Glimmer](07-glimmer-hosting.md)                                    |
| diagnostics, source maps and cost          | [Debugging, generated code and visible cost](08-debugging-and-cost.md)                        |
| game-corpus examples                       | [Translations from the game corpus](09-translation-studies.md)                                |
| implementation stages and decision status  | [Language stages and decisions](10-stages-and-decisions.md)                                   |

## Status language

- **Required** means that existing corpus code cannot be translated faithfully
  without the facility.
- **Chosen** marks a settled first-edition rule.
- **Provisional** marks a rule that implementation evidence may revise.
- **Open** names a bounded question and the evidence needed to close it.
- **Deferred** places a facility outside the first edition without promising
  that it will later be added.

Design history remains in the evidence documents and Git history. This book
describes the language a compiler is now expected to implement.
