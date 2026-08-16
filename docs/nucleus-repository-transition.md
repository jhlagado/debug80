# Nucleus repository transition

## Decision

Nucleus is a standalone Z80 language implementation, not an internal Debug80
package. Its repository owns the language specification, grammar, direct Z80
compiler, runtime contract, NOBJ format, proofs, and host compiler package.

Debug80 remains a first-class Nucleus development environment. It owns `.nu`
editor registration, target discovery, build orchestration, artifact loading,
debugging, and the documentation snapshot published on debug80.com.

## Current integration

The standalone repository now contains the authoritative compiler and Host API.
Debug80 builds Nucleus projects through that package and delegates version 2
import discovery to its shared `prepareNucleusProject()` path. D8 source maps,
positioned diagnostics, NOBJ publication, and flat-target launch all use the
same compiler result.

Local development uses npm links rather than registry publication:

```bash
cd /path/to/nucleus
npm install
npm run build

cd /path/to/debug80
npm install
npm install --no-save --install-links=false --legacy-peer-deps \
  file:/path/to/nucleus -w debug80
```

Debug80 Runtime is a workspace link in the Debug80 checkout. A standalone
Nucleus CLI checkout also links that package as described in the Nucleus
command-line guide. The committed Nucleus dependency remains commit-pinned for
clean CI and packaged extension builds; the local file installation above uses
link semantics and does not change either manifest while testing local Nucleus
work.

New language work belongs in the standalone repository. Debug80 contains no
second dependency resolver or compiler implementation.

## Host compiler boundary

The first desktop compiler executes the Z80 compiler in Debug80 Runtime. It
retains canonical NOBJ and emits Intel HEX only as a launch adapter. A future
TypeScript compiler must match the Z80 compiler on accepted programs,
diagnostics and positions, materialized bytes, target layout, and runtime
selection before it can replace the emulator-backed compiler as the reference.

NOBJ remains target memory metadata. A separate D8 sidecar carries executable
source ranges and routine anchors. Debug80 validates that sidecar through its
ordinary D8 importer for source breakpoints and PC-to-source lookup.
