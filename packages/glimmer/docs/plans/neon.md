# Neon

Status: architecture decision and implementation plan, 2026-08-18.

## Decision

Build **Neon** as the Atom-native successor to Glimmer in the Debug80 monorepo.
The package is `@jhlagado/neon`, the command and Debug80 backend ID are `neon`,
and the canonical source extension is `.neon`. Generated and imported assembly
continues to use `.asm`.

The name connects the two systems: excited neon atoms emit visible photons as
their electrons return to lower energy levels. Neon retains Glimmer's reactive
language and runtime semantics while replacing its AZM-shaped generation
pipeline.

The npm registry check on 2026-08-18 found `@jhlagado/neon` unregistered. The
unscoped `neon` package belongs to another project, so publication must retain
the `@jhlagado` scope. The scoped package can still install the `neon` command.

The current `@jhlagado/glimmer` package remains the working AZM implementation
and migration oracle. Existing `.glim` projects continue to use it. Neon source
uses `.neon`, which lets both systems coexist without an assembler override or
an ambiguous extension.

This is a package fork, not a repository fork. The Debug80 monorepo is where
Glimmer, Debug80, the headless runtime, and the assembler integrations already
meet. Keeping both implementations there makes differential tests and eventual
code sharing straightforward.

## Reason for a separate implementation

The reusable part of Glimmer ends at its checked program model. Its generator
is deliberately AZM-shaped:

- block bodies are defined as byte-for-byte verbatim AZM;
- generated files use `.type`, `.typealias`, `.enum`, `.op`, `.routine`,
  `.contracts`, and `.import`;
- generated and user names routinely exceed Atom's eight-character limit;
- underscore labels depend on AZM's owner-local scope;
- TMS9918 and LCD conveniences are AZM operations expanded by the assembler;
- layout expressions such as `sizeof`, `offset`, and `Card.GameOver` are left
  for AZM to resolve; and
- the source map relies on finding an entry label and matching the following
  body text exactly.

Putting an `assembler: "atom"` branch through that generator would leave AZM
concepts scattered through every profile. It would also preserve the weakest
part of the current D8 design: source attribution depends on emitted text
remaining verbatim. Atom needs token-aware name rewriting and sometimes emits
several instructions for one Neon body line, so the old label-and-text
heuristic cannot remain the mapping contract.

The language front end is still valuable. Parsing, whole-program validation,
the reactive graph, phase ordering, cards, timers, ramps, resources, and the
profile model describe the shared language rather than AZM. Common code can be
extracted after the Neon backend exposes the right seam.

## Package shape

The first implementation uses these boundaries:

```text
packages/glimmer                 existing AZM implementation and oracle
packages/neon                    Atom-native Neon implementation
packages/neon/src
    frontend/                    copied front end, changed only when Atom needs it
    lowering/                    layouts, names, body lowering, profiles
    provenance/                  source spans and generated-line origins
    build/                       Atom invocation, artifacts, D8 composition
```

Copying the front end initially is intentional. Extracting a shared package
before the Atom lowering exists would freeze today's AZM-shaped model as the
common abstraction. Once both implementations pass the same language fixtures,
move the genuinely common parser and semantic model into
`@jhlagado/neon-core`. The two packages should then depend on that core,
rather than on each other.

The copied front end gains precise source spans. Every declaration, field,
resource row, block clause, and body line needs a logical file, line, and column.
The existing model stores enough information for its body-only map rewrite, but
not enough for an Atom-native map of generated data and expanded body lines.

## Public surfaces

During migration the package exports:

```ts
generateAtom(program, options) -> {
  parts,
  provenance,
  names,
  diagnostics
}

buildNeonProgram(entryPath, options) -> {
  diagnostics,
  warnings,
  artifacts,
  mappedSegments,
  generatedParts
}
```

The `neon` CLI supports the same useful modes as the current Glimmer command:

```text
neon generate entry.neon
neon check entry.neon
neon build entry.neon
neon deps entry.neon
```

`generate` writes readable Atom `.asm`. `check` assembles without publishing a
generation. `build` publishes NOBJ, BIN, Intel HEX, listing, D8, and the name
ledger. `deps` remains assembler-independent.

Neon retains its own package, command, backend ID, and `.neon` extension after
migration. The existing Glimmer names continue to identify the AZM compiler
during the compatibility period. All generated or imported assembly remains
`.asm`.

## The lowering pipeline

```text
.neon entry and parts
        |
        v
parse, merge, validate, schedule
        |
        v
checked Neon program + source spans
        |
        +--> layout evaluator
        +--> exact Atom name allocator
        +--> body tokenizer and intrinsic expander
        +--> Atom profile/runtime emitter
        |
        v
ordered generated and imported .asm parts
        |
        v
Atom host API
        |
        v
NOBJ / BIN / HEX / listing / native Atom D8
        |
        v
Neon D8 composition
```

The generated assembly is a real build artifact. It is not hidden in a
temporary buffer: generated runtime glue remains a useful place to step when a
program leaves its Neon body. The build API may pass the same bytes directly
to Atom, but it writes each generated part at a stable path before publishing
the final artifacts.

The preferred Atom boundary is an in-memory prepared-project API: ordered
parts with logical identities, original bytes, and compiler bytes. Until Atom
exposes a higher-level name for that boundary, `assembleResolvedAtomProject`
provides the required semantics. Neon must not construct native Z80
descriptors or call internal sink hooks itself.

## Atom assembly dialect inside a Neon body

The lasting body contract is no longer “verbatim AZM.” It is:

> A block body is core Atom assembly plus Neon intrinsics. The host lowers
> names, layout expressions, private labels, and intrinsics before Atom sees it.

The lowerer is token-aware. It does not replace text inside strings or comments,
and it reports the original `.neon` position for every unsupported construct.
It performs these translations:

| Neon body form                                          | Atom output                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `_done`                                                 | an exact owner-private `.DONE` name, shortened when necessary |
| long state, pulse, routine, resource, or generated name | allocated exact Atom name                                     |
| `Card.GameOver`                                         | allocated card-value constant                                 |
| `sizeof(Piece)`                                         | host-computed integer or allocated `EQU`                      |
| `offset(Point, y)`                                      | host-computed integer or allocated `EQU`                      |
| `sprite_at Player, PlayerX, PlayerY`                    | explicit Atom instruction sequence                            |
| `tile_at Pip, 4, 0`                                     | explicit Atom instruction sequence                            |
| `lcd_row Msg, LcdRow1`                                  | explicit Atom instruction sequence                            |

The intrinsic set is closed and profile-owned. An identifier in statement
position that is not a Z80 mnemonic, an Atom directive, or a declared Neon
intrinsic is an error. Neon must never pass an unknown pseudo-operation to
Atom and hope it is accepted.

Existing `.glim` programs use underscore locals and AZM expressions. The
Glimmer-to-Neon converter accepts and lowers those known forms into `.neon`.
New Neon documentation teaches dot-private labels and Atom expressions, so new
source does not depend on the compatibility path.

## Lowering AZM-owned features

Atom remains a small assembler. The Neon host owns the higher concepts that
the Neon language exposes:

| Existing generated feature                         | Atom implementation                                        |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `.org`, `.db`, `.dw`, `.ds`, alignment and strings | bare Atom directives                                       |
| `.enum` for cards                                  | one ordered `EQU` per card                                 |
| `.type` and `.typealias`                           | host layout calculation; numeric storage sizes and offsets |
| `.op`                                              | profile intrinsic expansion before assembly                |
| `.import` and `@` exports                          | ordered Atom source parts with one flat resolved namespace |
| `.routine` and `.contracts`                        | Atom proof annotations plus the migration verifier         |
| underscore owner-local labels                      | dot-private Atom labels                                    |

Layout calculation is deterministic and checked before emission. The evaluator
supports byte, word, address, fixed byte counts, nested records, aliases, and
fixed arrays. It emits only numbers and ordinary `EQU` declarations. It never
requires forward `EQU`, so Atom's current declaration-order rule is harmless.

An imported assembly file must be Atom assembly. During migration, the existing
AZM libraries can be converted by Atom's strict AZM-to-Atom translator. Any
module construct, directive, operation, contract, or symbol that cannot be
mapped causes a positioned error. There is no best-effort mode. The converted
Snake and Tetro libraries become committed `.asm` files and are assembled as
ordinary Atom parts.

## Exact names within eight characters

Neon source names remain descriptive and are not limited to eight
characters. The generated Atom namespace uses an exact name ledger.

1. A valid, non-reserved source name of at most eight characters is kept when
   its uppercase form is unique.
2. Other globals receive an eight-character name consisting of a one-character
   kind prefix, a readable stem, and a deterministic three-character base-36
   discriminator.
3. Allocation order is the sorted semantic identity `(logical file, source
offset, declaration kind, source name)`, not traversal accident.
4. A candidate collision is resolved and recorded; names are never truncated
   and assumed unique.
5. Private labels use the same rule within their owning global and retain the
   leading dot.

The ledger records source identity, source spelling, canonical spelling, Atom
name, kind, owner, and source span. It is used by body lowering, diagnostics,
D8 symbols, differential reports, and the generated-source comments. A checksum
may choose a candidate, but the ledger and collision check establish identity;
the scheme is not hash-only.

Readable generated source matters. Every shortened declaration carries its
source name in a comment, and the build publishes a `names.json` ledger beside
the listing and D8 map.

## Source parts and imports

Neon `part` keeps its present meaning: it merges Neon declarations into
one checked program and namespace. It is not textual inclusion.

Neon `import` keeps its user-level meaning but changes its implementation:
the imported `.asm` file is an Atom source part. The build resolves paths
relative to the declaring `.neon` file, confines them to the project root,
deduplicates canonical identities, and gives Atom a deterministic ordered
project. Imported files retain their own logical identity in diagnostics,
listings, and D8.

Generated code should be split by concern rather than emitted as one giant
file:

```text
generated/constants.asm
generated/storage.asm
generated/runtime.asm
generated/profile.asm
generated/program.asm
imported user .asm parts
generated/entry.asm
```

The exact split can be measured during implementation. It must not change
addresses relative to the AZM oracle during parity tests. The entry part is
last and establishes the final ordered unit. No design decision depends on a
small fixed part count; the host supplies as many ordered records as the Atom
host interface supports at that checkpoint.

## D8 source mapping

D8 is a first-class output of the new compiler, not a post-release repair. The
design preserves the useful split in current Glimmer:

- bytes that implement a user's body or declared resource map to `.neon`;
- generated scheduling, polling, profile, and rollover glue maps to the
  generated `.asm`; and
- imported Atom code keeps its own `.asm` identity.

The new implementation replaces label matching with an emission ledger:

```ts
interface GeneratedLineOrigin {
  generatedPart: string;
  generatedLine: number;
  origin: { kind: 'neon'; file: string; line: number; column: number } | { kind: 'generated' };
  expansion?: { name: string; callLine: number; callColumn: number };
}
```

Every emitter call records the origin at the moment it writes a line. Body
lowering can therefore map one Neon line to one instruction, several
instructions, data, or no bytes without losing provenance. The emitted text is
still deterministic and snapshot-tested, but text equality is no longer the
proof of source identity.

After Atom renders its native D8 map, Neon composes it as follows:

1. Validate the Atom map as D8 v1.
2. Find segments belonging to generated parts by generated line.
3. For a `neon` origin, move the segment to the `.neon` file and replace only
   `line` and `column`. Preserve its half-open address range, `lstLine`, listing
   text reference, kind, confidence, and address-space information.
4. Leave a `generated` origin on the generated `.asm` file.
5. Leave imported Atom parts untouched.
6. When one Neon line expands to several instructions, map every resulting
   segment to that line. Debug80 already accepts several executable targets for
   one source line.
7. For an intrinsic expansion, add D8 macro metadata with the intrinsic name
   and the `.neon` call site. This is additive D8 v1 data.
8. Rebuild `fileList` deterministically with project-relative `/` paths.
9. Set the generator to `neon`, record the `.neon` entry and generated
   Atom entry as inputs, and validate the composed map again.

User-visible symbols need the same composition. Atom's short backing symbol is
replaced in the public D8 symbol set by an alias carrying the original Neon
name, declaration line, value or address, and a stable Neon identity. Runtime
internals remain attributed to generated assembly. The name ledger retains the
backing Atom spelling for engineers who inspect the generated source.

At minimum, D8 maps these Neon-authored bytes:

- instructions from effect, compute, render, enter, and routine bodies;
- all instructions expanded from a body intrinsic;
- storage allocated by state, pulse, timer, and ramp declarations;
- curve, shape, sprite, tile, and text data to their declaration or row; and
- addressable user symbols to their declaration line.

The generated wrapper code implied by `on`, `updates`, cards, and phase
scheduling remains on generated assembly. That is executable compiler output,
not literal user code, and stepping into it should show what the compiler made.

Atom diagnostics use the same ledger in reverse. A failure on a lowered body or
resource line is reported at the original `.neon` position. A failure in
generated glue points at the generated `.asm` file. Neon generation and
semantic failures never mention generated assembly.

The D8 proof is end to end:

- parse the composed map through Debug80's real D8 parser;
- bind breakpoints on a direct body instruction and on a multi-instruction
  intrinsic expansion;
- resolve every emitted address back to either the expected `.neon`, generated
  `.asm`, or imported `.asm` source;
- prove a part-declared body maps to its part file;
- prove source-level long symbol names resolve to the correct addresses; and
- step across user code, generated update glue, and imported code without an
  invented or line-zero location.

## Register and byte correctness

Atom is the production assembler. AZM remains a development oracle while the
new implementation is brought up.

Generated Atom routines carry `;@ROUTINE` and, where needed, `;@EXPECTOUT`
annotations. Native Atom ignores these comments. Atom's oracle translator
restores them as AZM contract directives for the proof build.

For every acceptance program the migration gate performs:

1. Build the existing `.glim` program through the Glimmer/AZM implementation.
2. Convert it to `.neon` and build it through the Neon/Atom implementation.
3. Translate the prepared Atom project to AZM and run strict register-contract
   checking with the appropriate MON-3 profile.
4. Compare the Atom image with the AZM image by initialized address set and byte
   value, not merely by a zero-filled flat binary.
5. Compare entry address and materialized extent.
6. Run the existing bounded Debug80 headless scenarios against the Atom image.

The expected early exceptions are listed by feature and program. A difference
cannot be hidden by changing the oracle fixture. When a feature is unsupported,
Neon rejects it at its `.neon` or imported `.asm` position.

AZM is therefore a test and migration dependency, not part of the final Atom
runtime path. Removing the oracle is a later decision, after parity has held
across releases.

## Debug80 integration

Debug80 gains a `neon` backend ID and infers it from `.neon`. The existing
`.glim` inference continues to select Glimmer. Projects may still record the
backend explicitly:

```json
{
  "sourceFile": "src/main.neon",
  "assembler": "neon",
  "outputDir": "build",
  "artifactBase": "main"
}
```

The backend calls `buildNeonProgram` in process and consumes its HEX and D8
artifacts just as the present Glimmer backend does. There is no subprocess or
listing parser.

Generated and imported assembly files are ordinary `.asm`. Debug80 selects
their assembler only through target configuration, never through a special
filename extension.

## Delivery sequence

### 1. Establish the new package and parity fixture

- Create `packages/neon` with library and CLI entry points.
- Copy the current parser, validation, model, and generic profile tests.
- Add source spans without changing accepted `.neon` programs.
- Build Counter through both implementations and record the exact image
  differential.

### 2. Build the Atom lowering foundation

- Implement the layout evaluator and exact name allocator.
- Implement token-aware body lowering, including underscore locals, cards,
  `sizeof`, and `offset`.
- Emit uppercase Atom assembly with bare directives and dot-private labels.
- Call Atom through its prepared-project host API and publish normal artifacts.

### 3. Port profiles and resources

- Generic profile and Counter first.
- TEC-1G matrix profile, then Dot, Slide, and Trail.
- Convert the Snake library and prove the multi-part/import path.
- Port cards, rotational shapes, LCD intrinsics, and Tetro.
- Port TMS9918 resources and intrinsic expansion, ending with Sprite Chase.

Each profile lands with a byte differential and a bounded headless behavioural
test. A later profile never weakens an earlier gate.

### 4. Land D8 composition

- Emit the generated-line provenance ledger from the first working backend.
- Compose Atom D8 segments and diagnostics without label matching.
- Add source-level symbol aliases and the published name ledger.
- Run the real Debug80 mapping and breakpoint tests.

D8 is part of each program's acceptance gate. It should not be postponed until
all profiles compile.

### 5. Integrate Debug80 and publish Neon

- Add the `neon` backend, `.neon` inference, and target configuration.
- Run the existing Dot, Tetro, and Sprite Chase headless scenarios through it.
- Publish `@jhlagado/neon` only after its packed API works outside the
  monorepo.
- Convert the examples and documentation after the complete acceptance corpus
  is green.
- Retain the Glimmer/AZM implementation as the oracle for an agreed
  compatibility period.

## Completion gate

Neon is ready for normal use when:

- every converted `.neon` example either builds byte-identically to its `.glim`
  AZM oracle or has an approved, measured semantic difference;
- Snake and Tetro use committed Atom assembly libraries with no translation at
  build time;
- all unsupported AZM constructs fail with exact source diagnostics;
- strict oracle contract checks pass for every generated and imported routine;
- D8 breakpoints, stepping, symbols, parts, intrinsics, and generated-glue
  transitions pass through Debug80's real consumer;
- Dot, Tetro, and Sprite Chase pass their bounded headless scenarios;
- the packed CLI and programming API build a clean external project; and
- generated Atom source, the exact name ledger, and all normal Atom artifacts
  are inspectable in the build directory.

## Deliberate exclusions

This work does not add macros to Atom, teach the resident assembler about Neon,
move the Node compiler into Z80 memory, or redesign the shared reactive
semantics. Generated and imported assembly remains `.asm`; Debug80's Neon
backend supplies the Atom flavour. The later TEC-1 shell can consume the same
prepared source-part and streaming Atom interfaces, but it is a separate
measured project after the Node implementation is complete.
