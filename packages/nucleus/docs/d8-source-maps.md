# Nucleus D8 Source Maps

The standalone Node host can ask the Z80 Nucleus compiler for enough execution
evidence to build a D8 source-map sidecar. The Z80 compiler remains the only
compiler. TypeScript records trace events, validates them against the committed
NOBJ, and formats the sidecar; it does not parse or compile Nucleus source.

Use `--d8-output` with a target build:

```bash
nucleus build -o build/main.nobj \
  --hex-output build/main.hex \
  --d8-output build/main.d8.json \
  --target-profile nucleus-target.json \
  src/main.nu
```

Without `--d8-output`, the host uses the ordinary shipping compiler image and
does no trace collection. A flat target produces the requested file. A banked
target produces one file per physical bank, named from the requested path as
`NAME.bank-N.d8.json`.

## Conditional trace ABI

The assembly source has two layouts:

```asm
DebugHooks .equ 0        ; shipping compiler
DebugHooks .equ 1        ; host-instrumented compiler
```

Every trace instruction is conditionally absent from the shipping layout. The
instrumented layout reports events with `OUT (n),A`. The host classifies the
event by `port & $ff`, because the Z80 exposes the full port as `(A << 8) | n`.
The value in A is live compiler state, not an event tag.

| Low port | Event                    | Host observation                                                          |
| -------: | ------------------------ | ------------------------------------------------------------------------- |
|    `$D8` | source mark              | source part, token offset, line, column, semantic write key               |
|    `$D9` | declaration-name mark    | retained source pointer, name length, semantic write key                  |
|    `$DA` | construct push           | push the current source context                                           |
|    `$DB` | enclosing-context resume | restore and pop one source context                                        |
|    `$DC` | routine mark             | push routine context and retain its source name for a symbol anchor       |
|    `$DD` | semantic-operation start | semantic read key before the operation or any operands are read           |
|    `$DE` | semantic-dispatch end    | one event after all operations and fixups succeed                         |
|    `$DF` | IMAGE byte               | emitted byte, physical bank, target address, and active operation context |

`SemanticPayloadBase` names the first payload byte after the transcript's
operation-count header. Source keys are `SinkCursor - SemanticPayloadBase`.
Operation keys are `SemanticReadCursor - SemanticPayloadBase`.

The `$DD` event selects the latest source mark whose key is not greater than
the operation key. That source remains selected while the operation reads its
operands and emits bytes. The collector does not inspect the later live read
cursor, which may already point into another operation. `$DE` is emitted once
per successful whole-program dispatch, not once per operation.

Operations before the first source mark have no source attribution. This is
intentional. Startup, runtime, terminal dispatch, padding, provider bytes, and
static data do not acquire an invented Nucleus line.

`$DA`, `$DB`, and `$DC` let closing operations return to the construct or
routine header that owns them. A successful parse must leave this host-side
stack empty. Underflow, an unbalanced successful parse, invalid name pointers,
or inconsistent semantic keys invalidates D8 publication. A failed parse may
abandon its tentative stack; the next compilation always receives a new
collector.

## Interception lifetime

The Node host intercepts `$D8..$DF` only while the instrumented compiler is
running. It never forwards an intercepted trace event to an emulated device.
Any nontrace compiler I/O is passed to the ordinary host handler when one is
supplied.
Collection is disabled in a `finally` path after compiler execution, whether
the compile succeeds, diagnoses source, or terminates unexpectedly.

The ordinary compiler image contains no active trace instructions. Generated
programs are executed in their target runtime after compilation, so their use
of ports `$D8..$DF` remains ordinary target I/O.

The normal and instrumented compiler images have separate caches. Each image
is paired with the AZM symbol map from that exact assembly. The host never uses
shipping-image addresses to inspect an instrumented compiler.

## Validation and publication

Trace state is tentative until the compiler emits a valid NOBJ commit. The
collector checks that:

- source keys are nondecreasing;
- operation keys are strictly increasing, match the published operation count,
  and equal the operation boundaries obtained by independently decoding the
  finalized variable-width transcript; the decoded final operation must end
  exactly at the semantic read cursor observed with the single end event;
- successful dispatch has exactly one end event;
- routine and declaration names point into a loaded source part;
- the construct stack is balanced on successful parsing; and
- the ordered `$DF` stream exactly matches every compiler-adapter `IMAGE` byte;
- every observed bank, address, and byte belongs to an original committed
  NOBJ `IMAGE` record.

The compiler-adapter comparison deliberately excludes provider-owned runtime
and initialization images. Those records are added by the host after the Z80
compiler has finished and therefore have no `$DF` event or source attribution.
The `$DF` stream is the dominant trace volume: it contributes exactly one host
callback for every compiler-adapter `IMAGE` byte.

`PATCH` does not create new attribution. A patched byte keeps the source
association recorded when the corresponding `IMAGE` byte was emitted.

A diagnostic, output failure, invalid event sequence, missing commit, or D8
write failure cannot publish a partial map. The CLI writes tentative sidecars
and replaces the previous group as a recoverable best-effort transaction. A
failed promotion restores that previous group; a concurrent reader or process
crash can still observe an in-progress filesystem update. Switching between
flat and banked output, or reducing the bank count, removes obsolete members of
the old group in the same publication transaction. NOBJ remains the canonical
non-relocatable target object; D8 remains a separate host artifact.

## D8 output

The host reconstructs file names, lines, 1-based byte columns, line text, and
routine spelling from the original raw source parts. CRLF input and compiler-
synthesized part-boundary newlines do not rewrite those parts.

Code ranges use inclusive starts and exclusive ends. Adjacent bytes are merged
only when they have the same file, source position, bank, kind, and confidence.
The writer omits empty marks from executable ranges. Directly correlated ranges use `kind: "code"`
and `confidence: "high"`.

The sidecar records byte columns, but Debug80's first Nucleus integration is
line-oriented when binding and stepping. It does not claim column-aware
stepping. Symbols are emitted only for `main` and source-defined routines,
using the first generated executable byte attributed to each routine.

Banked output uses one D8 document per physical bank and the existing D8 memory
bank identity. Visible addresses may repeat in different files without losing
their physical-bank distinction. No new D8 schema field is introduced.
