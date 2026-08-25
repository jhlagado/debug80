# Atom CP/M program

`ATOM.COM` is the native Z80 Atom assembler from
[`jhlagado/atom`](https://github.com/jhlagado/atom) commit
`ae57413cba865963cf00c8cc1172e5c4cc497b1c`. That repository contains the
complete GPL-3.0-only source, build scripts, strict assembly checks, output-path
measurements, and guest acceptance proof corresponding to this binary.

The checked artifact is 13,677 bytes with SHA-256
`f1e32b46fec49a2d815a45aab1e6c1ae8ac2c569648f076dd2ca73c86da9e61c`.
`npm run import:cpm22-atom` imports it from a neighbouring checkout only when
the exact reviewed commit and digest match. Normal Debug80 builds use the
committed artifact and require no Atom checkout or network access.
