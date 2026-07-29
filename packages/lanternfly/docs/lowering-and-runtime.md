# Lanternfly lowering, backend and runtime contract

Status: working architecture contract
Implementation status: documentation only

This document specifies the boundary a compiler prototype should implement. It
does not prescribe compiler modules or data structures.

## 1. Responsibilities

The front end owns:

- source parsing;
- name and type resolution;
- exact layout;
- integer promotions and conversions;
- definite assignment;
- structured-control validation;
- host/import interface checking;
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
initializer or import binding
```

Each expression has:

```text
nodeId
sourceSpan
resolved type
value/storage/reference category
constant value when known
narrowing/promotion decisions
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
record(typeId, exactSize, fields)
array(elementType, counts, exactStrides)
reference(class, referentType, mutable)
address(class, representationWidth)
opaqueAddress(spaceId, representationWidth)
procedureSignature(parameters, result, effects)
```

Record fields include exact byte offsets. Array descriptors include every
row-major stride so the backend does not recalculate semantic layout.

Reference class is `near`, `far` or a resolved target class. Opaque address
spaces are nominal.

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
ReferenceValue(value)
FieldAddress(base, byteOffset, fieldType)
IndexAddress(base, index, exactStride, elementType)
OpaqueAddressOffset(base, offset)
```

An address retains:

- referent type;
- address class/space;
- mutability;
- source path provenance.

`OpaqueAddressOffset` cannot feed `Load`/`Store` unless its space is declared
CPU-accessible.

### 4.3 Effects

```text
Store(type, address, value)
Call(signatureId, arguments)
StandardCall(operationId, arguments)
NativeBarrier(contractId)
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
aggregate copies.

## 5. Numeric lowering contract

The front end records promoted operand and result types. The backend implements
those types exactly.

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
  stride: 6
  element: Monster
field:
  offset: 3
  type: u8
```

The backend computes in an address width that can represent the whole object
and offset.

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
targets may spill an intermediate or bind a temporary reference.

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

A backend local allocator places scalar/reference locals and compiler
temporaries.

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
- a reference in a register;
- an address-sized local;
- a host-language pointer/index.

It never reserves `SIZEOF(aggregate)` local bytes.

## 8. Routine ABI

A target defines a default ABI capable of:

- scalar values through 32 bits;
- near and far references;
- opaque address values;
- one scalar/reference result;
- normal and no-return calls;
- local cleanup;
- host/native adapters.

Lanternfly does not dictate register or stack placement.

### 8.1 Initial Z80 ABI candidate

A first implementation may follow the useful ZAX shape:

- right-to-left argument pushes;
- one 16-bit slot for values no wider than 16 bits;
- two slots for 32-bit values;
- one target-sized slot/set for references;
- IX frame anchor when named frame slots exist;
- scalar locals in frame slots;
- aggregate aliases as near/far reference values;
- declared result carriers;
- generated prologue/epilogue.

That ABI is provisional backend design, not source semantics.

### 8.2 Imported ABI adapter

An adapter contract specifies:

```text
Lanternfly signature
substrate symbol
substrate parameter carriers/layout
substrate result carriers/layout
clobbers/preservation
memory effects
mapping effects
return behaviour
```

AZM adapters must pass strict register-contract verification.

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

`ISQRT(x)` is a visible standard call. The backend may select an intrinsic.

`index * 6` generated for an address is invisible runtime mechanics. It may use
the same multiplier implementation without adding a visible call to the source
summary.

Cost reports distinguish source calls from compiler helpers.

## 10. Runtime package

Runtime components should be granular:

```text
arith/u16-div
arith/i16-div
arith/u32-mul
arith/isqrt-u16
address/far-load-u8
address/far-store-u16
address/far-call
fault/div-zero
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

## 11. Near/far runtime

A target's far-reference descriptor includes:

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

### 11.1 Equality

Far-reference equality compares logical addresses. If several representations
can name the same location, the target must normalize or compare accordingly.

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
array counts/strides
reference class
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

A backend claiming a target must pass:

### Numeric

- all type boundary conversions;
- every binary operator across required type pairs;
- signed/unsigned comparisons;
- division/remainder edge cases;
- shift counts at 0, width-1, width and above;
- power/square-root vectors;
- byte-wrap and widened-difference corpus cases.

### Layout

- exact 3-, 4-, 6- and 8-byte records;
- arrays of those records;
- nested records and arrays;
- two dynamic indices;
- reference arrays;
- field offsets and `SIZEOF`;
- no substrate padding.

### Control

- all branches and loop forms;
- descending unsigned loop termination;
- exit/continue;
- early routine return;
- hosted body exit.

### ABI

- every scalar width;
- near/far references;
- aggregate reference parameters;
- local aliases;
- imported adapter;
- nested calls;
- no-return.

### Artifacts

- correct source mapping;
- deterministic output;
- runtime deduplication;
- cost report schema where claimed.

## 19. Reference implementation strategy

The simplest semantic oracle is a typed IR interpreter using arbitrary-precision
host integers followed by explicit Lanternfly width operations.

It should model:

- static byte-addressed regions;
- exact layouts;
- typed references as region/object/path identities;
- near/far and opaque spaces symbolically;
- calls and host epilogues;
- platform services through injected test doubles.

It need not model CPU timing. Backends can run the same fixture state through
the interpreter and emulator/host output, then compare observable storage and
service traces.

## 20. Implementation sequence

Documentation recommends:

1. manifest schema and type descriptors;
2. parser/type checker for K0;
3. typed IR plus interpreter;
4. AZM reference lowering for scalar state/control;
5. maps and Glimmer host epilogue;
6. exact arrays/records and path lowering;
7. helper registry and cost skeleton;
8. local aliases/references;
9. user routine ABI;
10. C and BASIC experiments;
11. far/address-space lowering.

No compiler code is part of the current package yet.
