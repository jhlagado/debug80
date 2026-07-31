# Lanternfly project documents

Lanternfly 0.4 is the implementation baseline for the first compiler. The
package still contains documentation only, but the language, conformance,
lowering, and delivery boundaries are defined well enough for coding to begin.

## Reading order

1. [LLM project handover](handover.md) gives a fast orientation, repository
   map, project state, and non-negotiable language boundaries.
2. [Implementation plan](implementation-plan.md) defines the package layout,
   first coding change, milestone gates, and completion criteria.
3. [Working language specification](specification.md) states the 0.4 syntax
   and semantics.
4. [Conformance and diagnostics](conformance.md) defines required acceptances,
   errors, warnings, faults, fixtures, and artifacts.
5. [Lowering, backend and runtime contract](lowering-and-runtime.md) defines
   the typed compiler, host, backend, and runtime boundaries.
6. [Language stages and decisions](design-book/10-stages-and-decisions.md)
   separates the frozen baseline from deferred and open design work.

The remaining documents explain the design:

- [Language charter](charter.md) establishes the purpose and product
  boundaries.
- [Language design book](design-book/index.md) develops the design from the
  game corpus and compares target lowerings. Several chapters retain
  superseded proposals as labelled design history.
- [Language completeness review](language-completeness-review.md) assesses the
  BASIC/Pascal baseline and ranks post-K1 facilities.
- [Research record](research.md) connects decisions to Glimmer, AZM, ZAX, and
  the program corpus.
- [Lanternfly Book 1](../../../../debug80-docs/lanternfly-book/book1/index.md)
  is maintained in the companion documentation repository and is outside this
  package rewrite.

The supporting evidence is kept under [evidence](evidence/reading-ledger.md).
It includes the reading ledger, chapter notes, corpus dossiers, a
[feature matrix](evidence/corpus-feature-matrix.md), generated output and
integration studies, and the [AZM/ZAX comparison](evidence/azm-zax-analysis.md).
The [AZM algorithms and native game study](evidence/azm-book3-and-native-games.md)
tests the storage design against Book 3 and the current TETRO/PACMO source.

## Document authority

When documents differ, use this order:

1. specification;
2. conformance contract;
3. lowering contract;
4. implementation plan;
5. decision chapter;
6. design history and evidence.

The documents use these status labels:

- **Direction:** a principle accepted for continued design.
- **Provisional:** the current best proposal, retained until examples or
  implementation evidence displace it.
- **Open:** a question that still needs corpus evidence, experiments, or an
  explicit language decision.
- **Deferred:** a facility excluded from the first implementation.

Illustrative code outside the working specification shows the intended reading
style rather than defining grammar. Provisional punctuation and keywords may
still change through the decision process.
