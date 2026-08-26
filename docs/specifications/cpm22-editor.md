# Native CP/M editor contract

Status: active implementation contract

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

The deployed editor excludes selection, copy and paste, multiple buffers,
drive prefixes, user areas, wildcards, binary files, configurable keys, syntax
highlighting, mouse input, undo, and recovery after a reset or power loss
during a directory-sector write. Forward search and new-file creation are
implemented under their settled increments below. Literal replacement is the
next specified increment; the other facilities remain later work rather than
hidden host services.

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
rejected as selected filenames. The no-argument default file must already
exist; an explicitly named file follows the new-file rule below. A command or
open failure prints one CRLF-terminated `EDIT error XX` line, where `XX` is a
stable two-digit hexadecimal editor status, and returns to the CCP with the
incoming stack restored.

## New-file creation increment

The new-file increment starts from pushed Debug80
`a3d705771356648cf717aec736069d4737c9e7d8`, whose complete `EDIT.COM` is
2,840 bytes. It changes only the outcome of an explicitly named file that is
absent. Existing files, malformed commands, reserved extensions, the default
command, text representation, capacity, search, terminal behavior, and
existing-file save transaction retain their settled contracts.

`EDIT NAME.EXT` first attempts the ordinary open. If the named file exists, it
is loaded and validated exactly as before. If it is absent, the editor opens a
new empty buffer associated with that name. Explicitness is syntactic:
`EDIT INPUT.NU` may create a missing `INPUT.NU`, while bare `EDIT` still reports
`EDIT error 02` when its default `INPUT.NU` is absent. An invalid existing text
file remains an error and never becomes a new buffer.

A new buffer has length, cursor, viewport, desired column, and committed search
length zero. Its row-24 filename is the selected name. It uses ready status and
the ordinary dirty marker rather than adding a new status string. The buffer is
dirty even while empty because the requested file has not been published.
`^Q` therefore displays the existing discard warning; the confirming `^Q`
returns without creating any directory entry. Editing, navigation, search, and
capacity behavior are otherwise identical to an empty existing file.

The first `^S` uses the existing `NAME.$$$` and `NAME.BAK` absence checks. It
creates and closes `NAME.$$$`, writing no records for an empty buffer and the
ordinary padded records for nonempty content. Because no selected file needs a
backup, it skips the selected-to-backup rename and renames `NAME.$$$` directly
to the selected name. Success clears the new, dirty, and discard-confirmation
state, reports `Saved`, and converts all later saves in that execution to the
ordinary existing-file transaction.

A temporary- or backup-name collision reports the existing save-conflict
status and leaves the new buffer dirty. Creation, write, close, or install
failure reports the existing phase-specific status, removes the temporary file
where CP/M permits it, leaves the selected name absent, and permits a later
retry. If the selected name unexpectedly exists when installation is
attempted, installation fails rather than replacing it. CP/M is single-tasking,
so ordinary guest execution cannot create that race while the editor is active.

The increment adds no create-on-open path, recovery file, host filesystem
operation, command keyword, prompt, or new status text. It must not weaken the
existing rule that unrelated `.$$$` and `.BAK` files are never deleted merely
to make a save proceed.

Before implementation, complete executable prototypes must compare at least:

1. a persistent new-buffer flag with a shared first-save branch;
2. save-time selected-file probing without a persistent new-buffer flag; and
3. a separately dispatched first-save path.

The comparison includes command-state retention, missing-file initialization,
empty and nonempty save, every rollback phase, retry, reset, immutable data,
workspace, stack, instructions, T-states, and the complete resident delta.
Resident size decides first; workspace and execution cost break a tie. Moving
state into the text arena, stack allocation, DMA record, or another unreported
account is not a saving.

The measured implementation uses a persistent new-buffer bit in the existing
flags byte and shares the ordinary save transaction. The executable comparison
and retained figures are recorded in
[`cpm22-editor-new-file-measurement.md`](../reports/cpm22-editor-new-file-measurement.md).

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
| `^F`            | enter or resume a forward-search query         |
| `^N`            | repeat the last committed search               |
| `^R`            | replace the current committed-search match     |
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

## Forward search increment

The search increment starts from the pushed 2,504-byte editor at Debug80
`141bb0b112367d18260ac8d89a7cf095a203d5c7`. It adds case-sensitive literal
byte search without changing the text representation, file capacity, newline
rules, save transaction, or terminal profile.

`^F` replaces row 24 with one reverse-video query row. Columns 1 through 6
contain `Find: `. Each query byte occupies one following cell: printable ASCII
is shown directly and a horizontal tab is shown as `>`. The remainder of the
row contains spaces, and the hardware cursor follows the displayed query. The
query holds at most 64 bytes, so its cursor remains within the row. The initial
query is the last successfully committed query, or empty when no search has
been committed in this execution.

The query reader accepts printable ASCII and horizontal tab. Backspace and
Delete remove the final query byte. Either key at an empty query rings the bell
once and changes nothing. A first byte beyond 64 also rings once and leaves the
query unchanged. Escape cancels query entry; Return accepts a nonempty query.
Return on an empty query has the same effect as Escape. Other control bytes ring
once and remain in query entry. Cancellation preserves the previous committed
query, file cursor, viewport, content, and dirty state, then returns to ready
status. Entering search is a complete command, so it cancels a pending discard
confirmation.

An accepted query replaces the previous committed query and searches from the
current file cursor, including that byte. Matching compares exact stored bytes.
The query cannot contain CR or LF, and a match never joins bytes across a line
ending, physical EOF, or the end-to-start wrap boundary. Horizontal tab may be
matched as byte `$09`. LF and CRLF retain their existing distinct encodings; a
match after either newline places the cursor at the exact first matched byte.

If the first scan reaches EOF, it continues at byte zero and stops before
testing the original starting byte a second time. The earliest complete match
in that order wins. A match before wrap sets status `Found`; a match after wrap
sets status `Wrapped`. A failed search leaves the cursor and viewport unchanged,
sets status `Not found`, and rings the bell once. Every terminal result returns
to the ordinary full-screen view with the hardware cursor on the file position.

`^N` repeats the committed query without opening the query row. Its scan starts
one byte after the current cursor, which admits overlapping matches. It scans
to EOF, wraps once, and may find the current match again only after examining
the rest of the file. A repeat with no committed query leaves the cursor and
viewport unchanged, sets status `No search`, and rings once. Edits do not clear
the committed query; repeat-search examines the current buffer contents. A new
editor execution starts with no committed query.

The implementation may use the inactive load/save DMA record while query entry
is active, but the committed query must survive later saves. Any storage reuse
must retain the existing 228-byte baseline account separately from new search
workspace and must prove that no BDOS path observes the DMA record as query
storage. At least a dedicated staging buffer, a DMA overlay, and a compact
single-buffer alternative must be measured as complete query-entry and search
paths before one is retained.

The measured implementation uses one active committed-query buffer and copies
its complete 65-byte state into the first 65 bytes of the inactive DMA record
when query entry begins. Escape and empty Return restore that snapshot;
accepted Return keeps the edited buffer in place. Query entry makes no BDOS
call, and the snapshot is dead before any later load or save may overwrite the
DMA record. The scan keeps a word count of candidate starts and tests exactly
the text length in one ring. The independent accounts and execution comparison
are recorded in
[`cpm22-editor-search-measurement.md`](../reports/cpm22-editor-search-measurement.md).

## Literal replacement increment

The literal-replacement increment starts from pushed Debug80
`77b0a44c311a05d9f43107b263649b4ec9c8fc68`. Its complete `EDIT.COM` is
2,869 bytes: a three-byte entry jump, 2,682 code bytes, and 184 immutable
bytes. It uses 292 bytes of fixed workspace, retains 47,104 text bytes, and
leaves 4,555 bytes in the code-and-data partition. The artifact SHA-256 is
`69e0cdf360c4449038ef1bbed1c9e388c9933ff6e21a06e0964db772c57f6bbc`.

`^R` operates on the committed forward-search query. With no committed query,
it retains the file cursor, viewport, content, and dirty state, reports
`No search`, rings the bell once, and does not open a replacement row. The
query must match exactly at the current file cursor. A missing or partial
current match reports `Not found`, rings once, and retains the file cursor,
viewport, content, dirty state, and committed query. The command does not
search ahead or wrap: `^F` and `^N` already select the match to be replaced.

For a current match, `^R` replaces row 24 with one reverse-video replacement
row. Columns 1 through 9 contain `Replace: `. The replacement starts empty on
every invocation and holds at most 64 bytes in the inactive DMA record.
Printable ASCII is displayed directly and a horizontal tab is displayed as
`>`. Backspace and Delete remove the final byte. Either key at length zero,
the first byte beyond 64, and every other unsupported control byte ring the
bell once without leaving the replacement row. Escape cancels; Return accepts
the replacement, including an empty one. Cancellation preserves the committed
search query, file cursor, viewport, content, and dirty state and restores
ready status.

Entering `^R` is a complete command, so every terminal path cancels a pending
discard confirmation under the existing main-loop rule.

An accepted replacement substitutes its bytes for the complete query span at
the current cursor. An empty replacement deletes the span. The replacement
and search query cannot contain CR or LF, and the query cannot cross LF or
CRLF, so replacement never changes or joins existing line endings. Both may
contain a horizontal tab, which remains one stored `$09` byte.

Capacity is checked against the final length before the first text byte or
editor field changes. A growth that would exceed 47,104 bytes reports `Full`,
rings once, and preserves the exact content, length, cursor, viewport, desired
column, dirty and new flags, committed query, and save state. The transient
replacement bytes in the DMA record have no meaning after the command
completes. Shrinking and equal-length replacements cannot fail after
validation.

Success leaves the file cursor at the first replacement byte, or at the
deletion point for an empty replacement. It invalidates the retained vertical
column, sets dirty state, clears discard confirmation, retains the committed
search query, reports `Replaced`, and repaints the screen. An equal-length
replacement marks the buffer dirty even when every replacement byte equals the
matched text. A following `^N` starts one byte after the replacement start and
therefore applies the settled repeat-search and overlap rules to the resulting
buffer.

The minimum retained scope is one replacement per `^R`. A second complete
candidate adds bounded replace-all by accepting `^A` from the replacement row.
That operation selects non-overlapping matches from byte zero to the original
logical EOF in increasing order. It never wraps or tests bytes inserted by an
earlier replacement. After a nonempty replacement, the next scan begins after
the inserted span; after deletion, it resumes at the deletion point. Success
leaves the cursor at the start of the final replacement. No match reports
`Not found`, rings once, and retains the content, cursor, viewport, dirty and
new flags, committed query, and save state.

The replace-all candidate must count its selected matches and prove the final
length before its first write. Exact-capacity growth succeeds; the first byte
beyond capacity rejects the complete operation atomically. The preflight and
mutation passes must select the same non-overlapping spans when the replacement
contains the search query, when it is empty, and when its length equals the
query length.

Both candidates use the existing committed-query storage, inactive DMA record,
contiguous text arena, edit primitives, statuses, renderer, and save path where
that makes the complete image smaller. Neither may add persistent replacement
history, regular expressions, case folding, confirmation per match, newline
replacement, selection, undo, host services, runtime support, or another text
buffer.

Complete executable prototypes must measure the single-replacement editor and
the single-plus-bounded-replace-all editor independently. The comparison
reports code, immutable data, workspace, text capacity, stack, instructions,
and T-states for prompt entry, cancellation, no match, deletion, equal-length
replacement, growth, shrinkage, exact-capacity growth, and rejected growth.
Single replacement is useful with the existing `^F` and `^N` commands, so the
complete resident size decides the scope. Replace-all is retained only if its
complete editor image is no larger than the sound single-replacement image;
otherwise its measured cost is recorded for later work and the single path is
retained.

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

The search increment must additionally distinguish:

- a new, retained, replaced, cancelled, and empty query;
- 64 accepted query bytes and the first rejected byte;
- printable and tab query display, Backspace, Delete, unsupported controls,
  exact prompt cells, attributes, cursor, and bell counts;
- a match at byte zero, at the current cursor, before EOF, after LF, after CRLF,
  after a tab, and at the final complete candidate;
- no match, a query longer than the remaining suffix, and no match across EOF
  or the wrap boundary;
- a wrapped match, one complete failed wrap, overlapping repeated matches, a
  single match found again after wrap, and repeat before any committed query;
- unchanged content, dirty state, save bytes, viewport, and cursor on every
  cancelling or failed path;
- search after an edit, search after save, sequential entry executions, and
  reset of committed query state; and
- exact feature code, immutable data, workspace, stack, instruction, and
  T-state deltas from the frozen 2,504-byte baseline.

The new-file increment must additionally distinguish:

- bare `EDIT` with a missing default file and explicitly named missing files,
  including explicit `INPUT.NU`;
- unchanged loading and validation of existing empty, representative, invalid,
  and maximum-capacity files;
- exact empty-buffer cells, filename, dirty marker, cursor, status, and query
  reset;
- confirmed discard of an untouched new buffer without a disk write;
- editing, searching, and discarding a new buffer;
- first save of empty, partial-record, exact-record, and maximum-capacity
  content;
- successful ordinary save after the first publication;
- temporary and backup collisions, every first-save failure phase, unchanged
  selected-name absence, rollback cleanup, and successful retry;
- sequential existing, new, failed, saved, and discarded executions with no
  retained command or new-buffer state;
- exact assembled extents, stack balance, instructions, T-states, headless
  CP/M behavior, and the real Extension Host workflow; and
- exact code, immutable, workspace, text-capacity, and runtime deltas from the
  pushed 2,840-byte baseline.

The literal-replacement increment must additionally distinguish:

- `^R` with no committed query, with a partial current match, and with exact
  current matches at byte zero, in the middle, and at the final candidate;
- an empty, one-byte, 64-byte, replaced, and cancelled replacement; the first
  rejected byte; Backspace, Delete, horizontal tab, and unsupported controls;
- exact prompt cells, attributes, cursor, ordinary repaint, status, and bell
  count for every terminal result;
- deletion, equal-length replacement, growth, shrinkage, byte-identical
  replacement, one-byte and 64-byte search queries, and overlapping matches;
- retained LF and CRLF bytes, no match across either line ending, and tab
  matching and replacement as exact `$09` bytes;
- a result that exactly fills the 47,104-byte arena and the first rejected
  growth, with byte-for-byte content and every listed persistent field
  unchanged on rejection except `Full` status and one bell;
- cursor placement, vertical-column invalidation, dirty and discard state,
  retained committed query, `^N` after replacement, repeated replacement,
  save, reload, and physical saved-file bytes;
- existing and new buffers, sequential executions, and reset of transient
  replacement state after cancellation, failure, save, and exit;
- for the replace-all candidate, no match, non-overlapping spans, replacement
  text containing the query, empty replacement, final cursor, exact capacity,
  rejected aggregate growth, and identical preflight and mutation selection;
- exact assembled extents, stack balance, instructions, T-states, headless
  CP/M behavior, and the real Extension Host workflow; and
- exact code, immutable, workspace, text-capacity, and runtime deltas from the
  pushed 2,869-byte baseline.

The final gate includes strict assembly, scoped editor proofs, the complete
CP/M acceptance, runtime and terminal tests, Extension Host integration, full
repository tests, typechecking, lint, formatting, link checks, and diff checks.

The production Z80 proof coverage and measurements are recorded in
[`cpm22-editor-proof.md`](../reports/cpm22-editor-proof.md).

The retained search implementation contains a three-byte entry jump, 2,653
bytes of code, and 184 bytes of immutable data. The complete `EDIT.COM` is
2,840 bytes, leaving 4,584 bytes in its code-and-data partition. Fixed
workspace is 292 bytes, the text capacity remains 47,104 bytes, and the deepest
measured private-stack use is 22 bytes.

Against the frozen 2,504-byte editor, search adds 297 code bytes, 39 immutable
bytes, and 64 workspace bytes. The complete artifact grows by 336 bytes. It
adds no runtime support and does not change the text or stack partitions. The
correctness-first build occupied 2,962 bytes; the feature-only size pass
removed 122 resident bytes before the implementation was retained.

New-file creation adds 29 code bytes to that retained search baseline. The
complete `EDIT.COM` is 2,869 bytes: a three-byte entry jump, 2,682 code bytes,
and 184 immutable bytes. It leaves 4,555 bytes in the code-and-data partition,
uses the same 292-byte workspace, retains the 47,104-byte text capacity, and
adds no runtime support. Its correctness-first production build occupied 2,873
bytes; the focused size pass removed four bytes.
