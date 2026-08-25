# Atom CP/M program

`ATOM.COM` is the native Z80 Atom assembler from
[`jhlagado/atom`](https://github.com/jhlagado/atom) commit
`964f26fbcdfd48a87cea24a3af1c7a5a225e8ab0`. That repository contains the
complete GPL-3.0-only source, build scripts, strict assembly checks, output-path
measurements, and guest acceptance proof corresponding to this binary.

The checked artifact is 14,133 bytes with SHA-256
`6a79dea8a238e859c79e033db6d56fa90e4ab9ed9595ce1fd8dcd94c3749bc3f`.
`npm run import:cpm22-atom` imports it from a neighbouring checkout only when
the exact reviewed commit and digest match. Normal Debug80 builds use the
committed artifact and require no Atom checkout or network access.
