# CP/M editor new-file design measurement

> Historical design record: Edit source, measurements, and executable proofs now live in the standalone [`jhlagado/edit`](https://github.com/jhlagado/edit/tree/v0.1.0) repository. Debug80 consumes its pinned `EDIT.COM`; commands and paths below describe the pre-extraction implementation.

Date: 2026-08-26

Status: retained production implementation

## Boundary

The frozen executable baseline is pushed Debug80
`a3d705771356648cf717aec736069d4737c9e7d8`. Its complete `EDIT.COM` is
2,840 bytes: 2,653 code bytes, 184 immutable bytes, and the three-byte entry
jump. The editor has 292 bytes of fixed workspace, 47,104 text bytes, and 4,584
unused bytes in its code-and-data partition.

Each candidate assembles a complete `EDIT.COM`. The buffer, navigation,
search, screen, terminal, existing-file transaction, immutable strings, and
memory partition come from production source. Only command explicitness,
missing-file initialization, and first-save control differ. The executable
comparison is
[`measure-new-file.mjs`](https://github.com/jhlagado/edit/blob/v0.1.0/tools/measure-new-file.mjs).

## Result

| Candidate                     | Complete bytes | Code bytes | Immutable | Workspace | Text capacity | Delta | Sound |
| ----------------------------- | -------------: | ---------: | --------: | --------: | ------------: | ----: | :---: |
| Frozen production baseline    |          2,840 |      2,653 |       184 |       292 |        47,104 |     0 |  yes  |
| Persistent new-buffer flag    |          2,879 |      2,692 |       184 |       292 |        47,104 |   +39 |  yes  |
| Save-time selected-name probe |          2,907 |      2,720 |       184 |       292 |        47,104 |   +67 |  no   |
| Separate first-save dispatch  |          2,948 |      2,761 |       184 |       292 |        47,104 |  +108 |  yes  |

The persistent flag is the smallest sound design. It consumes one previously
free bit in `EditorFlags` and adds no byte of workspace or immutable data. The
command parser retains syntactic explicitness transiently in the existing
save-state byte. A missing explicit name initializes an empty buffer with
dirty and new bits set. First save shares the existing transaction until the
selected-to-backup rename, skips that rename for a new buffer, installs the
temporary file, then clears new state with dirty and discard confirmation.

The separate path saves two instructions and 24 T-states on a representative
first save, but duplicates transaction control and costs 69 more resident bytes
than the selected design. That execution difference does not justify the
resident cost.

## Probe disqualification

A save-time `OPEN` can tell whether the selected name exists at save time. It
cannot tell whether that file was loaded at editor entry or appeared after a
new buffer was opened. The executable adversarial case opens a missing
`RACE.NU`, inserts `OURS`, then places an unrelated `RACE.NU` before `^S`.

The persistent and separate designs attempt only `RACE.$$$` to `RACE.NU`.
Installation fails because the target exists; rollback removes the temporary
file and preserves the unrelated target. The probe design classifies the
target as the original file, moves it to `RACE.BAK`, installs the editor
buffer, and deletes the backup. It therefore overwrites the unrelated file.
Adding durable origin state would repair the design, but would reduce it to the
persistent-state design with an unnecessary extra `OPEN` and `CLOSE`.

## Execution measurement

These counts exclude host-side fake-BDOS work. They include every executed Z80
instruction around each BDOS call.

| Candidate  | Explicit command | Missing load | Empty first save | Partial first save | Exact-record first save | Later ordinary save | Maximum measured stack |
| ---------- | ---------------: | -----------: | ---------------: | -----------------: | ----------------------: | ------------------: | ---------------------: |
| Persistent |      351 / 3,238 |     29 / 337 |      459 / 5,576 |        492 / 8,681 |             494 / 6,018 |        698 / 11,354 |               12 bytes |
| Save probe |      351 / 3,238 |     29 / 337 |      474 / 5,756 |        507 / 8,861 |             509 / 6,198 |        726 / 11,683 |               12 bytes |
| Separate   |      351 / 3,238 |     29 / 337 |      457 / 5,552 |        490 / 8,657 |             492 / 5,994 |        695 / 11,330 |               12 bytes |

Each cell is instructions / T-states. A partial record includes construction
of a padded 128-byte DMA record, which is why it executes more T-states than an
exact 128-byte record.

## Executed cases

Every candidate proves bare missing-default rejection, explicit missing names,
explicit `INPUT.NU`, unchanged existing and invalid-text loading, empty,
partial-record, and exact-record first saves, an ordinary save after first
publication, and an ordinary save of an existing file. Temporary and backup
collisions preserve their files and leave the selected name absent.

Injected first-save failures cover create, write, close, install, rollback
close, and rollback delete. Create, write, close, install, and rollback-close
cases clean up and then save successfully on retry. A failed rollback delete
leaves the temporary file recoverable and makes no claim of successful
publication. CP/M 2.2 reports both an absent file and an `OPEN` failure as
`$FF`; the editor cannot distinguish an injected storage failure during an
absence check from ordinary absence. The measurement does not claim a
diagnostic distinction that BDOS cannot express.

## Selection

Retain the persistent new-buffer flag. Its correctness-first projection is 39
code bytes, leaving 4,545 bytes in the editor partition before the required
feature-only size pass.

## Production result

The integrated correctness build occupied 2,873 bytes, 33 more than the frozen
production baseline and six fewer than the isolated candidate. Integration
kept the existing short failure branches where their final placement allowed
them. The real editor proof also caught one required seam: its edit-complete
tail had assigned the dirty flag byte, which erased new-file state. The retained
tail sets only the dirty bit and costs no additional resident byte.

The focused pass moved the conflict tail beside its two branches, reused save
transaction state after installation, compacted the missing-file return, and
placed the internal new-file flag where one rotate exposes it through carry.
The final `EDIT.COM` is 2,869 bytes: 2,682 code bytes, 184 immutable bytes, and
the three-byte entry jump. New-file creation therefore costs 29 resident bytes,
uses no new workspace or runtime support, retains 47,104 text bytes, and leaves
4,555 bytes of code-and-data headroom. The size pass removed four bytes from the
correctness build.
