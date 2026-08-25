# Nucleus CP/M compiler

`NUCLEUS.COM` is the native Z80 Nucleus compiler from
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) commit
`7cddad267f1b553661614c23fa3cf9af5bf01709`. That repository contains the
complete GPL-3.0-only source, fixed 16 KiB compiler-core accounting, strict
assembly checks, direct `.COM` publisher measurements, and guest execution
proof corresponding to this binary.

The checked artifact is 20,987 bytes with SHA-256
`fa910068a98858f0f7b82c2445c377451bbbe8c2c983ecd00e1a32247203ab08`.
`npm run import:cpm22-nucleus` rebuilds and imports it from a neighbouring
checkout only when the exact reviewed commit and digest match. Set
`NUCLEUS_ROOT` when that checkout is elsewhere. Normal Debug80 builds use the
committed artifact and require no Nucleus checkout or network access.
