# Lanternfly lowering, backend and runtime contract

Status: architecture contract for the 0.6 implementation baseline
Implementation status: documentation only

This document specifies the boundary a compiler prototype should implement. It
does not prescribe compiler modules or data structures. The
[implementation plan](implementation-plan.md) supplies the delivery order,
package seams, and milestone gates.

Under the charter's small-systems-first direction, the reference backend
shape is direct native-code emission with backpatched fixups, matching a
single-pass front end. Assembly-source generation through AZM or another
assembler is a transparency and portability backend; its provenance and
placement contracts in this document apply to that backend form. Both forms
implement the same typed program boundary.

## 1. Responsibilities

The front end owns:

- source parsing;
- declaration-ordered import, name and type resolution;
- exact layout;
- integer result typing and conversions;
- character decoding and string invariants;
- initialization and return-path validation;
- structured-control validation;
- host/import/external interface checking;
- typed read/write/call summaries.

The target backend owns:

- scalar representation;
- path/address lowering;
- instruction or substrate selection;
- ABI and local placement;
- whole-program memory-region allocation and segment origins;
- helper selection;
- near/far mechanics;
- native adapters;
- substrate source or object emission;
- final addressed-map validation;
- source provenance;
- target cost information.

The runtime owns reusable implementations selected by the backend.

The toolchain owns the versioned export interfaces for optional standard
modules. A target profile supplies bindings only for the standard services it
supports.

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
storageClass when the declaration is a storage root
placementClass and explicit address when applicable
providerBindingId when it is a provider-bound address constant
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
subrange(typeId, baseOrdinalType, lowerOrdinal, upperOrdinal)
string(capacity, headerWidth, exactSize, terminator=0,
       reservedAllOnesLength=true, sealed=true)
record(typeId, exactSize, fields)
array(elementType, indexDomains, counts, exactStrides)
aggregateAlias(class, referentType, mutable)
address(class, representationWidth)
procedureSignature(parameters, result, errorSet?, effects)
```

`errorSet` names the `u8`-representation enum of a failable signature's
error set and is absent from a routine without a `fails` clause.

Record fields include exact byte offsets. Each array dimension records its
root ordinal family, optional nominal type, inclusive lower and upper
ordinals, count and row-major stride, so the backend does not reconstruct
semantic layout.

An aggregate-alias class is `near`, `far` or a resolved target class. It is a
compiler representation of temporary access to existing aggregate storage,
not a Lanternfly value or source-level type. Source-visible opaque address
values have only the `near address` and `far address` types. A profile may
attach a device-space identity to a binding or service contract as target
metadata, but that identity does not create a nominal Lanternfly type or alter
source compatibility.

`unit` may appear as an internal routine result marker but is never a stored
type. Boolean descriptors are invariant across targets; imported adapters
validate external representations and invoke `F-INVALID-BOOLEAN` rather than
exposing a noncanonical value to Lanternfly.

A literal node carries its decoded payload, static storage identity and
source-byte mapping.

A string descriptor selects `headerWidth=8` for capacities 1 through
254 and `headerWidth=16` for capacities 255 through 65,534. Its exact size is
capacity plus two bytes in the short form and capacity plus three in the long
form. The all-ones length is invalid in either form. The target's ordinary
endianness applies to the 16-bit length. Its sealed
header, payload and terminator have no independently addressable source fields.

The standard services also use compiler-only descriptors. The `writeText`
source records either a decoded literal payload or one evaluated `string[N]`
storage path together with its string descriptor and storage class. The
`readLine` and `readArgument` destinations each record one evaluated writable
`string[N]` path with the same static layout facts. These are temporary call
operands, not Lanternfly types, aggregate aliases or general bounded views.

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
FailCode(callId)
Phi/type block parameter, if the chosen IR uses SSA
```

For a failable call, `CallResult` is valid only on the success edge of that
call's `BranchIfFail`, and `FailCode` — the callee's error code as a `u8` of
the signature's error-set type — is valid only on its failure edge. An IR
with block parameters may pass the code as a failure-block parameter
instead of a `FailCode` node; either way the code is an explicit value, not
an implicit register.

### 4.2 Addresses

```text
StaticAddress(declarationId)
AggregateAliasBase(aliasId)
FieldAddress(base, byteOffset, fieldType)
IndexAddress(base, index, exactStride, elementType)
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

An opaque `near address` or `far address` is a scalar value, not an IR address
for Lanternfly storage. Source-derived IR cannot offset it or feed it to
`Load`, `Store`, `FieldAddress` or `IndexAddress`. Only a selected target
service implementation may interpret the value under its profile contract.

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
FailReturn(code)
BranchIfFail(call, failTarget, successTarget)
BodyExit(hostEpilogueId)
NoReturn
```

Loop syntax is gone by this stage. Its blocks retain original loop node IDs for
debugging and cost aggregation.

The front end makes every failure edge explicit; the backend receives no
implicit failure control flow. A `fail` statement becomes `FailReturn`. Each
failable invocation is followed by one `BranchIfFail` whose fail target
implements the statement's consumption form: a `FailReturn` reusing the
callee's `FailCode` for `or fail`, an evaluation of the default value for a
failure default, or the `on error` block with the code bound to its named
value. Exits that pass deferred statements route through the cleanup blocks
in reverse registration order, and a `FailReturn` reached through cleanup
preserves its code across the cleanup statements.

### 4.5 Aggregate policy

Aggregates do not appear as arbitrary IR values. They appear as typed
addresses. `COPY`, `MOVE`, `FILL`, `CLEAR`, `STRING_COPY` and `STRING_APPEND`
are explicit aggregate effects.

This matches the language rule and avoids an optimizer inventing hidden
aggregate temporaries. A source aggregate assignment becomes one explicit
`COPY` effect with source-order and volatile semantics retained. Standard
`fill` and `clear` calls become `FILL` and `CLEAR` effects after the front end
has validated their target and scalar leaf types.

`COPY` records whether either region is volatile and whether overlap is
possible. An ordinary copy has snapshot/move semantics. A volatile copy is
accepted only after the front end proves non-overlap and retains its
field-order or row-major scalar access sequence.

`STRING_COPY` and `STRING_APPEND` retain the destination capacity, header form,
source text kind, overlap possibility and required pre-write checks. They do
not decompose into source-visible field stores. `CLEAR` establishes the
all-zero empty representation when its target has a counted-string descriptor;
`FILL` never accepts one.

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
the language specification. Its target contract also requires every visible
enum, subrange, Boolean, address and string representation to
remain valid when generated Lanternfly execution resumes.

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

### 4.8 Declaration order and fixups

The typed program preserves each module's declaration order. Imported export
interfaces precede local declarations. Every local declaration records the
earlier declarations available at its source position; a routine additionally
records its own checked signature while its body is analyzed. Later names must
not appear in resolved typed nodes.

This rule permits a front end that reads and checks one module declaration at a
time, but does not require that implementation. A desktop compiler may parse a
complete tree and construct typed IR in later passes while enforcing the same
eligibility boundary.

Single-pass source checking does not require single-pass machine emission.
Structured branches, a direct self-call, the program entry, module startup
entries and final segment addresses may leave bounded backend fixups. An AZM
backend emits labels and lets AZM resolve them; a direct machine-code backend
may retain an equivalent fixup table. These are address-resolution records,
not forward-visible Lanternfly declarations.

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

The backend may emit an instruction or helper only when its result matches the
recorded semantics for all inputs.

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

### 5.4 Text lowering

A character literal reaches the IR as an exact integer value and then follows
the ordinary expected-type rule. A string literal used to initialize constant
string storage emits the full counted layout: header, decoded payload and
terminator. Its payload is at most 65,534 bytes.

An AZM backend may emit the payload bytes with `.db`, or reuse text directives
when they represent the decoded bytes without change; either way the emitted
object carries the exact header, payload and trailing zero. C and BASIC
backends must preserve the byte-oriented ASCII contract rather than silently
adopting a host Unicode string representation.

String comparison and `length` may lower inline or through selected helpers.
A far helper must preserve and restore mapping context while it runs. Literal
`length` folds before helper selection.

A counted string is a typed address to sealed inline storage rather than an
arbitrary IR aggregate value. Its capacity statically selects the header load,
payload offset and exact copy bound. `length` reads the one- or two-byte header
and zero-extends the result to `u16`. When a native contract consumes the
terminated payload, the backend forms the appropriate near or far carrier for
the payload address; this carrier is a compiler result, not a source pointer
or address value.

Checked copy and append evaluate and snapshot their sources before the first
destination write when overlap is possible. They validate capacity and a byte
append's nonzero rule, branch to `F-RANGE` on failure, then write payload,
terminator and header. An adapter that may write counted-string storage
validates length, nonzero payload and terminator before returning to generated
Lanternfly code, branching to `F-INVALID-STRING` on failure.

For `writeText`, a literal remains a decoded immutable payload and a storage
argument evaluates its complete path once. The backend forms a temporary
read-only text carrier suitable for the selected ABI. It may pass the existing
terminated payload directly to a monitor or firmware routine, or adapt the
header and payload to another target contract. The carrier is consumed by the
call and cannot enter a scalar value, source aggregate alias or stored IR
location. The operation never validates a native write because its contract
does not permit one.

For `readLine`, the destination path also evaluates once. The backend forms a
temporary writable text carrier with its capacity and selected string layout.
The service establishes an empty destination, stores each valid input byte up
to capacity, maintains the terminator and length, and consumes the input
through the selected line ending. It returns canonical `true` when the whole
line fits. After a zero byte or capacity overflow it retains the longest valid
prefix, discards the rest of the line and returns canonical `false`. A native
binding must preserve the final string invariants before Lanternfly resumes.

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
array[index] = array[index] or mask
```

the front end retains two path occurrences. The destination path is evaluated
first; the right-hand path is evaluated later as part of the source expression.
A backend may share their address calculation only after proving that both
occurrences are free of calls, faults and volatile reads, produce the same
address and cannot be distinguished by any intervening effect.

This restriction preserves the language rule because an index expression may
call, fault or read volatile storage.

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
- routine cannot be reentered through interrupts or callbacks — the
  interrupt half holds by the handler rule: handlers are native code that
  never call Lanternfly routines or static-scratch components;
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
- near and far string aliases with exact capacities;
- opaque address values;
- one scalar result;
- a failure channel for failable routines: a one-bit completion discriminant
  plus a `u8` error code, absent from routines without a `fails` clause;
- normal and no-return calls;
- local cleanup;
- host/native adapters.

A target that supplies the optional standard service modules also defines
carriers for the compiler-only read-only source used by `writeText` and the
writable destinations used by `readLine` and `readArgument`. A carrier may
contain an address, length, capacity or mapping context as required by that
target. None of those fields becomes a source value. `readLine` and
`readArgument` return canonical `boolean` values. The remaining standard
service operations use ordinary `u8`, no-result or `u8`-result ABI forms.

Lanternfly does not dictate register or stack placement. The failure channel
is normative as an abstract obligation — a discriminant and a code, produced
and consumed at the boundaries section 11.8 of the specification defines —
while its register realization is target ABI design like every other row of
this section; the carry/A choice below is the provisional Z80 candidate, not
a language rule.

For a failable program entry, this channel terminates at the target profile's
program-termination implementation rather than a source caller. Normal entry
completion supplies the successful outcome; `fail` supplies the failure
outcome and zero-based enum member. A numeric-exit-status implementation emits
zero for success and `n + 1` for a failed member whose ordinal is `n`. Cost
reports attribute any boundary conversion and termination component to program
termination rather than to ordinary failable calls.

### 8.1 Initial Z80 ABI candidate

A first implementation follows the static-frame storage model:

- arguments stored to the callee's static slots, or carried in registers
  where the compiler proves both sides of the call;
- one 16-bit slot for values no wider than 16 bits;
- two slots for 32-bit values;
- one target-sized slot/set for near aggregate aliases;
- one bank/segment-plus-offset slot set for far aggregate aliases;
- scalar locals, parameters and temporaries in overlay-colored static
  slots; no frame pointer, and no generated prologue or epilogue outside
  recursion-admitted cycles;
- save-around lowering at call sites inside recursion-admitted cycles:
  the values live across the call, alias and address carriers included,
  pushed before the call and restored after it;
- assume-all-clobbered register handling at calls to forward-declared
  routines emitted before their completing bodies;
- the alternate register set reserved for the target's designated
  interrupt level; compiled code and runtime components never use it;
- aggregate aliases as non-observable near/far address carriers;
- declared result carriers;
- the carry flag as the failure discriminant with the error code in A: `SCF`
  before a failing return, carry clear on a successful one;
- propagation as `RET C` where no save-around bracket is open, folding to
  the plain final `RET` in tail position; a bracketed call site propagates
  through a restore stub that preserves the result carrier, the failure
  discriminant and the error code;
- failure-code preservation around deferred cleanup calls that may clobber
  A or the flags.

That ABI is provisional backend design, not source semantics. The carry
choice rests on the Z80 mechanism — `SCF` sets the discriminant in one
instruction, the conditional return and jump forms test it directly, and A
stays free for the code — and native routines that already report status
in carry, such as the corpus predicate routines, can bind through a future
`fails` contract with little or no adapter.

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
or verifies the ABI and effects. An omitted effect field or explicit
`{ kind: "conservative" }` normalizes to the conservative call barrier and emits
`W-NATIVE-001`; a missing binding or incompatible ABI never reaches backend
emission.

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
value)`, `clear(target)` and `append(destination, source)` are visible standard
effects. The backend may
select an intrinsic, inline sequence or helper without changing their
source-level types, evaluation order or volatile-store order.

`index * 6` generated for an address is invisible runtime mechanics. It may use
the same multiplier implementation without adding a visible call to the source
summary.

`size`, `count`, `lower`, `upper` and `offset` are resolved and folded by the
front end. They do not reach the backend as runtime operations.

Cost reports distinguish source calls from compiler helpers.

### 9.2 Optional standard services

The compiler-supplied interfaces for `standard/text-output.lafy`,
`standard/text-input.lafy` and `standard/program-arguments.lafy` map their
exports to seven stable service IDs:

```text
standard.textOutput.writeCharacter
standard.textOutput.writeText
standard.textOutput.writeNewline
standard.textInput.readCharacter
standard.textInput.readLine
standard.programArguments.argumentCount
standard.programArguments.readArgument
```

The first five IDs belong to `standard/text-output.lafy` and
`standard/text-input.lafy`; the final two belong to
`standard/program-arguments.lafy`. The selected target resolves each used ID
through its existing external-binding, ABI, adapter and runtime-component
registries. No new stream, file or process registry is implied. A missing
binding is `E-TARGET-001` for the optional module that the program imported.

The typed IR records these calls as visible `StandardCall` effects with normal
return. The text operations carry declared device I/O. `writeCharacter`
receives one converted `u8`. `writeText` receives the compiler-only text source
described in sections 3 and 5.4 and records a read of its storage argument when
it has one. `writeNewline` has no source operand. `readCharacter` blocks in the
abstract service model until it produces one `u8` result. `readLine` receives
the compiler-only writable destination, blocks until a complete line has been
consumed, writes the bounded result and produces one canonical Boolean result.
`argumentCount` produces one `u8`; `readArgument` receives an ordinary `u8`
index and the compiler-only writable destination, writes the specified bounded
result and produces one canonical Boolean result. `argumentCount` is pure for
one invocation; `readArgument` records only its destination write. The
interpreter implements all seven operations through injected services and
records their ordered service and destination-write events.

The backend may bind several operations to one monitor routine or implement
one operation with generated substrate code. It includes only the bindings,
adapters and runtime components reached by the imported and used operations.
Source maps attribute the call site to the Lanternfly invocation and retain
the selected service implementation as related generated provenance.

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
fault/invalid-boolean
fault/invalid-string
```

The two invalid-representation components report the public
`F-INVALID-BOOLEAN` and `F-INVALID-STRING` classes. Runtime component names
remain internal and do not replace conformance fault IDs.

Component inclusion covers selected components and their transitive
dependencies only.

A standard capability module under specification section 1.1 makes its type
descriptors and component implementations eligible through the same
registry; the import itself selects nothing. Typed operations the program
actually uses select components, transitive dependencies determine the
emitted bytes, and an unused operation contributes no bytes, so an unused
capability import changes the accepted language and nothing else. The cost
report attributes each selected capability component to its enabling
import. A banked target may group a capability's components into a bank as
a placement choice; a profile whose banking granularity forces inclusion of
unselected components must declare that exception in its cost report. An
unused import includes nothing under any banking granularity; the exception
concerns only a bank that a used component selects and that also contains
unselected components. A
non-kernel scalar type lowers through one generic wide-scalar strategy:
operands live in memory temporaries and operations call the type's helper
table, so each added capability type contributes a descriptor and helpers,
not new backend code paths.

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

A component holding static scratch declares itself non-interrupt-safe, and
the handler rule forbids calling it from interrupt context.

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

Far calls must support nesting according to profile. If an interrupt handler
can read or alter the bank, the profile must specify disabling, preservation or
common-memory trampolines.

## 12. Target registry and opaque address metadata

The target profile defines the legal placement space before it defines
bindings within that space:

```text
memoryRegions[]: MemoryRegion
  MemoryRegion
    id
    addressSpaceId
    start
    endExclusive
    minimumAlignment
    permissions { read, write, execute }
    allocation: "automatic" | "explicitOnly"
    initialization { preloadedImage, startupWrite }

placementDefaults: PlacementDefaults
  code: PlacementTarget
  constantData: PlacementTarget
  variableData: PlacementTarget
  staticScratch: PlacementTarget

PlacementTarget
  regionId
  start or null
  alignment

placementOverrides: PlacementOverrides
  code: PlacementTarget or null
  constantData: PlacementTarget or null
  variableData: PlacementTarget or null
  staticScratch: PlacementTarget or null
```

The configuration validator rejects empty or overlapping regions, invalid
alignment, incompatible permissions, an unresolved region ID and an automatic
placement target that names an `explicitOnly` region. A numeric start fixes the
first nonempty range of its class; an occupied or misaligned start is an error.
A null start continues at the first aligned free address after earlier classes
in the same region. Later allocation splits around explicit `at` reservations.
The class order is code, constant data, variable data and static scratch.

The target profile owns `placementDefaults`; a standalone or whole-program
host request owns `placementOverrides`. An isolated body request owns neither
final addresses nor overrides.

Placement and final-map artifacts qualify each address with its region's
address-space ID. A backend may use bare numeric addresses only when the
selected profile makes the address space unambiguous.

The target profile uses these exact registry names:

```text
substrateSymbolResolver: SubstrateSymbolResolver
externalBindings[]: ExternalBinding
callableAbiDefinitions[]: CallableAbiDefinition
adapterDefinitions[]: AdapterDefinition
runtimeComponents[]: RuntimeComponent
faultBindings[]: FaultBinding
callableCostMetadata[]: CallableCostMetadata
addressBindings[]: ProviderAddressBinding
addressValidityContracts[]: AddressValidityContract
```

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

Every `implementationId` resolves through the selected backend's implementation
registry. Runtime-component dependencies resolve within `runtimeComponents` and
are acyclic. ABI IDs resolve through `callableAbiDefinitions`; adapter endpoints
use the same namespace and their component IDs resolve through
`runtimeComponents`. A fault ID is public, its component is non-returning, and
an external binding that selects a runtime component has the same non-null
`abiId` as that component. IDs are unique within their named arrays.

For a callable using `targetBinding`, `bindingId` resolves through
`externalBindings`. With no adapter, the callable and external binding use the
same ABI. Otherwise `adapterId` resolves an adapter from the callable ABI to the
external ABI. A `hostSymbol` uses the callable ABI directly or through its named
adapter. Profile-list availability contains the selected profile ID; otherwise
the callable is unavailable and receives `E-TARGET-001`.

The selected profile contains one `substrateSymbolResolver`. A
configuration-phase resolver produces exact bytes during configuration. A
link-phase resolver may defer them, but must produce exact bytes and run the
selected validity rule before emitted-program completion. An unresolved provider
symbol is `E-CONFIG-002`; a resolved provider value that fails its rule is
`E-BOUNDARY-001`. An unresolved callable or external-binding symbol is
`E-EXTERN-001`.

The target profile defines address capabilities, provider bindings and validity
contracts with these closed records:

```text
AddressClassCapability
  { supported: true, representationWidth, validityContractId }
  or { supported: false, representationWidth: null,
       validityContractId: null }

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

The host manifest refers to a provider binding by ID. Manifest validation
requires the binding's class to match the constant's declared `near address` or
`far address` type. Validity belongs to the address-class capability, which
selects `validityContractId`; the provider binding does not repeat it. A service
contract may name the same binding or `deviceSpaceId` among the addresses it
accepts.

A supported class and its selected contract have the same positive
byte-multiple representation width. Literal representation bytes, masks and
expected bytes are integers from zero through 255. Literal byte arrays have
exactly `representationWidth / 8` entries. The configured symbol resolver
supplies exact representation bytes at its declared phase before applying the
rule. A `{ kind: "bytes" }` provider is validated during configuration.

`allBitPatterns` accepts every sequence. `unsignedRange` decodes one unsigned
integer in the target profile's endianness and accepts inclusive `min` through
`max`; the endpoints fit the width and `min <= max`. For `maskedBytes`, expected
bits outside their mask are zero, and byte `i` is valid exactly when
`(bytes[i] and mask[i]) = expected[i]`.

Applying the selected rule to an all-zero sequence derives zero-validity.
Compiler-owned address storage without an initializer receives `E-INIT-006`
when zero is invalid; no separate flag can disagree with the rule. A
well-shaped resolved provider or native value that fails the rule is an
`E-BOUNDARY-001` boundary failure.

An unknown union tag, missing or forbidden alternative field, unknown field or
out-of-range byte is `E-CONFIG-001`. A well-shaped wrong byte length, invalid
range/mask rule, unresolved binding, contract or substrate symbol, duplicate ID,
or class/width mismatch is `E-CONFIG-002`.

Device-space metadata does not create a nominal Lanternfly type. Source
compatibility and equality continue to use only `near address` and
`far address`. The generic front end and backend do not derive offsets, loads,
stores or storage paths from an opaque address.

For TMS9918 VRAM, the VDP platform library owns cursor and stream operations.
Only the implementation of a selected target service may interpret the numeric
carrier or device-space metadata.

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
subrange base type and inclusive ordinal bounds
array index domains/counts/strides
string capacity, header width, exact size, terminator and sealed invariants
Boolean width and canonical false/true bit patterns
```

Enum and subrange entries carry stable nominal type IDs. Record and array
entries carry the same exact layout and normalized ordinal-domain facts as
source-defined types. Manifest validation rejects invalid representations,
domains, dependencies and layouts before source checking.

### 13.3 Symbol entries

```text
ConstantSymbol
  id
  name
  kind: constant
  constantType:
    { kind: typed, typeId }
    or { kind: exactInteger }
  value or providerAddressReference:
    scalar value or aggregate initializer
    ProviderAddressReference { bindingId }
  visibility

StorageSymbol
  id
  name
  kind: storage
  typeId
  mutable
  volatile
  owner: host/source/native
  storageClass: near/far
  substrateSymbol
  visibility
```

A constant entry may contain an exact integer, an ordinary typed scalar value,
an immutable aggregate initializer or a provider address reference. Its kind
makes it immutable; `ConstantSymbol` has no `mutable` or substrate-binding
field. `exactInteger` has no runtime representation. Aggregate constants obey
ordinary initializer, type-identity and exact-layout rules. Exactly one of
`value` and `providerAddressReference` is present, and the latter is valid only
when a typed constant's `typeId` names `near address` or `far address`.
`ProviderAddressReference` contains only the binding ID; the constant's
declared type supplies its expected near/far class. The target profile's
`ProviderAddressBinding` supplies the actual class, a closed
`{ kind: "substrateSymbol", symbol }` or `{ kind: "bytes", bytes[] }`
representation and optional `deviceSpaceId`. The address-class capability
supplies `validityContractId`. Manifest validation resolves the binding and
class contract, then rejects an invalid representation or class mismatch. The
resulting opaque address is available for ordinary runtime value use but not for
source constant expressions.

A host resource maps to an ordinary constant, a constant containing a provider
address reference, mutable storage or a callable entry. Richer resource
metadata remains outside the Lanternfly namespace.

### 13.4 Callable entries

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

All records and unions are closed. `AggregateParameter` accepts only a string,
record or fixed-array `typeId`. `hostSymbol` names a symbol supplied directly by the host;
`targetBinding` resolves through the target profile's `externalBindings`.
`abiId` names a target ABI description and `adapterId` names an optional
boundary adapter. `costMetadataId` resolves through the target's
`callableCostMetadata`. Byte and cycle counts are non-negative, a cycle range
has `min <= max`, and an empty `profileIds` list is invalid. Every referenced ID
resolves uniquely.

An omitted `effects` field normalizes to `{ kind: "conservative" }`. It assumes
reads and writes of every visible mutable object, unknown native calls, possible
fault, device I/O and mapping-context change, with normal return. It emits
`W-NATIVE-001` and blocks optimization across the call.

In declared effects, `pure: true` requires empty `symbols` reads and writes,
forbids `allVisible` and `{ kind: "unknown" }` calls, and requires no device I/O
or mapping-context change. Every listed callable also has declared pure effects.
`mayFault` remains independent because a pure value operation can fault.

### 13.5 Epilogue

```text
fall-through required
generated label/id
may body no-return
host updates description
```

The Lanternfly compiler uses an abstract epilogue ID. The host supplies the
generated symbol.

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
- code, constant-data and writable-data size/alignment requirements without a
  fragment origin;
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
fragment ID
anchor ID
generated span within fragment text
origin SourceSpan
origin node ID
host body ID
role
```

The backend records this relation while lowering. It does not recover source
ownership by comparing Lanternfly text with generated assembly. Several
records may name one source node, and a node that emits no code has an empty
generated range.

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

For AZM, every emitted fragment contains a deterministic compiler-owned anchor
at a recorded offset. A standalone routine or initializer can use its entry
label. A hosted fragment uses a local label beneath the host's non-local
routine label, which preserves AZM routine scope. The host inserts the fragment
unchanged.

After the complete AZM source is assembled, map composition:

1. locates each unique anchor in the final source or symbol map;
2. subtracts the recorded anchor offset and validates the exact fragment text;
3. turns fragment-relative generated spans into final AZM spans;
4. joins those spans to assembler segments by generated line and column;
5. retains the AZM span, generated role and source node alongside every
   resulting machine range.

Generated wrappers stay mapped to generated AZM. Inline payloads return to
their original source lines. Runtime helpers retain their own source plus the
calling node. The same join reattributes assembler diagnostics without
discarding their generated context. An integrity failure reports `E-MAP-001`,
and no partial or guessed map is published.

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

## 17. Z80/AZM placement and verification gate

The first backend selects size-known instruction, helper and adapter forms
before it completes the placement plan. An AZM planning pass also obtains the
size and explicit addressed ranges of raw module assembly. A branch-relaxation
change reruns the plan. The backend reserves those assembly ranges and every
explicit `at` range before allocating unplaced components, then assigns source
code, helpers and adapters to the code class, immutable aggregates to constant
data, mutable module storage to variable data and eligible compiler temporaries
to static scratch. Stable source and component ordering makes the plan
deterministic.

Each contiguous segment begins with `.org` at its planned address. A hosted
body fragment contains no `.org`; the host assigns final segment addresses when
it combines bodies, wrappers, state, libraries and runtime components. If a
module `asm` block changes AZM placement, the backend restores the next planned
segment origin after the block.

AZM's address-planning pass may resolve generated labels, later branch targets,
the entry symbol and other machine fixups. The resulting initialized-byte map,
reserved-address set and symbol table are checked against the Lanternfly plan.
This final gate catches code-size growth, an inline origin directive, a backend
defect or any other emission or reservation that crosses a region boundary,
violates permissions or alignment, or overlaps another planned range.

Generated AZM must:

- use canonical AZM 0.3 syntax;
- emit segment `.org` directives from the validated plan;
- preserve exact Glimmer and Lanternfly layouts;
- declare generated callable routines with `.routine`;
- keep local labels in legal scoped form;
- import helpers deterministically;
- assemble under the selected profile;
- reproduce the planned initialized-byte, reserved-address and symbol maps;
- pass configured strict register-contract analysis;
- emit expected binary and map artifacts.

A non-AZM backend uses its substrate toolchain's placement mechanism to
preserve the same plan and returns equivalent occupancy and symbol artifacts.
It reports `E-TARGET-001` for a target whose placement contract it cannot
express.

The gate should compare execution against the original example during
translation milestones.

## 18. Backend conformance

A backend claiming a target must pass the applicable inventory in
[the conformance and diagnostics contract](conformance.md). The following
backend-focused groups summarize that inventory:

### Numeric

- all type boundary conversions;
- enum ordinals and checked integer/enum conversion;
- subrange containment, implicit base-type conversion and checked destination conversion;
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
- literal storage with exact header, payload and trailing terminator;
- short and long string layouts at capacities 254 and 255;
- header-read length, checked copy/append, clear and content comparison;
- terminated-payload native contracts and native-write invariant validation;
- optional standard text-module imports, temporary read-only `writeText` and
  writable `readLine` carriers, bounded line-input results, ordered
  output/input service traces and unavailable-binding rejection.

### Program invocation

- default `main` and explicit manifest entry selection;
- successful and failable entry termination through the selected profile;
- numeric exit status zero for success and failed ordinal plus one;
- optional program-arguments import, zero through 255 supplied arguments,
  repeated reads, temporary writable `readArgument` carriers, bounded copies,
  invalid indices, launcher-input traces and unavailable-binding rejection.

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
- `fail`, `or fail` propagation through one and two levels, failure
  defaults evaluated only on failure, and `on error` blocks with unwritten
  destinations;
- deferred-statement execution in reverse registration order on return,
  `fail`, propagation and end-of-body exits;
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
- the failure channel across result-free and result-bearing failable
  signatures, including tail-position folding and code preservation across
  deferred cleanup;
- consumption of a failable entry outcome by the profile's program-termination
  implementation;
- rejected recursion cycles on non-recursive profiles;
- independent per-invocation scalar state and stack-cost reporting on
  recursive profiles;
- save-around brackets at recursive call sites, with restore stubs that
  preserve the result carrier, failure discriminant and error code on
  success and failure paths alike.

### Safety

- constant and dynamic bounds failures;
- proof-based bounds-check removal;
- constant and dynamic ordinal range failures;
- proof-based range-check removal;
- arithmetic, `F-INVALID-BOOLEAN` and `F-INVALID-STRING` faults;
- no store after a failed destination check;
- single-instruction volatile word access where the target provides it,
  never split into byte accesses an interrupt could divide.

### Native boundary

- external binding resolution and conservative incomplete-effect handling;
- byte-for-byte inline assembly payload emission;
- module-item and statement placement;
- conservative barrier, spill and clobber handling;
- rejection by incompatible non-assembly backends;
- assembler diagnostics mapped to the original inline lines.

### Placement

- target memory-region shape, permissions, initialization and alignment;
- deterministic class allocation around explicit `at` reservations;
- standalone origin overrides constrained by the selected profile;
- hosted fragments without independent origins;
- AZM `.org` directives at planned segment starts;
- final initialized-byte, reserved-address and symbol maps equal to the
  placement plan;
- `E-PLACE-001` for an unsatisfied plan and `E-PLACE-002` for emission outside
  it.

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
- near/far address values and target device-space metadata symbolically;
- calls and host epilogues;
- platform services through injected test doubles.

It need not model CPU timing. Backends can run the same fixture state through
the interpreter and emulator/host output, then compare observable storage and
service traces.

## 20. Implementation sequence

The [implementation plan](implementation-plan.md) defines seven delivery
milestones. Their architecture order is:

1. establish source identity, diagnostics, and versioned host/target schemas;
2. parse the complete 0.6 grammar while preserving raw assembly payloads;
3. resolve imports and check declarations, ordinal domains and layouts in
   source order, then type-check K0;
4. lower the typed program to control-flow IR and execute it in the semantic
   interpreter;
5. plan target regions, emit canonical AZM for scalar state and structured
   control, assemble it, validate its final memory map and compose source maps
   through the host;
6. add exact arrays with ordinal index domains, records, startup effects,
   multidimensional paths, hosted-body scalar locals, and hosted-body local
   aggregate aliases;
7. add source-defined routines, source-routine scalar locals, and their ABI
   after storage and diagnostic behaviour are reliable, including failable
   routines, failable program entry, `defer`, the optional standard service
   interfaces and their target bindings.

After those seven milestones, C, BASIC, far-memory and additional CPU
experiments test the substrate independence of the established contract.

Each milestone has an executable gate. A development build may reject a
later-stage construct with an implementation-stage diagnostic, but only a
build that passes the full applicable inventory may claim 0.6 conformance.

General bounded views, parameter modes, floating point, and other post-0.6 design work
do not enter the first milestones accidentally. They require a language
decision, specification changes, conformance fixtures, and a lowering contract
before implementation.

No compiler code is part of the package at this checkpoint. The first coding
change is M0 from the implementation plan: TypeScript scaffolding, shared
source/diagnostic types, the two boundary schemas, and an empty hosted-body
result.
