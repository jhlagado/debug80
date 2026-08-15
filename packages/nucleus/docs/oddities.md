# Nucleus oddities

Status: working notes checked against the current compiler; does not amend the
language specification
Date: 2026-08-16

A first-time Nucleus programmer, coming from Pascal, BASIC, or Z80 assembler,
will recognize the spelling and still trip on the storage model, the open
views, and a handful of parse rules. This note records those places. Some are
the programming model. Some are furniture. Some are rough edges still intended
to be smoothed.

The [language specification](specification.md) remains the authority. When an
observation here conflicts with the compiler or its conformance proofs, that
conflict is a documentation defect to resolve rather than a new language rule.
The current specification covers signed integers, open string and array
parameters, bounded-string construction, and nested fixed arrays.

## Not oddities

These are choices, not defects.

Names are case-sensitive. `Player` and `player` are different identifiers.
Keywords use their lowercase spelling only: `elseif` is the keyword, `ELSEIF`
is a name. That pair is consistent once you treat keywords as fixed tokens and
names as preserved spellings.

A logical newline ends a statement. There is no semicolon. A line break inside
`()` or `[]` is whitespace.

Integer literals are decimal, `$` hexadecimal, and `%` binary. Remainder is
the word `mod`. Not-equal is `<>`. In a statement `=` assigns; in an
expression it compares. Assignment is not an expression.

Bounded strings are Pascal strings: a capacity, a current length, and a
payload that may contain zero bytes. Static construction from a string literal
is built in. Runtime construction, comparison, and formatting belong in
ordinary source libraries over `string[]`. The source operations are
`.length`, `.capacity` on the open view, and checked byte indexing. There is no
family of intrinsic `append`, `concat`, or `LEFT$` operations.

File names, directories, and open/close are not source constructs. Byte
streams and bulk storage are the language boundary. Filing systems sit in
libraries and in the host that selects those streams.

## The programming model

Routine locals are scalar only: `u8`, `u16`, `i8`, `i16`, and `boolean`.
Records, arrays, and strings live at program scope for the life of the
program. A routine that needs aggregate storage receives it as a parameter.
Arguments are the input and output path for aggregates. There are no source
pointers, no heap, and no local alias variable.

Recursion is legal. Shared global buffers are therefore a programmer concern,
not a hidden stack allocation.

Nucleus has two parameter-only complete-object views:

| View        | Binds to                         | Retains              | Extra operations                          |
| ----------- | -------------------------------- | -------------------- | ----------------------------------------- |
| `string[]`  | any concrete `string[N]`         | actual capacity      | `.capacity`; checked `.length` assignment |
| `T[]`       | any complete `T[N]` of exact `T`  | actual element count | `.length` as `u16`                        |

Neither is a slice. Each view is one complete object. You cannot take a
prefix, an offset, or a caller-chosen count. You cannot store the view, return
it, or put it in a record. Element type for `T[]` is exact: `u8[]` does not
accept `i8[N]`, and `string[16][]` does not accept `string[32][N]`.

Nested fixed arrays are ordinary nested types. Suffixes are outermost first:
`u8[3][2]` is three rows of `u8[2]`, and `grid[y][x]` selects in the same
order. An open view of those rows is `u8[][2]`; it can bind `u8[3][2]` or
`u8[10][2]`, but not `u8[3][3]`. The omitted bound is allowed only on the
outermost dimension of a formal parameter. `u8[2][]` and `u8[][]` are invalid.

A concrete `string[N]` can read `.length` and index existing bytes. It cannot
assign `.length` and has no `.capacity` property: the capacity is the type.
Length changes only through `string[]`:

```nucleus
sub clear(text as string[])
    text.length = 0
end

sub appendByte(text as string[], value as u8) as boolean
    var index as u8 = text.length

    if index = text.capacity
        return false
    end

    text.length = index + 1
    text[index] = value
    return true
end
```

A new length that exceeds capacity is a `bounds` trap. Shrink clears the
dropped bytes. Grow exposes the existing zero tail. You still cannot write
`text[text.length] = c`; the index must be below the current length, so a
library append extends first and then writes.

`T[N]` exposes `.length` on both the concrete object and the open view. String
capacity does not, because `N` is already the type. Array length is `u16`;
string length is `u8` (capacity 1 through 253).

## Remaining surprises

**One namespace, declaration before use.** A record named `Point` and a
variable named `Point` cannot coexist. A parameter cannot reuse a visible
global name. Locals occupy a contiguous prefix at the top of the routine;
`if` and `for` bodies declare nothing. The counted-loop counter must already
be an integer scalar local. Mutual recursion uses `forward`; the later body is
`sub name` with the signature omitted.

**`elseif` is one token.** `else if` is two tokens and is not a flat clause.
After `else`, the next token on that line cannot begin a nested `if`. `then`
is an identifier.

**Signed integers do not change lengths or capacities.** `i8` and `i16` are
ordinary integer types and may be used as indexes; a dynamic negative index
performs the same `bounds` trap as any other out-of-range index. String
lengths and capacities and array lengths remain unsigned values. Alias
carriers are not source integers at all. Implicit widening is `u8` → `u16`,
`i8` → `i16`, and `u8` → `i16`. Mixed `u8` and `i8` become `i16`. `u16` and
`i16` have no value-preserving common type, so their mixture requires an
explicit checked conversion. `$FF` is 255, never an `i8` bit pattern for −1.
Unary minus is modular in the operand's width and also accepts typed unsigned
integers. Signed division truncates toward zero; remainder follows the
dividend. The defined two's-complement result of `-32768 / -1` is `-32768`,
with remainder zero.

**Recoverable failure is consumed at the call.** A failable call must be
consumed at the site with `else fail` or same-line `handle NAME`. A scalar
local initializer admits only `else fail`; assignment and complete call
statements admit either form. A failable call cannot sit inside an argument or
a `return`. `return` is success only. The handler name is an existing writable
`u8`, not a new binding. Traps are not recoverable.

**String literals are initializers, not values.** Given `sub
writeText(text as string[])`, `writeText("Hi")` is not admitted. You declare a
concrete `string[N]` constant and pass that name.

**Aggregate constants are read-only by source path.** Direct assignment to
`Origin.x` is invalid. Pass `Origin` as an aggregate argument and the callee
may write through the parameter. Whether that write changes memory depends on
RAM versus ROM placement. Portable programs do not rely on it.

**A value routine needs a structural `return`.** Loops are assumed able to
finish, including `while true`. A function whose only live `return` sits
inside an infinite loop still needs a `return` after the loop, or the source
is invalid. That rule exists so fallthrough can be checked in one pass.

## Language-finish backlog

These items are rough edges rather than objections to the programming model.
Priority reflects how early a programmer meets the problem and how much it
undermines an otherwise consistent rule.

### P0 — first-program friction

1. **Mutation through an alias to an aggregate constant.** The direct-root
   rule is clear; losing that marker through a parameter permits a write whose
   physical result depends on RAM versus ROM placement. Carry read-only
   provenance through aliases and reject the write, or define another
   target-independent rule with a discriminating proof. Portable source
   should not acquire different mutation semantics from placement policy.
2. **Literal text as an argument.** Given `sub writeText(text as string[])`,
   requiring a named `string[N]` constant instead of `writeText("Hi")` is the
   first “is this unfinished?” moment. The eventual rule must account for the
   fact that every current `string[]` parameter is writable. A compiler must
   not simply alias literal
   bytes as writable storage. Plausible designs include a read-only open-string
   parameter form or an explicit temporary-copy rule with defined lifetime and
   repeat-call behaviour. Keep the literal contextual rather than turning it
   into a general aggregate expression.
3. **One current beginner path.** The language manual and examples need one
   short route that uses the implemented forms together: signed counters,
   `string[]`, `T[]`, nested arrays, `else fail`, and `handle`. This is a
   documentation deliverable, not another syntax feature.

### P1 — diagnostics and safety consistency

4. **`else if` versus `elseif`.** BASIC programmers will write the two-word
   form. Keep the one-token grammar if that is the language choice, but issue a
   diagnostic that says to write `elseif`; a generic newline error makes the
   rule look accidental.
5. **Same-line `handle`.** Failure consumption is consistent, but attaching
   `handle` to the call's logical line is easy to miss. Give a misplaced
   next-line `handle` a diagnostic that names the same-line form, and show the
   form beside `else fail` in the manual.
### P2 — analysis and system boundary

6. **Fallthrough after `while true`.** A result routine whose only live
   `return` is inside an unconditional loop still needs a trailing structural
   `return`. A narrow analysis could treat literal `while true` as
   non-returning only when no reachable `exit` targets that loop; an `exit`
   from a nested loop does not make the outer loop fall through. Without that
   proof, the conservative rule is correct.
7. **Port access.** Nucleus has typed byte streams and no source-visible Z80
   ports. A future system boundary could provide typed port input and output
   without exposing arbitrary memory or inline assembly. This needs a service
   and portability design before it becomes a language feature; it is not a
   missing core expression operator.

### Ongoing release discipline

The standalone specification, grammar, implementation, generated compiler
images, conformance tests, and any Debug80 reading copy must identify the same
language revision. Signed integers, open views, string construction, and
nested arrays are already specified. Future language commits should update the
manual and reading copy in the same milestone rather than leaving a note like
this one to reconcile them later.
