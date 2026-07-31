# Lanternfly 0.4 implementation plan

Status: approved implementation route for the first compiler

Lanternfly 0.4 is ready for implementation. The
[language specification](specification.md) defines source meaning, the
[conformance contract](conformance.md) defines observable correctness, and the
[lowering contract](lowering-and-runtime.md) defines the boundaries between
the front end, runtime, host, and backends. This plan turns those contracts
into buildable increments.

The first compiler is a desktop-hosted TypeScript program in the Debug80
monorepo. It uses the package conventions established by AZM and Glimmer:
Node.js 20 or later, ECMAScript modules, TypeScript, Vitest, ESLint, and
Prettier. A native compiler for an 8-bit target remains a long-term goal. The
desktop implementation must keep language semantics separate from JavaScript
and TypeScript behaviour so a later self-hosted compiler can implement the
same contract.

## 1. Implementation baseline

Specification 0.4 is the source-language baseline for K0 through K2. Coding may
reveal defects, but implementation work does not reopen a chosen rule by
default. A proposed language change must include:

- the source example or implementation conflict that exposes the problem;
- the affected specification and conformance clauses;
- compatibility consequences;
- a test that distinguishes the old and proposed rules.

Open facilities do not block the first compiler. General bounded aggregate
views, read-only/output/in/out parameter modes, floating point, owned local
aggregates, resizable strings, and recursion-capable bare-metal profiles remain
outside K0 and K1.

The implementation must preserve these boundaries from its first data model:

- source programs contain no pointer or reference values;
- aggregate parameters and local aliases are non-escaping names for existing
  aggregate storage;
- hidden address carriers cannot appear as source expressions or stored
  values;
- paths, multidimensional indices, and ordinal selectors provide persistent
  identity;
- `string[N]` is sealed aggregate storage whose hidden header and payload do
  not become source paths;
- opaque address values cannot be dereferenced or converted into storage
  paths;
- aggregate copies are explicit typed effects even when assignment is their
  source spelling;
- hosted `return` reaches the host epilogue.

## 2. First implementation target

The first end-to-end target is a Lanternfly body hosted by Glimmer and lowered
to canonical AZM. It is deliberately smaller than the complete language:

```text
Glimmer host manifest
        +
Lanternfly body source
        |
        v
lexer and parser
        |
        v
name, type, layout, and effect analysis
        |
        v
typed control-flow IR
       / \
      v   v
IR interpreter    AZM source and provenance
                       |
                       v
                      AZM
```

The first vertical fixture is Counter. It imports one `u8`, increments it,
compares the result with a constant, conditionally assigns zero, and falls
through to the host epilogue. This fixture exercises the host boundary,
integer typing, assignment, control flow, effects, and source mapping without
requiring arrays, user routines, or runtime helpers.

## 3. Package structure

The package grows into this layout as the milestones land:

```text
packages/lanternfly/
    src/
        diagnostics/
        source/
        syntax/
        semantics/
        ir/
        interpreter/
        host/
        targets/
            azm/
        index.ts
    schema/
        host-manifest-v1.schema.json
        target-profile-v1.schema.json
    test/
        unit/
        conformance/
            accept/
            reject/
            warn/
            fault/
            artifacts/
        integration/
        fixtures/
    docs/
```

Directories should appear only when their first real module or fixture is
added. Placeholder architecture layers make ownership harder to see.

M0 creates only `diagnostics`, `source`, `host`, `schema`, the public
`index.ts`, and their tests.

Public entry points should remain small:

```text
compileBody(request) -> result
parseModule(request) -> syntax result
checkProgram(request) -> typed result
runTypedProgram(request) -> interpreter result
```

Only `compileBody` belongs in the initial public API. The other names describe
useful internal seams and may become tooling APIs after their data contracts
stabilise.

## 4. Stable shared data

Every phase uses the same source identity:

```text
SourceId
SourceSpan { sourceId, startOffset, endOffset }
LineMap
NodeId
DeclarationId
BodyId
```

Offsets are zero-based UTF-16 code-unit offsets with a half-open end, matching
the indexing model of JavaScript strings. Human-facing lines and columns are
one-based and derived through `LineMap`. Diagnostics, generated provenance,
interpreter faults, and host composition retain `SourceSpan` rather than
copying line and column numbers between phases.

A diagnostic contains:

```text
id
severity
message
primarySpan or configurationPath
related locations
notes
```

The stable conformance identifier is the diagnostic `id`. Message text can
improve without breaking tests that assert the identifier, severity, and
locations.

## 5. Manifest and target schemas

The first coding milestone defines schemas before parsing source. This makes
the host/compiler boundary executable and prevents the parser from depending
on Glimmer internals. Both schemas use JSON Schema draft 2020-12, reject
unknown fields, and use non-negative integers for offsets, sizes, counts, and
widths.

### 5.1 Host manifest version 1

The schema must represent:

- format name and version;
- target profile identifier;
- body identity and original source span;
- imported constants and scalar or aggregate storage;
- enum members, subrange bounds, exact record fields, and array index domains
  and strides;
- mutability, volatility, ownership, and near/far storage class;
- canonical Boolean representation;
- string capacity, header width, exact layout, termination and sealed
  invariants;
- callable signatures, bindings, ABI keys, and effects;
- the abstract host epilogue identifier.

Type definitions should use stable IDs. Symbol entries refer to a type ID
instead of embedding structurally similar types repeatedly. Array counts and
strides are both supplied and validated against exact layout.

Version 1 type entries use a closed `kind` union:

```text
IntegerType
    id
    kind: "integer"
    width: 8 | 16 | 32
    signed: boolean

BooleanType
    id
    kind: "boolean"
    width: 8
    falseBits: 0
    trueBits: 1

EnumType
    id
    kind: "enum"
    name
    representationTypeId
    members[] { name, ordinal }

SubrangeType
    id
    kind: "subrange"
    name
    hostTypeId
    lowerOrdinal
    upperOrdinal

StringType
    id
    kind: "string"
    capacity
    headerWidth: 8 | 16
    exactSize
    terminator: 0
    directEncoding: "ascii"
    reservedAllOnesLength: true
    sealed: true

RecordType
    id
    kind: "record"
    name
    exactSize
    fields[] { name, typeId, offset }

ArrayType
    id
    kind: "array"
    elementTypeId
    indexDomains[] {
        family: "integer" | "enum"
        rootTypeId: string | null
        nominalTypeId: string | null
        lowerOrdinal
        upperOrdinal
        count
    }
    exactStrides[]
    exactSize

AddressType
    id
    kind: "address"
    addressClass: "near" | "far"
    representationWidth
```

`indexDomains` and `exactStrides` have the same nonzero length. An integer
domain has a null `rootTypeId`; an enum domain names its root enum.
`nominalTypeId` is present when the complete dimension was declared through a
named enum or subrange and is otherwise null. Strides are in bytes, ordered
from the first source dimension to the last.

The semantic validator resolves subrange hosts, checks member, bound and
counted-string-capacity representations, recomputes each string size, domain
count, record offset, stride and exact size, and rejects any disagreement.
Enum/subrange/string-capacity dependencies and direct or mutual record/array
containment must be acyclic.

Aggregate storage class belongs to storage roots and aggregate parameters, not
to string, record or array types. Two arrays have the same aggregate type when their
element type and normalized index domains match, even when one is stored near
and the other far. Address classes remain part of their
scalar type because they determine the value representation and legal
operations. A device-space identity is metadata on a provider binding or
service contract, not another type entry.

Version 1 symbol entries are:

```text
ConstantSymbol
    id
    name
    kind: "constant"
    typeId
    value or providerAddressReference
    visibility

StorageSymbol
    id
    name
    kind: "storage"
    typeId
    mutable
    volatile
    owner: "host" | "source" | "native"
    storageClass: "near" | "far"
    substrateSymbol
    visibility

ProviderAddressReference
    bindingId
```

A constant normally carries an ordinary scalar value or aggregate initializer.
A constant whose `typeId` resolves to `near address` or `far address` instead
carries a provider address binding. The target profile resolves `bindingId` to
the address class, substrate representation and optional device-space metadata,
then resolves that class's representation-validity contract. The metadata
preserves device-space identity for the service contract, debugger and generated
artifacts without creating a nominal Lanternfly type. The address constant is
available in ordinary same-class assignment, equality and call expressions, but
it is not an ordinal constant and cannot appear in a case, range, array domain
or counted-loop step.

The two constant payload forms are mutually exclusive. A provider address
binding is valid only for an address type; an ordinary scalar or aggregate
constant uses `value`. The semantic validator rejects a missing target binding,
an address-class mismatch, a representation that violates the class's validity
contract or device metadata incompatible with the selected service contract.

A host resource must map to one of these ordinary namespace entries before
source checking: a constant, a storage symbol or a callable. An immutable
device handle commonly becomes a constant with a provider address binding.
Richer host resource metadata remains outside the Lanternfly namespace. There
is no `resource` symbol kind in the version-1 manifest.

Callable entries are:

```text
Callable
    id
    name
    parameters[]: ScalarParameter | AggregateParameter
    resultTypeId or null
    implementation:
        { kind: "hostSymbol", symbol }
        or { kind: "targetBinding", bindingId }
    abi: CallableAbi
    effects: CallableEffects (optional)
    availability:
        { kind: "allTargets" }
        or { kind: "profiles", profileIds[] }
    costMetadataId (optional)

ScalarParameter
    name
    kind: "value"
    typeId

AggregateParameter
    name
    kind: "aggregateAlias"
    typeId
    storageClass: "near" | "far"
    mutable: true

CallableAbi
    abiId
    adapterId or null

DeclaredCallableEffects
    { kind: "declared",
      pure,
      reads: { kind: "symbols", symbolIds[] }
             or { kind: "allVisible" },
      writes: { kind: "symbols", symbolIds[] }
              or { kind: "allVisible" },
      calls: { kind: "callables", callableIds[] }
             or { kind: "unknown" },
      mayFault,
      deviceIO,
      changesMappingContext,
      returns: "normal" | "noReturn" }

CallableEffects
    DeclaredCallableEffects
    or { kind: "conservative" }

CallableCostMetadata
    id
    codeBytes or null
    staticDataBytes or null
    cycles:
        { kind: "fixed", value }
        or { kind: "range", min, max }
        or { kind: "unknown" }
```

`AggregateParameter` accepts only a counted-string, record or fixed-array
`typeId`. Its
`storageClass` describes the caller's aggregate storage. The parameter does
not introduce a reference type or value. Read-only, output, in/out, and bounded
view parameter records require a later schema version after their language
design is accepted. `hostSymbol` names a symbol supplied directly by the host;
`targetBinding` resolves through the selected profile's `externalBindings`.
`CallableAbi.abiId` names a target ABI description, while an optional adapter
ID names the selected boundary adapter. `costMetadataId`, when present, resolves
through the target's `callableCostMetadata` records. Byte counts and cycle
values are non-negative integers, and a cycle range requires `min <= max`.
Empty `profileIds` is invalid; a callable available everywhere uses
`allTargets`. Every record and union above is closed, and referenced IDs must
resolve uniquely.

An omitted `effects` field normalizes to `{ kind: "conservative" }`. That
alternative assumes reads and writes of every visible mutable object, unknown
native calls, possible fault, device I/O and mapping-context change, with normal
return. It emits `W-NATIVE-001` and blocks optimizations across the call. In a
declared effect, `pure: true` requires empty `symbols` reads and writes, forbids
`allVisible` and `calls: { kind: "unknown" }`, and requires no device I/O or
mapping-context change. Every callable named in its `calls` list must also have
declared pure effects. `mayFault` remains independent because a pure value
operation can fault.

Manifest validation has two layers:

1. JSON Schema checks shape and primitive field types.
2. semantic validation checks unique IDs, referential integrity, exact
   layouts, legal type composition, boundary guarantees, and target
   compatibility.

The compiler reports malformed JSON or schema violations as configuration
diagnostics. A valid-shaped manifest with an impossible layout or missing
boundary guarantee is also a configuration diagnostic, with the related
Lanternfly declaration when one exists.

The M0 empty-body manifest is:

```json
{
  "format": "lanternfly-host-manifest",
  "version": 1,
  "host": "glimmer",
  "target": "z80-tec1g-matrix",
  "body": {
    "id": "counter.tick",
    "displayName": "Counter tick",
    "edition": "0.4",
    "kind": "effect"
  },
  "types": [],
  "symbols": [],
  "callables": [],
  "epilogue": {
    "id": "counter.tick.updates",
    "fallThroughRequired": true,
    "mayBodyNoReturn": false
  },
  "source": {
    "sourceId": "examples/counter.glim",
    "startOffset": 120,
    "endOffset": 120,
    "startLine": 8,
    "startColumn": 5
  }
}
```

`source.startOffset` and `source.endOffset` are offsets in the original host
document. `startLine` and `startColumn` provide the one-based origin when the
host passes only a body slice. M0 requires an empty slice, so the two offsets
are equal.

### 5.2 Target profile version 1

The initial target profile records:

- profile ID, substrate and endianness;
- supported scalar operations and address classes;
- default private aggregate storage class;
- maximum object and literal sizes;
- required checked indexing;
- recursion and reentrancy capability;
- fault bindings;
- provider address bindings, validity contracts and optional device-space
  metadata;
- substrate-symbol resolver;
- external bindings, ABI definitions and adapters;
- optional callable cost metadata;
- runtime helper implementations;
- assembly-fragment support;
- source-map and cost-report capabilities.

The target profile supplies capabilities and implementations. It cannot
change integer results, exact layout, evaluation order, loop boundaries, or
any other source semantic.

`endianness` is the closed choice `"little"` or `"big"`.

The closed capability record has these fields:

```text
TargetCapabilities
    integerWidths: subset of [8, 16, 32]
    scalarOperations: subset of the version-1 scalar-operation IDs
    aggregateOperations: subset of the version-1 aggregate-operation IDs
    addresses:
        near:
            { supported: true, representationWidth, validityContractId }
            or { supported: false, representationWidth: null,
                 validityContractId: null }
        far:
            { supported: true, representationWidth, validityContractId }
            or { supported: false, representationWidth: null,
                 validityContractId: null }
    nearAggregates
    farAggregates
    recursion
    reentrancy
    inlineAssembly
    checkedIndexing: true
```

The version-1 scalar-operation IDs are `integerArithmetic`,
`integerConversion`, `integerBitwise`, `integerShift`, `integerComparison`,
`booleanLogic`, `booleanComparison` and
`addressEquality`. The aggregate-operation IDs are `stringLength`,
`stringComparison`, `stringCopy` and `stringAppend`. An implementation may use instructions, emitted sequences
or selected runtime components to provide an advertised operation. A supported
address class has a positive byte-multiple representation width; an unsupported
class uses `null`. `integerArithmetic` covers unary sign, addition,
subtraction, multiplication, division, remainder, power, `abs` and `sqrt`;
the other IDs cover the operations named by their categories.

The limits record is also closed:

```text
TargetLimits
    maximumStaticObjectBytes
    maximumStringPayloadBytes
    maximumCountedStringCapacity
```

All three fields are positive integers. `maximumStringPayloadBytes` and
`maximumCountedStringCapacity` are at most 65,534, and the former does not
exceed the latter. The declared maximum string capacity must itself fit within
`maximumStaticObjectBytes` after applying the language's `N + 2` short or
`N + 3` long layout. A source string literal whose decoded payload exceeds the
payload limit, a `string[N]` whose capacity exceeds the capacity limit, or any
single static object whose exact layout exceeds the object limit receives
`E-TARGET-001`. A missing or unknown limits field is `E-CONFIG-001`; a
nonpositive, out-of-language-range or mutually inconsistent value is
`E-CONFIG-002`.

Callable linkage, ABI, runtime and fault records have these closed shapes:

```text
ExternalBinding
    id
    implementation:
        { kind: "substrateSymbol", symbol }
        or { kind: "runtimeComponent", componentId }
    abiId

CallableAbiDefinition
    id
    implementationId

AdapterDefinition
    id
    fromAbiId
    toAbiId
    runtimeComponentId

RuntimeComponent
    id
    implementationId
    dependencyIds[]
    abiId or null
    effects: DeclaredCallableEffects

FaultBinding
    faultId
    runtimeComponentId

SubstrateSymbolResolver
    id
    resolutionPhase: "configuration" | "link"
    implementationId
```

`implementationId` resolves in the implementation registry supplied by the
backend selected through `substrate`. M0 verifies every such registry entry
without executing it. Runtime-component dependency IDs resolve within the
profile and form an acyclic graph. ABI IDs resolve through
`callableAbiDefinitions`; adapter endpoints resolve through the same namespace,
and their runtime component resolves through `runtimeComponents`. A
`FaultBinding.faultId` is one public fault ID and its component is non-returning.
All IDs are unique within their named arrays.

The backend registry entry named by an ABI definition supplies its parameter and
result carriers, calling convention, preserved and clobbered resources, stack
rules and reentrancy contract. A runtime-component implementation entry supplies
its emitted implementation, exported symbols, size and cost facts, clobbers,
interrupt/reentrancy properties, test vectors and provenance. A fault binding's
component must have declared `returns: "noReturn"` effects. When an external
binding selects a runtime component, its `abiId` must equal that component's
non-null `abiId`.

For a callable using `targetBinding`, the binding ID resolves through
`externalBindings`. With no adapter, `CallableAbi.abiId` must equal the external
binding's `abiId`; otherwise `CallableAbi.adapterId` resolves an adapter from the
callable ABI to that external ABI. A `hostSymbol` uses the callable ABI directly
or its named adapter. A profile-list availability record must contain the
selected profile ID; otherwise the callable is unavailable and receives
`E-TARGET-001`.

The selected profile contains one `substrateSymbolResolver`. Its
`implementationId` resolves through the backend registry. At M0 the validator
checks resolver availability and the shape of every symbol representation. A
configuration-phase resolver must produce exact bytes during configuration. A
link-phase resolver may defer the numeric value, but it must produce exact bytes
and run the selected address-class validity rule before emitted-program
completion. Failure to resolve a provider symbol is `E-CONFIG-002`; bytes that
resolve but fail the rule are `E-BOUNDARY-001`. Failure to resolve a callable or
external-binding symbol is `E-EXTERN-001`.

Provider address bindings and address-class validity contracts have these
closed target-profile shapes:

```text
ProviderAddressBinding
    id
    addressClass: "near" | "far"
    representation:
        { kind: "substrateSymbol", symbol }
        or { kind: "bytes", bytes[] }
    deviceSpaceId (optional)

AddressValidityContract
    id
    representationWidth
    rule:
        { kind: "allBitPatterns" }
        or { kind: "unsignedRange", min, max }
        or { kind: "maskedBytes", mask[], expected[] }
```

The `representation` alternatives are mutually exclusive. Every byte in a
literal representation is an integer from 0 through 255, and its length in bits
must match the selected address class. The backend resolves a
`substrateSymbol` under the selected substrate; the interpreter uses the binding
ID as its symbolic representation. The target binding is the single source of
its near/far class, substrate representation and optional device-space identity.
A service contract may also name the device space for diagnostics and backend
validation. Source type compatibility continues to use only the binding's
near/far class.

`AddressValidityContract.id` is stable within the profile.
`representationWidth` is a positive multiple of eight and must equal the width
of every supported address class that selects the contract and the corresponding
`AddressType.representationWidth` in the host manifest. The contract applies to
all values of that address class, including provider constants, ordinary storage
and native results.

`allBitPatterns` accepts every byte sequence of the declared width.
`unsignedRange` decodes the representation as one unsigned integer using the
profile's byte order and accepts inclusive `min` through `max`; both endpoints
must fit the declared width and `min` must not exceed `max`. `maskedBytes`
requires `mask` and `expected` arrays of exactly `representationWidth / 8`
bytes. Each entry is from 0 through 255, every expected bit outside its mask is
zero, and byte `i` is valid exactly when
`(bytes[i] and mask[i]) = expected[i]`. M0 can therefore validate an exact-byte
provider representation without executing backend code. A substrate-symbol
provider must resolve to exact representation bytes before validation.

Zero-validity is derived by applying the selected rule to an all-zero byte
sequence. Compiler-owned address storage with no initializer is rejected with
`E-INIT-006` when zero is invalid; no separate zero-validity flag may disagree
with the rule.

Schema shape failures, including an unknown representation/rule tag, a missing
union field, a forbidden field from another alternative or an unknown field,
use `E-CONFIG-001`. A well-shaped representation with the wrong byte length, an
invalid range/mask rule, an unresolved binding, validity-contract ID or
substrate symbol, a duplicate ID, or a class/width mismatch uses
`E-CONFIG-002`. A resolved provider or native value that fails the selected
rule, or a service that cannot preserve it, uses `E-BOUNDARY-001`.

The matching minimal target profile is:

```json
{
  "format": "lanternfly-target-profile",
  "version": 1,
  "id": "z80-tec1g-matrix",
  "substrate": "azm",
  "endianness": "little",
  "capabilities": {
    "integerWidths": [8, 16, 32],
    "scalarOperations": [
      "integerArithmetic",
      "integerConversion",
      "integerBitwise",
      "integerShift",
      "integerComparison",
      "booleanLogic",
      "booleanComparison",
      "addressEquality"
    ],
    "aggregateOperations": [
      "stringLength",
      "stringComparison",
      "stringCopy",
      "stringAppend"
    ],
    "addresses": {
      "near": {
        "supported": true,
        "representationWidth": 16,
        "validityContractId": "address.u16.all"
      },
      "far": {
        "supported": false,
        "representationWidth": null,
        "validityContractId": null
      }
    },
    "nearAggregates": true,
    "farAggregates": false,
    "recursion": false,
    "reentrancy": false,
    "inlineAssembly": true,
    "checkedIndexing": true
  },
  "defaults": {
    "privateAggregateClass": "near"
  },
  "limits": {
    "maximumStaticObjectBytes": 65536,
    "maximumStringPayloadBytes": 65533,
    "maximumCountedStringCapacity": 65533
  },
  "substrateSymbolResolver": {
    "id": "azm.symbols",
    "resolutionPhase": "link",
    "implementationId": "azm.resolve-symbol-bytes"
  },
  "addressBindings": [],
  "addressValidityContracts": [
    {
      "id": "address.u16.all",
      "representationWidth": 16,
      "rule": { "kind": "allBitPatterns" }
    }
  ],
  "callableCostMetadata": [],
  "externalBindings": [],
  "callableAbiDefinitions": [],
  "adapterDefinitions": [],
  "runtimeComponents": [],
  "faultBindings": [],
  "artifacts": {
    "generatedSource": true,
    "sourceMap": true,
    "costReport": true
  }
}
```

`checkedIndexing` is the literal value `true` in every conforming version-1
profile. The compiler performs each dynamic bounds check not removed by proof.
A future explicitly unsafe unchecked mode requires a separate extension
contract and cannot claim conforming 0.4 execution; setting this field to
`false` is not a release-mode option.

M0 validates this structural boundary without interpreting absent runtime
components. Later milestones extend the same version only by filling fields
already admitted by the version 1 schema. A new required field or changed
meaning requires a new schema version.

### 5.3 M0 request and result

The first public operation has this boundary:

```text
CompileBodyRequest
    sourceId
    sourceText
    sourceOrigin { offset, line, column }
    hostManifest
    targetProfile

CompileBodyResult
    success
    diagnostics
    body? {
        bodyId
        sourceSpan
        epilogueId
        effects
        requirements
    }
```

`sourceOrigin` uses an original-document UTF-16 offset and one-based line and
column. It must agree with the manifest source entry. M0 accepts only an empty
body. Its successful result contains empty effect and requirement sets. Any
nonempty source receives `D-STAGE-001` until M1 supplies the lexer and parser.

## 6. Front-end pipeline

The front end should use explicit passes. Combining parsing, name lookup, and
type checking into one walk makes forward visibility, layout dependencies,
and diagnostic ownership difficult to preserve.

### 6.1 Source and lexer

The source layer provides:

- original text and stable source identity;
- offset-to-line mapping;
- logical-newline handling, including final input without a line ending;
- UTF-8 input validation and ASCII identifier classification;
- token spans that exclude trivia while retaining comments for formatting.

The lexer decodes neither integer values nor string payloads beyond what is
required to find token boundaries. Literal validation and decoded values
belong to a later syntax or semantic pass so errors keep precise component
spans.

### 6.2 Parser

The parser builds a concrete syntax tree with source spans on every node and
token. Comments remain attached as trivia. The parser accepts grammar, not
types. In particular, it does not decide whether a name is a type, value,
routine, or aggregate while recognising the surrounding syntax.

The initial parser should cover the complete 0.4 grammar even when later
phases temporarily diagnose an unsupported implementation stage. A single
grammar avoids replacing a K0 parser when K1 adds source-owned module and
storage constructs or K2 adds routines.

Raw statement and module `asm` blocks require a lexer mode that preserves
payload bytes and line boundaries until the case-insensitive closing `end`.
The parser must not tokenise assembler content as Lanternfly.

### 6.3 Declaration collection

Declaration collection assigns IDs and creates the separate type and value
namespaces. It registers enum members in the value scope and enforces
duplicate, case-only, reserved-name, shadowing, and type/callable collision
rules.

Module declarations are collected before routine bodies are checked.
Initialiser visibility still follows source order, so collection and
eligibility are separate concepts.

### 6.4 Dependency and layout resolution

The resolver builds dependency graphs for:

- constants;
- enum and subrange domains;
- array index domains;
- record layouts;
- placement expressions;
- layout queries;
- module imports.

It reports cycles with the dependency path. Exact ordinal bounds, record
offsets, array strides, aggregate sizes, and zero-validity are computed once
and stored in canonical type descriptors.

### 6.5 Type and effect analysis

Expression analysis records:

- resolved type and value category;
- constant value when known;
- inserted value-preserving conversions;
- operator result type;
- destination conversion and warning classification;
- purity and possible runtime faults;
- ordered reads and calls.

Statement analysis records:

- ordered reads, writes, calls, faults, and device I/O;
- control-flow successors;
- reachability and return behaviour;
- loop-control protection;
- host continuation.

Aggregate aliases have their own semantic category. They must not pass through
the scalar expression APIs merely because a backend will eventually carry an
address.

## 7. Typed IR and interpreter

The IR is typed, control-flow based, and small. Source loops and selections
lower to basic blocks while retaining source node IDs for diagnostics, maps,
and cost aggregation.

The IR uses scalar values and typed addresses. Aggregate storage is represented
through explicit effects:

```text
Copy
Clear
Fill
```

A local alias or aggregate parameter becomes a compiler-only aggregate
location. No instruction converts that location into a source value.

Address computation must retain evaluation order and fault boundaries.
Destination paths complete before assignment sources. Earlier index
expressions complete and pass bounds checks before later index expressions
run.

The interpreter is the first executable semantic oracle. It uses
arbitrary-precision host integers, then applies explicit Lanternfly width,
signedness, wrapping, shift, division, comparison, and conversion operations.
It models:

- byte-addressed static regions with exact layout;
- symbolic near/far aggregate locations;
- opaque address values without CPU loads or stores;
- calls through injected test services;
- ordered volatile and service traces;
- faults with source provenance;
- hosted epilogues.

JavaScript arithmetic, truthiness, object layout, and string comparison are
never accepted as implicit Lanternfly semantics.

## 8. AZM backend

The first backend emits canonical AZM source and a provenance map. It should
start with straightforward, auditable instruction sequences. Optimisation
begins after interpreter and emulator results agree.

The backend receives a typed program and target profile. It owns:

- scalar representation and temporary placement;
- exact path calculation;
- branch and label selection;
- helper and adapter selection;
- host epilogue branches;
- inline assembly emission;
- generated symbol naming;
- AZM source and mapping artifacts.

Generated names use one reserved prefix that cannot collide with Lanternfly,
host, or assembler-visible user names. Their allocation is deterministic for
the same typed program.

AZM assembly is part of the backend gate. A successful backend test:

1. emits canonical AZM;
2. assembles it through the supported AZM API;
3. passes strict routine-contract analysis where applicable;
4. maps AZM diagnostics to Lanternfly source;
5. compares execution or final state with the IR interpreter.

## 9. Conformance fixture protocol

Each fixture has:

```text
stable conformance ID
edition
minimum stage
source files or hosted body
manifest
target profile
expected diagnostics
expected typed facts
expected final storage
expected ordered service/fault trace
expected artifact assertions
```

Positive fixtures should assert observable results, not complete generated
source text. Focused snapshot tests may cover canonical formatting, IR, and
AZM output, but semantic tests compare storage and traces so harmless emission
changes do not rewrite the whole suite.

Negative fixtures assert:

- diagnostic ID and severity;
- primary source or configuration location;
- required related locations;
- absence of later emission or execution.

The first executable fixture sequence is:

1. empty hosted body;
2. Counter;
3. character and string literals;
4. Dot;
5. Slide;
6. Trail;
7. focused numeric, name, conversion, and control vectors;
8. exact record and multidimensional-array fixtures;
9. one hosted Tetro storage body;
10. one hosted Pacmo six-byte-record storage body;
11. a source-routine version of the Tetro body;
12. a source-routine version of the Pacmo body.

## 10. Delivery milestones

### M0: package and boundary

Deliver:

- TypeScript package scaffolding;
- source spans and diagnostics;
- host-manifest and target-profile schemas;
- schema and semantic validators;
- empty-body API and fixture.

Gate:

- invalid configuration produces stable diagnostics;
- an empty body retains source identity and host epilogue metadata;
- build, typecheck, lint, format, and tests pass.

### M1: complete syntax

Deliver:

- source and lexer;
- complete 0.4 parser;
- raw `asm` preservation;
- canonical syntax-tree debug printer;
- parser acceptance and rejection fixtures.

Gate:

- every 0.4 grammar production has a focused test;
- malformed constructs recover far enough to report more than one independent
  error without inventing semantic nodes;
- syntax nodes retain exact source spans.

### M2: K0 semantics

Deliver:

- host import model;
- names and namespaces;
- integer, Boolean, enum, subrange, string and near/far
  address types;
- manifest-defined records, fixed arrays and immutable aggregate constants;
- literals, constants, and expressions;
- checked ordinal conversions and range proofs;
- exact record fields, ordinal array paths, index arity and bounds proofs;
- `size`, `count`, `lower`, `upper` and `offset` layout queries;
- imported callable signatures, arguments, results and effects;
- aggregate assignment, counted-string copy/append, `clear` and `fill` over
  imported storage;
- destination conversions and warnings;
- structured control and hosted `return`;
- typed effects and K0 diagnostics.

Gate:

- Counter, Dot, Trail and focused K0 conformance vectors type-check;
- required K0 rejection fixtures report their stable IDs;
- no aggregate carrier enters the expression value model.

### M3: semantic oracle

Deliver:

- typed control-flow IR;
- interpreter;
- runtime bounds and range-fault model;
- imported record and ordinal-array paths;
- imported aggregate copy, counted-string operations, `clear` and `fill`;
- ordered storage and service traces.

Gate:

- Counter, character/string, Dot, Slide and Trail fixtures
  execute;
- numeric boundary vectors match the specification;
- ordinal-path vectors preserve check and evaluation order;
- fault traces retain source locations.

### M4: AZM vertical slice

Deliver:

- scalar and control-flow AZM lowering;
- imported record and ordinal-array path lowering;
- required range and bounds checks plus proof-based removal;
- imported aggregate copy, counted-string operations, `clear` and `fill`;
- generated-source provenance;
- host epilogue composition;
- module `asm` emission with provenance and statement `asm` emission with
  conservative barriers;
- runtime component and fault-hook selection;
- AZM assembly gate;
- first external-call adapter.

Gate:

- interpreter and AZM execution agree for character/string,
  Counter, Dot, Slide and Trail fixtures;
- an AZM diagnostic maps back to the responsible Lanternfly span;
- generated source is deterministic.

### M5: K1 storage

Deliver:

- Lanternfly-owned constants and variables;
- exact records and fixed arrays;
- count, range, subrange and enum array index domains;
- initialisers and startup effects;
- module imports, visibility, export checks, and deterministic installation;
- multidimensional lower-bound normalization and bounds checks;
- hosted-body scalar locals and local aggregate aliases;
- hosted-local initializer ordering, zero-validity and fresh per-entry
  lifetime;
- string storage, copy, append and native payload access;
- aggregate copy, `clear`, and `fill` for source-owned storage.

Gate:

- exact 3-, 4-, 6-, and 8-byte records pass;
- one hosted Tetro storage body and one hosted Pacmo storage body agree across
  interpreter and AZM;
- source-owned initialization and module-installation traces agree across
  interpreter and AZM;
- repeated hosted-body entries receive freshly initialized, independent local
  storage;
- every applicable K1 rejection fixture reports its stable diagnostic ID;
- alias carriers remain absent from source values and public typed output.

### M6: routines

Deliver:

- source-defined `sub`;
- scalar parameters and optional scalar results;
- counted-string and other aggregate alias parameters;
- source-routine scalar locals using the K1 initializer-ordering and
  zero-validity machinery with fresh per-call lifetime;
- return-path analysis;
- non-recursive call graph;
- `extern sub` bindings and ABI validation;
- standalone program-entry validation;
- ABI frame and adapter reporting.

Gate:

- nested-call and early-return vectors pass;
- source-routine versions of the selected Tetro and Pacmo fixtures agree across
  interpreter and AZM;
- recursive cycles are rejected for the initial profile;
- aggregate arguments accept storage paths and reject temporaries;
- every applicable K2 rejection fixture reports its stable diagnostic ID;
- frame and scratch artifacts account for every allocated byte.

Bounded views and parameter modes receive a separate language decision before
they enter this milestone. Their absence does not delay the initial routine
ABI.

## 11. First coding change

The first implementation change should contain only M0:

1. convert `packages/lanternfly` into a private TypeScript workspace package;
2. add source-span and diagnostic types;
3. add versioned host-manifest and target-profile schemas;
4. validate one valid empty-body request and focused invalid requests;
5. return an empty typed body result containing the abstract epilogue ID,
   source identity, and empty effect summary;
6. add package scripts for build, typecheck, lint, test, and format checks.

This change establishes real boundaries without committing to parser
internals, IR shape, or Z80 instruction selection.

## 12. Completion criteria for the first compiler

The first compiler is complete when:

- M0 through M6 gates pass;
- the applicable conformance inventory is executable and green;
- unsupported 0.4 profile capabilities produce required diagnostics;
- interpreter and AZM results agree for the selected corpus;
- generated AZM assembles under the supported AZM version;
- source, generated-source, and machine mappings compose;
- emitted symbol, layout, helper, effect, startup, frame, and target-assumption
  artifacts are available;
- no source construct exposes a pointer, reference value, function value, or
  hidden aggregate carrier.

Self-hosting begins after this desktop compiler and its conformance suite are
stable. The self-hosted compiler may use a staged subset internally, but it
must accept and reject programs according to the same edition and produce
equivalent observable results.
