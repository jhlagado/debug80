# Lanternfly

Lanternfly is a small, typed, BASIC-like programming language.
It is intended to replace handwritten assembly in the ordinary logic of a
Glimmer program while remaining independent of Glimmer itself.

The package is a design workspace. It contains no compiler yet. The documents
separate accepted direction from provisional proposals and open questions so
the language can be derived from real Glimmer programs rather than completed
in the abstract.

Lanternfly sits between structured source and a target substrate:

```text
Lanternfly source
    |
    v
target backend
    |
    +-- AZM or another Z80 assembler
    +-- a 6502 or 8086 assembler
    +-- C
    `-- BASIC
```

Glimmer may host Lanternfly bodies, just as it currently hosts AZM bodies, but Lanternfly
has no built-in knowledge of Glimmer state, triggers, effects, cards, displays,
or resources. The Glimmer preprocessor continues to own those concepts.

## Documents

- [LLM project handover](docs/handover.md)
- [Lanternfly teaching book](../../../debug80-docs/lanternfly-book/book1/index.md)
- [Documentation index](docs/index.md)
- [Lanternfly language design book](docs/design-book/index.md)
- [Language charter](docs/charter.md)
- [Working language specification](docs/specification.md)
- [Lowering, backend and runtime contract](docs/lowering-and-runtime.md)
- [Research record and evidence](docs/research.md)

## Current priorities

The first design work concentrates on:

1. fixed-size arrays, records, indexing, aliases, and references;
2. a small expression language for arithmetic, comparison, masks, and
   conditions;
3. structured conditionals and loops;
4. portable lowering and target runtime support.

Formal arguments and scalar locals form a later implementation stage than
structured storage, but their semantics are now included in the design.
Floating point remains deferred. ZAX demonstrates that routine features can be
added while aggregate locals remain aliases and the language remains
heap-free.
