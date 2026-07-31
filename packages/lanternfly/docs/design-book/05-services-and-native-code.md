# Services, native code and the runtime

Multiplication, division and wide arithmetic require different machinery on a
Z80, a 6502 and a BASIC substrate. Lanternfly keeps one source meaning by
separating each operation from the instructions, helpers or host expressions
that implement it.

## Four implementation layers

### Core semantics

Assignment, arithmetic, comparison, bit operations, ordinal conversion,
structured control, paths and calls are language operations. A backend must
implement them even when the target needs a helper.

Source never imports an internal name such as `__divide_u16`.

### Visible standard layer

The first edition has a deliberately small set of language-defined standard
operations:

| Operation                  | Meaning                                     |
| -------------------------- | ------------------------------------------- |
| `abs(value)`               | unsigned magnitude at the same width        |
| `sqrt(value)`              | floor of a non-negative integer square root |
| `length(text)`             | payload byte count of a string              |
| `size(type-or-path)`       | exact compile-time byte size                |
| `count(array, dimension?)` | compile-time dimension extent               |
| `lower(array, dimension?)` | first valid ordinal index                   |
| `upper(array, dimension?)` | last valid ordinal index                    |
| `offset(Record.fieldPath)` | compile-time field offset                   |
| `clear(target)`            | ordered all-zero aggregate store            |
| `fill(target, value)`      | ordered repeated scalar store               |
| `append(target, source)`   | checked string growth                       |

Power is the `^` operator, not a second function. Aggregate assignment performs
complete equal-type copying, so the core does not need separate `copy` and
`move` procedures.

`clear` is legal only when every leaf accepts the all-zero representation; a
string does and becomes empty. `fill` converts its value once
before the first store and never exposes a string's sealed cells.
`append` checks its final length and source byte before changing its
destination. Repeated array stores visit elements in row-major order, which
matters for volatile effects.

#### Optional standard text modules

Portable text transfer uses two explicit imports rather than core `print` or
`input` statements:

```lanternfly
import "standard/text-output.lafy"
import "standard/text-input.lafy"

var key as u8
var command as string[32]
var lineFits as boolean

sub useConsole()
    writeCharacter('>')
    writeText("READY")
    writeNewline()
    key = readCharacter()
    lineFits = readLine(command)
end
```

The selected profile may bind these operations to monitor or firmware
routines, a keyboard and display, a serial terminal, generated substrate code
or a host adapter. A profile may omit either module. The portable contract
defines character and fixed-string output, a target-appropriate newline,
blocking character input and bounded line input; it does not define streams,
file handles or an operating system.

`writeText` is the one narrow capacity-generic read-only text service in the
first edition. It accepts a literal or any `string[N]` path. The compiler forms
a temporary carrier for the call, but that carrier is not a source value or a
general read-only parameter.

`readLine` is the matching writable service. It accepts any writable
`string[N]` path and returns `true` when the complete input line fits. On a
zero byte or an overlong line, it preserves the longest fitting valid prefix,
consumes the input through the line ending and returns `false`. Its temporary
destination carrier is likewise unavailable to source code. Echo and line
editing belong to the selected device rather than this portable contract.

### Platform services

Display control, specialized input, sound, device memory and randomness depend
on a platform:

```lanternfly
key = scanKeys()
framebufferPlot(x, y, colour)
soundStart(duration, divider)
vdpWrite(nameAddress, tileDataAddress)
```

These typed routines come from a host manifest, target profile or module. A
target that lacks one reports a capability error. In `vdpWrite`, the two
arguments are provider-bound `near address` or `far address` values interpreted
by the service, not immutable arrays passed to writable aggregate parameters.
Any device-space identity is target metadata on their bindings and the service
contract.

### Hidden runtime helpers

A backend may link helpers for:

- signed and unsigned division;
- wide multiplication and 32-bit operations;
- dynamic shifts and power;
- integer square root;
- constant-stride address calculation;
- far aggregate or far string access;
- fault dispatch.

Only selected helpers are linked. Their identities appear in artifacts and
cost reports, not in ordinary name lookup.

## Owned text at the boundary

`string[N]` owns writable inline storage and is the only text type crossing
the native boundary:

```lanternfly
var banner as string[16] = "LANTERNFLY"

extern sub printText(text as string[16])
```

The declared capacity uses a one-byte length field through 254 or a two-byte
length field from 255 through 65,534. Every value also maintains a zero
immediately after its nonzero payload, so a native routine that consumes
NUL-terminated bytes needs only the payload address in the appropriate address
class. There is no conversion from a raw `u8` buffer because neither its
capacity nor its termination is guaranteed.

The representation is sealed. Language code uses checked assignment,
`append`, `clear`, comparison and `length`; it cannot write a header or payload
cell separately. Native code that receives a writable string alias
must preserve the declared layout and all invariants. Its adapter validates a
possibly written value before Lanternfly resumes.

The standard `writeText` operation instead receives a temporary read-only text
source. For stored strings, an adapter can pass the already terminated payload
directly. A literal may remain immutable generated data. Neither case exposes
the carrier to Lanternfly source.

The standard `readLine` operation receives a temporary writable text
destination of known capacity. The binding replaces its contents while
maintaining the header, payload and terminator invariants, even when the input
is too long and the operation returns `false`.

## External routine declarations

Existing substrate routines enter through typed `extern sub` declarations:

```lanternfly
extern sub checkCollisionAt(x as i16, y as i16) as boolean from "CheckCollAt"
extern sub firmwarePrint(text as string[32]) at $0033
```

An external declaration may bind an address, a substrate symbol or a
target-profile name. The contract includes:

- Lanternfly parameter and result types;
- substrate binding and supported target;
- ABI and storage classes;
- visible reads, writes, calls and faults;
- device I/O or mapping-context changes;
- normal or no-return control flow.

When the substrate and Lanternfly ABIs differ, the compiler generates an
adapter. AZM `.routine` contracts then verify both adapter and callee.

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

Far aggregate parameters, aliases and strings may require a bank or segment
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

| Fault               | Condition                                         |
| ------------------- | ------------------------------------------------- |
| `F-BOUNDS`          | dynamic array index outside its domain            |
| `F-RANGE`           | checked ordinal or string destination fails       |
| `F-DIV-ZERO`        | runtime division or `mod` by zero                 |
| `F-NEGATIVE-SHIFT`  | negative runtime shift count                      |
| `F-NEGATIVE-POWER`  | negative runtime exponent                         |
| `F-NEGATIVE-SQRT`   | negative runtime square-root operand              |
| `F-LOOP-RANGE`      | continuing loop value cannot fit its control type |
| `F-INVALID-BOOLEAN` | imported Boolean is not zero or one               |
| `F-INVALID-STRING`  | native write leaves an invalid string             |

A profile binds each class to a non-returning hook. A debug TEC-1G target might
store a code in known RAM and halt; a C runner might report the mapped source
location and abort.

Ordinary fixed-width overflow remains wrapping. Debug mode does not silently
change it into checked arithmetic.

## Library and helper testing

Language edition, standard-operation contracts, optional standard modules and
platform packages are versioned explicitly. A platform service may change
without redefining integer arithmetic or the standard text contract.

Visible operations receive target-independent vectors. Runtime helpers receive
the same semantic vectors plus ABI and assembly checks. For `sqrt`, tests cover
zero, values around perfect squares, each integer maximum and negative-input
failure. For range and bounds helpers, tests verify that failure occurs before
any destination store.

Correct arithmetic with a broken register or mapping contract is still a
backend failure.
