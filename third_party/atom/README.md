# Atom CP/M program

`ATOM.COM` is the native Z80 Atom assembler from
[`jhlagado/atom`](https://github.com/jhlagado/atom) commit
`d9583e101cca43863433f8fe79ef0acd46b3b010`. That repository contains the
complete GPL-3.0-only source, build scripts, strict assembly checks, output-path
measurements, and guest acceptance proof corresponding to this binary.

The checked artifact is 13,681 bytes with SHA-256
`3a5ec53680fe8707dd1b472ec2719c93b25a1ce863952acc05c6eddd0ec161f5`.
`npm run import:cpm22-atom` imports it from a neighbouring checkout only when
the exact reviewed commit and digest match. Normal Debug80 builds use the
committed artifact and require no Atom checkout or network access.
