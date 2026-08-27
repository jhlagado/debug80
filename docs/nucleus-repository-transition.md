# Nucleus repository transition

## Decision

Nucleus is a standalone Z80 language implementation, not an internal Debug80
package. Its repository owns the language specification, grammar, direct Z80
compiler, runtime contract, NOBJ format, proofs, and host compiler package.

Debug80 remains a first-class Nucleus development environment. It owns `.nu`
editor registration, target discovery, build orchestration, artifact loading,
debugging, and the documentation snapshot published on debug80.com.

## Migration sequence

1. Preserve the history of `packages/nucleus` in the standalone repository.
2. Establish an emulator-backed Node compiler around the existing Z80 binary.
3. Teach Debug80 to discover and build `.nu` targets through that compiler.
4. Resolve source dependencies into ordered immutable parts through the
   language host adapter, alongside validated machine-service profiles.
5. Publish Nucleus and Debug80 Runtime packages, then pin Debug80 to a released
   Nucleus version.
6. Add a D8-compatible Nucleus source-map sidecar for source breakpoints and
   stepping.
7. Copy the public Nucleus documentation into the Debug80 website from a pinned
   Nucleus revision.
8. Remove `packages/nucleus` from Debug80 only after the external package, CI,
   documentation sync, and integration tests are independently green.

The temporary in-tree copy prevents a destructive cutover before the new
repository has a durable remote and reproducible release path. New language
work belongs in Nucleus after that cutover; Debug80 should consume releases
rather than accumulating a second compiler implementation.

## Host compiler boundary

The first desktop compiler executes the Z80 compiler in Debug80 Runtime. It
retains canonical NOBJ and emits Intel HEX only as a launch adapter. A future
TypeScript compiler must match the Z80 compiler on accepted programs,
diagnostics and positions, materialized bytes, target layout, and runtime
selection before it can replace the emulator-backed compiler as the reference.

NOBJ does not yet carry source-to-address mappings. With a validated target
profile and callable service destinations, Debug80 supports editing, building,
positioned diagnostics, and machine-code execution. Source stepping must wait
for a separately specified D8-compatible sidecar rather than guessing from the
object image.
