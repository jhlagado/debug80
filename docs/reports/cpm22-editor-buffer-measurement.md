# Native CP/M editor buffer measurement

> Historical design record: Edit source, measurements, and executable proofs now live in the standalone [`jhlagado/edit`](https://github.com/jhlagado/edit/tree/v0.1.0) repository. Debug80 consumes its pinned `EDIT.COM`; commands and paths below describe the pre-extraction implementation.

Status: selected design evidence

Date: 2026-08-26

## Baseline and boundary

The measurement uses Debug80
`bb47a29549dd9a942258cba926f0977ea381112d` with AZM 0.3.9 in strict
register-contract mode and Debug80's Z80 runtime. The proposed editor contract
fixes a 512-byte workspace, a 47,104-byte text arena at `$2000..$D7FF`, and a
3,072-byte stack. The prototypes contain no immutable data, runtime support,
generated output, or disk adapter.

`npm run measure:cpm22-editor` strictly assembles both executable candidates,
checks their final SP, reconstructs their exact logical bytes after every edit,
and executes empty, 95-byte representative, nearly full, and full workloads.
The script also proves byte mapping across both sides of the gap and exact
previous-line and next-line lookup.

## Resident accounts

| Candidate           | Representation code | Shared scan code | Complete code | Workspace | Text capacity |
| ------------------- | ------------------: | ---------------: | ------------: | --------: | ------------: |
| Contiguous sequence |                 216 |               63 |           279 |         6 |        47,104 |
| Movable gap         |                 230 |               63 |           293 |         7 |        47,104 |

The shared 63-byte suffix implements line-start lookup, next-line lookup, and
logical traversal through the same candidate interface. Both artifacts use the
same fixed TPA partition. The contiguous scans require at most four bytes of
local stack beneath the public return address; the gap scans require six.

A full per-line descriptor representation cannot fit the partition. LF-only
content can contain 47,105 logical lines, so two-byte line-start descriptors
require at least 94,210 bytes. That exceeds the complete fixed workspace by
93,698 bytes and would consume more than the entire text arena if stored there.
This is a measured capacity rejection; no executable descriptor candidate can
preserve the contracted 47,104 text bytes.

## Representative execution

The counts below include the called routine through its `RET`. AZM block
instructions are one runtime step with their complete repeated T-state cost.

| Operation                          | Contiguous instructions | Contiguous T-states | Gap instructions | Gap T-states |
| ---------------------------------- | ----------------------: | ------------------: | ---------------: | -----------: |
| Load 95 bytes                      |                       5 |                  56 |               19 |        2,165 |
| Load 47,104 bytes                  |                       5 |                  56 |               19 |      989,354 |
| Insert at middle of 95 bytes       |                      35 |               1,344 |               12 |          126 |
| Insert at middle of 47,103 bytes   |                      35 |             494,928 |               12 |          126 |
| Insert at start of 47,103 bytes    |                      35 |             989,499 |               12 |          126 |
| Delete at middle of 47,104 bytes   |                      28 |             494,825 |               10 |           99 |
| Delete at start of 47,104 bytes    |                      28 |             989,417 |               10 |           99 |
| Traverse 47,104 bytes              |                 942,095 |           9,232,549 |        1,978,395 |   20,019,479 |
| Reject insertion into a full arena |                       9 |                  97 |                9 |          102 |

Both candidates preserve all bytes and fail atomically at capacity. The gap
removes the buffer-length term from insertion and deletion, but it adds 14 code
bytes, one workspace byte, a one-time load move, and an extra address mapping on
every rendered or saved byte. A full contiguous shift costs less than 0.25
seconds at 4 MHz, while representative source edits are much smaller. Full
traversal is also 10,786,930 T-states cheaper with the contiguous sequence.

## Selection

The first editor retains the contiguous sequence. It is the smallest complete
candidate, has the smallest workspace, accepts the full contracted capacity,
loads without relocating text, and supplies the cheaper full-screen and save
traversal. The worst-case shift remains bounded and its measured latency is
acceptable for the first vertical slice. The movable gap remains a measured
alternative if later sustained editing workloads demonstrate that subsecond
worst-case insertion matters more than the complete resident and traversal
accounts.
