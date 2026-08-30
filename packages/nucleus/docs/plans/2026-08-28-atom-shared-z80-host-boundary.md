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
- **Host service** names host-side code for source bytes, object output,
  console I/O, named binary inputs, runtime images, or publication.

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

Nucleus should eventually consume this directly. Keep `SourcePart` only as a
compatibility adapter while existing compiler and proof code still require
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

### Source provenance

Generated-output provenance is a separate optional stream. The resident
compiler should never emit JSON, path names, or Debug80-specific map records.
It should emit compact source-address facts that the host can translate:

```ts
interface NucleusGeneratedSourceSegment {
  partOrdinal: number;
  line: number;
  column: number;
  bank: number;
  start: number;
  end: number;
  kind: "code" | "data" | "directive" | "unknown";
  confidence: "high" | "medium" | "low";
}
```

The source adapter already tracks the necessary source state:

- `SourcePartId`;
- `SourceOffset`;
- `SourceLine`;
- `SourceColumn`;
- token start offset, line, and column.

The target output layer already owns the generated address state:

- selected output bank;
- `EmitCursor`;
- image and patch operations;
- final NOBJ map.

The missing resident operation is therefore a small provenance event emitted
around semantic lowering, not a second source pass and not host-side guessing.
The host maps `partOrdinal` to the prepared source project's logical identity
and renders Debug80 D8 file entries, source-line segments, and later symbols.

The current host module `source-provenance.ts` establishes this shape. It can
render the minimal D8 artifact from a committed flat NOBJ today, and it accepts
explicit `NucleusGeneratedSourceSegment[]` once the resident compiler begins
publishing them. Segment validation rejects unknown source ordinals and banked
segments until banked D8 policy exists.

The proof harness now has an optional resident provenance side channel matching
the NOBJ adapter pattern: a proof manifest may name a log base, a length word,
and a maximum byte count. The resident-facing record is fixed-width and numeric:

```text
byte 0      part ordinal, one-based
byte 1      output bank
bytes 2-3   source line, one-based, little-endian
bytes 4-5   source column, one-based, little-endian
bytes 6-7   generated start address, little-endian
bytes 8-9   generated end address, exclusive, little-endian
byte 10     segment kind: 0 unknown, 1 code, 2 data, 3 directive
byte 11     confidence: 0 low, 1 medium, 2 high
```

The host decoder rejects logs that exceed their declared capacity, cross proof
memory, contain a partial record, use zero part/line/column values, reverse the
generated address range, or use unknown kind/confidence ordinals.

The first resident emission checkpoint is intentionally coarse. For a flat
single-source-part publication the target finalizer emits one low-confidence
`code` segment covering the generated source-code region, excluding startup,
runtime helper image, initialized data, and map metadata. Multipart builds do
not emit this coarse record, because attributing the whole code region to one
part would be wrong. Fine-grained D8 requires the semantic transcript to retain
source position per emitted operation.

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
- the Atom-preview proof matrix at 26 byte-identical proof images and 3 skipped
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
status codes, typed append-only sink adapter, and conformance tests into
`@jhlagado/z80-tool-services`.

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
- `loadCanonicalRuntimeImage` assembles the canonical runtime link with Atom by
  default, keeps AZM as an explicit legacy option, prepends those vector bytes
  to the runtime initial image, and requires `vectorBase === writableBase`,
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

## Host-callback stub checkpoint

The first host-backed service proof now covers all six stream services:
`readInputByte`, `writeOutputByte`, `readStorageByte`, `rewindStorageInput`,
`writeStorageByte`, and `seekStorageOutput`.

The shared package owns the byte-wide I/O protocol:

| Port | Purpose |
| ---- | ------- |
| `$E0` | operation number |
| `$E1` | low byte argument |
| `$E2` | status byte |
| `$E3` | result byte |
| `$E4` | high byte argument for word-valued operations |

The operation numbers match the six stable Nucleus service ordinals for stream
services. Nucleus records this explicitly through
`NUCLEUS_RUNTIME_STREAM_IO_OPERATION`.

The proof keeps the resident call shape unchanged:

```text
generated program
    CALL vectorBase + serviceOrdinal*3
runtime vector slot
    JP host-callback stub
stub
    OUT operation
    OUT value
    IN status
    OR A
    RET Z
    SCF
    RET
```

Debug80 handles the I/O ports with `createRuntimeStreamIoHandlers`, backed by a
`RuntimeByteStreams` instance. Shared code also generates the call-compatible
Z80 stub bytes with `createRuntimeStreamIoStubBytes`, so the operation protocol
and stub representation are tested together.

Nucleus now wraps these pieces in `createNucleusHostRuntimeStreamAdapter`. That
adapter owns the Nucleus-specific service-address table, generated stub images,
vector bytes, stream object, Debug80-compatible I/O handlers, and an
`install(memory, vectorBase)` helper. Callers pass the baseline service address
table they want to adapt; the adapter redirects only the six stream-service
entries and leaves `success`, `unhandledFailure`, `trap`, `farCall`, and
`farJump` unchanged.

The checked behavior is:

- input and storage reads return the stream byte in `A` on success;
- output and storage writes append or overwrite the host stream as appropriate;
- storage rewind resets the storage-input cursor;
- storage seek accepts existing positions and rejects an out-of-range word
  offset;
- each service preserves stack balance through the original `CALL vector-slot`
  shape;
- success returns `A == 0` with carry clear; and
- failure returns the service-error code in `A` with carry set and no forbidden
  stream mutation.

This still does not replace the canonical resident proof runtime. It proves the
preferred adapter direction: service vectors can point at host-callback stubs
without changing the generated program's service-call ABI.

The NOBJ proof runner now has a selectable host-backed stream execution option.
`executeCommittedNobj` still defaults to the resident-Z80 service path. When
`runtimeStreams` is supplied, it creates a Nucleus host-stream adapter, composes
the stream I/O handlers with the existing bank-switch hook, and reports the
final stream snapshot on the execution outcome.

The adapter now exposes the two runtime installation steps separately:

- `installVector(memory, vectorBase)` writes only the live vector table;
- `installStubs(memory)` writes only the host-callback Z80 stubs;
- `install(memory, vectorBase)` keeps the original combined behavior.

That split lets compatibility proofs keep execution-time vector installation
while target-style proofs commit the intended vector table earlier. The link
helper `createNucleusHostRuntimeStreamLink` derives a `RuntimeLinkContext` whose
service addresses point at generated host stubs. The canonical runtime provider
can then emit runtime initial bytes containing those addresses, and normal Z80
startup code copies the committed vector bytes into RAM before calling through
the existing vector-call ABI.

The current NOBJ proof covers that path: the object is committed with a
host-backed `RuntimeLinkContext`, the test program copies the committed runtime
initial image into writable memory, and execution installs only the stubs
(`installVector: false`). The observed call through the `writeOutputByte` vector
therefore proves the vector bytes came from the committed object, not from an
execution-time patch.

The proof-harness tests now include a resolver-backed source-part path that
compares the prepared project with the equivalent flat manifest bytes. This is
the first high-level consumer moved onto the shared resolver without changing
the historical proof images.

The application boundary now exposes `prepareNucleusCompilation` from the
package source index. It returns the resolved source project, the legacy
`SourcePart[]` adapter shape, the path-keyed `partBanks` array, the total
compiler source byte count, and a prepared runtime link. This is the handoff
shape for future CLI and tool callers while the resident compiler still
consumes the existing source-part ABI.

Runtime linking is prepared through `prepareNucleusRuntimeLink`. The default
service profile is `resident`, which preserves the existing
`defaultRuntimeLinkContext` service table. The opt-in `host-streams` profile
takes a stub base address and returns a derived `RuntimeLinkContext` whose six
stream-service destinations point at generated host-callback stubs while
terminal, trap, far-call, and far-jump services remain unchanged.

The first development command now uses that application boundary:

```text
npm run source:prepare -w nucleus -- --root path/to/project src/main.nu
npm run source:prepare -w nucleus -- --runtime-services host-streams --stub-base 0x4100 --json src/main.nu
```

This command resolves `//% import` dependencies and reports the prepared
ordered compiler input plus the selected runtime-service link profile. It
deliberately stops before compilation, assembly, or publication.

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
open/closed generation state. The shared package also has a typed append-only
generation adapter for conformance checks. Atom supplies its flat assembler
begin, image, patch, and commit records to that adapter; Nucleus supplies its
NOBJ begin, image, patch, and map records. Both sinks keep their existing public
APIs, but the lifecycle vectors now run through the same typed boundary instead
of hand-written untyped test shims.

The shared package also owns the one-byte status normalization and
thrown-operation capture used by Atom's direct-host gateway and Debug80 service
trampoline. The shared one-byte gateway conformance vectors now cover Atom
direct-host source reads, output calls, malformed byte results, unavailable
operations, and thrown host operations.

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

The shared package now also owns reusable conformance vectors for the
byte-wide port protocol used by generated Z80 service stubs. Those vectors prove
operation selection, byte and word argument transfer, status and result returns,
invalid operation handling, reset, and storage cursor effects. Nucleus runs the
same vectors through `createNucleusHostRuntimeStreamAdapter`, while its
runtime-service test still separately proves that the Nucleus service vector
and generated JP stubs execute correctly on a Z80.

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

The first file-producing publication commands are now available:

```text
npm run cli -w nucleus -- publish --root path/to/project --target target.json --output build/program.nobj src/main.nu
npm run cli -w nucleus -- publish --root path/to/project src/main.nu build/program.nobj build/program.bin build/program.hex build/program.d8.json
npm run publish:nobj -w nucleus -- --root path/to/project --target target.json --output build/program.nobj src/main.nu
npm run cli -w nucleus -- proof:publish --output build/program.nobj proofs/flat-target-z80-slice-proof.json
npm run proof:publish -w nucleus -- --output build/program.nobj proofs/flat-target-z80-slice-proof.json
npm run proof:publish -w nucleus -- --root path/to/project --output build/program.nobj src/main.nu
npm run proof:publish -w nucleus -- --root path/to/project --target target.json --output build/program.nobj src/main.nu
```

The selected Node-hosted command shape is a dispatcher: `nucleus <command>`.
Its current development script is `npm run cli -w nucleus -- <command>`.
`nucleus prepare` resolves source parts, `nucleus publish` is the normal
entry-source publication path, and `nucleus proof:publish` remains the
compatibility/debug command for proof manifests. Publication commands accept
positive output paths by suffix. The implemented formats are `.nobj`, `.bin`,
`.hex`, and `.d8.json`; `.lst` and `.com` fail explicitly until Nucleus has
specified policies for those artifacts. The current D8 artifact is intentionally
minimal: it records the flat loaded range, input identity, and entry address,
but no source-line segments or symbols until the resident compiler emits real
source provenance. The older direct npm scripts remain as compatibility
shortcuts while the command surface converges.

The shared `@jhlagado/z80-tool-services` package now exposes the assembler
flavour vocabulary, concrete selection helper, and dependency-free dispatcher
for `.asm` source. `.asm` is not an assembler selector. Command-owned frontends
may provide a concrete default, such as the `atom` executable defaulting to
Atom, but neutral Debug80-style project loaders should require
`assembler: "atom"` or `assembler: "azm"` before dispatching to either
assembler. The dispatcher owns only this policy decision; the Atom and AZM
handler implementations stay in their assembler packages.

The package now follows the AZM/Glimmer build model for installed commands:
TypeScript source is emitted to `dist/src`, and the npm `bin` entry exposes
`dist/src/cli/nucleus.js` as `nucleus`. The development dispatcher still runs
through `tsx` for fast local iteration, but the packaged command itself has no
runtime dependency on `tsx`.

`nucleus publish` prepares an entry `.nu` file, installs the resulting source
bytes and resident descriptors into the current flat compiler proof image,
requires that image to publish a committed NOBJ target, and renders requested
artifacts from that committed object. NOBJ is the exact object stream. BIN and
HEX are rendered only for flat targets, using `BEGIN.imageBase` and
`MAP.banks[0].usedLength` rather than the full image capacity. D8 is also
rendered only for flat targets and describes the same committed range without
inventing source-line attribution. `proof:publish` still accepts the same
prepared-source bridge options while the resident compiler image is
proof-hosted.

Target publication data now has its own application descriptor. A
`NucleusTargetPublicationDescriptor` contains the NOBJ `begin` record, target
`map`, and optional runtime-link context used to interpret compiler-emitted
runtime-image operations. The prepared-source publication API supplies this
descriptor explicitly; the default bridge descriptor matches the current flat
target, but tests prove the committed NOBJ follows the supplied descriptor
rather than silently copying the proof manifest's target map.

Node-facing descriptor files use a deliberately plain JSON wrapper:

```json
{
  "schema": "nucleus-target-publication/v1",
  "begin": { "...": "NOBJ begin fields" },
  "map": { "...": "NOBJ map fields" },
  "runtimeLinkContext": { "...": "optional runtime link fields" }
}
```

This is a desktop/build-host configuration format only. It is not a native
Z80 or CP/M interchange format, and the resident compiler does not read JSON.
The loader validates the schema and the same address, bank, capacity, and
runtime-service bounds as the programmatic descriptor API before publication.

The host-prepared source descriptor adapter now exists as a public application
boundary. `buildNucleusResidentSourceImage` takes prepared `SourcePart[]` input
and returns:

- a contiguous source byte image;
- a five-byte descriptor per part: `ordinal:u8`, `start:u16`, `end:u16`;
- the resolved source start and end addresses for diagnostics and memory
  installation; and
- validation against the current resident multipart adapter limit.

The resident adapter now uses the same byte-domain part count as Atom and the
shared source-preparation resolver. `SourcePartCapacity = 255`; the remaining
part count and pending boundary-newline flag are separate workspace bytes; and
target-source bank lookup uses the active descriptor's one-based
`SourcePartId`. The host builder rejects the 256th part before execution.

The proof harness can now install that host-prepared source image before
entering the resident compiler. `runProofManifest` accepts a source override
containing the prepared source image and a resolved resident compiler entry
descriptor. The descriptor names the execution entry, source descriptor table,
source byte region, target descriptor, part-bank table, and output-log anchors.
For this checkpoint the proof manifest still supplies the actual start PC, so
the runner verifies that the descriptor entry and manifest entry match before
installing source.

The flat target proof has a discriminator for this path: it prepares source
from ordinary files, resolves the current proof image's compiler-entry
descriptor, installs the resulting bytes and descriptors over the proof image's
resident source area, runs the existing compiler entry, and checks that the
committed NOBJ stream is byte-identical to the embedded-source baseline. This
proves the host descriptor builder is not merely producing a plausible table;
it is accepted by the resident compiler.

This checkpoint deliberately does not move Nucleus record framing, map
semantics, runtime-provider calls, NOBJ status behavior, Atom's assembler sink,
or Nucleus runtime storage services. Runtime stream linking is now visible at
the application boundary, proof-published and entry-source NOBJ can be written
from the command line, host-prepared source has a single descriptor object for
the anchors needed by a resident compiler image, and prepared-source
publication can use an application-owned target descriptor. The CLI can now
select that descriptor from a Node-facing JSON file, while still preserving the
default flat target for tests and simple commands.

The publication CLIs now share their option parser and summary renderer.
`publish:nobj` remains entry-source only. `proof:publish` keeps the additional
proof-manifest dispatch path, but its prepared-source path uses the same parser
and summary code as the normal command. This prevents the command contract from
forking as output formats and runtime profiles are added. The dispatcher routes
`prepare`, `publish`, and `proof:publish` to those same command implementations
without spawning another process.

## Fine-grained provenance checkpoint

The current D8 path is deliberately coarse. A direct inspection of the resident
compiler state on `main` at `d22ee861` shows why it should not be upgraded by
host-side guessing.

The source adapter and tokenizer already maintain the right live source facts:

- `SourcePartId`;
- `SourceOffset`;
- `SourceLine`;
- `SourceColumn`;
- `TokenStartOffset`;
- `TokenStartLine`; and
- `TokenStartColumn`.

The semantic transcript does not yet retain those facts per emitted operation.
For the currently inspected output-producing operation, `SemanticWriteValueU8`,
the parser records only `ExpressionCallOffset`. `TypedWrite8` later reads that
offset for trap reporting. That is enough to preserve an offset-based runtime
trap diagnostic; it is not enough to publish a high-confidence D8 source
segment because the backend no longer has the source part, line, or column at
the point where it commits generated bytes.

The correct next design is a resident provenance event paired with target
emission, not a host reconstruction pass:

```text
semantic operation source position
        |
        v
backend begins source segment with part/line/column/kind/confidence
        |
        v
target sink emits IMAGE/PATCH bytes
        |
        v
backend commits segment with generated start/end
```

That API has to be atomic. A failed target write must not publish a source
segment for bytes that were not committed, and a recoverable compile error must
retain the original source diagnostic rather than a generated-address failure.

The first safe implementation slice is therefore:

1. extend one semantic operation, preferably `SemanticWriteValueU8`, to carry
   the minimal source tuple needed for D8;
2. add a resident target-output helper that begins and commits one fixed-width
   provenance record around a successful image emission;
3. prove that failure paths do not advance either the output cursor or the
   provenance log;
4. decode the record through the existing host `source-provenance.ts` path; and
5. keep the existing coarse segment as the fallback for proof images that have
   not yet emitted fine-grained records.

Do not widen this to every semantic operation until the single-operation slice
has exact byte, workspace, and proof evidence. The ABI affects the semantic
transcript, target sink, proof harness, publication object, and D8 renderer, so
it is a correctness feature rather than a documentation cleanup.

## Next implementation unit

Continue with the fine-grained provenance slice above. After that, return to
the richer Nucleus artifact policies: listing, source-provenanced D8, CP/M
`.com`, and banked target publication. Listing and full D8 need resident
source-provenance policy; `.com` needs a loaded-image and entry-address policy;
banked output needs a packaging format for multiple banks rather than
pretending it is one flat binary.
