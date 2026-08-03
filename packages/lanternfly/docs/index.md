# Lanternfly project documents

Lanternfly 0.6 is the implementation baseline for the first compiler. The
package still contains documentation only, but the language, conformance,
lowering, and delivery boundaries are defined well enough for coding to begin.

## Reading order

1. [Language charter](charter.md) establishes the purpose, the Candlemoth
   self-hosting goal, and the product boundaries.
2. [Implementation plan](implementation-plan.md) defines the package layout,
   first coding change, milestone gates, and completion criteria.
3. [Working language specification](specification.md) states the 0.6 syntax
   and semantics.
4. [Conformance and diagnostics](conformance.md) defines required acceptances,
   errors, warnings, faults, fixtures, and artifacts.
5. [Lowering, backend and runtime contract](lowering-and-runtime.md) defines
   the typed compiler, host, backend, and runtime boundaries.

The remaining documents:

- [Language completeness review](language-completeness-review.md) assesses the
  BASIC/Pascal baseline and ranks post-K1 facilities.
- The white papers
  [Cooperative tasks for Lanternfly](../../../../debug80-docs/lanternfly-book/papers/cooperative-tasks.md)
  and
  [Task-first Lanternfly](../../../../debug80-docs/lanternfly-book/papers/task-first.md)
  are published in the companion documentation repository and on the
  documentation site: the cooperative-task architecture proposal and the
  task-first program-model direction built on it.
- [Lanternfly Book 1](../../../../debug80-docs/lanternfly-book/book1/index.md)
  and Book 2 are maintained in the companion documentation repository.
- [archive/](archive/) holds superseded design history: the error-handling
  design rationale behind specification section 11.8, and the language
  design book developed from the game corpus.

## Document authority

When documents differ, use this order:

1. specification;
2. conformance contract;
3. lowering contract;
4. implementation plan.

Archived documents carry no authority.

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
