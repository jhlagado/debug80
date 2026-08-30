# Nucleus and Atom convergence

Status: accepted migration target
Date: 2026-08-28

## Decision

Nucleus should converge with Atom below the source-language boundary. The two projects should share host-facing Z80 tool services, source identity rules, dependency resolution, provider adapters, publication discipline, and proof structure where the semantics match. They should not share source syntax by accident.

Atom remains the first-class Z80 assembler. Nucleus remains a separate Z80 compiler with its own language, compiler vector, runtime contract, and proof obligations. The convergence point is the common harness and host-service architecture that lets both tools run either in Debug80 emulation or on a native Z80 environment.

The migration should proceed in measured stages. Each stage must preserve current Nucleus behaviour until the replacement path has a byte-identical or proof-equivalent result.

## Current state

Atom already uses the shared architecture:

- `packages/z80-tool-services` defines the language-neutral source-preparation and named-object service boundary.
- `packages/atom` uses `@jhlagado/z80-tool-services/source-preparation` through an Atom-specific source profile.
- The Atom host API exposes project assembly, resolved project assembly, artifact rendering, named-object providers, translation helpers, and self-host helpers.
- Atom has Node, Debug80, CP/M, and TEC-oriented platform documentation, with the native profiles kept free of JSON.

Nucleus has now started moving onto that boundary:

- `packages/nucleus/src/source-preparation.ts` uses
  `@jhlagado/z80-tool-services/source-preparation` through a Nucleus-specific
  leading-import source profile.
- `prepareNucleusSourceParts()` and `resolveNucleusProject()` are exported from
  the package root.
- The source profile recognizes only leading `//% import "path.nu"` directives
  and passes compiler bytes through unchanged.
- The permanent Atom translation under `packages/nucleus/atom-asm` has no
  compatibility-lowering issues, no late includes, and no source drift.
- The proof harness routes the ordinary permanent Atom-ready proof path through
  Atom-built images while retaining explicit AZM routes for compatibility and
  measurement artifacts.
- Nucleus depends on `@jhlagado/z80-tool-services`, `atom-z80`,
  `@jhlagado/azm`, and `@jhlagado/debug80-runtime` while the migration is
  incomplete.
- `packages/nucleus/src/source-manifest.ts` still exists as a low-level
  compatibility helper. It is not the desired user-facing or package-root
  project model.

That state is useful migration progress. It should not be treated as the final
shape: the remaining work is to make the shared preparation, service, CLI, and
Debug80 boundaries normal production surfaces, then retire compatibility-only
paths after their replacements are proved.

## Shared layer model

The common model should be layered this way:

| Layer | Shared or project-owned | Responsibility |
| --- | --- | --- |
| Processor and machine | Shared through Debug80 runtime or hardware | Z80 execution, memory, traps, timing where measured |
| Operating provider | Platform-specific | Files, named objects, console, block transfer, host callbacks |
| `z80-tool-services` ABI | Shared | Stable Z80-facing service calls for named objects and source bytes |
| Tool adapter | Project-owned | Atom compact callbacks or Nucleus compiler vector mapped onto services |
| Z80 core | Project-owned | Atom assembler core or Nucleus compiler core |
| Source preparation | Shared resolver with language profiles | Dependency discovery, source identities, ordering, capacities, provenance |
| CLI/API/Debug80 integration | Project-owned shape over shared services | Desktop commands, package exports, Debug80 assembler/compiler backends |

The Nucleus runtime services used by generated programs are a separate concern from the services used while the Nucleus compiler runs. They may share provider machinery, but the contracts must stay distinct: one contract feeds the compiler; the other supports the compiled program.

## Nucleus source preparation

The target Nucleus source-preparation profile should use the shared resolver but keep Nucleus syntax separate from Atom.

Initial Nucleus profile:

- recognize only leading `//% import "path.nu"` directives;
- inspect only the leading header block;
- resolve imports relative to the importing file;
- include each dependency once;
- reject cycles and conflicting identities before compiler execution;
- order dependencies before their importer using the shared deterministic postorder;
- pass compiler bytes through unchanged;
- retain each file as a distinct source part with its original logical identity;
- avoid macros, conditional body filtering, textual inclusion, namespaces, and export rules.

Because `//% import` is already a Nucleus comment, the compiler reads the original bytes. Source offsets, diagnostics, and future maps do not need a masking table for this initial profile.

Atom differs deliberately. Atom uses `%` host directives and masks preprocessor-only ranges with spaces while preserving byte offsets. Nucleus should not pay for Atom's conditional source-elision machinery unless a later Nucleus design explicitly admits host conditions.

The old flat source-manifest implementation should remain available only while
existing proof and package callers still need it. It should not reappear as a
native command format. Nucleus source composition should be expressed by the
entry source file's leading imports, resolved by the host or native harness
before the resident compiler starts.

## Harness and service convergence

Nucleus should use the shared service boundary under an adapter rather than copying Atom's internal callback ABI.

The adapter must preserve:

- the Nucleus compiler vector and register contracts unless a measured design change replaces them;
- atomic compiler input/output behaviour described in the Nucleus runtime contract;
- existing trap and diagnostic identities;
- ordered multipart source semantics;
- NOBJ output semantics where Nucleus currently uses NOBJ;
- strict proof harness coverage.

The shared named-object ABI is a good fit for source parts and output objects. Nucleus may still need compiler-specific calls for semantic diagnostics or runtime-specific records. Those should be added as Nucleus adapter policy first, then promoted into `z80-tool-services` only when Atom or another Z80 tool also needs them.

## CLI convergence

The Nucleus CLI should follow the same product philosophy as Atom without copying every switch.

Recommended desktop shape:

```text
nucleus main.nu build/program.nobj
nucleus main.nu build/program.nobj build/program.hex build/program.d8.json
nucleus --project nucleus.json
```

The desktop command may also retain `publish` as an explicit subcommand for
existing scripts and development tooling, but ordinary publication should not
require it.

Recommended native shape:

```text
NUCLEUS MAIN.NU PROGRAM.NOBJ
```

The Node command may support richer output selection, diagnostics, maps, and project JSON. Native Z80 commands should remain positional and small. A native system should not parse JSON; if it needs configuration, use a deliberately small native format or explicit command arguments.

Output switches should request outputs rather than suppress defaults. That keeps the common command easy to type and avoids carrying Node-specific Debug80 options into CP/M or TEC-style environments.

For native Nucleus, `MAIN.NU` is the entry source. Its leading `//% import`
header drives dependency discovery. There is no public `PLAN` command and no
serialized source-plan file in the native CLI contract. If a small system later
needs a cached dependency product for performance, that product is an internal
harness cache, not a source-language or command-line interface.

## Rewriting Nucleus assembly in Atom

Moving the Nucleus compiler source from AZM syntax to Atom syntax is a separate migration stage. It should not be combined with service-layer refactoring.

Required stages:

1. Census every AZM construct used under `packages/nucleus/asm`.
2. Classify each construct as directly supported by Atom, mechanically translatable, contract-only, or unsupported.
3. Build a symbol naming ledger for Atom's eight-character symbol limit.
4. Define a collision-safe naming scheme before editing source.
5. Translate AZM contract annotations into Atom comment-form annotations that can still generate the AZM proof input while the contract checker remains AZM-owned.
6. Assemble the translated source with Atom and compare the produced compiler image against the current AZM-built image.
7. Run the strict register-contract proof suite against the translated source path.
8. Switch the authoritative source only after byte identity and proof equivalence hold.

The naming ledger is mandatory. Shortening Nucleus labels without a ledger risks creating private-symbol or routine-symbol collisions that would be hard to diagnose after translation.

Contract comments need their own rule. Atom should not have to implement AZM's proof language inside the assembler core. The host can translate comment-form annotations into the contract-checking format used by the proof runner.

## Repository location

Nucleus should remain in the Debug80 monorepo during this convergence work.

That gives the migration direct access to:

- Atom as the target assembler;
- `z80-tool-services`;
- Debug80 runtime;
- package and CLI integration tests;
- shared documentation and service specifications.

A standalone Nucleus repository can be reconsidered only after these facts are true:

- Nucleus source preparation no longer depends on the old flat source-manifest path, and that helper is not exported from the package root;
- the shared service boundary is stable enough to consume as a package;
- the Nucleus host API and CLI are stable;
- an Atom-built Nucleus compiler image is proven against the old image;
- Debug80 integration uses public package surfaces rather than workspace internals;
- the build remains reproducible from published dependencies.

Until then, moving Nucleus out would add release and dependency friction without reducing technical risk.

## Implementation sequence

1. Keep this convergence specification current as the migration authority.
2. Keep the Nucleus source-preparation profile on
   `@jhlagado/z80-tool-services/source-preparation` and remove production
   dependence on the old flat source-manifest helper.
3. Move Nucleus source and output access behind shared-service adapters while
   preserving the compiler vector.
4. Define the Nucleus Node API and CLI v1 on top of leading-import source
   preparation and positive output selection.
5. Keep the Atom migration census green while converting additional Nucleus
   assembly to permanent Atom source.
6. Retire compatibility-only proof paths after every non-measurement proof image
   has a permanent Atom route.
7. Build the Nucleus compiler image from permanent Atom source and prove byte
   identity with the current image.
8. Revisit the repository-location decision with measured evidence.

## Explicit stop points

Stop for a user decision before:

- adding Nucleus source syntax beyond leading `//% import`;
- adding conditional body filtering to Nucleus source preparation;
- changing the Nucleus compiler vector;
- changing NOBJ format or generated-program runtime services;
- raising, removing, or weakening the 16 KiB compiler-core gate;
- making Atom the only way to build Nucleus;
- moving Nucleus out of the Debug80 monorepo.

These are product and architecture decisions, not incidental implementation details.
