# Book One coverage matrix

Maintenance tool, not book content. Each row connects a language feature
to the Book One chapter that teaches it, the companion listing that
exercises it, and the conformance fixture family it feeds. When a chapter
gains a feature, this file gains a row; when a listing changes, its rows
are rechecked. The companion listings are intended to become compiler test
programs, so a feature taught but not exercised is a gap.

| Feature | Chapter | Companion listing | Conformance family |
| ------- | ------- | ----------------- | ------------------ |
| module vars, assignment, entry | 1 | 01-first-program | Counter |
| integer types, literals, const, boolean, char | 2 | 02-scalar-values | Counter, numeric vectors |
| capability import (wide32) | 2, 3 | 02-scalar-values | E-CAP-001 vectors |
| arithmetic, result widths, conversions | 3 | 03-expressions | Skyfall/Rushlight numeric |
| abs, sqrt | 3 | 03-expressions | numeric vectors |
| comparisons, short-circuit, masks | 4 | 04-comparisons | numeric vectors |
| enum, range, if/else if, select, case ranges | 5 | 05-decisions | Ordinal domains |
| counted loops, step, while, exit | 6 | 06-loops | loop vectors |
| continue, nested loops | 6 | 06-loops (sumOdds, findInGrid) | loop vectors |
| for each | 7 | — (prose only) | traversal vectors — GAP |
| arrays, index domains, bounds, initializers, clear/fill | 7 | 07-fixed-arrays | Trail, layout vectors |
| counted strings, append, comparison | 8 | 08-strings | Text |
| long-strings capability | 8 | — (prose only) | E-CAP-001 — GAP |
| records, nesting, layout queries, aggregate copy | 9 | 09-records | Pacmo, layout vectors |
| parameters, results, locals, aggregate params | 10 | 10-routines | Tetro collision |
| forward sub, mutual calls | 10 | 10-routines (updatePlayer pair) | E-FORWARD fixtures |
| alias, index identity, selector select | 11 | 11-selecting-storage | Tetro collapse |
| modules, import, export, privacy | 12 | 12-counters + 12-tally | module vectors |
| standard text I/O, five operations | 13 | 13-portable-text | Standard text I/O |
| error set, fails, fail, on error | 14 | 14-number-entry | Error handling (program 14) |
| or fail, defaults, defer | 15 | 15-number-entry | Error handling (program 14) |
| extern sub, at, from, module asm | 16 | 16-console | native-boundary vectors |
| statement asm, near param, opaque address | 16 | 16-report, 16-console | native-boundary vectors |
| placement `at` for storage | 16 | — (prose only) | placement vectors — GAP |

Known gaps are marked; they are acceptable while the listing stays a
teaching artifact, and must close before a listing is promoted to a
conformance fixture.
