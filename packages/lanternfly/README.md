# Lanternfly

Lanternfly is a statically typed structured BASIC for fixed-memory systems. It
combines the direct compilation and exact storage model of C or Pascal with a
word-oriented syntax intended to be familiar to a BASIC programmer. Programs
compile ahead of time to native code or another low-level substrate; Lanternfly
is not an interpreter.

Specification 0.4 is the implementation baseline for the first compiler. This
package currently contains the language, conformance, architecture, and
implementation contracts. Compiler source has not yet been added.

The first compiler will be desktop-hosted and will emit AZM for Z80 systems.
The architecture also supports other processors and hosted C or BASIC
backends. A later Lanternfly compiler may run directly on the small systems it
targets.

```text
Lanternfly source
    |
    v
typed front end and IR
    |
    +-- IR interpreter
    +-- AZM / Z80
    +-- another CPU backend
    `-- C or a named BASIC dialect
```

Glimmer bodies are the first expected use, but Lanternfly is an independent
language. A Glimmer integration supplies ordinary typed storage, constants,
routines, and a host epilogue through a versioned manifest. Glimmer retains
its scheduling, change tracking, resources, and platform declarations.

Lanternfly source has no pointer or reference values. Declared paths,
multidimensional indices, and integer selectors identify persistent storage.
Aggregate parameters and local aliases are temporary, non-escaping names for
existing arrays or records. A backend may carry an address internally, but
that carrier is not a source value.

## Documents

- [Implementation plan](docs/implementation-plan.md) gives the coding order,
  package structure, milestone gates, and first change.
- [Specification](docs/specification.md) defines 0.4 source syntax and
  semantics.
- [Conformance contract](docs/conformance.md) defines required diagnostics,
  faults, fixtures, and artifacts.
- [Lowering contract](docs/lowering-and-runtime.md) defines the typed
  front-end, IR, host, backend, and runtime boundaries.
- [Decision chapter](docs/design-book/10-stages-and-decisions.md) records
  chosen, provisional, deferred, and open design points.
- [Documentation index](docs/index.md) links the charter, design history,
  completeness review, and evidence.
- [Project handover](docs/handover.md) supplies repository context for a new
  development session.

The separately maintained
[Lanternfly teaching book](../../../debug80-docs/lanternfly-book/book1/index.md)
is not part of this implementation package.

## Implementation order

Implementation proceeds in this order:

1. TypeScript package scaffolding and shared source-span diagnostics;
2. versioned host-manifest and target-profile schemas;
3. validation of an empty hosted body and its epilogue contract;
4. the complete 0.4 parser;
5. K0 name, type, layout, and effect analysis;
6. typed IR and interpreter;
7. canonical AZM lowering and composed source maps;
8. K1 exact arrays, records, paths, locals, and aliases;
9. user routines after storage and diagnostic behaviour are stable.

Bounded views, parameter modes, enums, floating point, rich strings, and
recursion-capable bare-metal profiles remain later design work. They do not
block K0 or K1.

## Validation

Documentation changes run from the repository root:

```sh
npx prettier --check \
  packages/lanternfly/README.md \
  packages/lanternfly/package.json \
  'packages/lanternfly/**/*.md'

npm run check:links
git diff --check
```
