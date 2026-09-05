# Nucleus CP/M compiler

`NUC.COM` is the native Z80 Nucleus compiler from
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) commit
`52cca195d1b557ebfbbc3a6d924ca3d6ea657829`. That repository contains the
complete GPL-3.0-only source, fixed 16 KiB compiler-core accounting, strict
assembly checks, final-image publisher measurements, and guest execution
proof corresponding to this binary.

The checked artifact is 21,281 bytes with SHA-256
`7b3da3c0b595a88b4906537fe0f76c44f7abd412e248d35d927d1aefd8971ef1`.
`npm run import:cpm22-nucleus` verifies the vendored release without compiling
or fetching anything. To import reviewed release inputs, set
`NUCLEUS_RELEASE_DIR` to a directory containing `NUC.COM`, `NUC.manifest.json`
and the reviewed `triptych-release-provenance-v1` `PROVENANCE.json`.
The importer checks the pinned repository, revision, artifact and manifest
digests before changing destination files. It preserves the upstream record
as `release.provenance.json` and writes Debug80's consumer provenance separately.
Normal builds require no Nucleus or Triptych checkout or network access.
