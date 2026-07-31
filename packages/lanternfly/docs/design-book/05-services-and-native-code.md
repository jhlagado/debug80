# Services, native code and the runtime

A Z80 has no single multiply or divide instruction. A 6502 needs software for
wide arithmetic. A BASIC substrate already has operators, but may lack
unsigned words. Lanternfly keeps one source meaning by separating language
semantics from the machinery used to implement them.

## Four implementation layers

### Core semantics

Assignment, arithmetic, comparison, bit operations, ordinal conversion,
structured control, paths and calls are language operations. A backend must
implement them even when the target needs a helper.

Source never imports an internal name such as `__divide_u16`.

### Standard operations

The first edition has a deliberately small visible set:

| Operation                  | Meaning                                     |
| -------------------------- | ------------------------------------------- |
| `abs(value)`               | unsigned magnitude at the same width        |
| `sqrt(value)`              | floor of a non-negative integer square root |
| `length(text)`             | payload byte count of a `cstring`           |
| `size(type-or-path)`       | exact compile-time byte size                |
| `count(array, dimension?)` | compile-time dimension extent               |
| `lower(array, dimension?)` | first valid ordinal index                   |
| `upper(array, dimension?)` | last valid ordinal index                    |
| `offset(Record.fieldPath)` | compile-time field offset                   |
| `clear(target)`            | ordered all-zero aggregate store            |
| `fill(target, value)`      | ordered repeated scalar store               |

Power is the `^` operator, not a second function. Aggregate assignment performs
complete equal-type copying, so the core does not need separate `copy` and
`move` procedures.

`clear` is legal only when every scalar leaf accepts the all-zero
representation. `fill` converts its value once before the first store. Both
visit array elements in row-major order, which matters for volatile effects.

### Platform services

Input, display, sound, device memory and randomness depend on a platform:

```lanternfly
key = scanKeys()
framebufferPlot(x, y, colour)
soundStart(duration, divider)
vdpWrite(nameAddress, tileDataAddress)
```

These are typed routines supplied through a host manifest, target profile or
module. Their absence is a capability error rather than a missing keyword. Here
the two VDP arguments are provider-bound `near address` or `far address` values
interpreted by the service, not an immutable array passed to a writable
aggregate parameter. Any device-space identity is target metadata on their
bindings and the service contract.

### Hidden runtime helpers

A backend may link helpers for:

- signed and unsigned division;
- wide multiplication and 32-bit operations;
- dynamic shifts and power;
- integer square root;
- constant-stride address calculation;
- far aggregate or C-string access;
- fault dispatch.

Only selected helpers are linked. Their identities appear in artifacts and
cost reports, not in ordinary name lookup.

## Static text as a boundary type

`cstring` is a non-null, read-only view of program-lifetime NUL-terminated bytes:

```lanternfly
const banner as near cstring = "LANTERNFLY"

extern sub printText(text as near cstring)
```

The value carries an address class but no length, capacity or ownership.
Assignment copies that carrier, not the bytes. `length` scans to the
contract-bounded terminator and returns `u16`; literal calls fold.

Writable text remains ordinary `u8` storage with an explicit capacity.
Lanternfly does not pretend that a terminator proves enough destination space.
Bounded writable views remain later design work.

## External routine declarations

Existing substrate routines enter through typed `extern sub` declarations:

```lanternfly
extern sub checkCollisionAt(x as i16, y as i16) as boolean from "CheckCollAt"
extern sub firmwarePrint(text as near cstring) at $0033
```

An external declaration may bind an address, a substrate symbol or a
target-profile name. The contract includes:

- Lanternfly parameter and result types;
- substrate binding and supported target;
- ABI and storage classes;
- visible reads, writes, calls and faults;
- device I/O or mapping-context changes;
- normal or no-return control flow.

The compiler generates an adapter when the substrate ABI differs from the
Lanternfly ABI. AZM `.routine` contracts then verify that adapter and callee.

## Effects are part of the interface

A routine is not pure merely because its result is discarded. The effect
summary records visible storage access, calls, faults, device I/O, mapping
changes and control flow.

An incomplete native contract is conservative. It may read or write visible
mutable storage and perform I/O. This prevents unsafe reordering and allows a
counted loop to reject a call that might mutate its control variable.

Purity permits reordering, elimination and other optimizations only when the
implementation satisfies the declared effect contract. Effectful calls remain
legal in expressions and expression statements.

## Assembly blocks

`asm`/`end` exposes the selected assembler directly:

```lanternfly
asm
    ; exact target assembly
end
```

At module level, the block may contain directives, data or routines. At
statement level, it emits code at that control point and forms a conservative
compiler barrier. Its payload passes through verbatim to an assembly-source
backend.

A non-assembly target rejects the block unless its profile supplies a
compatible fragment pipeline. Statement assembly defaults to fall-through and
may not bypass a hosted epilogue. A declared no-return native boundary ends
control flow explicitly.

## Far access

Far aggregate parameters, aliases and C strings may require a bank or segment
carrier. A far call commonly:

1. evaluates and preserves arguments;
2. saves the current mapping context;
3. selects the callee context;
4. invokes the near entry;
5. preserves the result;
6. restores the caller's context.

Nested calls and interrupts must preserve mapping state according to the target
contract. Far data access may use scalar-width helpers, a mapped window, an
inline switch for a known bank or a bulk service.

The carrier remains invisible to source. There is no far pointer arithmetic or
reference variable.

## Runtime faults

Bare-metal systems may lack exceptions and standard output, but they can still
distinguish faults:

| Fault               | Condition                                              |
| ------------------- | ------------------------------------------------------ |
| `F-BOUNDS`          | dynamic array index outside its domain                 |
| `F-RANGE`           | value entering an enum/subrange destination is invalid |
| `F-DIV-ZERO`        | runtime division or `mod` by zero                      |
| `F-NEGATIVE-SHIFT`  | negative runtime shift count                           |
| `F-NEGATIVE-POWER`  | negative runtime exponent                              |
| `F-NEGATIVE-SQRT`   | negative runtime square-root operand                   |
| `F-LOOP-RANGE`      | continuing loop value cannot fit its control type      |
| `F-ADDRESS`         | checked far-to-near C-string conversion fails          |
| `F-INVALID-BOOLEAN` | imported Boolean is not zero or one                    |

A profile binds each class to a non-returning hook. A debug TEC-1G target might
store a code in known RAM and halt; a C runner might report the mapped source
location and abort.

Ordinary fixed-width overflow remains wrapping. Debug mode does not silently
change it into checked arithmetic.

## Library and helper testing

Language edition, standard-operation contracts and platform packages are
versioned separately. A platform service may change without redefining integer
arithmetic.

Visible operations receive target-independent vectors. Runtime helpers receive
the same semantic vectors plus ABI and assembly checks. For `sqrt`, tests cover
zero, values around perfect squares, each integer maximum and negative-input
failure. For range and bounds helpers, tests verify that failure occurs before
any destination store.

Correct arithmetic with a broken register or mapping contract is still a
backend failure.
