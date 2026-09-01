# Nucleus CP/M compiler

`NUC.COM` is the native Z80 Nucleus compiler from
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) commit
`79016539569aaffe66334cf350f9b9100a5a8bb4`. That repository contains the
complete GPL-3.0-only source, fixed 16 KiB compiler-core accounting, strict
assembly checks, final-image publisher measurements, and guest execution
proof corresponding to this binary.

The checked artifact is 21,281 bytes with SHA-256
`7b3da3c0b595a88b4906537fe0f76c44f7abd412e248d35d927d1aefd8971ef1`.
`npm run import:cpm22-nucleus` rebuilds and imports it from a neighbouring
checkout only when the exact reviewed commit and digest match. Set
`NUCLEUS_ROOT` when that checkout is elsewhere. Normal Debug80 builds use the
committed artifact and require no Nucleus checkout or network access.
