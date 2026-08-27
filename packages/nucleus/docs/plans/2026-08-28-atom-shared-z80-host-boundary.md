# Atom shared Z80 host boundary for Nucleus

Status: active migration plan. This document is non-normative. The Nucleus
language specification, Z80 runtime contract, target-system specification, and
object format remain the authorities for source meaning, generated-code
semantics, target behavior, and NOBJ serialization.

## Purpose

Nucleus and Atom should converge on the same hosted Z80 architecture without
forcing either language to inherit the other's syntax. The shared boundary is
the machinery around a Z80-resident compiler or assembler:

1. prepare source from a filesystem-aware host;
2. supply ordered source bytes to a Z80 program running either on real hardware
   or in Debug80;
3. publish append-only generated output through a host-owned sink;
4. preserve exact diagnostics, object integrity, and proof reproducibility.

Atom has already proved this shape for a native assembler. Nucleus has now
proved, through the Atom-preview matrix, that its existing AZM proof images can
be translated into Atom-compatible assembly and assembled byte-identically for
every non-measurement proof image. The next work is therefore not instruction
syntax compatibility. It is making the host boundary common enough that Nucleus
and Atom can share services while keeping different source profiles and target
contracts.

## Terms

Use these names consistently:

- **Z80-native environment** means the tool runs on or close to a real Z80
  operating environment such as CP/M or TEC-1/TECMATE. It may have a filesystem,
  but it should not require JSON, Node, or Debug80.
- **Debug80 environment** means the tool's resident Z80 code runs in the
  Debug80 emulator under a Node harness.
- **Node host** means the desktop command-line and package layer that can use
  JSON, rich diagnostics, files, and generated artifacts.
- **Resident tool** means the Z80 compiler or assembler image.
- **Host service** means a function outside the resident tool that provides
  source bytes, object output, console I/O, named binary inputs, runtime images,
  or publication.

Avoid using "native" for the Node/Debug80 path. Atom and Nucleus may run native
Z80 code under Debug80, but the environment is still hosted and emulated.

## Current evidence

### Already shared

The package `@jhlagado/z80-tool-services/source-preparation` already owns:

- confined Node source reading;
- physical, dependency, and logical source identities;
- deterministic dependency graph resolution;
- diamond deduplication and cycle detection;
- path-keyed placement join;
- capacity checks for part count, depth, logical path bytes, retained path
  bytes, and bank ordinal;
- byte-length preservation between original source and compiler source; and
- immutable provenance records.

Atom uses this through `resolveAtomProject`. Nucleus uses it through
`resolveNucleusProject`.

### Atom-specific today

Atom's host profile owns:

- `%DEFINE`, `%INCLUDE`, `%IF`, `%ELSE`, and `%ENDIF`;
- equal-length masking of host directives and inactive lines;
- `INCBIN` discovery and equal-length lowering to native `DS`;
- the flat bank-zero native assembler restriction; and
- native assembler diagnostics for unprocessed directives.

Atom's resident host ABI currently consists of:

- source byte reads;
- output generation begin;
- image byte emission;
- patch byte and patch word emission;
- commit;
- abort; and
- optional console read, write, success, and failure services.

The Debug80 runner validates the native core, copies source bytes into the
emulated environment, configures symbol and pending arenas, executes
`AtomAssemble`, and materializes output from the sink.

### Nucleus-specific today

Nucleus's source profile owns:

- leading `//% import "path"` directives only;
- byte-preserving pass-through of source bytes;
- dependency ordering through the shared resolver; and
- conversion into the existing `SourcePart` shape.

The older `source-manifest.ts` still exists. It parses a flat ordered manifest
and builds source parts directly. It is now an adapter for explicit low-level
tests and existing callers, not the desired high-level project model.

Nucleus's target boundary is richer than Atom's assembler boundary. It needs:

- begin records carrying target and runtime identity;
- banked image records;
- patch records;
- runtime image and runtime initial image provider calls;
- a map record;
- commit and abort;
- NOBJ serialization and materialization;
- target services and vectors; and
- runtime link context verification.

This should not be squeezed into Atom's exact sink interface. It should be
factored into a shared lower layer with Nucleus-specific operations above it.

## Selected architecture

Use a two-layer shared-services model.

```text
Node project configuration / Z80-native command input
        |
        v
language-specific source profile
        |
        v
@jhlagado/z80-tool-services/source-preparation
        |
        v
language-specific resident adapter
        |
        v
resident Z80 tool running on real Z80 or Debug80
        |
        v
shared host-service gateway
        |
        v
language-specific object/artifact publisher
```

The shared package should not become an Atom package by another name. It should
own the language-neutral contracts:

- prepared source project;
- source byte provider;
- generation lifecycle;
- append-only image spool;
- patch spool;
- named binary object provider;
- console services;
- bounded error/status codes; and
- conformance tests for every shared contract.

Atom keeps Atom syntax and Atom artifact policy. Nucleus keeps Nucleus syntax,
runtime linking, target profiles, NOBJ map semantics, and generated-code proof
rules.

## Public shapes to converge

### Prepared source project

The existing shared resolver result is the right high-level shape:

```ts
interface PreparedSourcePart {
  ordinal: number;
  bank: number;
  logicalIdentity: string;
  physicalPath?: string;
  dependencyIdentity: string;
  originalBytes: Uint8Array;
  compilerBytes: Uint8Array;
  dependencies: DependencyReference[];
  maskedRanges: SourceRange[];
  includeStack: DependencyEdge[];
}
```

Nucleus should eventually consume this directly. `SourcePart` should remain only
as a compatibility adapter while the compiler and proofs still expect
one-based ordinals and the old `stableIdentity` field.

### Source provider

The shared source provider should be byte-oriented and part-oriented:

```ts
interface SourceByteProvider {
  read(partOrdinal: number, offset: number): number | undefined;
}
```

On Node/Debug80 this reads from frozen `compilerBytes`. On Z80-native systems it
may stream from a filesystem or copy the current part through an operating
buffer. The resident tool must not know which strategy is used.

### Generation sink

The common sink lifecycle should be:

```ts
interface GenerationSink {
  begin(context: BeginContext): Status;
  image(record: ImageRecord): Status;
  patch(record: PatchRecord): Status;
  commit(context: CommitContext): Status;
  abort(): Status;
}
```

Atom can use this directly for flat assembler output. Nucleus should layer its
target-specific calls over it:

```ts
interface NucleusTargetSink extends GenerationSink {
  runtimeImage(context: RuntimeLinkContext): Status;
  runtimeInitialImage(context: RuntimeLinkContext): Status;
  map(record: NucleusMapRecord): Status;
}
```

`runtimeImage` and `runtimeInitialImage` are not wire records. They are provider
operations that append ordinary image bytes after verifying the runtime identity
and link context.

### Named binary objects

The existing named-object service in `@jhlagado/z80-tool-services` is a useful
precedent. It should remain language-neutral. Atom uses it for host-visible
binary inputs such as `INCBIN`; Nucleus can use the same pattern for runtime
images, target profiles, or future operating-layer resources only when the
resource is genuinely named and immutable for the build.

### CLI contract

The command-line surface should have one shared shape and platform-specific
profiles:

```text
atom SOURCE [OUTPUT]
atom -o OUTPUT SOURCE
atom --format nobj|bin|hex|com|d8 SOURCE
atom -DNAME[=VALUE] SOURCE
```

For Z80-native environments, keep the short form small:

```text
ATOM SOURCE OUTPUT
```

Extra Node-only outputs such as listings, D8 maps, and package diagnostics
belong in the Node host, not in the resident ABI. Nucleus should follow the same
principle: a small Z80-native command form, with richer Node options layered
outside the resident compiler.

## Migration phases

### Phase 1: document and lock the boundary

Deliverables:

- this document;
- tests proving Nucleus still resolves source through the shared resolver;
- tests proving the flat manifest adapter remains compatible; and
- the Atom-preview proof matrix at 25 byte-identical proof images and 3 skipped
  measurement artifacts.

Completion evidence:

- `npm run typecheck -w nucleus`;
- `npm test -w nucleus`;
- `npm run atom:migration:proof-compare -w nucleus -- --report-only`.

### Phase 2: make Nucleus consume prepared projects directly

Replace internal use of flat manifest strings in high-level Nucleus callers with
`resolveNucleusProject`. Keep `buildSourceParts` for explicit low-level tests
and simple embedded callers.

Completion evidence:

- source-preparation tests prove dependency order, identity, and byte
  preservation;
- proof harnesses consume the same ordered parts as the resolver; and
- existing flat-manifest tests still pass as compatibility tests.

### Phase 3: extract the shared generation sink contract

Move the language-neutral lifecycle, image spool, patch spool, generation store,
status codes, and conformance tests into `@jhlagado/z80-tool-services`.

Atom should adapt `createMemoryAtomSink` to the shared sink. Nucleus should adapt
`NobjGenerationSink` to the same base lifecycle while retaining Nucleus map and
runtime-provider operations.

Completion evidence:

- Atom host tests still prove append-only image and patch behavior;
- Nucleus NOBJ tests still prove serialization, map, CRC, patch application, and
  atomic commit;
- shared conformance tests run against both adapters.

### Phase 4: define the resident host-service ABI

Publish one shared Z80-facing ABI file for operation numbers, request layout,
status values, and conformance probes. Atom may keep assembler-specific entry
points, but the gateway beneath them should dispatch through the shared ABI.

Nucleus should define an adapter over the same ABI for source reads, target
output, runtime-provider calls, and console or storage services.

Completion evidence:

- Debug80 runners for Atom and Nucleus both pass through the shared service
  gateway;
- Z80-native stubs can be assembled without Node-only dependencies;
- service failures preserve exact diagnostics and abort the active generation.

### Phase 5: Atom-assemble Nucleus proof sources

Use the existing Nucleus Atom-preview translator as the bridge, but make the
proof harness capable of selecting Atom as the assembler for proof images. Then
replace temporary preview-only lowering with durable source or documented
translation rules.

Completion evidence:

- every non-measurement proof image assembles with Atom and produces
  byte-identical output to the current assembler path;
- strict register contracts remain checked;
- generated proof programs execute with the same observations and extents; and
- the migration ledger has no unresolved public-symbol collision.

### Phase 6: decide repository location

Keep Nucleus in the Debug80 monorepo until Phases 2 through 5 prove that the
shared services are real package boundaries rather than local convenience
imports. Revisit standalone extraction only after:

- Nucleus has no hidden dependency on Atom internals;
- Atom has no hidden dependency on Nucleus internals;
- shared services have conformance tests independent of both tools; and
- package publishing can consume the shared services from declared package
dependencies.

Current recommendation: keep Nucleus in the Debug80 monorepo for the migration.
The shared Z80 services package is the extraction seam. Moving Nucleus out now
would split the evidence and slow convergence.

## Risks and constraints

- The Node host may use JSON project files. Z80-native environments should not.
  Their command and configuration formats must be line-oriented or binary-small,
  or avoided entirely for simple builds.
- Atom's masking profile and Nucleus's pass-through profile are intentionally
  different. Do not generalize source preparation by inventing one common
  preprocessor grammar.
- Nucleus's target sink is richer than Atom's sink. Shared code belongs below
  the Nucleus target layer, not above it.
- The old flat manifest path is still useful for tests and minimal embedded
  callers. Remove it only after every high-level caller has moved to prepared
  projects.
- Atom-preview compatibility proves assembly syntax and byte output for proof
  images. It does not by itself prove an Atom-built Nucleus compiler image.

## Current checkpoint

The source-preparation boundary is now covered by executable tests:

1. `resolveNucleusProject` produces dependency-before-importer order;
2. diamond imports deduplicate through shared identity;
3. compiler bytes pass through unchanged for Nucleus;
4. path-keyed placement is retained on the resolved project; and
5. `sourcePartsFromResolvedProject` and `prepareNucleusSourceParts` preserve
   the old one-based `SourcePart` contract while the compiler boundary is still
   migrating.

The proof-harness tests now include a resolver-backed source-part path that
compares the prepared project with the equivalent flat manifest bytes. This is
the first high-level consumer moved onto the shared resolver without changing
the historical proof images.

The application boundary now exposes `prepareNucleusCompilation` from the
package source index. It returns the resolved source project, the legacy
`SourcePart[]` adapter shape, the path-keyed `partBanks` array, and the total
compiler source byte count. This is the handoff shape for future CLI and tool
callers while the resident compiler still consumes the existing source-part ABI.

The first development command now uses that application boundary:

```text
npm run source:prepare -w nucleus -- --root path/to/project src/main.nu
```

This command resolves `//% import` dependencies and reports the prepared
ordered compiler input. It deliberately stops before compilation, assembly, or
publication.

## Next implementation unit

Wire the first compiling Nucleus command through `prepareNucleusCompilation`.
It should accept the same project root and entry source, resolve `//% import`
dependencies with the shared resolver, and pass the returned `sourceParts` and
`partBanks` to the existing compiler path unchanged. The compatibility predicate
is strict: the resolved project must produce the same ordered source bytes,
diagnostics, and proof outcome as the flat manifest path.
