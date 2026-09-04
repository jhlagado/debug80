# Native CP/M editor proof checkpoint

> Historical design record: Edit source, measurements, and executable proofs now live in the standalone [`jhlagado/edit`](https://github.com/jhlagado/edit/tree/v0.1.0) repository. Debug80 consumes its pinned `EDIT.COM`; commands and paths below describe the pre-extraction implementation.

Date: 2026-08-26

This report records the first production `EDIT.COM`, its forward-search,
new-file, and literal-replacement increments, the isolated Z80 proof harness,
and all retained size passes. It follows the contract in
[`cpm22-editor.md`](../specifications/cpm22-editor.md) and the retained buffer
measurement in
[`cpm22-editor-buffer-measurement.md`](cpm22-editor-buffer-measurement.md).
The initial implementation baseline is Debug80 `d3f8931`; search starts from
the pushed 2,504-byte editor at `141bb0b`, new-file creation starts from the
pushed 2,840-byte editor at `a3d70577`, and literal replacement starts from the
pushed 2,869-byte editor at `87d10025`. The retained compressed replacement
implementation is `dddcbd68`, assembled with AZM 0.3.9 strict register
contracts.

## Resident accounts

| Account                       | Baseline | With search | With new files | With replace | Replace delta |
| ----------------------------- | -------: | ----------: | -------------: | -----------: | ------------: |
| Entry jump                    |        3 |           3 |              3 |            3 |             0 |
| Editor code                   |    2,356 |       2,653 |          2,682 |        2,798 |          +116 |
| Immutable strings and names   |      145 |         184 |            184 |          202 |           +18 |
| Complete `EDIT.COM`           |    2,504 |       2,840 |          2,869 |        3,003 |          +134 |
| Fixed writable workspace used |      228 |         292 |            292 |          292 |             0 |
| Text capacity                 |   47,104 |      47,104 |         47,104 |       47,104 |             0 |
| Free code-and-data partition  |    4,920 |       4,584 |          4,555 |        4,421 |          -134 |

The deepest measured private-stack use is 24 bytes. The proof checks the exact
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

The new-file proof additionally distinguishes bare missing-default rejection
from explicit missing names, including explicit `INPUT.NU`. It checks the exact
empty buffer, filename, dirty marker, status row, cursor, viewport, and query
reset; untouched and edited discard; empty, partial, exact-record, and
47,104-byte first saves; and an ordinary save after first publication. It also
executes temporary and backup collisions, create, write, close, install,
rollback-close, and rollback-delete failures, successful retries, an unexpected
target appearing before installation, and sequential discarded, failed, new,
and existing executions.

The search proof additionally covers exact empty, tabbed, and full query rows;
query replacement and cancellation; Backspace, Delete, unsupported controls,
and the 64-byte boundary; matches at byte zero, the current cursor, after LF,
after CRLF, after a tab, and at the final candidate; overlapping repeat-search;
wrap, complete miss, a query longer than the suffix, and rejection of matches
across EOF or a newline. It also proves search after editing and saving,
cancelled discard confirmation, repeat before a committed query, and reset over
two complete editor executions.

The replacement proof additionally covers no committed query, an ahead-only
match, a partial suffix at EOF, attempted matches across LF and CRLF,
cancellation, empty deletion, growth, shrinkage, equal-length and byte-identical
replacement, tabs, unsupported controls, and the 64-byte staging boundary. It
checks exact-capacity growth and the first rejected growth with a byte-for-byte
comparison of the complete text and persistent editor state. Repeated
replacement, overlapping candidates, repeat-search after replacement,
save/reload, new-buffer replacement, discard-confirmation cancellation, and
sequential execution reset use the production entry path.

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
| Load empty file                          |           64 |        748 |           8 |
| Load 47,104 bytes                        |    1,889,744 | 16,738,492 |           8 |
| Reject byte 47,105                       |    1,889,756 | 16,738,536 |           8 |
| Insert at start of four-byte buffer      |           55 |        658 |           4 |
| Insert at end                            |           54 |        584 |           4 |
| Insert CRLF                              |           56 |        594 |           4 |
| Render tabbed line and status            |        3,874 |     44,579 |          16 |
| Render horizontally scrolled line        |       13,933 |    149,022 |          16 |
| Save one partial record                  |          733 |     11,687 |          12 |
| Roll back failed final rename            |          902 |     13,981 |          10 |
| Rollback failure with recoverable backup |          904 |     13,996 |          10 |
| Clean full-entry quit                    |        3,821 |     43,777 |          20 |

Representative search paths use the same production image:

| Search operation                    | Instructions |   T-states | Stack bytes |
| ----------------------------------- | -----------: | ---------: | ----------: |
| Render an empty query row           |        2,099 |     23,678 |          16 |
| Accept and run a short query        |        6,585 |     75,368 |          20 |
| Cancel an edited query              |        6,461 |     75,425 |          20 |
| Immediate match                     |           63 |        631 |           4 |
| Representative wrapped match        |          118 |      1,255 |           4 |
| Representative complete miss        |          305 |      3,374 |           4 |
| Full 47,104-byte miss               |    1,507,357 | 16,675,112 |           4 |
| Full-entry accepted search and quit |       11,984 |    137,636 |          24 |

Representative literal-replacement paths use the same production image:

| Replacement operation | Instructions | T-states | Stack bytes |
| --------------------- | -----------: | -------: | ----------: |
| Cancel                |        2,172 |   24,431 |          20 |
| Growth                |        8,730 |   98,091 |          20 |
| Shrinkage             |        4,409 |   49,475 |          20 |
| Equal-length          |       10,878 |  122,072 |          20 |
| Empty deletion        |        2,233 |   25,024 |          20 |
| Exact-capacity growth |        6,563 |   73,658 |          20 |
| Reject first growth   |        6,520 |   73,199 |          20 |

Representative new-file paths use the same final production image:

| New-file operation                    | Instructions | T-states | Stack bytes |
| ------------------------------------- | -----------: | -------: | ----------: |
| Open explicit missing name            |           32 |      350 |           8 |
| Render initial empty screen           |        3,301 |   38,251 |          16 |
| Save empty file                       |          459 |    5,557 |          10 |
| Save one partial record               |          492 |    8,662 |          10 |
| Save exact 128-byte record            |          494 |    5,999 |          12 |
| Save maximum 47,104-byte file         |       13,339 |  168,213 |          12 |
| Reject unexpected installation target |          692 |   11,046 |          10 |
| Full-entry edited save and quit       |       11,323 |  132,608 |          20 |

The complete bundled CP/M acceptance uses the real BDOS, BIOS, disk, and
terminal. Its open, forward-search, literal replacement, render, edit,
Backspace, arrow, Delete, save, and quit path takes 373,894 instructions and
3,680,246 T-states. It verifies the exact 80-by-24 cells and attributes,
publishes the expected source bytes, removes `INPUT.$$$` and `INPUT.BAK`, and
returns to the CCP at its stable stack depth. The same acceptance opens and
discards a missing explicit name in 52,244 instructions and 559,122 T-states,
then creates and reads back another new file in 113,403 instructions and
1,143,976 T-states.

The VS Code 1.134.0 Extension Development Host test boots the same bundled
platform through Debug80's public commands and opens the actual terminal panel.
It waits for the editor's initial source and reverse-status output, enters a
query through Ctrl-F, observes the real search result, sends the editing and
control-key sequence through the active debug session, replaces `sub` with
`SUB` through Ctrl-R, and verifies the published source with guest
`TYPE INPUT.NU`. The terminal DOM regression also checks that Ctrl-R, Ctrl-S,
and Ctrl-Q become bytes `$12`, `$13`, and `$11`, browser defaults are cancelled,
Ctrl-C remains a debugger break, and SGR 7 creates reverse-video spans. The
feature-specific Extension Host path opens `EDIT CREATED.NU`, observes its
dirty empty status row, saves one byte, and verifies the guest file with
`TYPE CREATED.NU`.

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

The new-file design comparison assembled three complete editor images. The
persistent-flag design measured 2,879 bytes, the save-time probe 2,907 bytes,
and separate first-save dispatch 2,948 bytes. The probe is also unsound: it
cannot distinguish the file loaded at entry from an unrelated target that
appears later, and its executable adversarial case overwrites that target. The
persistent flag is the smallest sound choice.

Production integration reduced the correctness-first result to 2,873 bytes by
retaining short branches available at final placement. The focused pass then
removed four bytes by moving the conflict tail beside its callers, reusing
transaction state after installation, compacting the missing-file return, and
placing the internal new-file flag where one rotate exposes it through carry.
The retained 2,869-byte image adds 29 code bytes and no immutable, workspace,
runtime, text-arena, or stack-partition bytes to the search baseline.

The literal-replacement comparison assembled a 3,106-byte single-replacement
correctness build and a 3,286-byte bounded replace-all build. Replace-all costs
180 more resident bytes and eight workspace bytes, so production retains one
replacement per Ctrl-R. The feature-only pass reduced the selected build to
3,003 bytes by removing 102 code bytes and one immutable byte. The final
feature cost is 116 code bytes and 18 immutable bytes, or 134 resident bytes,
with no workspace, text-capacity, runtime, or stack-partition increase.

The retained integration shares the exact matcher with forward search, shares
the established no-query, not-found, and ready tails, and applies growth or
shrinkage at the replacement start without temporary cursor movement. Prompt
rendering reloads its recorded input pointer, adjacent flags and status fields
share one update sequence, and the default FCB's leading zero terminates the
replacement status string. The compressed complete paths retain capacity
preflight before mutation and the original cursor and query semantics.

## Final verification

The final production assembly has 69 strict register-contract routine
summaries. Every summary reports a balanced stack with no unknown stack effect,
and the call graph has no unknown target. The isolated proof records the exact
return SP and PC and a deepest private-stack use of 24 bytes.

The final gates pass:

- `npm run proof:cpm22-editor` proves the production editor paths and exact
  accounts above;
- `npm run test:cpm22` passes the complete boot, toolchain, editor, disk, and
  warm-boot acceptance;
- `npm run check` passes build, typecheck, lint, formatting, and the full test
  suite across AZM, Glimmer, the runtime, both headless integrations, Debug80,
  its terminal webview, and Nucleus;
- `npm run test:vscode -w debug80` passes the editor workflow in VS Code
  1.134.0's real Extension Development Host, including literal replacement,
  new-file publication, and guest readback; and
- the prose gate reports no findings, all local documentation links resolve,
  and `git diff --check` is clean.
