# CP/M editor literal-replacement design measurement

Date: 2026-08-26

Status: single replacement selected for production

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
[`measure-editor-replace.mjs`](../../scripts/cpm22/measure-editor-replace.mjs).

## Result

| Candidate                  | Complete bytes | Code bytes | Immutable | Workspace | Text capacity | Delta |
| -------------------------- | -------------: | ---------: | --------: | --------: | ------------: | ----: |
| Frozen production baseline |          2,869 |      2,682 |       184 |       292 |        47,104 |     0 |
| Single replacement         |          3,106 |      2,900 |       203 |       292 |        47,104 |  +237 |
| Bounded replace-all        |          3,286 |      3,080 |       203 |       300 |        47,104 |  +417 |

Single replacement is 180 resident bytes smaller than replace-all and uses
eight fewer workspace bytes. It is therefore the selected production scope
under the settled rule. The measurement is a correctness build; its 237-byte
delta is the starting point for integration and feature-only compression, not
the final feature cost.

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

## Selection

Retain single replacement. Production integration must preserve the measured
zero workspace delta and full text capacity, then run the complete editor proof,
headless CP/M acceptance, Extension Host workflow, save-and-reload cases, and a
feature-only size pass. Replace-all remains a measured rejected design unless a
future requirement justifies its additional 180 resident bytes, eight workspace
bytes, and full-buffer preflight cost.
