# The Lanternfly language design book

Lanternfly is a small, statically typed language for code that is presently written
as the body of a Glimmer rule, effect or render. Its source should be readable
to somebody who once programmed in BASIC. Its memory model should still be
precise enough to describe a Z80 game without surrendering arrays, records or
the cost of an operation.

The book develops the language from repository evidence. It is not a tutorial
and it is not the normative specification. Many examples preserve the dialect
being considered when their chapter was written; they are design history, not
current syntax. Where this book differs from the
[working specification](../specification.md), the specification governs.
The [implementation plan](../implementation-plan.md) governs coding order and
milestone gates.

## Chapters

1. [A language between intention and substrate](01-language-and-boundaries.md)
2. [Numbers, truth and expressions](02-numbers-and-expressions.md)
3. [Static storage, layouts and references](03-storage-and-addressing.md)
4. [Control flow and routines](04-control-and-routines.md)
5. [Services, native code and the runtime](05-services-and-native-code.md)
6. [Lowering across unlike targets](06-lowering-and-portability.md)
7. [Hosting Lanternfly inside Glimmer](07-glimmer-hosting.md)
8. [Debugging, generated code and visible cost](08-debugging-and-cost.md)
9. [Translations from the game corpus](09-translation-studies.md)
10. [Language stages and decisions](10-stages-and-decisions.md)

The [working specification](../specification.md) states rules tersely. The
[evidence ledger](../evidence/reading-ledger.md) identifies the source material
behind them.

## Status language

The book uses four terms.

- **Required** means the corpus cannot be translated faithfully without the
  facility.
- **Chosen** means the current design accepts the rule.
- **Provisional** means implementation should follow the rule for now, while
  retaining a named point at which evidence may change it.
- **Deferred** means the feature is outside the first implementation, not
  necessarily outside the eventual language.

An open question is useful only when it names the decision, the plausible
choices and the evidence that will close it. The final chapter keeps that list.
