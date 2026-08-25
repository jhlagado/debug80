# Native CP/M editor search measurement

Status: selected design evidence

Date: 2026-08-26

## Baseline and boundary

The measurement uses pushed Debug80
`f0ca7ae2196e02123382d23de189e8b6a45c7264`, AZM 0.3.9 in strict
register-contract mode, and Debug80's Z80 runtime. The production editor source
is unchanged from the frozen search baseline at
`141bb0b112367d18260ac8d89a7cf095a203d5c7`:

| Baseline account        |  Bytes |
| ----------------------- | -----: |
| Entry jump              |      3 |
| Code                    |  2,356 |
| Immutable data          |    145 |
| Complete `EDIT.COM`     |  2,504 |
| Fixed workspace         |    228 |
| Code-partition headroom |  4,920 |
| Retained text capacity  | 47,104 |

`npm run measure:cpm22-editor-search` assembles executable versions of all
three query-storage designs and both scan designs. Each complete storage
candidate contains its candidate-specific begin, accept, and cancel path plus
the same key classifier, query editing, prompt-cell rendering, bounded literal
scan, statuses, bell paths, and reset. Existing editor key input, terminal byte
output, ordinary full-screen rendering, and viewport repair are common
production code and remain outside this comparison.

The proof invokes every candidate in the Z80 runtime and observes the final
return PC, SP, exact query and text bytes, prompt cells and attributes, cursor,
status, bell count, instructions, and T-states. The prototypes contain no new
runtime support or generated output.

## Query storage

| Candidate                        | Executable | Immutable | Complete | New workspace | Existing DMA overlay | Maximum local stack |
| -------------------------------- | ---------: | --------: | -------: | ------------: | -------------------: | ------------------: |
| Dedicated committed and staging  |        406 |         6 |      412 |           130 |                    0 |                   4 |
| DMA staging, dedicated committed |        406 |         6 |      412 |            65 |                   65 |                   4 |
| Active committed, DMA rollback   |        406 |         6 |      412 |            65 |                   65 |                   4 |

The candidate-specific storage path is 20 executable bytes in every case. The
other 386 executable bytes and six immutable `Find: ` bytes are identical.
Dedicated staging therefore has no resident-code advantage and consumes twice
the new workspace.

The two DMA forms are safe under the settled editor lifecycle. Load completes
before interactive input begins. Query entry performs no BDOS operation. A
cancelled query restores the snapshot before ordinary input resumes, while an
accepted query leaves the committed bytes outside DMA. The next save may then
reuse all 128 DMA bytes without affecting the committed query.

| Operation                    |  Dedicated or DMA staging | Active committed with DMA rollback |
| ---------------------------- | ------------------------: | ---------------------------------: |
| Begin query entry            |  7 instructions / 1,414 T |           7 instructions / 1,414 T |
| Accept edited nonempty query | 18 instructions / 1,509 T |            13 instructions / 109 T |
| Cancel edited query          |     8 instructions / 71 T |          13 instructions / 1,471 T |
| Accept byte 64               |   32 instructions / 244 T |            32 instructions / 244 T |
| Reject byte 65 and ring      |   26 instructions / 229 T |            26 instructions / 229 T |

The rollback form moves the fixed copy from successful acceptance to
cancellation. Both paths already pay the entry snapshot. Successful searches
are expected to outnumber cancellations, and code plus workspace remain tied,
so the rollback form is retained.

## Bounded scan

Two scans implement the same visit order. The endpoint form records the
starting offset and treats the pre-wrap and post-wrap ranges separately. The
counted form records the number of untested candidate starts and decrements it
after every failed candidate. Both normalize an initial offset at EOF to zero,
track whether wrapping occurred, reject a match extending beyond physical EOF,
and stop after one ring.

| Operation                     |                  Two-segment endpoint |                          Counted ring |
| ----------------------------- | ------------------------------------: | ------------------------------------: |
| Scan code                     |                             190 bytes |                             183 bytes |
| Immediate match at byte zero  |               70 instructions / 705 T |               66 instructions / 655 T |
| Overlapping repeat            |            103 instructions / 1,065 T |            104 instructions / 1,071 T |
| Representative wrapped match  |            141 instructions / 1,441 T |            136 instructions / 1,388 T |
| Representative complete miss  |            336 instructions / 3,650 T |            363 instructions / 3,993 T |
| 64-byte exact match           |            437 instructions / 3,396 T |            433 instructions / 3,346 T |
| Full 47,104-byte miss         | 1,578,029 instructions / 17,287,648 T | 1,789,983 instructions / 19,878,215 T |
| Match at final full-file byte | 1,554,458 instructions / 17,240,322 T | 1,789,969 instructions / 19,878,040 T |

The counted ring saves seven executable bytes. Its full-file miss costs
2,590,567 additional T-states, about 0.65 seconds at 4 MHz. The editor's compact
resident account takes precedence over that bounded worst-case difference, so
the counted ring is retained.

## Proof coverage

The executable comparison proves empty, retained, replaced, and cancelled
queries; byte 64 and the rejected byte 65; empty deletion; unsupported control
input; printable and tab storage; and empty Return. Prompt proofs compare all
80 cells and attributes for empty, tabbed, and 64-byte queries, including the
cursor at columns 7, 10, and 71 in one-based terminal coordinates.

Search proofs cover byte zero, the current byte, overlapping matches, one
match found again after a complete ring, LF, CRLF, tab, the final complete
candidate, a query longer than the suffix, an empty file, a 64-byte match, no
cross-wrap match, a complete 47,104-byte miss, and a final-byte match in the
full arena. Failure preserves the original cursor and text. Reset clears the
committed length, cursor, status, and bell state. Every public return restores
the exact stack shape.

## Selection

Production integration will use the active committed buffer with a 65-byte DMA
rollback snapshot and the 183-byte counted-ring scan. The complete isolated
candidate is 406 executable bytes plus six immutable bytes, with 65 new
workspace bytes and no runtime or text-capacity cost. This isolated figure is
not the eventual feature delta: integration can share existing input, bell,
status, render, cursor, and scratch paths. The assembled production delta will
be measured separately after correctness is green.
