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

Open facilities do not block the first compiler. Bounded aggregate views,
read-only/output/in/out parameter modes, floating point, owned local
aggregates, rich strings, and recursion-capable bare-metal profiles remain
outside K0 and K1.

The implementation must preserve these boundaries from its first data model:

- source programs contain no pointer or reference values;
- aggregate parameters and local aliases are non-escaping names for existing
  aggregate storage;
- hidden address carriers cannot appear as source expressions or stored
  values;
- paths, multidimensional indices, and ordinal selectors provide persistent
  identity;
- `cstring` is a specialised immutable text value, not a general storage
  reference;
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
- static C-string class, termination, immutability, and program lifetime;
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

CStringType
    id
    kind: "cstring"
    addressClass: "near" | "far"
    terminator: 0
    directEncoding: "ascii"
    mutable: false
    lifetime: "program"

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

OpaqueAddressType
    id
    kind: "opaqueAddress"
    spaceId
    representationWidth
```

`indexDomains` and `exactStrides` have the same nonzero length. An integer
domain has a null `rootTypeId`; an enum domain names its root enum.
`nominalTypeId` is present when the complete dimension was declared through a
named enum or subrange and is otherwise null. Strides are in bytes, ordered
from the first source dimension to the last.

The semantic validator resolves subrange hosts, checks member and bound
representation, recomputes each domain count, record offset, stride and exact
size, and rejects any disagreement. Enum/subrange dependencies and direct or
mutual record/array containment must be acyclic.

Address class belongs to storage and alias parameters, not to record or array
types. Two arrays have the same aggregate type when their element type and
normalized index domains match, even when one is stored near and the other
far. C-string and opaque-address classes remain part of their scalar type
because they determine the value representation and legal operations.

Version 1 symbol entries are:

```text
ConstantSymbol
    id
    name
    kind: "constant"
    typeId
    value
    visibility

StorageSymbol
    id
    name
    kind: "storage"
    typeId
    mutable
    volatile
    owner: "host" | "source" | "native"
    addressClass: "near" | "far"
    substrateSymbol
    visibility

ResourceSymbol
    id
    name
    kind: "resource"
    typeId
    immutable: true
    addressClass: "near" | "far" | null
    addressSpaceId: string | null
    substrateSymbol
    visibility
```

A host resource must map to an existing Lanternfly constant, storage, address,
or callable category when it enters the typed program. `resource` is a
manifest classification for host diagnostics, not a source declaration kind.
Exactly one of `addressClass` and `addressSpaceId` is non-null.

Callable entries are:

```text
Callable
    id
    name
    parameters[]
    resultTypeId or null
    binding
    abi
    effects
    availability[]

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
```

`AggregateParameter` accepts only a record or fixed-array `typeId`. Its
`storageClass` describes the caller's aggregate storage. The parameter does
not introduce a reference type or value. Read-only, output, in/out, and bounded
view parameter records require a later schema version after their language
design is accepted.

The initial callable effect record contains:

```text
pure
reads: symbol IDs or "allVisible"
writes: symbol IDs or "allVisible"
calls: callable IDs or "unknown"
mayFault
deviceIO
changesMappingContext
returns: "normal" | "noReturn"
```

`pure: true` requires empty visible reads and writes, no device I/O, and no
mapping-context change. `mayFault` remains independent because a pure value
operation can fault. Any native-to-native call named by a pure contract must
itself satisfy the same purity rule. Missing or incomplete native effects
become the conservative forms; they do not default to purity.

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

- profile ID and substrate;
- supported scalar operations and address classes;
- default private aggregate storage class;
- maximum object and literal sizes;
- checked-index policy;
- recursion and reentrancy capability;
- fault bindings;
- external ABI implementations;
- runtime helper implementations;
- assembly-fragment support;
- source-map and cost-report capabilities.

The target profile supplies capabilities and implementations. It cannot
change integer results, exact layout, evaluation order, loop boundaries, or
any other source semantic.

The matching minimal target profile is:

```json
{
  "format": "lanternfly-target-profile",
  "version": 1,
  "id": "z80-tec1g-matrix",
  "substrate": "azm",
  "capabilities": {
    "integerWidths": [8, 16, 32],
    "nearAggregates": true,
    "farAggregates": false,
    "recursion": false,
    "inlineAssembly": true,
    "checkedIndexing": true
  },
  "defaults": {
    "privateAggregateClass": "near",
    "cstringClass": "near"
  },
  "limits": {
    "maximumStaticObjectBytes": 65536,
    "maximumCStringPayloadBytes": 65534
  },
  "faults": {},
  "externalBindings": {},
  "runtimeComponents": {},
  "artifacts": {
    "generatedSource": true,
    "sourceMap": true,
    "costReport": true
  }
}
```

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
grammar avoids replacing a K0 parser when K1 adds module declarations,
records, or routines.

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
3. character and static C-string literals;
4. Dot;
5. Slide;
6. Trail;
7. focused numeric, name, conversion, and control vectors;
8. exact record and multidimensional-array fixtures;
9. one Tetro storage routine;
10. one Pacmo six-byte-record routine.

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
- integer, Boolean, enum and subrange types;
- literals, constants, and expressions;
- checked ordinal conversions and range proofs;
- destination conversions and warnings;
- structured control and hosted `return`;
- typed effects and K0 diagnostics.

Gate:

- Counter, Dot, and focused K0 conformance vectors type-check;
- required K0 rejection fixtures report their stable IDs;
- no aggregate carrier enters the expression value model.

### M3: semantic oracle

Deliver:

- typed control-flow IR;
- interpreter;
- runtime bounds and range-fault model;
- ordered storage and service traces.

Gate:

- Counter, character/C-string, Dot, and Slide fixtures execute;
- numeric boundary vectors match the specification;
- fault traces retain source locations.

### M4: AZM vertical slice

Deliver:

- scalar and control-flow AZM lowering;
- generated-source provenance;
- host epilogue composition;
- statement and module `asm` emission with conservative barriers;
- runtime component and fault-hook selection;
- AZM assembly gate;
- first external-call adapter.

Gate:

- interpreter and AZM execution agree for Counter and Dot;
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
- scalar locals and local aggregate aliases;
- aggregate copy, `clear`, and `fill`.

Gate:

- Trail and focused layout vectors pass;
- exact 3-, 4-, 6-, and 8-byte records pass;
- one Tetro and one Pacmo fixture agree across interpreter and AZM;
- alias carriers remain absent from source values and public typed output.

### M6: routines

Deliver:

- source-defined `sub`;
- scalar parameters and optional scalar results;
- aggregate alias parameters;
- definite assignment and return analysis;
- non-recursive call graph;
- `extern sub` bindings and ABI validation;
- standalone program-entry validation;
- ABI frame and adapter reporting.

Gate:

- nested-call and early-return vectors pass;
- recursive cycles are rejected for the initial profile;
- aggregate arguments accept storage paths and reject temporaries;
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
