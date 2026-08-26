# Atom CP/M program

`ATOM.COM` is the native Z80 Atom assembler from
[`jhlagado/atom`](https://github.com/jhlagado/atom) commit
`a61002edba870668badfdadbb4c624964489bfe0`. That repository contains the
complete GPL-3.0-only source, build scripts, strict assembly checks, output-path
measurements, and guest acceptance proof corresponding to this binary.

The checked artifact is 14,145 bytes with SHA-256
`ee23f83f8d8c9511e59a8a025b2a28300659b22101f2917c1ff3b2dd4ef3ea79`.
`npm run import:cpm22-atom` imports it from a neighbouring checkout only when
the exact reviewed commit and digest match. Normal Debug80 builds use the
committed artifact and require no Atom checkout or network access.
