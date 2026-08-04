# Lanternfly toolchain contract

Versioned separately from the language. The specification defines what a
program means; this document defines the shapes a build supplies and a
compiler validates. Nothing here is reachable from Lanternfly source.

## 1. Build manifest

A build names one root module and, optionally, the declarations that start
the program under specification section 12.6.

```text
BuildManifest
  rootModule                      // path ending in .lafy
  start: { declarationName } or null
  end:   { declarationName } or null
  targetProfileId
  placementOverrides[] (optional)
```

`start` names the prologue, `end` the epilogue. Either may be present with
an empty `declarationName`, which selects the root module's single eligible
export. Both name a subroutine with no parameters and no result, declared
in the root module and exported.

## 2. External bindings

`extern sub` resolves through the target profile's binding registry.

```text
ExternalBinding
  id
  symbol or address
  abiId
  adapterId or null
  blockingClass: "nonblocking" | { kind: "bounded", worstCase } | "unbounded"
  effects: DeclaredEffects or { kind: "conservative" }

DeclaredEffects
  { pure,
    reads:  { kind: "symbols", symbolIds[] } or { kind: "allVisible" },
    writes: { kind: "symbols", symbolIds[] } or { kind: "allVisible" },
    calls:  { kind: "callables", callableIds[] } or { kind: "unknown" },
    mayFault,
    deviceIO,
    changesMappingContext,
    returns: "normal" | "noReturn" }
```

Omitting `effects` normalises it to conservative — reads and writes of every
visible mutable object, unknown native calls, possible fault, device I/O and
mapping-context change, with normal return. That emits `W-NATIVE-001` and
blocks optimisation across the call. `pure: true` requires empty symbol sets,
forbids `allVisible` and unknown calls, and admits no device I/O or
mapping-context change; `mayFault` stays independent.

Blocking class is normative for the language: a bounded or unbounded routine
may be called only from a prologue or epilogue, or a subroutine one of those
calls, under specification section 12.4. Every unbounded call site reports
`W-NATIVE-002`.

## 3. ABI and adapters

```text
CallableAbi
  abiId
  adapterId or null
```

Without an adapter, a callable and its external binding use the same ABI.
Otherwise `adapterId` resolves an adapter from the callable's ABI to the
external one. A profile-list availability record must contain the selected
profile ID, or the compiler reports `E-TARGET-001`.

## 4. Memory regions and placement

A target profile declares its regions, their address classes, and whether the
program image may contain bytes for each. `placementOverrides` may redirect a
compiler-allocated object to a named region. Placement validation runs before
emission and reports `E-PLACE-002` for a region conflict and `E-MAP-001` for a
memory-map inconsistency.

## 5. Address classes and validity

A target profile supplies each address class's representation and its
validity contract. A well-shaped value that fails its class's selected rule,
or a service that cannot preserve it, is `E-BOUNDARY-001`; a malformed
representation or rule shape is `E-CONFIG-001`.

## 6. Standard service bindings

The optional standard modules bind through the same registry:

| Export           | Service ID                           |
| ---------------- | ------------------------------------ |
| `writeCharacter` | `standard.textOutput.writeCharacter` |
| `writeText`      | `standard.textOutput.writeText`      |
| `writeNewline`   | `standard.textOutput.writeNewline`   |
| `pollCharacter`  | `standard.characterPoll.poll`        |
| `instantCount`   | `standard.instantClock.count`        |
| `argumentCount`  | `standard.programArguments.count`    |
| `readArgument`   | `standard.programArguments.read`     |

A missing binding for a used service is `E-TARGET-001`.
`standard/character-input.lafy` binds nothing: it is an ordinary Lanternfly
module supplied as source, since it declares a task instance.

## 7. Machine-code inclusion

The language has no inline assembly: a machine-code routine is a placed
constant byte array called through an `extern sub`, under specification
section 13.3. A build may generate that array from assembly source as a step
before compilation, so the assembler lives here rather than in a self-hosted
compiler on a small target.

```text
AssembledInclusion
  sourcePath
  assemblerId
  origin or null          // null means position-independent
  emits: { constantName, elementType }
```

What it generates is ordinary Lanternfly source. A build that cannot run the
named assembler reports `E-CONFIG-001`.

## 8. Instant rate

A profile may declare an instant rate in hertz. Where it does, an instant is
that period and a delay is a lower bound in real time. Where it does not, an
instant has no duration, and a program requiring real time reports
`E-TARGET-001` rather than receiving an approximation.
