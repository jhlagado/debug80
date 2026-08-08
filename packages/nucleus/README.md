# Nucleus

A small typed language for sixteen-kilobyte Z80 systems, executed by a register
virtual machine.

The normative source-language and virtual-machine specifications live in the
Lanternfly Nucleus documentation directory. This package supplies executable
definitions, conformance checks, and Z80 measurements for those specifications.

## Layout

|         |                                                  |
| ------- | ------------------------------------------------ |
| `asm/`  | virtual machine, in AZM                          |
| `src/`  | executable NVM and compiler-metadata definitions |
| `test/` | measurements and VM conformance evidence         |

## Method

Bottom up. Every claim about Z80 bytes or timing is produced by AZM and the
Debug80 Z80 runtime from a test in `test/`, or is labelled an estimate in the
document that makes it.

The machine-readable opcode table is checked against the VM specification.
The type-metadata model covers every Nucleus type, including arrays of records
and bounded strings, without turning aggregate aliases into runtime types.

```bash
npm run measure -w nucleus
npm test -w nucleus
```
