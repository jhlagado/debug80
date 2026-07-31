# Generated-output analysis

Current Glimmer 0.6.2 generated fresh AZM for Dot, Trail, Snake, Tetro and
Sprite Chase during this study. The files were written to temporary storage,
not to the repository. Together they contain 4,281 lines.

The analysis concentrated on the program-specific prelude, state and resources,
each wrapped body, imports, generated operations and the two profile-library
boundaries. Shared runtime and profile behaviour was cross-checked against the
complete Book 1, Book 2 and appendix reading.

## The insertion point

Every ordinary body becomes one bare AZM routine:

```asm
.routine
Glim_StampTrail:
    ; body text
        ; Glimmer-generated update bookkeeping
        ret
```

This is the cleanest initial Lanternfly integration point. The body compiler receives
one Lanternfly statement list and emits substrate instructions between the generated
label and Glimmer's wrapper. It does not emit the wrapper, the final return, the
card gate, the dispatch test, or change-flag bookkeeping.

Glimmer still owns an empty body. Sprite Chase's `StartPlaying` emits no user
instructions, yet its wrapper defers four declared updates. Lanternfly must not decide
that an empty body is semantically removable.

Header-only `goto` blocks have no substrate body at all; Glimmer emits their
card assignment and update staging. Lanternfly need not know that the block exists.

## The input symbol environment

Before any body, generated AZM declares:

- platform constants and service names;
- program state and pulse storage;
- layout and resource data;
- generated enum members such as `Card.Playing`;
- timer and harness-owned storage;
- profile-owned arrays such as `Framebuffer`, `NameShadow` and
  `SpriteShadow`.

Lanternfly needs this information as typed metadata, not merely as a flat list of
assembler labels. Glimmer can derive the state portion from its declarations.
A target profile supplies service signatures, profile layouts, constants,
resource handle types and ABI adapters. Imported native or Lanternfly modules supply
their own interfaces.

The first implementation can synthesize a manifest during Glimmer generation.
Scraping generated AZM would lose signedness, array bounds, referent types and
address classes.

## The output contract

For each body Lanternfly should return:

- generated substrate text;
- a deterministic local anchor and source spans for every emitted instruction
  or expansion, expressed within that exact fragment text;
- semantic reads and writes, normalized to the enclosing imported cell;
- calls and required target capabilities;
- optional byte/cycle cost records after substrate assembly;
- diagnostics attached to Lanternfly source coordinates.

Glimmer can compare the semantic write set with `updates`. Native pass-through
bodies remain declaration-driven because their indirect writes may not be
recoverable.

The generated text must fit within a bare `.routine` when targeting AZM. It may
use local labels because AZM scopes them under `Glim_<Block>`. A Lanternfly backend
should generate collision-resistant local names and never rely on the
programmer naming labels.

## Wrapper independence

Trail demonstrates the separation precisely. Its movement body stores `DotY`,
then Glimmer writes `CHG_DOTY` to `Next0` because another same-phase consumer
already ran. `StampTrail` stores through an indirect pointer, then Glimmer
writes `CHG_TRAIL` to `Raised0`. Lanternfly can identify both stores, but only Glimmer
knows which queue and phase rule applies.

Tetro demonstrates multi-bank updates. One body can cause generated writes to
`Raised0`, `Raised1`, `Next0` and `Next2`. None of that complexity belongs in
Lanternfly assignment semantics.

## Resources and structured types

Tetro's output confirms the static resource model:

- every distinct rotation is a four-byte table;
- aliases repeat addresses rather than bytes;
- the rotation table is 7 by 4 near references;
- right bounds are 7 by 4 bytes;
- colours are 7 bytes.

The current AZM flattens these declarations into labels and `.dw`/`.db`
sequences. Lanternfly's input manifest should restore their logical dimensions and
referent types so source can write `ShapeRotation[piece, rotation]`.

Sprite Chase confirms the same for profile memory. `NameShadow` is emitted as
768 raw bytes and `SpriteShadow` as 128 raw bytes, but the Lanternfly-facing profile
can describe them as a 24-by-32 byte array and a 32-element attribute-record
array. The binary layout remains identical.

## Calls, ops and imports

Generated body text may refer forward to AZM ops and routines defined later in
the file. `sprite_at` is used in wrapped bodies and defined in the VDP resource
runtime near the end. Native imports are placed after the wrapped bodies.

Lanternfly should present both through one call expression. Its AZM adapter decides
whether to emit:

- a normal `call`;
- an AZM op invocation;
- an inline instruction sequence;
- a direct monitor `rst`;
- a generated ABI shim.

The distinction remains visible in the listing and cost report.

## Backend validation

Every generated AZM body is inside a bare `.routine`, and the complete physical
file uses `.contracts strict` for real TEC-1G profiles. Lanternfly-generated Z80
should pass this same checker. Contract failures in generated code are compiler
or interface defects unless the source made an invalid typed call.

The checked-in generic Counter output uses `.contracts audit` because its
placeholder API addresses have no analyzable bodies. That profile confirms the
need for declared external signatures when an implementation is outside the
current compilation unit.

## Debug mapping

Glimmer currently attributes verbatim body instructions to `.glim` source and
generated wrappers to `.main.asm`. With Lanternfly, a body line can lower to several
instructions or a helper call. The composed map should attribute those
instructions to the Lanternfly statement while retaining the generated substrate as
an inspectable secondary source.

The compiler-owned local anchor identifies the body after Glimmer adds its
wrapper. Explicit relative spans identify the source node responsible for each
generated range. The integration validates the unchanged fragment and then
joins those spans to the AZM machine map; the anchor never substitutes for the
compiler's own lowering provenance.

Calls into a target service should step over at Lanternfly level by default. A user
who steps in crosses to the service's implementation source, whether AZM,
generated adapter code or another language.

## Portability implication

Nothing in the generated boundary requires a Z80 instruction vocabulary from
the body language. Glimmer needs typed state and service information plus
compiled body artifacts. AZM is the first substrate because it is the existing
one and offers unusually good validation, not because Lanternfly semantics depend on
it.
