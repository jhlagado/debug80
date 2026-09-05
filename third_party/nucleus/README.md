# Nucleus CP/M compiler

`NUC.COM` is the native Z80 Nucleus compiler from
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) commit
`b5276a85fd36600a10dbd65039f0af3afc033f0d` (release `nucleus-v0.3.1`). That
repository contains the complete GPL-3.0-only source, fixed 16 KiB compiler-core accounting, strict
assembly checks, final-image publisher measurements, and guest execution
proof corresponding to this binary.

The checked artifact is 21,271 bytes with SHA-256
`1c047ac1ed5ff1c4e914321b66476b842a1b28cc0dfef4cfdb86f691ca037334`.
It was assembled with ATOM revision
`802b5c2d320bec777f427755ff2d7338e3b80a05`, loads and enters at address 256,
and ends at exclusive address 21,527. The unmodified 466-byte manifest has
SHA-256 `ea2555944622b59b45bc89c9aec63e0575eb9ae6d4a1e9c9430942d905132388`.
`npm run import:cpm22-nucleus` verifies the vendored release without compiling
or fetching anything. To import reviewed release inputs, set
`NUCLEUS_RELEASE_DIR` to a directory containing `NUC.COM`, `NUC.manifest.json`
and the reviewed `triptych-release-provenance-v1` `PROVENANCE.json`.
The importer checks the pinned repository, revision, artifact and manifest
digests before changing destination files. It preserves the upstream record
as `release.provenance.json` and writes Debug80's consumer provenance separately.
Normal builds require no Nucleus or Triptych checkout or network access.
