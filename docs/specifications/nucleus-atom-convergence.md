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

Nucleus has not yet moved onto that boundary:

- `packages/nucleus/src/source-manifest.ts` still accepts a flat source list and turns it into ordered source parts.
- Nucleus tests still describe and verify the flat source-manifest path.
- Nucleus proof harnesses assemble handwritten Z80 through AZM and run through Debug80.
- Nucleus depends on `@jhlagado/azm` and `@jhlagado/debug80-runtime`; it does not currently depend on `@jhlagado/z80-tool-services`.
- Nucleus documents still describe external packaging as a supplied ordered source stream, with no import or include syntax in the language.

That state is acceptable as the starting point. It should not be treated as the final shape.

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

The current flat source-manifest implementation should remain available until the new profile proves equivalent on the existing proof corpus. After that, the old path can become a compatibility adapter or be removed in a separate checkpoint.

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
nucleus main.nu --out build/program.nobj
nucleus main.nu --hex build/program.hex --d8 build/program.d8.json
nucleus --project nucleus.json
```

Recommended native shape:

```text
NUCLEUS MAIN.NU PROGRAM.NOBJ
```

The Node command may support richer output selection, diagnostics, maps, and project JSON. Native Z80 commands should remain positional and small. A native system should not parse JSON; if it needs configuration, use a deliberately small native format or explicit command arguments.

Output switches should request outputs rather than suppress defaults. That keeps the common command easy to type and avoids carrying Node-specific Debug80 options into CP/M or TEC-style environments.

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

1. Record this convergence specification.
2. Add a Nucleus source-preparation profile using `@jhlagado/z80-tool-services/source-preparation`.
3. Keep the existing flat source-list path and add a dual-run proof that both paths produce the same ordered source parts for the current corpus.
4. Move Nucleus source and output access behind a shared-service adapter while preserving the compiler vector.
5. Define the Nucleus Node API and CLI v1 on top of the new preparation path.
6. Census Nucleus AZM source for Atom compatibility.
7. Implement the Atom naming ledger and contract-comment translation.
8. Build a Nucleus compiler image from Atom source and prove byte identity with the current image.
9. Revisit the repository-location decision with measured evidence.

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
