# First Milestone: Minimal Flat Assembler

Status: proposed starting slice

The first implementation slice should prove the replacement architecture with a
small but real assembler path.

## Scope

Accept a single source string containing:

- blank lines and semicolon comments
- labels with colons
- `ORG`
- `EQU`
- `DB`
- `DW`
- `DS`
- a small instruction subset: `NOP`, `RET`, `LD A,n`

Produce:

- diagnostics
- symbol table
- byte ranges
- BIN bytes
- HEX text

## Out of Scope

- includes
- op declarations
- layout declarations
- register-care
- listing and D8 output
- full Z80 instruction coverage

## Success Test

This source:

```asm
        ORG 0100H
VALUE   EQU 42
START:
        LD A,VALUE
        RET
```

should produce bytes at `0100H`:

```text
3E 2A C9
```

and a symbol table containing `VALUE = 42` and `START = 0100H`.
