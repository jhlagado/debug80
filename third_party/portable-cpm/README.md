# Portable CP/M release inputs

CCP and BDOS are pinned to `jhlagado/portable-cpm` release `v0.1.0`, revision
`579657f9177b31e1fccf0c05f72ba2ee76f3d052`. The binaries, upstream manifest,
provenance records, and GPL-3.0-or-later licence were copied verbatim from
Triptych's verified release inputs during this migration. Builds read only
this repository's copies; no sibling checkout is required.

The provenance records retain their original schema and release-asset URLs.
`scripts/cpm22/portable-cpm-release.mjs` checks their identity and the exact
manifest and binary hashes. The upstream profile is named `triptych-cpu-v0.1`;
its CCP origin/entry `$E400` and BDOS origin `$EC00`, entry `$EC06` match the
Debug80 BIOS at `$FA00`. The binaries contain no Triptych BIOS. Debug80's
bootstrap, BIOS, source map, smoke program, and disk format remain locally
owned.

Source and build instructions are available at the pinned upstream revision:
https://github.com/jhlagado/portable-cpm/tree/579657f9177b31e1fccf0c05f72ba2ee76f3d052

Run `node scripts/cpm22/build-image.mjs --candidate` to measure without
publishing artifacts. A normal build refuses to publish until the complete
candidate matches `scripts/cpm22/image-hashes.json`; vendoring these inputs
does not itself approve new frozen hashes or qualify guest workflows.
