# CP/M editor literal-replacement design measurement

> Historical design record: Edit source, measurements, and executable proofs now live in the standalone [`jhlagado/edit`](https://github.com/jhlagado/edit/tree/v0.1.0) repository. Debug80 consumes its pinned `EDIT.COM`; commands and paths below describe the pre-extraction implementation.

Date: 2026-08-26

Status: single replacement implemented, compressed, and verified

## Boundary

The frozen baseline is pushed Debug80
`87d10025bc866360661164306623619244b406e5`. Its complete `EDIT.COM` is
2,869 bytes: 2,682 code bytes, 184 immutable bytes, and the three-byte entry
jump. The editor has 292 bytes of fixed workspace, a 47,104-byte text arena,
and 4,555 free bytes in its code-and-data partition.

Both candidates assemble a complete editor with strict register-contract
checking. They use the production buffer, navigation, screen, terminal, save,
new-file, and command paths. Replacement text occupies the inactive 128-byte
CP/M DMA record while the prompt is active. The executable comparison is
[`measure-replace.mjs`](https://github.com/jhlagado/edit/blob/v0.1.0/tools/measure-replace.mjs).

## Result

| Candidate                  | Complete bytes | Code bytes | Immutable | Workspace | Text capacity | Delta |
| -------------------------- | -------------: | ---------: | --------: | --------: | ------------: | ----: |
| Frozen production baseline |          2,869 |      2,682 |       184 |       292 |        47,104 |     0 |
| Single replacement         |          3,106 |      2,900 |       203 |       292 |        47,104 |  +237 |
| Bounded replace-all        |          3,286 |      3,080 |       203 |       300 |        47,104 |  +417 |
| Compressed production      |          3,003 |      2,798 |       202 |       292 |        47,104 |  +134 |

Single replacement is 180 resident bytes smaller than replace-all and uses
eight fewer workspace bytes. It is therefore the selected production scope
under the settled rule. Its 237-byte correctness delta supplied the baseline
for integration and feature-only compression. The retained production path
costs 134 bytes.

## Candidate behaviour

Both candidates require the committed query to match at the current cursor
before displaying `Replace: `. Return accepts an empty replacement, Escape
cancels, Backspace and Delete remove the final staged byte, and Tab is stored as
`$09` while the prompt displays `>`. The staged literal is bounded at 64 bytes.
Unsupported controls, deletion from an empty literal, and a sixty-fifth byte
ring without changing the staged value.

The single candidate performs one replacement and leaves the cursor at its
start. Growth opens a checked gap after the matched span; shrinkage deletes the
excess span; equal-length replacement writes in place. Every successful path
sets dirty state, clears desired-column state, retains the committed query, and
reports `Replaced`. A byte-identical replacement still sets dirty state.

The larger candidate accepts Ctrl-A in place of Return. It first counts
nonoverlapping matches and computes the final length without changing the text.
Mutation consumes exactly that count, skips inserted replacement bytes, and
revisits the same offset after deletion. The candidate uses four additional
words for the remaining count, scan offset, final cursor, and projected length.

## Executed evidence

The candidate proof covers missing query, mismatch, a partial match at EOF,
attempted matches across LF and CRLF, cancellation, insertion at the start and
end, growth, shrinkage, deletion, equal-length and byte-identical replacement,
tabs, unsupported controls, a 64-byte replacement, exact text capacity, the
first rejected growth, retained query state, repeated replacement after
repeat-search, stack shape, and workspace canaries.

Replace-all additionally covers ordinary multiple matches, overlapping
candidates, replacement text containing the query, adjacent deletions,
LF/CRLF/tab text, exact final capacity, and atomic rejection when aggregate
growth first exceeds capacity. The rejection proof compares the complete text
arena and every persistent state byte before and after the command, except for
the required `Full` status.

| Complete path                  | Instructions |   T-states | Maximum stack |
| ------------------------------ | -----------: | ---------: | ------------: |
| Single growth                  |        8,758 |     98,335 |      22 bytes |
| Single shrinkage               |        4,430 |     49,655 |      22 bytes |
| Single deletion                |        2,252 |     25,211 |      22 bytes |
| Single rejected growth         |        6,545 |     73,434 |      22 bytes |
| Replace-all, three matches     |        9,252 |    103,166 |      22 bytes |
| Replace-all aggregate overflow |    1,419,670 | 15,335,102 |      22 bytes |

The counts include prompt rendering and every executed Z80 instruction around
fake BDOS console calls. Host-side terminal work is excluded. The long
replace-all overflow case scans a nearly full 47,104-byte buffer during its
mandatory atomic preflight.

## Production integration and compression

The correctness implementation assembled to the measured 3,106-byte single
candidate. The focused pass removed 102 code bytes and one immutable byte,
producing a 3,003-byte `EDIT.COM`: a three-byte entry jump, 2,798 code bytes,
and 202 immutable bytes. Fixed workspace remains 292 bytes, text capacity
remains 47,104 bytes, and the code-and-data partition retains 4,421 free bytes.
The artifact SHA-256 is
`bbe4ac2b6236d178089fcd01822d0d7fa3c6159f0d2da3655eba1212dda5aa02`.

The retained code shares one exact-match routine between forward search and
replacement, reuses the established no-query and not-found tails, and routes
replacement cancellation through the ordinary ready return. Growth and
shrinkage now operate at the replacement start, so they no longer move the
cursor around the buffer primitive. The status update shares the adjacent
flags and status fields, prompt rendering reloads its recorded input pointer,
and the replacement status terminator shares the default FCB's leading zero.
None of these changes moves bytes into workspace, the text arena, the private
stack partition, runtime code, or the disk adapter.

The compressed production paths measure:

| Complete path         | Instructions | T-states | Maximum stack |
| --------------------- | -----------: | -------: | ------------: |
| Growth                |        8,730 |   98,091 |      20 bytes |
| Shrinkage             |        4,409 |   49,475 |      20 bytes |
| Deletion              |        2,233 |   25,024 |      20 bytes |
| Equal-length          |       10,878 |  122,072 |      20 bytes |
| Exact-capacity growth |        6,563 |   73,658 |      20 bytes |
| Rejected first growth |        6,520 |   73,199 |      20 bytes |

The complete entry workflow reaches 24 bytes of private-stack use while
rendering and executing replacement. The partition still reserves 3,072
bytes.

The final production proof passes strict AZM register contracts, all isolated
editor cases, the complete headless CP/M acceptance, and the VS Code 1.134.0
Extension Development Host workflow. The host workflow enters `sub` through
Ctrl-F, replaces it with `SUB` through Ctrl-R, saves the edited source, and
checks the guest file through `TYPE INPUT.NU`.

## Selection

Single replacement is retained in production. It adds 116 code bytes and 18
immutable bytes to the 2,869-byte editor, with no workspace, text-capacity,
runtime, or partition change. Replace-all remains a measured rejected design
unless a future requirement justifies the candidate's additional 180 resident
bytes, eight workspace bytes, and full-buffer preflight cost.
