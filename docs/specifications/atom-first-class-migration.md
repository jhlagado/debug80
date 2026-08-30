# Atom first-class migration

Status: Atom-first Debug80 consolidation complete; Nucleus convergence active

Date: 2026-08-27

Implemented through the Debug80 default-project checkpoint: the shared services
authority, Atom monorepo package, include-driven Node and CP/M preparation, CLI
v1, and Debug80's `assembler: "atom"` backend are on `main`. New Debug80
assembly projects select Atom and every shipped starter is assembled through
the real Atom engine in the extension suite. Every checked-in assembly project
now selects Atom explicitly, enforced by a repository gate.

Native work includes the reusable Z80 named-object harness and proved TECM8
providers for ordinary TEC-FS input and transactional output. The harness has
a proved immutable-bank profile with fixed state relocated to common RAM. The
TEC include resolver, launcher, and final memory map are implemented and proved
under emulation. Physical TEC hardware acceptance is deferred to a later
deployment checkpoint. Nucleus convergence has resumed against the shared
source-preparation, output-selection, assembler-flavour, and service-boundary
packages. Atom npm publication and install verification are complete. The
checked-in Debug80 project corpus no longer selects AZM.

## Objective

Make Atom the first-class assembler across the Node-hosted Debug80 environment
and Z80-native CP/M and TEC environments, while preserving one authoritative
Z80 assembler core and using root source plus `%INCLUDE` as the only
source-composition interface.

The migration keeps one working production path at every checkpoint. A
replacement is proved before the path it replaces is deleted.

## Expression and patch invariant

Atom remains a single-pass assembler. A later integration step must not require
Atom to retain expression trees, perform a second symbol pass, or patch from a
serialized relocation expression. The resident assembler may keep only the
compact pending form it can resolve while streaming: one unresolved symbol, one
constant addend, and a fixed patch kind.

This policy applies to Nucleus and Debug80 integration as well as ordinary Atom
assembly. Host source preparation may select files, evaluate host conditions,
and mask inactive text before assembly starts. It must not depend on
assembler-level forward `EQU`, unresolved `ORG`, late textual inclusion, or
multi-symbol expression fixups. Code that needs a value before assembly should
put that value in an earlier included constants file or pass it through the
host profile before the Z80 core starts.

Broader expression support requires a separate design decision because it
changes the pending-record ABI, memory account, and native-host proof surface.
It is not an incidental compatibility cleanup.

## Remaining explicit AZM selections

Nucleus still contains a small number of explicit AZM selections. These are
compatibility and measurement boundaries, not production defaults.

| Location                                                                                        | Classification                                                             | Retire when                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/nucleus/src/proof.ts` and `NUCLEUS_LEGACY_PROOF_ASSEMBLER`                            | Direct proof-manifest default for the legacy assembler path.               | Direct proof-manifest execution either requires an explicit assembler selection or defaults to the permanent Atom proof path. |
| `packages/nucleus/test/proof-harness.test.ts` migration-metadata proof                          | Compatibility proof for legacy manifests carrying Atom migration metadata. | Legacy manifest metadata support is no longer part of the migration surface.                                                  |
| `packages/nucleus/test/proof-harness.test.ts` dispatcher measurement proofs                     | Measurement artifacts pinned to the legacy proof assembler.                | Equivalent permanent Atom measurement fixtures exist, or the measurements are retired.                                        |
| `packages/nucleus/test/nobj.test.ts` runtime comparison                                         | Byte-identity check for the explicit AZM runtime fallback.                 | The runtime fallback is removed after the Atom runtime path is the only supported path.                                       |
| `packages/nucleus/test/publication-cli.test.ts` and `packages/nucleus/test/application.test.ts` | Compatibility tests for `ASM80` alias normalization.                       | The public CLI/API compatibility alias is retired.                                                                            |
| `packages/nucleus/scripts/legacy-azm-comparison.mjs`                                            | Migration comparison baseline used by diagnostic scripts.                  | Atom-built proof images are authoritative and the comparison diagnostics are no longer needed.                                |

New Nucleus proof, runtime, publication, or source-preparation code should not
add a direct AZM dependency outside one of these classifications. If another
case appears, classify it here before merging it.

## Frozen baseline

Repositories at the start of the migration:

- Debug80 `main` at `392ee5084b5e64cf3a0be2320e178d7f2dd9e62f`.
- Atom `main` at `ca592266d81bbef8f34b2d9623419162f66535cb`.
- Nucleus `main` at `e9611569b63b1a8424136c0cd4c7277a57fad9a4`.

Fresh baseline evidence:

- Atom: 319 of 319 tests passed, including self-hosting, complete instruction
  differentials, named-object services, Node package installation, and CP/M.
- Debug80 runtime: 312 of 312 tests passed.
- Nucleus focused CP/M compiler/provider/publisher/source/command slice: 44 of
  44 tests passed.

The Atom CP/M transient is 14,145 bytes at this baseline. The native Atom core
is 12,396 bytes. Older compatibility composition interfaces are not part of the
target architecture.

## Checkpoints

### 1. Contracts and terminology

Publish the platform architecture, CLI v1, package dependency direction,
source-preparation model, versioned contracts, and acceptance predicates.

Proof: documentation agrees that one root source plus `%INCLUDE` is the only
source-composition model; JSON is Node-only; no new production path changes.

### 2. Shared tool services

Create `packages/z80-tool-services` as the authority for the versioned request,
operations, statuses, transaction state, generated Z80 constants, TypeScript
types, memory provider, and conformance vectors.

Proof: existing Atom and Nucleus definitions compare exactly with the shared
authority; Node conformance passes without changing either public compiler API.

### 3. Atom package import

Import Atom's Git history into `packages/atom`. Preserve package name
`atom-z80`, command `atom`, public exports, documentation, native sources,
assets, and independent semantic version. Archive the standalone repository
after cutover; never maintain two writable authorities.

Proof: package tarball, offline installation, CLI, native core digest, CP/M
image, self-host output, and complete test suite match the frozen Atom revision.

### 4. Internal ownership

Reorganize Atom into core, harness, Node project preparation, artifact
rendering/publication, and statically composed native profiles. Replace CP/M
source-text surgery with an explicit adapter/link seam.

Proof: no public output or ABI change; core, harness, provider, workspace, and
buffers have separate measured accounts.

### 5. Include-driven source preparation

Keep the existing Node resolver but remove serialized intermediate composition
files and saved-order input. Implement a Z80-native include resolver over tool
services, preserving separate part identities and offsets.

Proof: diamonds, cycles, missing includes, 255-part capacity, 65,535-byte part
boundaries, cross-part labels, exact diagnostics, and failed-read atomicity
pass under Node and CP/M-native profiles. Node additionally proves active and
inactive conditional preparation. The current CP/M and TEC native profiles
recognize leading `%INCLUDE` only; adding native conditionals is a separate
profile extension, not a condition of this checkpoint.

Only after this proof, delete CP/M source-list command handling, caches, tests,
documentation, and obsolete representation ledgers. If an integrated native
resolver cannot fit the declared deployment account, measure a separately
loaded native stage; do not restore a public intermediate composition format.

### 6. CLI and artifacts

Implement CLI v1, source-driven BIN base selection, positive output paths, the
COM validator/renderer, project-owned target geometry, and requested-only
publication. Keep Debug80 on the API rather than shelling out.

Proof: every output suffix, target conflict, duplicate path, preparation error,
render failure, and publication failure has a discriminator; legacy scripts
are migrated before default output changes.

### 7. Debug80 integration

Add `AtomBackend`, `assembler: "atom"`, structured diagnostics, BIN, HEX, D8,
and listing integration. Explicit assembler selection wins; an omitted backend
now defaults assembly source to Atom. Existing projects that require AZM must
select it explicitly.

Proof: CLI and Debug80 API produce byte-identical artifacts and Debug80's
mapping/load flows consume Atom output without AZM-specific assumptions.

### 8. Native providers

Prove the CP/M provider against real guest BDOS/BIOS and implement the TEC
provider against MON3/TEC-FS. Preserve compact profile-specific output modules.

The shared Atom harness uses separate source and output selectors. This lets a
TEC build read ordinary catalogue files while publishing through the existing
transactional object arena. The source resolver may reduce a canonical path to
the catalogue's one-byte file ID after dependency discovery; the assembler
then retains a 255-byte ordinal-to-file-ID map instead of every path string.
The eight-slot transactional arena is an output store, not a source-part
limit.

Proof: shared provider conformance, exact native memory maps, failure
injection, CP/M native execution, and emulated TEC acceptance.

Status: CP/M and TEC provider implementation, exact memory accounts, failure
proofs, and emulated acceptance are complete. Physical TEC hardware acceptance
is deferred to a later deployment checkpoint.

### 9. Nucleus convergence

Move Nucleus's lower named-object constants and provider tests onto the shared
package without changing its fourteen-entry compiler vector, language policy,
runtime catalogue, or generated-program services.

Proof: shared service conformance plus unchanged Nucleus compiler and proof
profile acceptance.

Status: active. Nucleus now uses the shared source-preparation resolver for
high-level source preparation, the shared assembler-flavour selector for
proof-image assembly, and the shared positive-output selector for publication
CLIs. The host-backed runtime stream adapter uses the shared runtime-stream
I/O operation vocabulary for its stub/service-name mapping. The checked-in
permanent Atom translation has no compatibility-lowering issues, no late
includes, and no source drift. The permanent proof gate currently checks 29
proof manifests: 26 assemble byte-identically with Atom and execute
successfully, while 3 measurement artifacts are intentionally skipped.

Remaining Nucleus convergence work is implementation, not a source-format
blocker: finish retiring compatibility-only proof paths after all proof images
have permanent Atom routes, continue moving lower service adapters onto the
shared contracts where that does not change the compiler vector, and then
decide whether Nucleus remains in this monorepo or returns to an independent
repository with `@jhlagado/z80-tool-services` as the explicit extraction seam.

### 10. Default migration

Build the Debug80 project corpus with Atom, document unsupported legacy
language features, and convert in-scope sources. Make Atom the default after
the corpus and compatibility gates pass. Existing explicit selections remain
unchanged.

AZM remains available during bootstrap and migration. Its removal from a build
path is a separate measured checkpoint, never an incidental dependency edit.

The default migration is complete. New scaffolds and every checked-in assembly
target select Atom, the repository rejects ambiguous checked-in targets, and
an omitted backend now selects Atom for assembly source. Existing projects that
require AZM must add `"assembler": "azm"`; the Debug80 changelog records this
compatibility change.

The Debug80 extension's own root smoke target was the first converted corpus
target. Its checked source assembles through Atom to `3E 05 C6 03 76`.

The four `examples/debug80-dev` TEC-1G targets are also converted. Their
checked `.ASM` sources use Atom directives and private labels, the project
selects `assembler: "atom"`, and a Debug80 corpus test assembles every target
through `AtomBackend` while pinning its exact byte count and SHA-256 digest.

[`azm-retirement-inventory.json`](azm-retirement-inventory.json) is now empty.
The repository check rejects a new unlisted AZM target and rejects an inventory
entry after its target moves to Atom. Any future exception must therefore be
explicit, reviewed, and temporary.

The three static Debug80 adapter fixtures now select Atom as well. Their HEX
bytes are unchanged, their D8 maps are generated from the checked sources by
`generate-atom-e2e-fixtures.mjs`, and the complete adapter E2E suite proves
entry stops, stepping, constants, included-source breakpoints, and sparse-ORG
breakpoints against those Atom maps.

Glimmer's generated Dot, Slide, Trail, Sprite Chase, Snake, and Tetro targets
now select Atom. Snake and Tetro retain imported hand-written modules as
separate ordered source parts and match the corresponding compatibility build
byte for byte.

The direct Tetro and Pacmo corpus sources now use Atom syntax and leading
`%INCLUDE` roots. Their main loops and modules remain distinct source parts.
Stable eight-character identifiers are recorded in per-target symbol ledgers.
The Atom images match the previous measured binaries exactly: Tetro is 2,801
bytes with SHA-256 `1ded84b34cfe93d07ae8e766bfd499ffa85e405b5c850f0e7d1fcdae267c2688`;
Pacmo is 3,573 bytes with SHA-256
`4b985d210f22bde37bd82ed41b6c14326dc21dc7cca4568c8b0b6c8c6e42ec0e`.
No checked-in Debug80 target now selects AZM.

### 11. Release installation

Publish Atom as a public npm package and prove that the installed package runs
without a neighbouring Atom checkout or a runtime AZM dependency.

Status: complete. `atom-z80@0.2.0` is published publicly on npm as
`GPL-3.0-only`. The release gate installs the packed package offline in an
unrelated directory, verifies that AZM is absent from the installed runtime
tree, runs the `atom` and `azm-to-atom` commands, assembles explicit BIN, HEX,
D8, COM, and default-output builds, checks `INCBIN`, rejects unsupported
source, and runs `atom self-host` against the installed native core.

## Checkpoint discipline

Each checkpoint:

1. pulls the current `main` revision of every touched repository;
2. records branch, HEAD, dependency revisions, dirty files, and generated
   authorities;
3. pins behavior before structural edits;
4. makes one independently testable change class;
5. runs the focused proof followed by the affected release gate;
6. reports measured core, harness, provider, workspace, buffer, output, and
   cycle changes separately where applicable;
7. commits and pushes the completed checkpoint to `main`; and
8. recommends the next checkpoint.
