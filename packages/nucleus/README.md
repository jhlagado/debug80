# Nucleus

A small typed language for sixteen-kilobyte Z80 systems, executed by a register
virtual machine.

Nucleus is an autonomous project. Its language, grammar, compiler contract,
virtual machine, and conformance rules are defined here. Material outside this
package does not govern Nucleus.

## Layout

|         |                                                                |
| ------- | -------------------------------------------------------------- |
| `docs/` | language and VM specifications, plus the reviewer's charter    |
| `asm/`  | virtual-machine implementation experiments in AZM              |
| `src/`  | grammar analysis, executable NVM, and compiler metadata models |
| `test/` | grammar, measurement, and VM conformance evidence              |

The current authorities are:

- [Nucleus 0.1 Language Specification](docs/specification.md)
- [Nucleus Virtual Machine 0.1 Specification](docs/virtual-machine-specification.md)
- [Nucleus reviewer's charter](docs/reviewers-charter.md)

## Method

Bottom up. Every claim about Z80 bytes or timing is produced by AZM and the
Debug80 Z80 runtime from a test in `test/`, or is labelled an estimate in the
document that makes it.

The grammar analyzer reads the complete grammar from the language
specification. The machine-readable opcode table is checked against the VM
specification. The type-metadata model covers every Nucleus type, including
arrays of records and bounded strings, without turning aggregate aliases into
runtime types.

```bash
npm run measure -w nucleus
npm test -w nucleus
```
