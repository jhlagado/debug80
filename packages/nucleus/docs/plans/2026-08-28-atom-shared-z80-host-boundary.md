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

The runtime stream boundary is now covered as a model and as resident-Z80
state:

1. Nucleus service ordinals map onto the shared `RuntimeByteStreams` operation
   names;
2. Nucleus service-error values are the status policy used by the shared stream
   model;
3. proof-runtime capacities, selected output-call failure, storage overwrite,
   append, seek failure, and reset semantics are reproduced by the shared
   stream model; and
4. proof execution snapshots compare the final resident-Z80 service state with
   the shared stream model for the checked proof cases.

## Debug80 execution-adapter trace

Measured against Debug80 `createZ80Runtime` and the current Nucleus canonical
runtime link path:

- `createZ80Runtime` exposes memory callbacks, I/O callbacks, a tick callback,
  single-instruction stepping, breakpoints, CPU snapshots, and reset.
- It does not expose a first-class "intercept this CALL target and emulate a
  return" hook.
- `RuntimeLinkContext.services` is a table of Z80 addresses.
- `nucleusRuntimeServiceVectorBytes` publishes those addresses as 3-byte
  vector slots: `JP serviceAddress`.
- `loadCanonicalRuntimeImage` prepends those vector bytes to the runtime
  initial image and requires `vectorBase === writableBase`,
  `writableStateBase === vectorBase + vectorLength`, and
  `programDataBase === writableStateBase + stateLength`.
- The proof runtime's stream services are ordinary Z80 routines that read and
  write `ServiceBase` state. The host observes that state after execution.

Selected decision: the current Nucleus runtime-service execution mode remains
**resident-Z80 vector services**. `RuntimeByteStreams` is now the shared semantic
model and conformance surface, not yet the execution backend for generated
programs.

That distinction matters. Routing generated-service calls directly through
`RuntimeByteStreams` without changing the resident ABI requires a new adapter
boundary, not a refactor of the existing proof runtime.

Two compatible implementation paths remain open:

1. **Host-callback stubs.** Link each service vector to a small Z80 stub that
   uses an agreed Debug80 I/O port protocol. Debug80 dispatches those port
   operations to `RuntimeByteStreams`. This preserves ordinary Z80 execution and
   also gives Z80-native systems a concrete BIOS/OS stub shape.
2. **CALL-target interception.** Teach the Debug80 execution adapter to stop at
   configured service addresses, dispatch `RuntimeByteStreams`, set the Z80
   return convention (`A` and carry), pop the return address, and resume. This
   is compact for Node proofs, but it is Debug80-only unless a native equivalent
   is written separately.

Recommendation: prototype host-callback stubs first. They are closer to the
multi-platform goal: CP/M, TEC-1/TECMATE, and Debug80 can all implement the
same service operation contract below the resident tool, while the existing
resident-Z80 proof runtime remains the compatibility baseline.

Completion evidence for that next checkpoint should include:

- a Debug80 test proving one linked service vector reaches the shared stream
  backend through the stub protocol;
- no change to the existing `RuntimeLinkContext` vector-call ABI;
- existing proof-runtime service tests still green; and
- a documented native-host stub contract that avoids JSON and Node-only state.

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

Phase 3 has started at the lowest shared storage layer. The package
`@jhlagado/z80-tool-services` now exports language-neutral
`GenerationSpool`, `MemoryGenerationSpool`, `GenerationSpoolFactory`,
`AtomicGenerationStore<T>`, `GenerationLifecycle`, and reusable lifecycle
conformance vectors. Nucleus keeps its existing public NOBJ names by aliasing or
subclassing the shared storage types:

- `NobjSpool` remains the Nucleus object-sink spool contract;
- `NobjSpoolFactory` remains the factory type used by NOBJ tests and sinks;
- `MemoryNobjSpool` remains a constructible compatibility name; and
- `NobjGenerationStore` still validates with `parseNobj` before replacing the
  prior committed bytes.

`NobjGenerationSink` now uses the shared lifecycle guard for the common
open/closed generation state and passes the shared lifecycle conformance
vectors. Atom's Mac memory sink also passes those vectors through an adapter
that translates its byte-status API into the shared conformance surface. The
shared package also owns the one-byte status normalization and thrown-operation
capture used by Atom's direct-host gateway and Debug80 service trampoline. The
Atom direct-host gateway now passes shared one-byte gateway conformance vectors
for source reads, output calls, malformed byte results, unavailable operations,
and thrown host operations.

The source-byte boundary is now explicit in the shared package too.
`MemorySourceByteProvider` stores explicit part ordinals and serves one byte at
a time through `read(partOrdinal, offset)`. Atom's Debug80 runner uses it for
the default zero-based native source service. Nucleus proves the same provider
against its current one-based `SourcePart` compatibility adapter. This keeps
the resident contract independent of whether a host stores a whole part in a
Node buffer, pages it through CP/M, or streams it from TEC-FS.

The resident source-service gateway shape is now covered by shared conformance
vectors as well. They prove source-read request validation around part ordinal,
byte offset, EOF or out-of-range reads, malformed requests, and host-provider
failure. Atom's direct-host gateway uses the shared dispatcher for source reads
and passes those vectors.

The console-service shape is now explicit in the shared package. It covers the
lowest common byte-oriented operations:

1. read one byte from standard input;
2. write one byte to standard output;
3. report terminal success; and
4. report terminal failure with a non-zero byte status.

The shared dispatchers validate byte requests before calling the host, translate
missing operations to the unavailable status, normalize malformed host status
returns to the invalid status, and map thrown host exceptions through the
configured exception policy. Atom's direct-host gateway now uses those
dispatchers and passes the shared console conformance vectors.

Nucleus already has a compatible lower byte-service concept for standard input
and standard output in its runtime contract, but its stable service table also
includes storage services, canonical service-error codes, cursor atomicity, and
fresh-run reset requirements. Those semantics should be adapted through a
Nucleus runtime-service gateway rather than by treating Atom's optional console
operations as the whole Nucleus runtime boundary.

The first shared runtime-service layer now exists separately from Atom's
console layer. `RuntimeByteStreams` models the Nucleus service set directly:
standard input, standard output, bulk-storage input, bulk-storage output,
storage rewind, storage output seek, and per-run reset. The shared default
status policy deliberately matches Nucleus's predefined service-error values:
`endOfInput = 1`, `inputFailure = 2`, `outputFailure = 3`, and
`storageFailure = 4`. Its conformance vectors prove successful reads and
writes, EOF, invalid byte requests, storage overwrite versus append, failed
storage atomicity, and reset back to the initial stream state.

Nucleus now exposes `createNucleusProofRuntimeStreams`, a host-side adapter over
that shared layer. It locks the stable Nucleus service ordinals to the shared
operation names, uses the Nucleus service-error values as the runtime stream
status policy, and keeps the current proof runtime's four-byte standard-output
and storage-output capacities. It also models the Z80 proof runtime's
`ServiceFailureCall` behavior, where a selected standard-output call fails
atomically without appending the byte.

The proof harness now exposes a decoded `runtimeStreams` snapshot on
`ProofOutcome` when the proof image publishes service-state symbols. Existing
direct-Z80 proof tests compare that snapshot with an independently driven
`createNucleusProofRuntimeStreams` instance for both the final reset/no-output
state and the output-failure path. The comparison path is read-only: it does
not change the proof images, generated programs, runtime code, or execution
observations.

Nucleus also exposes `runNucleusProofRuntimeStreamOperations`, a compact
host-side script runner for deriving expected stream snapshots. The current
runtime-service tests use it to model the Stage 8 storage-success sequence
(`readStorageByte`, `rewindStorageInput`, overwrite via `seekStorageOutput`)
and representative storage-failure sequences without entering the Z80 proof
image. This keeps the comparison executable while the existing Stage 8 proof
continues to own the resident-code discrimination.

This checkpoint deliberately does not move Nucleus record framing, map
semantics, runtime-provider calls, NOBJ status behavior, Atom's assembler sink,
or Nucleus runtime storage services. Those are the next Phase 3 layers.

## Next implementation unit

Continue Phase 3 by deciding whether the Debug80 execution adapter can call the
shared stream service directly without changing the resident runtime ABI. The
decision should start as a read-only trace of the current generated-service
entry calls and should preserve the existing Z80 proof-runtime images until
the call boundary is fully understood.
