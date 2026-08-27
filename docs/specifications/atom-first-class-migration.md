# Atom first-class migration

Status: active implementation sequence

Date: 2026-08-27

Implemented through the Debug80 default-project checkpoint: the shared services
authority, Atom monorepo package, include-driven Node and CP/M preparation, CLI
v1, and Debug80's `assembler: "atom"` backend are on `main`. New Debug80
assembly projects select Atom and every shipped starter is assembled through
the real Atom engine in the extension suite. Existing checked-in assembly
projects select either Atom or AZM explicitly, enforced by a repository gate.

Native work includes the reusable Z80 named-object harness and proved TECM8
providers for ordinary TEC-FS input and transactional output. The harness has
a proved immutable-bank profile with fixed state relocated to common RAM. The
TEC include resolver, launcher, and final memory map are implemented and proved
under emulation. TEC hardware acceptance, Nucleus convergence, broader corpus
conversion, release installation, and the compatibility-default change remain.

## Objective

Make Atom the first-class assembler across the Node-hosted Debug80 environment
and Z80-native CP/M and TEC environments, while preserving one authoritative
Z80 assembler core and using root source plus `%INCLUDE` as the only
source-composition interface.

The migration keeps one working production path at every checkpoint. A
replacement is proved before the path it replaces is deleted.

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
and listing integration. `.ASM` does not infer a dialect. Existing projects
retain their configured or historical assembler; new Atom projects select it
explicitly.

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

Proof: shared provider conformance, exact native memory maps, failure injection,
emulated acceptance, and hardware acceptance for TEC.

Status: CP/M and TEC provider implementation, exact memory accounts, failure
proofs, and emulated acceptance are complete. Physical TEC hardware acceptance
remains.

### 9. Nucleus convergence

Move Nucleus's lower named-object constants and provider tests onto the shared
package without changing its fourteen-entry compiler vector, language policy,
runtime catalogue, or generated-program services.

Proof: shared service conformance plus unchanged Nucleus compiler and native
profile acceptance.

Status: pending. Nucleus is undergoing an architectural rewrite and still owns
its existing source-composition implementation. Atom does not force that older
interface into the shared package; convergence resumes against Nucleus's new
host boundary when it stabilizes.

### 10. Default migration

Build the Debug80 project corpus with Atom, document unsupported legacy
language features, and convert in-scope sources. Make Atom the default for new
Debug80 projects only after the corpus and release gates pass. Existing projects
remain explicit until converted.

AZM remains available during bootstrap and migration. Its removal from a build
path is a separate measured checkpoint, never an incidental dependency edit.

The first default-migration substep is complete: new scaffolds select Atom,
existing checked-in assembly targets declare their current backend, and the
repository rejects an ambiguous checked-in assembly target. The compatibility
fallback remains AZM for external project files that predate explicit
selection. It changes only after the in-repository corpus is converted and a
major-release migration note is ready.

The Debug80 extension's own root smoke target is the first converted corpus
target. Its checked source assembles through Atom to `3E 05 C6 03 76`. Sources
that require unsupported language features remain explicitly assigned to AZM;
the migration does not rewrite them opportunistically.

The four `examples/debug80-dev` TEC-1G targets are also converted. Their
checked `.ASM` sources use Atom directives and private labels, the project
selects `assembler: "atom"`, and a Debug80 corpus test assembles every target
through `AtomBackend` while pinning its exact byte count and SHA-256 digest.

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
