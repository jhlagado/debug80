# Atom CP/M program

`ATOM.COM` is the native Z80 Atom assembler from
[`jhlagado/atom`](https://github.com/jhlagado/atom) commit
`2ec93226b1f528ee7a5052fee4c2aba1c0b2b285`. That repository contains the
complete GPL-3.0-only source, build scripts, strict assembly checks, output-path
measurements, and guest acceptance proof corresponding to this binary.

The checked artifact is 13,199 bytes with SHA-256
`c8aaaf2e89a593064f0701ebfcfced6fe70a041f81ef5084ccda6c78a0666891`.
`npm run import:cpm22-atom` imports it from a neighbouring checkout only when
the exact reviewed commit and digest match. Normal Debug80 builds use the
committed artifact and require no Atom checkout or network access.
