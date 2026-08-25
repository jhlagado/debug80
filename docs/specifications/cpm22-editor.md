# Native CP/M editor contract

Status: proposed implementation contract

Date: 2026-08-26

## Purpose and authority

This document defines the first native full-screen editor for Debug80's ideal
CP/M 2.2 platform. The editor is a project-owned Z80 transient named
`EDIT.COM`. It uses the guest BDOS for console and file operations and the
platform's existing 80-column by 24-row terminal contract. Debug80 does not
intercept editor file or terminal calls.

The authority order is:

1. this editor contract;
2. `docs/specifications/cpm22-platform.md`;
3. the CP/M 2.2 BDOS ABI used by the platform; and
4. AZM 0.3.9 strict Z80 register contracts.

The implementation baseline is Debug80
`d3f89311108e5d7533449fc1cc9b98247643171b`, Atom
`964f26fbcdfd48a87cea24a3af1c7a5a225e8ab0`, and Nucleus
`7cddad267f1b553661614c23fa3cf9af5bf01709`. All three revisions are the
pushed `main` revision at the start of this work.

## Scope

The first editor opens one current-drive CP/M 8.3 text file, presents a
full-screen view, moves the cursor, inserts and deletes text, and saves through
a recoverable file transaction. It is a functional replacement with a new
interface, not an ED command or file-format emulation.

The first slice excludes search, replace, selection, copy and paste, multiple
buffers, new-file creation, drive prefixes, user areas, wildcards, binary
files, configurable keys, syntax highlighting, mouse input, undo, and recovery
after a reset or power loss during a directory-sector write. These are later
features rather than hidden host facilities.

## Command

The accepted commands are:

```text
EDIT
EDIT NAME.EXT
```

The no-argument form opens `INPUT.NU`. The selected name must be one
current-drive CP/M 8.3 filename. Lowercase ASCII is converted to uppercase.
Spaces may surround the name, but extra arguments, drive prefixes, wildcards,
empty components, and invalid CP/M filename characters are rejected before the
screen is changed.

The extensions `BAK` and `$$$` are reserved for the save transaction and are
rejected as selected filenames. The file must already exist. A command or open
failure prints one CRLF-terminated `EDIT error XX` line, where `XX` is a stable
two-digit hexadecimal editor status, and returns to the CCP with the incoming
stack restored.

## Text-file model

The editable content is the logical byte sequence before the first `$1A` text
EOF byte or physical EOF, whichever comes first. The editor accepts printable
7-bit ASCII, horizontal tab, LF, and CRLF. Every CR must be followed by LF.
Other control bytes and a bare CR reject the file without entering the editor.

Accepted bytes remain byte-for-byte unchanged until an edit affects them. LF
and CRLF are distinct newline encodings and are preserved. Return inserts CRLF.
Backspace or Delete treats either newline encoding as one logical character and
never leaves the cursor between CR and LF.

The content capacity is exactly 47,104 bytes. Empty files and files containing
exactly 47,104 logical bytes are accepted. A first byte beyond that capacity is
rejected before it is written into the text arena. Capacity is checked before
every insertion; a rejected insertion leaves the content, cursor, viewport,
dirty state, and transaction state unchanged.

Saving writes each complete 128-byte span as one CP/M record. A final partial
record is padded with `$1A`. Content whose length is an exact multiple of 128,
including an empty file, needs no extra physical record. Physical padding from
the input file is not part of the editable content.

## TPA allocation and accounting

CP/M loads `EDIT.COM` at `$0100`. The transient uses this fixed partition:

| Account                                     | Inclusive addresses |     Capacity |
| ------------------------------------------- | ------------------- | -----------: |
| Code and immutable data                     | `$0100..$1DFF`      |  7,424 bytes |
| Fixed writable workspace and one DMA record | `$1E00..$1FFF`      |    512 bytes |
| Text arena                                  | `$2000..$D7FF`      | 47,104 bytes |
| Private stack                               | `$D800..$E3FF`      |  3,072 bytes |

The code, immutable data, writable workspace, text arena, and stack are
reported separately. Overlaying one account onto another does not count as a
size reduction. The complete `.COM` must end before `$1E00`; uninitialized
workspace and the text arena do not inflate the artifact.

The CP/M entry saves the exact incoming SP in writable transient code, selects
the private stack, and restores the incoming SP before every return to the CCP.
The editor is non-reentrant. No success, load failure, edit-capacity failure,
save failure, or discard exit may write `$E400..$FFFF` except through BDOS.

## Screen

Rows 1 through 23 display text. Row 24 is a reverse-video status row containing
the selected filename, a dirty marker when appropriate, the last status, and
the `^S Save` and `^Q Quit` key hints. The editor uses only the CSI cursor,
erase, and rendition operations already required by the platform contract.

Printable bytes occupy one cell. A tab advances to the next eight-column tab
stop and displays spaces. Newline bytes are not displayed. The viewport has a
logical top-line offset and a horizontal display-column offset. Moving the
cursor beyond row 23 or column 80 scrolls the applicable viewport just far
enough to keep the cursor visible. Long lines are clipped at the viewport
edges; their bytes remain editable and are preserved on save.

The hardware cursor is placed on the logical insertion position after every
completed command. A repaint may rewrite the complete 24-row screen, but the
observable cells, attributes, cursor, and bell count must match the contract.
The editor never depends on terminal output being echoed as input.

## Keys and editing

The input parser consumes the platform's raw byte stream:

| Bytes           | Operation                                      |
| --------------- | ---------------------------------------------- |
| printable ASCII | insert before the cursor                       |
| HT              | insert one tab byte                            |
| CR              | insert CRLF                                    |
| BS              | delete the logical character before the cursor |
| DEL             | delete the logical character at the cursor     |
| `ESC [ A`       | move up one logical line                       |
| `ESC [ B`       | move down one logical line                     |
| `ESC [ C`       | move right one logical character               |
| `ESC [ D`       | move left one logical character                |
| `^S`            | save                                           |
| `^Q`            | quit or begin discard confirmation             |

Left and Right cross line boundaries. Up and Down retain the current visual
column where the target line permits it and otherwise stop at that line's end.
A following vertical movement reuses the retained column until a horizontal
movement or edit establishes a new one.

Backspace at byte zero, Delete at physical EOF, and a movement beyond the file
boundary leave all editor state unchanged and ring the bell once. An incomplete
or unsupported escape sequence has the same effect after its bytes have been
consumed.

`^Q` returns immediately when the buffer is clean. With unsaved changes, the
first `^Q` displays a discard warning without changing the buffer. A second
consecutive `^Q` returns without saving. Any other complete key command cancels
the confirmation.

## Save transaction

The editor derives `NAME.$$$` and `NAME.BAK` from the selected filename. Both
transaction names must be absent when a save begins. This prevents the editor
from deleting an unrelated or previously recoverable file.

A save performs these phases through ordinary FCB calls:

1. create `NAME.$$$`;
2. write and close the complete padded content;
3. rename the selected file to `NAME.BAK`;
4. rename `NAME.$$$` to the selected name; and
5. delete `NAME.BAK`.

Dirty state is cleared only after the new selected file has been installed. A
single injected BDOS failure at any phase restores the previous selected file,
removes a partial temporary file where CP/M permits it, retains the edited
buffer, and reports `Save failed XX` on row 24. If both publication and rollback
operations fail, the previous complete file must remain recoverable as either
the selected name or `NAME.BAK`; the editor reports the rollback status and
does not claim a successful save.

Repeated saves in one process use fresh FCB state and preserve the same rules.
The configured source disk image remains unchanged because Debug80 runs the
guest on its private session image.

## Buffer design measurement

The external text arena, capacity, cursor behavior, display result, and save
format are fixed before representation is selected. At least these candidates
are measured independently:

1. one contiguous byte sequence shifted with `LDDR` for insertion and `LDIR`
   for deletion;
2. a movable gap represented by separate pre-gap and post-gap spans; and
3. line descriptors over a text arena with bounded descriptor storage.

The measured selection is the contiguous byte sequence. The executable
comparison and retained figures are recorded in
`docs/reports/cpm22-editor-buffer-measurement.md`. The implementation may share
or compress routines after integration, but it must retain the contiguous
representation and the external capacity unless a new complete measurement
supersedes that result.

Each prototype must implement or price the complete candidate-specific path:
middle insertion, backward and forward deletion, left and right movement,
line lookup, viewport rendering, two-span or one-span save traversal, capacity
failure, and reset. Shared command, BDOS, terminal, and transaction code is
excluded only when it is byte-identical for every candidate.

The report records code, immutable data, fixed workspace, usable text bytes,
stack, instructions, and T-states for an insertion and deletion at the start,
middle, and end of empty, representative, and full buffers. The retained design
is the smallest complete implementation. Editing speed breaks a close size tie;
one fast instruction sequence does not outweigh a larger complete path.

## Required proofs

The standalone assembly and Debug80 integration must distinguish:

- no-argument and selected-name commands;
- invalid command tails and reserved extensions;
- missing, empty, representative Atom, and representative Nucleus files;
- LF, CRLF, tabs, long lines, `$1A`, invalid controls, and bare CR;
- exactly 47,104 content bytes and the first rejected byte;
- insertion at the start, middle, and end;
- CRLF insertion and atomic capacity rejection;
- Backspace and Delete over bytes, LF, and CRLF;
- all four arrows, retained vertical column, vertical and horizontal scrolling,
  malformed escape input, and boundary bells;
- exact cells, attributes, cursor, status row, and bell count;
- clean quit, discard confirmation, cancellation, and confirmed discard;
- save, repeated save, every transaction failure phase, rollback failure, and
  successful save after a failure;
- exact logical and physical saved-file bytes;
- exact entry and exit SP, return PC, workspace canaries, text-arena canaries,
  and unchanged CP/M high memory;
- exact assembled extents, representative instructions and T-states, and Z80
  stack balance; and
- headless CP/M plus the real VS Code Extension Host terminal workflow.

The final gate includes strict assembly, scoped editor proofs, the complete
CP/M acceptance, runtime and terminal tests, Extension Host integration, full
repository tests, typechecking, lint, formatting, link checks, and diff checks.
