# Nucleus CP/M compiler

`NUCLEUS.COM` is the native Z80 Nucleus compiler from
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) commit
`da987afdd51ea723800a81702849518d96373f06`. That repository contains the
complete GPL-3.0-only source, fixed 16 KiB compiler-core accounting, strict
assembly checks, direct `.COM` publisher measurements, and guest execution
proof corresponding to this binary.

The checked artifact is 21,004 bytes with SHA-256
`bf4f7f4273b08afe54af08eb27f24ed819186e019c1e4b3cc268f1f24f1dad7f`.
`npm run import:cpm22-nucleus` rebuilds and imports it from a neighbouring
checkout only when the exact reviewed commit and digest match. Set
`NUCLEUS_ROOT` when that checkout is elsewhere. Normal Debug80 builds use the
committed artifact and require no Nucleus checkout or network access.
