# Native CP/M editor proof checkpoint

Date: 2026-08-26

This report records the first production `EDIT.COM`, its forward-search
increment, the isolated Z80 proof harness, and both retained size passes. It
follows the contract in
[`cpm22-editor.md`](../specifications/cpm22-editor.md) and the retained buffer
measurement in
[`cpm22-editor-buffer-measurement.md`](cpm22-editor-buffer-measurement.md).
The initial implementation baseline is Debug80 `d3f8931`; search starts from
the pushed 2,504-byte editor at `141bb0b`. The retained search implementation
is `90f28cbc`, assembled with AZM 0.3.9 strict register contracts.

## Resident accounts

| Account                       | Baseline | With search | Delta |
| ----------------------------- | -------: | ----------: | ----: |
| Entry jump                    |        3 |           3 |     0 |
| Editor code                   |    2,356 |       2,653 |  +297 |
| Immutable strings and names   |      145 |         184 |   +39 |
| Complete `EDIT.COM`           |    2,504 |       2,840 |  +336 |
| Fixed writable workspace used |      228 |         292 |   +64 |
| Text capacity                 |   47,104 |      47,104 |     0 |
| Free code-and-data partition  |    4,920 |       4,584 |  -336 |

The deepest measured private-stack use is 22 bytes. The proof checks the exact
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

The search proof additionally covers exact empty, tabbed, and full query rows;
query replacement and cancellation; Backspace, Delete, unsupported controls,
and the 64-byte boundary; matches at byte zero, the current cursor, after LF,
after CRLF, after a tab, and at the final candidate; overlapping repeat-search;
wrap, complete miss, a query longer than the suffix, and rejection of matches
across EOF or a newline. It also proves search after editing and saving,
cancelled discard confirmation, repeat before a committed query, and reset over
two complete editor executions.

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
| Load empty file                          |           63 |        744 |           8 |
| Load 47,104 bytes                        |    1,889,743 | 16,738,488 |           8 |
| Reject byte 47,105                       |    1,889,756 | 16,738,536 |           8 |
| Insert at start of four-byte buffer      |           55 |        653 |           4 |
| Insert at end                            |           54 |        579 |           4 |
| Insert CRLF                              |           56 |        589 |           4 |
| Render tabbed line and status            |        3,874 |     44,579 |          16 |
| Render horizontally scrolled line        |       13,933 |    149,022 |          16 |
| Save one partial record                  |          727 |     11,634 |          12 |
| Roll back failed final rename            |          899 |     13,952 |          10 |
| Rollback failure with recoverable backup |          901 |     13,967 |          10 |
| Clean full-entry quit                    |        3,819 |     43,760 |          20 |

Representative search paths use the same production image:

| Search operation                    | Instructions |   T-states | Stack bytes |
| ----------------------------------- | -----------: | ---------: | ----------: |
| Render an empty query row           |        2,099 |     23,678 |          16 |
| Accept and run a short query        |        6,579 |     75,213 |          18 |
| Cancel an edited query              |        6,450 |     75,270 |          18 |
| Immediate match                     |           63 |        621 |           2 |
| Representative wrapped match        |          122 |      1,237 |           2 |
| Representative complete miss        |          321 |      3,320 |           2 |
| Full 47,104-byte miss               |    1,601,563 | 16,392,484 |           2 |
| Full-entry accepted search and quit |       11,976 |    137,482 |          22 |

The complete bundled CP/M acceptance uses the real BDOS, BIOS, disk, and
terminal. Its open, forward-search, render, edit, Backspace, arrow, Delete,
save, and quit path takes 322,710 instructions and 3,189,184 T-states. It
verifies the exact 80-by-24 cells and attributes, publishes the expected source
bytes, removes `INPUT.$$$` and `INPUT.BAK`, and returns to the CCP at its stable
stack depth.

The VS Code 1.134.0 Extension Development Host test boots the same bundled
platform through Debug80's public commands and opens the actual terminal panel.
It waits for the editor's initial source and reverse-status output, enters a
query through Ctrl-F, observes the real search result, sends the editing and
control-key sequence through the active debug session, and verifies the
published source with guest `TYPE INPUT.NU`. The terminal DOM regression also
checks that Ctrl-S and Ctrl-Q become bytes `$13` and `$11`, browser defaults are
cancelled, Ctrl-C remains a debugger break, and SGR 7 creates reverse-video
spans.

## Size pass

The original editor measured 2,629 bytes before compression and 2,504 bytes
after it, a reduction of 125 code bytes. Immutable data, the 228-byte writable
workspace, the 47,104-byte text arena, and the private-stack partition did not
change. The retained changes share the selected and transactional FCB call
tails, merge the rename-FCB and extension-writing paths, remove one-use output
and hexadecimal wrappers, integrate command-name validation, remove redundant
buffer and rendering checks, and use relative transfers where the assembled
displacement permits them.

The final branch census rejected three additional relative transfers at
measured displacements of +132, -139, and -171 bytes. The selected-file BDOS
tail adds one instruction and 12 T-states per open, read, or close call; this
accounts for the small load-path increase above. The complete interactive path
is faster because the full-screen repaint loop and its common terminal paths
execute fewer instructions.

The correctness-first search build measured 2,962 bytes: 2,773 code bytes, 186
immutable bytes, and 293 workspace bytes. Its focused pass produced the retained
2,840-byte image with 2,653 code bytes, 184 immutable bytes, and 292 workspace
bytes. The 122-byte resident reduction came from the search and its immediate
rendering, dispatcher, status, and reset seams; it did not reduce text capacity
or move resident bytes into another account.

The retained implementation edits query length in place, shares the initial
and repeat query check, shares initial and advancing cursor normalization,
falls directly from a successful byte comparison into the found path, and uses
the existing status byte as the wrap marker. Search statuses encode compact
string offsets. The ordinary and query status rows share their terminal setup
and completion, and terminal sequences that are always adjacent have one
terminator. The loader's pending-CR byte becomes query length only after load
has finished, saving one workspace byte and making successful load itself the
query reset.

The pass rejected changes that merely moved storage, added workspace, or grew
the complete image. These included dedicated query staging, a common copy
wrapper, a shared bell tail, a separate one-caller match routine, and the
seven-byte-larger endpoint scan. The final stack high-water mark rises from 20
to 22 bytes because common status setup preserves its selected prefix across
terminal output; the fixed 3,072-byte stack partition is unchanged.

## Final verification

The final production assembly has 65 strict register-contract routine
summaries. Every summary reports a balanced stack with no unknown stack effect,
and the call graph has no unknown target. The isolated proof records the exact
return SP and PC and a deepest private-stack use of 22 bytes.

The final gates pass:

- `npm run proof:cpm22-editor` proves the production editor paths and exact
  accounts above;
- `npm run test:cpm22` passes the complete boot, toolchain, editor, disk, and
  warm-boot acceptance;
- `npm run check` passes build, typecheck, lint, formatting, and the full test
  suite across AZM, Glimmer, the runtime, both headless integrations, Debug80,
  its terminal webview, and Nucleus;
- `npm run test:vscode -w debug80` passes the editor workflow in VS Code
  1.134.0's real Extension Development Host; and
- the prose gate reports no findings, all local documentation links resolve,
  and `git diff --check` is clean.
