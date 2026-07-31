# Lanternfly lowering, backend and runtime contract

Status: architecture contract for the 0.4 implementation baseline
Implementation status: documentation only

This document specifies the boundary a compiler prototype should implement. It
does not prescribe compiler modules or data structures. The
[implementation plan](implementation-plan.md) supplies the delivery order,
package seams, and milestone gates.

## 1. Responsibilities

The front end owns:

- source parsing;
- name and type resolution;
- exact layout;
- integer result typing and conversions;
- character decoding and C-string typing;
- initialization and return-path validation;
- structured-control validation;
- host/import/external interface checking;
- typed read/write/call summaries.

The target backend owns:

- scalar representation;
- path/address lowering;
- instruction or substrate selection;
- ABI and local placement;
- helper selection;
- near/far mechanics;
- native adapters;
- substrate source or object emission;
- source provenance;
- target cost information.

The runtime owns reusable implementations selected by the backend.

The host, when present, owns scheduling, wrapper code, epilogues and the
manifest supplied to Lanternfly.

## 2. Typed program boundary

The front end must hand the backend a fully typed program. The backend must not
repeat language-level type inference from generated symbol spelling.

Each declaration has:

```text
declarationId
sourceSpan
name
visibility
kind
type
mutability
storageOwner
addressClass/addressSpace
initializer or import/external binding
```

Each expression has:

```text
nodeId
sourceSpan
resolved type
value/storage/aggregate-alias category
constant value when known
operand-widening, narrowing and result-type decisions
round-trip conversion classification
ordinal-domain proof and required range check
purity
```

Each statement has:

```text
nodeId
sourceSpan
control successor(s)
read/write/call effects
host continuation where applicable
```

Stable IDs need only be stable within one compilation unless an incremental
tooling design later requires more.

## 3. Type descriptor

A backend-facing type descriptor can represent:

```text
integer(width, signed)
boolean(width=8, falseBits=0, trueBits=1)
enum(typeId, representationType, members)
subrange(typeId, hostOrdinalType, lowerOrdinal, upperOrdinal)
cstr(class, terminator=0, directEncoding=ascii, mutable=false)
record(typeId, exactSize, fields)
array(elementType, indexDomains, counts, exactStrides)
aggregateAlias(class, referentType, mutable)
address(class, representationWidth)
opaqueAddress(spaceId, representationWidth)
procedureSignature(parameters, result, effects)
```

Record fields include exact byte offsets. Each array dimension records its
root ordinal family, optional nominal type, inclusive lower and upper
ordinals, count and row-major stride, so the backend does not reconstruct
semantic layout.

An aggregate-alias class is `near`, `far` or a resolved target class. It is a
compiler representation of temporary access to existing aggregate storage,
not a Lanternfly value or source-level type. Opaque address spaces are nominal.

`unit` may appear as an internal routine result marker but is never a stored
type. Boolean descriptors are invariant across targets; imported adapters
validate external representations and invoke the invalid-value fault rather
than exposing a noncanonical value to Lanternfly.

A C-string descriptor carries an address class but no length field. A literal
node separately carries its decoded payload, appended terminator, static
storage identity and source-byte mapping.

## 4. Suggested Lanternfly IR

The first IR can be deliberately small and control-flow based.

### 4.1 Values

```text
Const(type, value)
Load(type, address)
Unary(op, type, value)
Binary(op, type, left, right)
Compare(op, type, left, right)
Convert(kind, sourceType, targetType, value)
CallResult(callId)
Phi/type block parameter, if the chosen IR uses SSA
```

### 4.2 Addresses

```text
StaticAddress(declarationId)
AggregateAliasBase(aliasId)
FieldAddress(base, byteOffset, fieldType)
IndexAddress(base, index, exactStride, elementType)
OpaqueAddressOffset(base, offset)
```

An address retains:

- referent type;
- address class/space;
- mutability;
- source path provenance.

`AggregateAliasBase` reads a compiler-only binding established by an aggregate
parameter or local alias. It cannot feed `Const`, `Load`, `Store`, `Compare`,
`Convert`, or any other scalar-value operation by itself. Field and index
selection turn it into an address for the aliased aggregate's scalar leaves or
bulk effects.

`OpaqueAddressOffset` cannot feed `Load`/`Store` unless its space is declared
CPU-accessible.

### 4.3 Effects

```text
Store(type, address, value)
Call(signatureId, arguments)
StandardCall(operationId, arguments)
NativeBarrier(contractId)
InlineAssembly(blockId, dialect, placement, payload, conservativeEffects)
Fault(classId)
```

### 4.4 Control

```text
Branch(target)
BranchIf(value, trueTarget, falseTarget)
Switch(value, cases, default)
Return(value?)
BodyExit(hostEpilogueId)
NoReturn
```

Loop syntax is gone by this stage. Its blocks retain original loop node IDs for
debugging and cost aggregation.

### 4.5 Aggregate policy

Aggregates do not appear as arbitrary IR values. They appear as typed
addresses. `COPY`, `MOVE`, `FILL` and `CLEAR` are explicit aggregate effects.

This matches the language rule and avoids an optimizer inventing hidden
aggregate temporaries. A source aggregate assignment becomes one explicit
`COPY` effect with source-order and volatile semantics retained. Standard
`fill` and `clear` calls become `FILL` and `CLEAR` effects after the front end
has validated their target and scalar leaf types.

`COPY` records whether either region is volatile and whether overlap is
possible. An ordinary copy has snapshot/move semantics. A volatile copy is
accepted only after the front end proves non-overlap and retains its
field-order or row-major scalar access sequence.

### 4.6 Ordered effects

The IR must preserve the source order fixed by specification section 8.7.
Address calculations that may call, fault or read volatile storage are effects,
not freely movable value nodes. An assignment's destination address is
completed once before its right-hand value is evaluated. Optimizers may reorder
only after proving the operations mutually unobservable.

### 4.7 Inline assembly

`InlineAssembly` retains the raw payload and its exact source span. `placement`
is `module` or `statement`. A statement block is a `NativeBarrier` with the
conservative reads, writes, calls, faults and machine-state clobbers defined by
the language specification.

Before emitting a statement block, the backend spills or preserves every live
generated value needed after it. The payload is then copied verbatim into the
assembly source stream. A module block is emitted at its module-item position.
No optimizer inspects or moves either form.

An assembly-source backend composes:

```text
Lanternfly source
    -> generated assembly with verbatim inline ranges
    -> selected assembler
    -> machine program and debug artifacts
```

The generated-to-original map gives every inline line its Lanternfly source
location, so assembler diagnostics point back into the `asm` block. The
generated symbol artifact records any compiler-owned names available to raw
assembly. A backend without a compatible assembly-fragment pipeline rejects
`InlineAssembly`.

## 5. Numeric lowering contract

The front end records resolved operand and result types. It inserts every
value-preserving operand widening allowed by specification section 3.1 instead
of asking the backend to infer a common type. The backend implements the
recorded types exactly.

For every integer operation it receives:

```text
operation
operand widths/signedness
result width/signedness
constant operands
wrapping/fault rule
source node
```

The backend may choose an instruction or helper only when its result matches
the recorded semantics for all inputs.

Destination conversions also record whether value analysis proved them safe,
whether the round-trip arithmetic rule suppressed the default warning and
which low-bit or sign interpretation the destination applies. Warning policy
never changes the conversion performed.

An enum or subrange destination records its permitted ordinal interval and
whether the source type proves containment. A required dynamic check occurs
after source evaluation and before the store, argument transfer or return.
Failure selects `F-RANGE`; successful conversion preserves the declared
representation bits.

### 5.1 C substrate caution

Signed C overflow may not implement Lanternfly wrapping. A C backend should normally
perform wrapping arithmetic in the corresponding unsigned type, then
bit-preserve into the signed interpretation.

Signed right shift, narrowing and mixed comparisons require explicit generated
forms or verified compiler assumptions.

### 5.2 BASIC substrate caution

A BASIC backend must not use floating intermediates where integer rounding,
mask or overflow results could change. Unsigned word comparison and 32-bit
operations generally require helpers on a signed 16-bit dialect.

### 5.3 Constant folding

The front end or backend may fold only after result type is resolved. Folded
values apply Lanternfly wrapping, shift and division rules rather than host-language
defaults.

### 5.4 Static text lowering

A character literal reaches the IR as an exact integer value and then follows
the ordinary expected-type rule. A C-string literal allocates immutable static
bytes containing its decoded payload followed by zero. The IR value is the
near or far address-class representation selected for that object.

An AZM backend may emit literal storage with `.cstr` when the decoded payload
can be represented by that directive without changing bytes. It may use `.db`
for escaped controls or when exact byte emission gives clearer provenance.
Both forms emit the same trailing zero. C and BASIC backends must preserve the
byte-oriented ASCII contract rather than silently adopting a host Unicode
string representation.

C-string comparison and `length` may lower inline or through selected helpers.
The helper accepts the address class declared by the operands. A far helper
must preserve and restore mapping context while it scans. Literal `length`
folds before helper selection.

## 6. Path lowering

For a scalar path, the backend receives a base and sequence of constant/dynamic
segments.

Example:

```lanternfly
monsters[index].timer
```

Descriptor:

```text
base: static monsters, near
index:
  value: index
  lowerOrdinal: 0
  stride: 6
  element: Monster
field:
  offset: 3
  type: u8
```

The backend subtracts each dimension's lower ordinal, then computes in an
address width that can represent the whole object and offset. A zero lower
ordinal folds away. Enum indices use their recorded ordinal.

### 6.1 Constant stride scaling

Preferred selection order:

1. fold constant index;
2. identity stride one;
3. shift for power of two;
4. target addressing mode;
5. short addition chain;
6. general binary shift-and-add;
7. runtime multiply helper.

The selector may use a speed/size policy. It may not change exact layout.

### 6.2 Several dynamic terms

Each dynamic index can be lowered and accumulated in sequence. Register-poor
targets may spill an intermediate or bind a temporary storage carrier.

If an early backend lacks this facility, it reports a backend capability error
with a source-level staging suggestion. The typed program remains valid Lanternfly.

### 6.3 Repeated path in read-modify-write

For:

```lanternfly
array[index] = array[index] OR mask
```

the front end should identify a single logical destination path. The backend
should compute it once unless it proves recomputation equivalent and cheaper.

This matters for cost even though initial indexes are pure.

## 7. Local allocation

A backend local allocator places scalar locals, aggregate-alias carriers and
compiler temporaries.

Possible locations:

- machine register;
- stack/frame slot;
- zero page;
- static scratch;
- substrate local variable.

The allocation report must retain type, lifetime and source identity.

### 7.1 Static scratch

Static scratch is allowed only when:

- target profile rejects recursion for the affected call graph;
- routine cannot be reentered through interrupts or callbacks;
- aliasing with host/native code is controlled;
- debugger metadata identifies it.

### 7.2 Aggregate aliases

A local aggregate alias is represented as:

- a folded static address;
- an address carrier in a register;
- an address-sized local;
- a host-language pointer/index.

It never reserves `size(aggregate)` local bytes. These representations are IR
and backend details; Lanternfly source cannot inspect or copy them.

## 8. Routine ABI

A target defines a default ABI capable of:

- scalar values through 32 bits;
- near and far aggregate aliases;
- near and far C-string views;
- opaque address values;
- one scalar result;
- normal and no-return calls;
- local cleanup;
- host/native adapters.

Lanternfly does not dictate register or stack placement.

### 8.1 Initial Z80 ABI candidate

A first implementation may follow the useful ZAX shape:

- right-to-left argument pushes;
- one 16-bit slot for values no wider than 16 bits;
- two slots for 32-bit values;
- one target-sized slot/set for near aggregate aliases;
- one bank/segment-plus-offset slot set for far aggregate aliases;
- one address-class slot/set for C-string views;
- IX frame anchor when named frame slots exist;
- scalar locals in frame slots;
- aggregate aliases as non-observable near/far address carriers;
- declared result carriers;
- generated prologue/epilogue.

That ABI is provisional backend design, not source semantics.

### 8.2 External and imported ABI adapter

An adapter contract specifies:

```text
Lanternfly signature
binding kind: profile name/substrate symbol/absolute address
substrate symbol
substrate parameter carriers/layout
substrate result carriers/layout
clobbers/preservation
memory effects
mapping effects
return behaviour
```

AZM adapters must pass strict register-contract verification.

An `extern sub` declaration enters the typed program with this contract. The
front end resolves `at` and `from` bindings, while the target profile completes
or verifies the ABI and effects. An incomplete effect description becomes a
conservative call barrier; a missing binding or incompatible ABI never reaches
backend emission.

### 8.3 Hosted body ABI

A hosted body is given:

- visible imported declarations;
- entry assumptions;
- required fall-through/epilogue label;
- permitted scratch/state;
- substrate routine ownership.

It has no Lanternfly return value. `BodyExit` targets the supplied epilogue.

## 9. Standard-operation selection

The backend keeps a registry keyed by:

```text
operation
operand/result type tuple
target CPU
platform capabilities
policy (size/speed)
```

An implementation record says:

```text
inline/native/helper/host
required imports
code/data dependencies
effects
cost model
source mapping policy
```

Selection should be deterministic.

### 9.1 Intrinsic versus visible call

`sqrt(x)` and `abs(x)` are visible standard value operations. `fill(target,
value)` and `clear(target)` are visible standard effects. The backend may
select an intrinsic, inline sequence or helper without changing their
source-level types, evaluation order or volatile-store order.

`index * 6` generated for an address is invisible runtime mechanics. It may use
the same multiplier implementation without adding a visible call to the source
summary.

`size`, `count`, `lower`, `upper` and `offset` are resolved and folded by the
front end. They do not reach the backend as runtime operations.

Cost reports distinguish source calls from compiler helpers.

## 10. Runtime package

Runtime components should be granular:

```text
arith/u16-div
arith/i16-div
arith/u32-mul
arith/isqrt-u16
memory/fill-u8
memory/clear
address/far-load-u8
address/far-store-u16
address/far-call
fault/div-zero
fault/negative-shift
fault/negative-power
fault/negative-sqrt
fault/bounds
fault/range
fault/address
fault/invalid-value
```

The linker includes transitive dependencies of selected components only.

Each component declares:

- semantic operation/version;
- targets;
- exported substrate symbol;
- ABI;
- code/data size;
- clobbers/effects;
- reentrancy and interrupt properties;
- test vectors;
- license/provenance where relevant.

Fault components are non-returning. Their profile-specific implementation may
trap to a host, terminate, or enter a monitor, but it preserves the fault class
and source provenance supplied by the call site.

## 11. Near/far aggregate storage

A target's far aggregate-carrier descriptor includes:

```text
representation fields
normalization/equality rule
current-context source
map/unmap operations
nested-call policy
interrupt policy
common-memory regions
object placement restrictions
```

### 11.1 Carrier identity

The compiler may need to compare or normalize logical locations while binding
or forwarding aggregate aliases. If several target representations can name
the same location, the backend must treat them consistently. This carrier
identity is not available to Lanternfly source code.

### 11.2 Load/store

A far scalar access must preserve all source-visible state and mapping state
required by the target contract.

Bulk operations should use a far-aware `COPY`/`FILL` implementation rather than
repeatedly mapping each byte when a target can do better.

### 11.3 Calls

Far calls must support nesting according to profile. If interrupts can observe
or alter the bank, the profile must specify disabling, preservation or
common-memory trampolines.

## 12. Opaque address spaces

An address-space plugin defines:

```text
space identity
representation type
legal offset range and wrap/fault rule
equality
CPU accessibility
services accepting the address
debug display
```

For TMS9918 VRAM, CPU accessibility is false. The VDP platform library owns
cursor and stream operations.

The generic backend must reject `Load(VRAM address)` unless an implementation
explicitly maps the space.

## 13. Glimmer manifest

The first integration manifest should be versioned and machine-readable.

Top-level:

```json
{
  "format": "lanternfly-host-manifest",
  "version": 1,
  "host": "glimmer",
  "target": "z80-tec1g-matrix",
  "body": {},
  "types": [],
  "symbols": [],
  "callables": [],
  "epilogue": {},
  "source": {}
}
```

### 13.1 Body

```text
id
display name
source span
dialect edition
host body kind
cost/timing budget if any
```

Body kind is for diagnostics/budget only. It does not add Lanternfly syntax.

### 13.2 Type entries

```text
type id/name
kind
exact size
fields with offsets
enum representation and ordered members
subrange host type and inclusive ordinal bounds
array index domains/counts/strides
aggregate storage class
C-string address class, terminator, immutability and program lifetime
Boolean width and canonical false/true bit patterns
opaque resource identity
```

### 13.3 Symbol entries

```text
name
kind: constant/storage/resource
type id
mutable
substrate symbol
address class/space
visibility
source owner
```

### 13.4 Callable entries

```text
name
parameters
result
pure/effects
implementation kind
substrate binding
ABI adapter
target availability
cost metadata
```

### 13.5 Epilogue

```text
fall-through required
generated label/id
may body no-return
host updates description
```

The Lanternfly compiler uses an abstract epilogue ID. Glimmer chooses the generated
symbol.

## 14. Compiler result to host

The result should include:

```json
{
  "generatedFragment": {},
  "requirements": {},
  "effects": {},
  "mapping": {},
  "cost": {},
  "diagnostics": []
}
```

Requirements:

- imports;
- runtime components;
- static scratch;
- generated private symbols;
- target features.

Effects:

- read symbols;
- written symbols;
- calls;
- I/O/native barriers;
- conservative inline-assembly effects;
- early/no-return.

The host merges requirements across bodies and diagnoses conflicts before final
assembly.

## 15. Source provenance

Every emitted substrate item has:

```text
generated span
origin source span
origin node ID
host body ID
role
```

Roles:

- direct statement;
- expression lowering;
- local/prologue;
- control branch;
- body epilogue transfer;
- call adapter;
- runtime helper;
- inline assembly;
- synthetic target glue.

Runtime helper source maps point to the runtime source and also retain the call
site relation in call metadata. They should not falsely attribute the helper's
entire body to one Lanternfly line.

## 16. Cost model

A backend operation estimate contains:

```text
bytes: exact/range/unknown
cycles: exact/range/unknown
temporary bytes
helper calls
context switches
iteration multiplier when statically known
confidence
assumptions
```

The report aggregates by:

- source node;
- loop;
- routine/body;
- helper;
- memory bank/section.

A dynamic loop reports per-iteration cost plus known setup, not a fabricated
total.

## 17. Z80/AZM verification gate

Generated AZM must:

- use canonical AZM 0.3 syntax;
- preserve exact Glimmer and Lanternfly layouts;
- declare generated callable routines with `.routine`;
- keep local labels in legal scoped form;
- import helpers deterministically;
- assemble under the selected profile;
- pass configured strict register-contract analysis;
- emit expected binary and map artifacts.

The gate should compare execution against the original example during
translation milestones.

## 18. Backend conformance

A backend claiming a target must pass the applicable inventory in
[the conformance and diagnostics contract](conformance.md). The following
backend-focused groups summarize that inventory:

### Numeric

- all type boundary conversions;
- enum ordinals and checked integer/enum conversion;
- subrange containment, host widening and checked destination conversion;
- value-preserving operand widening without third-type synthesis;
- round-trip destination conversion classification;
- every binary operator across required type pairs;
- signed/unsigned comparisons;
- division/remainder edge cases;
- shift counts at 0, width-1, width and above;
- power, `abs` and `sqrt` vectors;
- byte-wrap and widened-difference corpus cases;
- one-byte canonical Boolean results and invalid imported Boolean values.

### Text

- character escape decoding and expected integer typing;
- static literal bytes with exactly one trailing terminator;
- near/far C-string placement and conversion;
- content comparison and `u16` length;
- imported/native termination, immutability and lifetime contracts.

### Layout

- exact 3-, 4-, 6- and 8-byte records;
- arrays of those records;
- count, inclusive, exclusive, enum and named-subrange index domains;
- non-zero lower-bound normalization and enum declaration order;
- nested records and arrays;
- two dynamic indices;
- multidimensional arrays and integer selector tables;
- `size`, `count`, `lower`, `upper` and `offset` query vectors;
- `fill` and `clear` effects, including ordered volatile stores;
- field offsets and exact sizes;
- no substrate padding.

### Control

- all branches and loop forms;
- integer, enum and subrange selection and counted traversal;
- descending unsigned loop termination;
- counted-loop boundary and post-loop values;
- inclusive `to`, exclusive `until` and `for each` traversal;
- exit/continue;
- early routine return;
- hosted body return;
- left-to-right operand, argument, path and initializer evaluation;
- destination-before-source assignment evaluation.

### ABI

- every scalar width;
- near/far aggregate aliases;
- aggregate alias parameters;
- local aliases;
- external and imported adapters;
- profile-name, substrate-symbol and absolute-address bindings;
- nested calls;
- no-return;
- rejected recursion cycles on non-recursive profiles;
- independent frames and stack-cost reporting on recursive profiles.

### Safety

- constant and dynamic bounds failures;
- proof-based bounds-check removal;
- constant and dynamic ordinal range failures;
- proof-based range-check removal;
- arithmetic, address and invalid-value faults;
- no store after a failed destination check.

### Native boundary

- external binding resolution and conservative incomplete-effect handling;
- byte-for-byte inline assembly payload emission;
- module-item and statement placement;
- conservative barrier, spill and clobber handling;
- rejection by incompatible non-assembly backends;
- assembler diagnostics mapped to the original inline lines.

### Artifacts

- correct source mapping;
- deterministic output;
- runtime deduplication;
- inline assembly provenance and conservative effect summaries;
- cost report schema where claimed.

## 19. Reference implementation strategy

The simplest semantic oracle is a typed IR interpreter using arbitrary-precision
host integers followed by explicit Lanternfly width operations.

It should model:

- static byte-addressed regions;
- exact layouts;
- aggregate aliases as non-escaping region/object/path identities;
- near/far and opaque spaces symbolically;
- calls and host epilogues;
- platform services through injected test doubles.

It need not model CPU timing. Backends can run the same fixture state through
the interpreter and emulator/host output, then compare observable storage and
service traces.

## 20. Implementation sequence

The [implementation plan](implementation-plan.md) defines seven delivery
milestones. Their architecture order is:

1. establish source identity, diagnostics, and versioned host/target schemas;
2. parse the complete 0.4 grammar while preserving raw assembly payloads;
3. collect declarations, resolve ordinal domains, dependencies and layouts,
   and type-check K0;
4. lower the typed program to control-flow IR and execute it in the semantic
   interpreter;
5. emit canonical AZM for scalar state and structured control, assemble it,
   and compose source maps through the host;
6. add exact arrays with ordinal index domains, records, startup effects,
   multidimensional paths, scalar locals, and local aggregate aliases;
7. add source-defined routines and their ABI after storage and diagnostic
   behaviour are reliable;
8. use C, BASIC, far-memory, and additional CPU experiments to test the
   substrate independence of the established contract.

Each milestone has an executable gate. A development build may reject a
later-stage construct with an implementation-stage diagnostic, but only a
build that passes the full applicable inventory may claim 0.4 conformance.

Bounded views, parameter modes, floating point, and other post-0.4 design work
do not enter the first milestones accidentally. They require a language
decision, specification changes, conformance fixtures, and a lowering contract
before implementation.

No compiler code is part of the package at this checkpoint. The first coding
change is M0 from the implementation plan: TypeScript scaffolding, shared
source/diagnostic types, the two boundary schemas, and an empty hosted-body
result.
