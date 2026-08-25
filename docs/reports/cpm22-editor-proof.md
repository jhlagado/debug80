# Native CP/M editor proof checkpoint

Date: 2026-08-26

This checkpoint records the first production `EDIT.COM` and its isolated Z80
proof harness. It follows the contract in
[`cpm22-editor.md`](../specifications/cpm22-editor.md) and the retained buffer
measurement in
[`cpm22-editor-buffer-measurement.md`](cpm22-editor-buffer-measurement.md).
The implementation was assembled from Debug80 `1e87bdee` with AZM 0.3.9
strict register contracts.

## Resident accounts

| Account                       | Measured bytes |
| ----------------------------- | -------------: |
| Entry jump and compiler code  |          2,484 |
| Immutable strings and names   |            145 |
| Complete `EDIT.COM`           |          2,629 |
| Fixed writable workspace used |            228 |
| Text capacity                 |         47,104 |
| Free code-and-data partition  |          4,795 |

The deepest measured private-stack use is 20 bytes. The proof checks the exact
caller SP on every return, the unused workspace canary, and unchanged memory
above the editor's private stack. The production transient remains within the
fixed TPA partition; no account is hidden in another region.

## Executed boundaries

`npm run proof:cpm22-editor` assembles the production sources and executes them
in the Debug80 Z80 runtime. BDOS calls cross the real register interface into a
deterministic proof adapter. The adapter implements only the CP/M operations
used by the editor, records their FCB names and order, and can fail one named
operation. It does not replace the editor's parsing, buffer, navigation,
rendering, transaction, or rollback code.

The proof covers:

- default, selected, malformed, and reserved command names;
- missing and empty files, the bundled Atom and Nucleus sources, LF, CRLF,
  tabs, text EOF, invalid controls, and bare CR;
- exactly 47,104 input bytes and rejection of byte 47,105;
- insertion at the start, middle, and end, CRLF insertion, and atomic capacity
  failure;
- byte, LF, and CRLF deletion in both directions;
- left and right movement across CRLF, retained vertical columns, tab display,
  and vertical and horizontal scrolling;
- complete status-row rendition, exact cursor placement, malformed and timed
  out escape sequences, boundary bells, clean quit, discard confirmation, and
  confirmation cancellation;
- empty, exact-record, and partial-record saves, repeated saves, both reserved
  transaction-name conflicts, every primary transaction failure, rollback
  failure, and a successful retry; and
- exact logical buffer contents, physical record padding, retained dirty state,
  recoverable previous files, and removal of temporary names where CP/M permits
  it.

The save-failure cases inject failures at temporary creation, record writing,
temporary close, both publication renames, and backup deletion. Each ordinary
failure restores the exact previous selected file. When restoration is also
failed deliberately, the previous file remains under `NAME.BAK` and the editor
reports rollback failure rather than success.

## Representative execution measurements

The isolated figures below count production editor instructions and T-states.
They exclude the proof adapter's host implementation of BDOS calls.

| Operation                                | Instructions |   T-states | Stack bytes |
| ---------------------------------------- | -----------: | ---------: | ----------: |
| Load empty file                          |           61 |        716 |           8 |
| Load 47,104 bytes                        |    1,889,373 | 16,734,044 |           8 |
| Reject byte 47,105                       |    1,889,386 | 16,734,094 |           8 |
| Insert at start of four-byte buffer      |           55 |        653 |           4 |
| Insert at end                            |           54 |        579 |           4 |
| Insert CRLF                              |           56 |        589 |           4 |
| Render tabbed line and status            |        3,933 |     45,039 |          16 |
| Render horizontally scrolled line        |       14,215 |    150,579 |          16 |
| Save one partial record                  |          681 |     11,140 |          10 |
| Roll back failed final rename            |          884 |     13,768 |          10 |
| Rollback failure with recoverable backup |          886 |     13,783 |          10 |
| Clean full-entry quit                    |        3,850 |     44,044 |          20 |

The complete bundled CP/M acceptance uses the real BDOS, BIOS, disk, and
terminal. Its open, render, edit, Backspace, arrow, Delete, save, and quit path
takes 273,716 instructions and 2,705,522 T-states. It verifies the exact
80-by-24 cells and attributes, publishes the expected source bytes, removes
`INPUT.$$$` and `INPUT.BAK`, and returns to the CCP at its stable stack depth.

The VS Code 1.134.0 Extension Development Host test boots the same bundled
platform through Debug80's public commands and opens the actual terminal panel.
It waits for the editor's initial source and reverse-status output, sends the
editing and control-key sequence through the active debug session, and verifies
the published source with guest `TYPE INPUT.NU`. The terminal DOM regression
also checks that Ctrl-S and Ctrl-Q become bytes `$13` and `$11`, browser defaults
are cancelled, Ctrl-C remains a debugger break, and SGR 7 creates reverse-video
spans.

## Work still open

This checkpoint does not complete the editor goal. A focused size pass, final
adversarial review, platform documentation update, and complete repository gate
remain.
