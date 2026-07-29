# Hosting Lanternfly inside Glimmer

Lanternfly begins as an optional body language. Glimmer remains responsible for the
program around it.

## The current generated shape

A Glimmer scheduled block produces an AZM routine with:

1. generated entry and guard logic;
2. the user's body;
3. generated `updates` work;
4. generated return logic.

The body is therefore a region inside a routine, not an independently callable
routine. This matters for exits, source maps and register contracts.

## Explicit dialect selection

Glimmer should never infer body language from tokens. A body declares its
dialect:

```text
effect MoveDot
    when MovePulse
    begin lanternfly
        IF DotX < 7 THEN DotX = DotX + 1
    end
```

The spelling `begin lanternfly` is provisional. The requirement is chosen:

- dialect selection is explicit;
- existing bare/native bodies retain their current meaning;
- a syntax error in Lanternfly does not fall back to AZM;
- generated diagnostics identify both the Glimmer block and Lanternfly location.

Direct AZM remains a parallel body language during adoption:

```text
begin azm
    ; native body
end
```

The current undifferentiated body can remain a compatibility spelling for AZM
until a deliberate migration.

## The typed body manifest

Before compiling a Lanternfly body, Glimmer supplies a manifest. At minimum it
contains:

- body identity and source span;
- body kind only for host diagnostics, not Lanternfly semantics;
- visible scalar storage names and types;
- arrays, records, sizes, bounds and field offsets;
- mutability;
- reference and address-space class;
- constants and enum-like values;
- callable services and signatures;
- service purity and memory effects;
- generated resource identities;
- imports required by selected implementations;
- host epilogue target;
- target CPU/platform capabilities.

An illustrative entry:

```json
{
  "name": "Framebuffer",
  "kind": "storage",
  "mutable": true,
  "type": {
    "array": 8,
    "element": {
      "record": "FramebufferRow",
      "size": 4,
      "fields": {
        "red": 0,
        "green": 1,
        "blue": 2,
        "aux": 3
      }
    }
  },
  "addressClass": "near"
}
```

Lanternfly must not scrape generated AZM text to rediscover this information. The
manifest is the language boundary.

## Names supplied by Glimmer

Glimmer declarations become ordinary imported Lanternfly names.

| Glimmer declaration      | Lanternfly view                        |
| ------------------------ | -------------------------------------- |
| byte state               | mutable `BYTE` storage                 |
| word state               | mutable `WORD` storage                 |
| typed array state        | mutable fixed array                    |
| layout type              | exact Lanternfly record/interface type |
| constant                 | compile-time constant                  |
| generated resource       | typed immutable object or reference    |
| shape/sprite/tile handle | opaque or typed reference              |
| generated op/routine     | callable signature                     |

This view need not expose every generated implementation symbol. Internal
trigger flags and scheduler labels remain private unless the body contract
deliberately imports them.

## Reads, writes and change tracking

Lanternfly emits ordinary storage operations. Glimmer decides how state changes are
observed.

The simplest integration preserves the existing wrapper:

```text
Lanternfly body writes state
Glimmer-generated updates run afterward
```

Lanternfly does not replace a store with a `SET_STATE` keyword or special accessor.
This avoids coupling the language to the current Glimmer implementation.

A later integration may use Lanternfly's typed write summary to derive
Glimmer's update set instead of requiring an `updates` clause for every
Lanternfly body. This is more than an optimisation: it removes a duplicated
declaration whose accuracy the compiler can already prove.

The first integration should keep explicit `updates` and compare them with the
summary. That produces useful diagnostics while the host interface is still
being tested. A later inferred mode can make the summary authoritative and
print the derived update set in dependency reports, preserving the
documentation value of the explicit clause without requiring the programmer to
maintain it twice. Native AZM bodies continue to require explicit declarations
because their effects cannot always be proved.

## Body summaries

The Lanternfly compiler returns a summary with its generated fragment:

- imported storage read;
- imported storage written;
- services called;
- native blocks used;
- may exit body early;
- may not return;
- runtime helpers required;
- static scratch required;
- estimated cost;
- source mapping.

Glimmer can compare this with its dependency model. A mismatch between a
declared host expectation and the actual summary is a build diagnostic.

The summary also gives the book's dependency reports a more accurate picture
than textual assembly scanning.

## Falling through the epilogue

Normal Lanternfly body completion falls through to the Glimmer epilogue.

`exit body` jumps to that same epilogue. It does not emit `RET`. A Lanternfly
`return` is illegal at body top level because the body is not a sub.

An imported no-return service ends control flow. Glimmer must accept that only
where a non-returning body is valid and must not emit unreachable update work
as if it ran.

Native pass-through inside the body defaults to fall-through and is checked for
direct returns where the substrate analyser can detect them.

## Generated resource access

Glimmer already generates arrays and tables for curves, shapes, sprites and
other resources. Lanternfly sees their public data contract:

```lanternfly
DotX = SlideX[Travel]
CurrentPiece = ShapeRotations[pieceIndex, rotation]
```

Whether the resource is:

- bytes placed in the current bank;
- an array of near references;
- a far asset;
- an opaque service handle;

is stated in the manifest. Lanternfly does not assume that every resource is a raw
near pointer.

## Services from profiles

Matrix and TMS9918 profiles can supply different callable sets:

```lanternfly
REM matrix profile
FbPlot(x, y, colour)

REM TMS9918 profile
VdpWrite(nameAddress, tiles)
SpriteCommit(spriteTable)
```

These are platform imports. Lanternfly has no `PLOT`, `SPRITE`, `VRAM` or `SOUND`
statement baked into its grammar.

The same core language compiles either body. A target without the imported
profile service reports a missing capability.

## Placement in the Glimmer pipeline

Two arrangements are possible.

### Lanternfly before Glimmer AZM generation

Glimmer parses the program, creates the typed manifest, calls Lanternfly for each
body, and inserts the returned AZM fragment into its generator.

Advantages:

- clear body boundaries;
- direct access to Glimmer type information;
- no second parse of generated source;
- easy body summaries.

### Lanternfly as an earlier source expansion

A front phase replaces Lanternfly regions with substrate fragments before the main
Glimmer generation.

This may be simpler for an initial experiment but risks losing typed context
and source ownership. It still must use a manifest rather than textual guesses.

The first arrangement is the long-term design.

## Parsing boundaries

Lanternfly block terminators such as `END IF` do not terminate a Glimmer body. The
host parser owns the outer delimiter; the Lanternfly parser owns tokens inside it.

The host should pass the exact body slice and starting source coordinate to
Lanternfly. Lanternfly returns diagnostics in original file coordinates. It should not
receive a synthetic file containing only the body unless the map retains the
original source identity.

## Imports and deduplication

Each body may request runtime helpers and service adapters. Glimmer collects
those requirements across the program and emits each implementation once.

The generated program should not contain five copies of integer division
because five bodies use `/`. Helper identity includes target, width,
signedness and ABI.

Imports already required by Glimmer are shared where signatures match. A
signature conflict is diagnosed before assembly.

## Register contracts

On the AZM backend, every generated body fragment participates in the
surrounding `.routine` contract.

The Lanternfly compiler can also generate private helper routines with their own
contracts. The combined program is run through AZM strict analysis. A failure
is reported with:

- Lanternfly body source location;
- generated AZM location;
- routine or helper name;
- concise backend explanation.

The user should not have to reverse-map a generated label by hand.

## Adoption path

A safe rollout has four steps.

1. Add the empty-body and scalar read/write K0 tests before implementing the
   full language. They expose manifest and epilogue mistakes while the
   interface is still small.
2. Add explicit Lanternfly bodies while current AZM bodies remain unchanged,
   then translate small examples and compare emulator behaviour and generated
   maps.
3. Translate native game engines selectively once structured memory and
   routines exist.
4. Decide later whether the default body dialect becomes Lanternfly.

No step requires removing substrate access. If the integrated product is still
called Glimmer, Lanternfly can become an internal language name without losing its
independent specification.

## Integration acceptance tests

The minimum tests are:

- one empty Lanternfly body whose Glimmer updates still execute;
- a body that reads and writes imported scalar state;
- an early `exit body` that still executes updates;
- an imported call implemented as AZM op;
- an imported call implemented as routine;
- generated resource indexing;
- record-array field access;
- a Lanternfly diagnostic at the correct original file/line/column;
- an AZM contract failure mapped back to the Lanternfly call;
- mixed Lanternfly and AZM bodies in one program;
- helper deduplication across bodies;
- no Lanternfly or runtime import in a Glimmer program that contains no Lanternfly.
