# Hosting Lanternfly inside Glimmer

Lanternfly begins as an optional Glimmer body language. Glimmer owns the
scheduled program around each body; Lanternfly compiles the body itself.

## Hosted body shape

A scheduled block normally becomes:

```text
generated entry and guard
    Lanternfly body
generated Glimmer update epilogue
generated wrapper return
```

The body is a region inside host control flow rather than an independent
machine routine. That fact determines return lowering, source-map composition
and effect checking.

## Explicit dialect selection

Glimmer must select the body dialect explicitly:

```text
effect MoveDot
    when MovePulse
    begin lanternfly
        if dotX < 7 then
            dotX = dotX + 1
        end
    end
```

The exact outer Glimmer spelling remains a host design question. Four rules do
not:

- existing assembly bodies retain their meaning;
- a Lanternfly syntax error cannot fall back to assembly;
- the host supplies the exact body slice and source origin;
- diagnostics identify both the Glimmer block and Lanternfly construct.

Direct AZM remains a parallel body dialect during adoption.

## Versioned host manifest

Glimmer supplies language facts rather than generated assembly text. The
version-1 manifest contains:

- body identity, edition and original source span;
- target profile identifier;
- integer, Boolean, string and near/far address types;
- type entries for enums, subranges, records and arrays, carrying representation,
  shape and exact layout but no aggregate storage class;
- symbol entries for ordinary scalar constants, immutable aggregate constants
  and storage;
- storage class on storage symbols and aggregate callable parameters;
- provider-bound `near address` and `far address` constants;
- callable entries with signatures, aggregate parameter classes, ABI and
  effects;
- mutability, volatility, ownership and visibility where they apply;
- host epilogue identity.

An address constant declares its `near address` or `far address` type and
contains one `ProviderAddressReference`, whose only field is `bindingId`. The
named target-profile entry has this shape:

```text
ProviderAddressBinding
    id
    addressClass: "near" | "far"
    representation:
        { kind: "substrateSymbol", symbol }
        or { kind: "bytes", bytes[] }
    deviceSpaceId (optional)
```

The target binding is the sole owner of its class, closed representation and
device-space identity. The supported near or far `AddressClassCapability`
instead names the `validityContractId` shared by every value of that class. Its
`AddressValidityContract` records an ID, representation width and one closed
rule: `allBitPatterns`, `unsignedRange` with inclusive `min` and `max`, or
`maskedBytes` with byte-for-byte `mask` and `expected` arrays. Whether all-zero
storage is valid is derived by applying that rule to zero bytes.

Validation resolves `bindingId`, checks the binding class against the
constant's declared type, resolves the class capability's validity contract and
validates the selected representation. A substrate symbol must resolve to exact
bytes before that validation. A body may read, copy, compare and pass the
resulting value wherever an ordinary runtime value of that class is accepted.
It may not use the provider-bound address in a source constant expression.

A richer Glimmer resource does not create a fifth Lanternfly declaration
category. The host maps it to an ordinary constant, a provider-bound
`near address` or `far address` constant, storage or a routine before it enters
the Lanternfly namespace. This keeps resource metadata on the Glimmer side
while giving the body one ordinary typed interface.

An array domain records more than a count:

```json
{
  "family": "enum",
  "rootTypeId": "Colour",
  "nominalTypeId": "Colour",
  "lowerOrdinal": 0,
  "upperOrdinal": 3,
  "count": 4
}
```

This lets a hosted body type-check `palette[green]`, preserve debug names and
remove a bounds check proven by the enum domain. A count-only manifest would
lose those semantics before parsing began.

The semantic validator recomputes sizes and strides. It rejects inconsistent
layouts, invalid ordinal domains, unresolved IDs and host/target mismatches.

## Names supplied by Glimmer

| Host fact             | Lanternfly view                                        |
| --------------------- | ------------------------------------------------------ |
| byte or word state    | mutable fixed-width integer storage                    |
| Boolean state         | canonical `boolean` storage                            |
| owned text state      | sealed fixed-capacity `string[N]` storage              |
| named small state set | enum or checked subrange                               |
| typed array state     | fixed array with complete ordinal domains              |
| layout type           | exact record type                                      |
| constant              | compile-time scalar or aggregate constant              |
| generated resource    | ordinary or address-bound constant, storage or routine |
| generated operation   | callable signature and effects                         |

Scheduler labels, trigger machinery and private resource symbols remain host
implementation details.

## Reads, writes and update tracking

Lanternfly emits ordinary typed storage operations. Glimmer runs its generated
updates after the body.

The first integration should retain explicit Glimmer `updates` declarations
and compare them with Lanternfly's typed write summary. A disagreement is a
diagnostic. Once the integration has enough evidence, the host may derive
updates from the summary and print that derivation in its dependency report.

Assembly bodies continue to need explicit effect declarations when static
analysis cannot prove their writes.

## Body result and effects

The compiler returns generated source or IR together with:

- imported storage reads and writes;
- routines called;
- assembly blocks used;
- faults and no-return paths;
- runtime helpers and adapters;
- static scratch;
- source provenance;
- optional cost information;
- the abstract host continuation.

This summary is typed. It distinguishes a possible `F-RANGE` from an array
`F-BOUNDS`, and it retains the ordinal domain responsible for either check.

## Hosted return

Bare `return` is legal in a hosted body and targets the Glimmer epilogue:

```lanternfly
if paused then
    return
end

updateActors()
```

It must not emit a machine `RET`. The generated update work still runs before
the wrapper returns. A direct machine return from a body fragment is a backend
or assembly-contract failure.

Normal fall-through reaches the same continuation. A declared no-return
service ends control flow and lets Glimmer omit unreachable epilogue work only
when the host contract permits it.

## Generated resources

Glimmer exposes a public typed contract:

```lanternfly
dotX = slideX[travel]
currentRotation = shapeRotations[pieceIndex, rotation]
```

A regular table is an immutable fixed-array constant or typed storage.
Irregular or device-backed resources enter as provider-bound `near address` or
`far address` constants accepted by a platform service. Lanternfly does not
infer a pointer from a linker symbol and does not represent a resource table as
an array of source references.

Near/far aggregate storage class belongs to a storage symbol or aggregate
callable parameter. Device-space identity belongs to the target binding and
service contract for a `near address` or `far address` value. It remains
distinct from CPU storage even when both use 16 bits.

## Platform profiles

Different profiles supply different callables:

```lanternfly
extern sub vdpWrite(destination as far address, source as far address)
extern sub spriteCommit(table as Sprite[32])

framebufferPlot(x, y, colour)
vdpWrite(nameAddress, tileDataAddress)
spriteCommit(spriteTable)
```

The manifest exposes `nameAddress` and immutable `tileDataAddress` as
provider-bound `far address` constants interpreted by `vdpWrite`. It supplies
`spriteTable` as mutable `Sprite[32]` storage, so the writable aggregate
parameter is legal. Lanternfly has no built-in `plot`, `sprite`, `vram` or
`sound` statement. Missing services are target-capability diagnostics.

## Pipeline placement

The preferred integration is:

1. Glimmer parses the outer program.
2. It resolves host declarations and creates the versioned manifest.
3. It passes the exact body slice to Lanternfly.
4. Lanternfly returns typed effects, generated AZM and provenance.
5. Glimmer inserts the fragment and composes the maps.
6. AZM verifies the complete generated program.

An earlier source-expansion experiment may be useful, but it still needs the
manifest. Scraping types from generated AZM would make host implementation
details the language interface.

## Parsing and mapping boundaries

The Glimmer parser owns the outer body delimiter. The Lanternfly parser owns
every inner bare `end`. A body slice therefore arrives with a source ID,
UTF-16 offsets and one-based line/column origin.

Lanternfly diagnostics use original coordinates. Generated AZM diagnostics map
back through both the Lanternfly map and the Glimmer wrapper map.

Runtime helpers and adapters requested by several bodies are deduplicated by
semantic identity: target, width, signedness, domain and ABI where relevant.

## Adoption and acceptance

The staged rollout begins with empty and scalar K0 bodies, then adds ordinary
array/record paths and imported calls before translating native engines.
Existing AZM bodies can remain beside Lanternfly throughout.

Minimum integration fixtures include:

- an empty body whose updates still execute;
- scalar read/write and an early hosted `return`;
- imported pure and effectful calls;
- imported enum/subrange types and enum-indexed storage;
- non-zero-bound resource indexing;
- record-array field access;
- `F-RANGE` and `F-BOUNDS` mapped to original source;
- AZM contract failure mapped through the generated call;
- helper deduplication across bodies;
- mixed Lanternfly and AZM bodies;
- no Lanternfly artifacts when a program contains no Lanternfly body.
