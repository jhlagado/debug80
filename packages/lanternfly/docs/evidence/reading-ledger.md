# Lanternfly source reading ledger

This ledger records the sources used to develop the Lanternfly language design. A
source is marked complete only after it has been read from beginning to end.
Search results and excerpts do not count as complete reading.

## Source baselines

| Source                       | Baseline                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| Debug80 monorepo             | commit `b8a152010b005aa618e8c0de75f25faf76b4c653`, Glimmer 0.6.2, AZM 0.3.8 |
| Debug80 documentation        | commit `524bf2226bd4a4674273680d992781894ae68a3b`                           |
| ZAX current main             | commit `8b7d4a9f714196d5d1ed8fdda0a91e731a091251`                           |
| ZAX exact-size lowering line | commit `e40b75a21edda2a039430d11f36e6ba6aada3afb`                           |
| TETRO production repository  | commit `53ef6e0648a7a95a2a038a0f6f40ab94d8831a41`                           |

The Debug80 documentation, ZAX and TETRO checkouts were clean when their
studies began. The Debug80 monorepo contained only the uncommitted Lanternfly package
and its root README and lockfile registration.

## Glimmer Books

Reading order follows the published book order.

### Shared entry and reference

| Source                                                  | Lines | Status   |
| ------------------------------------------------------- | ----: | -------- |
| `glimmer-book/index.md`                                 |    23 | complete |
| `glimmer-book/appendices/index.md`                      |    20 | complete |
| `glimmer-book/appendices/appendix-a-declarations.md`    |   530 | complete |
| `glimmer-book/appendices/appendix-b-matrix-profile.md`  |   287 | complete |
| `glimmer-book/appendices/appendix-c-tms9918-profile.md` |   243 | complete |
| `glimmer-book/appendices/appendix-d-build-and-debug.md` |   242 | complete |
| `glimmer-book/appendices/appendix-e-azm-touchpoints.md` |   269 | complete |

### Book 1

| Source                                         | Lines | Status   |
| ---------------------------------------------- | ----: | -------- |
| `book1/index.md`                               |    47 | complete |
| `book1/01-the-shape-of-a-game.md`              |   430 | complete |
| `book1/02-first-light.md`                      |   247 | complete |
| `book1/03-state.md`                            |   261 | complete |
| `book1/04-pulses-and-bindings.md`              |   251 | complete |
| `book1/05-compute-effect-render.md`            |   276 | complete |
| `book1/06-the-matrix-profile.md`               |   421 | complete |
| `book1/07-time.md`                             |   521 | complete |
| `book1/08-motion-curves.md`                    |   393 | complete |
| `book1/09-shapes-sound-and-displays.md`        |   413 | complete |
| `book1/10-arrays-and-layout-types.md`          |   413 | complete |
| `book1/11-dependency-reports-and-debugging.md` |   385 | complete |
| `book1/12-routines-parts-and-imports.md`       |   413 | complete |
| `book1/13-cards.md`                            |   534 | complete |
| `book1/exercise-notes.md`                      |   105 | complete |

### Book 2

| Source                                  | Lines | Status   |
| --------------------------------------- | ----: | -------- |
| `book2/index.md`                        |    34 | complete |
| `book2/01-building-skyfall.md`          |   565 | complete |
| `book2/02-reading-tetro.md`             |   520 | complete |
| `book2/03-the-tms9918-profile.md`       |   521 | complete |
| `book2/04-building-rushlight.md`        |   581 | complete |
| `book2/05-two-displays-one-language.md` |   260 | complete |
| `book2/exercise-notes.md`               |    44 | complete |

## Glimmer examples and book programs

| Source group                              |                                                                                                                    Approximate lines | Status   |
| ----------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------: | -------- |
| Monorepo `.glim` examples                 |                                                                                                                                1,286 | complete |
| Monorepo native example libraries         |                                                                                                                                  578 | complete |
| Checked-in `counter.main.asm`             |                                                                                                                                  178 | complete |
| Book 2 Skyfall source                     |                                                                                                                                  232 | complete |
| Book 2 Rushlight source                   |                                                                                                                                  380 | complete |
| Generated AZM for representative examples | 4,281 generated lines; structural/body/resource/profile regions analysed, shared runtime regions deduplicated against the appendices | complete |

The example pass read each multi-file program in declaration and inclusion
order rather than alphabetical file order.

### Monorepo program checklist

| Program source                                               | Lines | Status   |
| ------------------------------------------------------------ | ----: | -------- |
| `examples/counter.glim`                                      |    55 | complete |
| `examples/dot.glim`                                          |    87 | complete |
| `examples/slide.glim`                                        |    99 | complete |
| `examples/trail.glim` + `trail-blocks.glim`                  |   120 | complete |
| `examples/snake.glim` + `snake-rules.glim` + `snake-lib.asm` |   350 | complete |
| `examples/sprite-chase.glim`                                 |   230 | complete |
| `examples/tetro.glim` + `tetro-rules.glim` + `tetro-lib.asm` |   923 | complete |
| Book 2 `skyfall.glim` + `skyfall-rules.glim`                 |   232 | complete |
| Book 2 `rushlight.glim`                                      |   380 | complete |

## Historical Glimmer corpus

| Source group                                 | Approximate lines | Status   |
| -------------------------------------------- | ----------------: | -------- |
| Corpus overview and TEC-1G Game Suite README |               220 | complete |
| Shared TEC-1G assembly                       |               606 | complete |
| Tetro assembly                               |             2,093 | complete |
| Pacmo assembly                               |             2,749 | complete |
| TMS9918 reference assembly                   |               870 | complete |
| Shared, Tetro, and Pacmo codebase tours      |             1,423 | complete |

The historical assembly corpus supplies comparison evidence. Current Glimmer
examples and book programs remain the primary evidence for Lanternfly's intended
body language.

## Glimmer implementation documentation

| Source group                                | Status   |
| ------------------------------------------- | -------- |
| Language foundation and roadmap             | complete |
| Grammar reference                           | complete |
| User manual                                 | complete |
| Compiler pipeline documentation             | complete |
| Relevant parser, generator, and build tests | complete |

Implementation tests were read after the books and programs established the
user-visible model.

## AZM and ZAX

| Source group                                                                         | Status                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Current AZM grammar and declaration/routine reference                                | complete                                     |
| Current AZM layout and operation behaviour used by Glimmer                           | complete                                     |
| AZM Book 1, chapters 1–8 and index                                                   | complete; 2,618 lines                        |
| AZM Book 2, chapters 1–11, exercises and index                                       | complete; 3,151 lines                        |
| AZM Book 3, introduction, chapters 1–9, exercises and index                          | complete; 3,309 lines                        |
| AZM Book 3, examples 1–9 and string library                                          | complete; 1,083 lines                        |
| ZAX book chapters on functions, arrays, records, aliases, references, and addressing | complete; relevant claims verified           |
| ZAX current specification and implementation                                         | complete; relevant claims verified           |
| ZAX exact-size design and lowering line                                              | complete; relevant commit and tests verified |

The AZM book pass covered 10,161 lines. Book 3 and its examples were read in
published order after Books 1 and 2 established the assembler and machine
model.

## Current TETRO and PACMO production source

| Source group                                  | Lines | Status   |
| --------------------------------------------- | ----: | -------- |
| Shared, TETRO and PACMO codebase guides       | 1,128 | complete |
| Shared production assembly used by both games |   582 | complete |
| TETRO production assembly in inclusion order  | 2,120 | complete |
| PACMO production assembly in inclusion order  | 2,682 | complete |

The 6,512-line pass used the clean sibling TETRO checkout recorded in the
baseline table. Hardware smoke and duty-cycle test programs were outside the
requested native game implementation scope. The current source cross-checks
the earlier historical-corpus findings rather than counting as a new language
corpus.

## Lanternfly deliverables

The assembled document set received two final passes on 2026-07-29:

| Deliverable group                                  | Technical evidence pass | Sentence deletion and voice pass |
| -------------------------------------------------- | ----------------------- | -------------------------------- |
| Charter, package entry points and research record  | complete                | complete                         |
| Design book, chapters 1–10                         | complete                | complete                         |
| Working language specification                     | complete                | complete                         |
| Lowering, backend and runtime contract             | complete                | complete                         |
| Evidence dossiers, matrix and integration analyses | complete                | complete                         |

The technical pass reconciled numeric promotion and narrowing, truth values,
exact aggregate layout, alias/reference behaviour, bounds, body completion,
near/far/device addressing and backend responsibilities across the documents.
The prose pass removed repeated setup, question-shaped placeholders and
sentences that did not change a rule, example or inference.
