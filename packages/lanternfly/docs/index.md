# Lanternfly design documents

Lanternfly is currently a language-design project. These documents record the
working contract before parser or compiler implementation begins.

## Reading order

1. [LLM project handover](handover.md) gives a fast orientation, repository
   map, project state and implementation starting point.
2. [Lanternfly Book 1](../../../../debug80-docs/lanternfly-book/book1/index.md)
   teaches the working language through beginner-facing programs.
3. [Language charter](charter.md) establishes the purpose and boundaries.
4. [Language design book](design-book/index.md) develops the design from the
   game corpus and compares target lowerings.
5. [Surface language draft](surface-language.md) records the current lowercase
   syntax, unified routine model, expression statements and source modules.
6. [Working language specification](specification.md) retains the detailed
   numeric, storage, target and hosted-body contract from the earlier syntax
   edition.
7. [Lowering, backend and runtime contract](lowering-and-runtime.md) defines
   the typed compiler/host/backend boundaries.
8. [Research record](research.md) links decisions to the Glimmer, AZM and ZAX
   evidence.

The supporting evidence is kept under [evidence](evidence/reading-ledger.md).
It includes the reading ledger, chapter notes, corpus dossiers, a
[feature matrix](evidence/corpus-feature-matrix.md), generated output and
integration studies, and the [AZM/ZAX comparison](evidence/azm-zax-analysis.md).
The [AZM algorithms and native game study](evidence/azm-book3-and-native-games.md)
tests the storage design against Book 3 and the current TETRO/PACMO source.

## Status vocabulary

The documents use three labels:

- **Direction:** a principle accepted for continued design.
- **Provisional:** the current best proposal, retained until examples or
  implementation evidence displace it.
- **Open:** a question that still needs corpus evidence, experiments, or an
  explicit language decision.

Illustrative code outside the working specification shows the intended reading
style rather than defining grammar. Provisional punctuation and keywords may
still change through the decision process.
