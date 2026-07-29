# Corpus feature matrix

This matrix condenses the full dossiers in
[glimmer-corpus-analysis.md](glimmer-corpus-analysis.md). A mark means the
program contains a real use, not merely that the feature would be convenient.

## Current Glimmer and book programs

| Program      | Scalar arithmetic | Conditions      | Counted loop      | Conditional loop | Arrays              | Records/fields       | References/aliases                  | Width-sensitive case  | Platform calls     |
| ------------ | ----------------- | --------------- | ----------------- | ---------------- | ------------------- | -------------------- | ----------------------------------- | --------------------- | ------------------ |
| Counter      | yes               | yes             | —                 | —                | —                   | —                    | —                                   | byte store            | character output   |
| Dot          | yes               | yes             | —                 | —                | —                   | —                    | resource handle                     | byte coordinates      | framebuffer        |
| Slide        | yes               | yes             | —                 | —                | generated curve     | —                    | shape resource                      | numeric truth         | sound/shape        |
| Trail        | yes               | yes             | yes               | —                | trail rows          | framebuffer row      | —                                   | masks                 | framebuffer        |
| Snake        | yes               | yes             | yes               | yes              | 64-byte ring        | —                    | —                                   | modular masks         | random/framebuffer |
| Sprite Chase | yes               | priority ladder | —                 | —                | generated resources | —                    | handles                             | signed difference     | sprite/tile        |
| Tetro rules  | yes               | yes             | small loops       | —                | resource tables     | framebuffer          | selected piece ref                  | signed candidate      | sound/random       |
| Tetro engine | yes               | yes             | nested/descending | yes              | planes/tables       | exact rows           | arrays of refs, alias params/locals | signed y, word tables | framebuffer        |
| Skyfall      | yes               | yes             | —                 | —                | —                   | —                    | —                                   | byte wrap             | sprite             |
| Rushlight    | div/mod           | yes             | yes               | —                | name shadow         | sprite/resource data | handles                             | widened `ABS`         | TMS9918            |

## Historical comparison corpus

| Program/group             | Fixed aggregate model                           | Important access form                                          | Native boundary               |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------------- | ----------------------------- |
| TEC-1G shared             | exact framebuffer rows, LCD scripts             | row records; sentinel `(row, textRef)` entries                 | ports, ROM, fixed scan timing |
| historical Tetro          | four byte planes and piece tables               | array of plane refs; signed spawn y=-3                         | scan/input/sound              |
| Pacmo                     | `Monster[3]`, packed 15-row maps, point tables  | six-byte record indexing; reference identity; packed row masks | scan/input/LCD/sound          |
| TMS9918 sanity/video/demo | fixed pattern, colour, sprite and motion tables | word VRAM offsets; lookup tables; phase-bank indexing          | VDP port streaming            |

## Required versus deferred

| Facility                              | Evidence                                  | Initial status                         |
| ------------------------------------- | ----------------------------------------- | -------------------------------------- |
| signed and unsigned 8/16-bit integers | all games; Tetro -3; masks                | required                               |
| signed/unsigned 32-bit integers       | products, scores, future address range    | required language types; helper-backed |
| floating point                        | no corpus use                             | deferred                               |
| unified `AND`/`OR`/`NOT`; `XOR`       | masks, flags, compound conditions         | required                               |
| shifts                                | Snake packing, Tetro masks, Pacmo windows | required                               |
| `/`, `MOD`                            | Rushlight and coordinate splitting        | required                               |
| exact arrays and records              | Trail, Tetro, Pacmo, TMS9918              | required                               |
| non-power-of-two runtime stride       | Pacmo `Monster` size 6                    | required                               |
| multidimensional indexing             | Tetro resources, name shadow              | required language meaning              |
| aggregate local aliases               | Tetro `CollapseRow`                       | required by structured engine stage    |
| arrays of references                  | Tetro board planes/rotations              | required                               |
| scalar locals/arguments               | Snake, Tetro, Pacmo clarity               | required by routine stage              |
| aggregate reference parameters        | Tetro helpers, Pacmo monster routines     | required by routine stage              |
| heap allocation                       | no use                                    | excluded initially                     |
| recursion                             | no game use                               | target capability/deferred             |
| device address type                   | TMS9918 VRAM                              | required platform type                 |
| far references                        | TEC-1G banked direction, future targets   | specified early; implemented later     |
| unrestricted pointer arithmetic       | no use                                    | excluded initially                     |

## Address shapes observed

The corpus uses a bounded family of address calculations:

1. scalar global: `Count`;
2. array plus runtime index: `Body[index]`;
3. array plus runtime index and field: `Monsters[index].timer`;
4. record-array plus one index: `Framebuffer[row].green`;
5. two-dimensional array: `ShapeRight[piece, rotation]`;
6. array of references then array index: `BoardPlanes[p][row]`;
7. local alias then index: `plane[row]`;
8. packed row selected by index, then shifts/masks;
9. opaque device address plus constant/dynamic offset passed to a service.

No source algorithm requires an address expression with an unbounded number of
independent terms. Supporting two dynamic indices plus staging covers the
observed programs.

## Control shapes observed

- simple `IF`;
- `IF`/`ELSEIF` priority ladders;
- counted ascending loops;
- counted descending loops;
- loops that repeat the same index after mutation;
- table walks terminated by a known count or sentinel;
- early procedure/function exit;
- selection over a small direction/state value.

No irreducible cross-routine jump or exception path appears.

## Native code that remains

The residual native set is consistent across the corpus:

- machine entry and stack setup;
- direct port and firmware calls;
- fixed-dwell or cycle-sensitive display scanning;
- substrate ABI adapters;
- target-specific bulk transfer until a backend service covers it;
- intentionally tuned code.

This boundary supports a small Lanternfly core without pretending all systems work is
portable.
