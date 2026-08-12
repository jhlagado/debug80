# Nucleus 0.1 Language Specification

## Contents

1. [Status and conformance](#1-status-and-conformance)
2. [Design constraints](#2-design-constraints)
3. [Source text and lexical rules](#3-source-text-and-lexical-rules)
4. [Program and file structure](#4-program-and-file-structure)
5. [Names and scopes](#5-names-and-scopes)
6. [Types](#6-types)
7. [Storage, values, and lifetime](#7-storage-values-and-lifetime)
8. [Constants and declarations](#8-constants-and-declarations)
9. [Expressions](#9-expressions)
10. [Statements](#10-statements)
11. [Conditional control](#11-conditional-control)
12. [Loop control](#12-loop-control)
13. [Routines and calls](#13-routines-and-calls)
14. [Recoverable errors](#14-recoverable-errors)
15. [Safety failures and traps](#15-safety-failures-and-traps)
16. [System boundary](#16-system-boundary)
17. [Complete grammar](#17-complete-grammar)
18. [Static semantics](#18-static-semantics)
19. [Runtime semantics](#19-runtime-semantics)
20. [Feature ledger](#20-feature-ledger)
21. [Conformance examples](#21-conformance-examples)

## 1. Status and conformance

### 1.1 Status

This specification is a working draft. Nucleus 0.1 has not been frozen or released as a standard, and later revisions may change rules recorded here. This revision defines the complete proposed 0.1 source language and supports conformance review, but the project may still correct it before the freeze.

The language under design is named **Nucleus 0.1**. It has one source language: no language levels, selectable language profiles, or compiler-selected subsets of standard syntax exist.

### 1.2 Scope

This specification defines the source-language syntax, static semantics, runtime semantics, required diagnostics, specified safety failures, and abstract compilation-input contract of Nucleus 0.1. It defines the conditions for a source program or compiler to claim Nucleus 0.1 conformance.

The separate [Nucleus Z80 Runtime and Backend Contract](z80-runtime-contract.md) defines the packed data representation, direct-code integrity rules, runtime boundary, and target execution obligations. Non-normative implementation plans and design papers record compiler strategies and project constraints; they do not add source-language semantics.

The first implementation is a handwritten Z80 compiler that emits Z80 machine code directly. Project acceptance requires its compiler core and required immutable constants to fit in one 16 KiB bank; generated programs, compiler workspace, and the target runtime have separate budgets. That gate does not create a smaller Nucleus dialect or alter the meaning of a conforming program. Chapter 2 and the implementation plan carry the detailed budget rules.

### 1.3 Authority

When repository materials disagree, apply this order:

1. This specification governs Nucleus 0.1 source syntax and semantics.
2. The Nucleus Z80 Runtime and Backend Contract governs packed representation, generated-code integrity, runtime services, and direct Z80 execution. It cannot change the meaning required by this specification.
3. The implementation plan is non-normative. It records construction order, budgets, measurements, and implementation choices.
4. Architecture and design-rationale papers explain decisions but do not override either authority.
5. Conformance tests provide evidence that an implementation follows the specifications. A conflicting test is a test defect, not a language amendment.

An unwritten rule cannot be supplied by a lower-ranked document. Until this specification states the rule, the point remains unresolved for Nucleus 0.1 conformance.

### 1.4 Normative words

This specification uses four requirement words:

| Word         | Meaning                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| **must**     | The rule is required for conformance.                                                                            |
| **must not** | The described form or behaviour is prohibited.                                                                   |
| **may**      | The form or implementation choice is permitted but not required.                                                 |
| **should**   | The rule is recommended. A departure needs a documented reason and must not violate a `must` or `must not` rule. |

Declarative syntax and semantic rules are normative even when they contain none of these words. Notes, rationale, examples, and implementation sketches are non-normative unless they explicitly state a rule.

### 1.5 Conforming source programs

A conforming Nucleus 0.1 source program:

- uses only syntax and features admitted by this specification;
- satisfies the complete grammar and all applicable static-semantic rules;
- depends only on specified behaviour or on a choice that this specification explicitly marks as implementation-defined;
- does not depend on an extension or an unadmitted design candidate.

Exceeding one compiler's documented capacity does not affect a program's language conformance. The compiler may reject the program with a capacity diagnostic; that diagnostic reports an implementation limit rather than a source-language violation.

The complete accepted programs in Chapter 21 form the minimum conformance corpus. A conforming compiler and execution environment must compile and execute each program under its stated inputs without a capacity diagnostic or an `activation-capacity` trap. An implementation may publish smaller limits than another implementation only above this floor. This requirement establishes a minimum useful implementation without creating a language profile or changing the conformance of larger source programs.

A program can use this complete working revision to establish conformance. Such a claim identifies the exact specification revision because the draft may still change before the 0.1 freeze.

### 1.6 Conforming compilers

A compiler claiming Nucleus 0.1 conformance must:

- compile every complete accepted program in Chapter 21 without a capacity diagnostic;
- accept and translate every conforming source program within its documented capacity limits;
- accept an in-capacity program presented through the multipart compilation stream in Section 4.3;
- preserve the specified observable results, side effects, and runtime traps of each accepted program;
- issue a diagnostic for compile-time invalid source rather than silently translating it with another meaning;
- issue a diagnostic when a documented capacity limit prevents translation;
- identify each source diagnostic by stable source-part identity and position within that part;
- identify and document every implementation-defined choice it makes;
- keep extensions separate from standard Nucleus mode.

A compiler must not report successful translation and then emit code with semantics that differ from this specification. Diagnostic wording and presentation are implementation-defined unless a later chapter requires a particular machine-readable result.

The first handwritten compiler passes an additional project acceptance gate only if its core plus required immutable constants fit in one 16 KiB bank. A compiler may conform to the language and fail that size gate. Conversely, fitting in the bank does not excuse a compiler that rejects an in-capacity conforming program, accepts invalid source without a diagnostic, or changes program meaning.

### 1.7 Extensions

An implementation may provide extensions only through an explicit selection, such as a distinct mode or option. Standard mode must diagnose source that requires an extension. An extension must not change the syntax, validity, or meaning of a conforming Nucleus 0.1 program.

Source that requires an extension is not a conforming Nucleus 0.1 program unless a later specification revision admits that feature into the language.

### 1.8 Implementation-defined choices

An implementation-defined choice is permitted only where this specification uses that term. The implementation must identify the choice, document the selected behaviour, and apply it consistently for the documented configuration.

Nucleus does not use undefined behaviour as an escape hatch for source-language errors. If this working draft omits a necessary rule, the omission is a specification gap; it does not permit arbitrary compiler or runtime behaviour.

### 1.9 Invalid source, capacity failures, and runtime traps

These cases are distinct:

| Case                                                                                   | Required treatment                                                                                                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| A grammar or static-semantic rule is violated.                                         | The source is invalid. The compiler must issue a compile-time diagnostic and must not present an executable as a successful translation. |
| A conforming program exceeds a documented compiler capacity.                           | The compiler may stop with a capacity diagnostic. The source does not become invalid.                                                    |
| A conforming program reaches a condition for which this specification requires a trap. | The generated program must perform the specified runtime trap unless a later chapter explicitly permits compile-time rejection.          |
| This draft has not yet specified the case.                                             | No conformance result can be inferred until the specification supplies the missing rule.                                                 |

A runtime trap is specified behaviour, not undefined behaviour and not evidence that the source was necessarily invalid. Later chapters define which failures are compile-time invalid, which are recoverable, and which trap at runtime.

### 1.10 Provisional features

Design candidates may be prototyped and measured while Nucleus 0.1 remains a working draft. Before 0.1 is frozen, the project either admits each candidate to the single normative language or omits it. Nucleus does not expose candidates as language levels or standard profiles.

A program that depends on an unadmitted candidate is not yet a conforming Nucleus 0.1 program. Prototype support for that candidate follows the extension rules in Section 1.7.

### 1.11 Direct Z80 implementation

The first compiler emits Z80 machine code directly and satisfies the separate Z80 runtime and backend contract. It may retain a checked semantic-operation transcript as private compiler workspace, but it does not serialize or execute that transcript as a public bytecode format.

Another compiler may use a different internal organization or target only when it preserves the same source semantics, diagnostics, and specified traps. An implementation choice does not create another Nucleus language profile.

### 1.12 Non-requirements

This working draft makes no claim that Nucleus 0.1 is frozen or implementation-validated. It does not require the first compiler to be written in Nucleus or compile its own source. It also does not require another conforming compiler to copy the first compiler's internal organization.

## 2. Design constraints

### 2.1 Scope

This chapter records three kinds of constraint: properties preserved by the Nucleus 0.1 language design, acceptance gates for the first handwritten Z80 compiler, and evidence required before a provisional feature enters the language. Later chapters define the source language and its semantics. The separate Z80 runtime and backend contract defines the direct target obligations.

The implementation gates in this chapter apply to the first compiler project. They are not language-conformance requirements for every Nucleus compiler. A compiler may conform to Nucleus 0.1 on another host without using Z80 code, banked memory, or the same internal architecture.

Nucleus 0.1 is one language. Measurements may change the draft before it is frozen, but they do not create language levels, implementation-selected syntax profiles, or optional dialects. Each candidate is either admitted to the single language or omitted.

### 2.2 Language-shaping constraints

Nucleus is a safe, practical, general-purpose structured language designed to remain viable on small Z80 systems. Its minimum programming model includes `u8`, `u16`, and Boolean values; scalar and aggregate constants; formal arguments; named scalar local variables; routines with no result or one typed result; fixed-layout records; checked fixed arrays; bounded strings; complete positional static initializers; exact-type aggregate assignment; assignment and calls; `if`/`elseif`/`else`; `while`; counted `for`; `return`; and the unlabeled, innermost-loop forms of `exit` and `continue`. Silently removing one of these requirements does not make an oversized compiler acceptable. If a faithful implementation cannot fit, that result requires compiler-architecture redesign or rejection of the architecture hypothesis.

The language design uses deterministic parsing with canonical forms, minimal lookahead, and no backtracking. A smaller production count is useful only when it preserves the required programming model. Grammar terseness is not an independent design goal.

A conforming compiler must perform every source-safety check for which compilation provides sufficient information. Safety conditions that depend on runtime values must produce defined traps. Source code has no raw pointer arithmetic or unchecked reinterpretation. Later chapters define the checks, traps, and source types.

Every implementation capacity must have an explicit limit and a diagnostic for excess. Exhausting a symbol table, input limit, nesting limit, or other bounded resource must not alter program meaning or produce silently incorrect output.

### 2.3 Compiler-core gate

Project acceptance requires the first compiler's executable core and every immutable table or constant required while compiling to fit together in one 16 KiB bank. Placing required code or immutable data in another bank does not satisfy this gate.

For each tested configuration, the compiler-core total includes the front end, the direct-Z80 emitter, and all immutable data that either component requires. The report identifies the resident configuration and includes every shared or required component.

The first implementation may use a flat 64 KiB address-space model as its initial abstraction. This model does not bind Nucleus source semantics to a particular operating system, monitor, or memory map. Additional memory or banks may hold separately budgeted components, but they are not a fallback for an oversized core.

### 2.4 Separate resource accounts

Resources outside the compiler-core gate may use other RAM or banks where the platform permits, but they remain bounded, measured, and reported. Separate accounting does not make a resource free or unlimited.

| Account                     | Required report                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Compiler core               | Executable code and required immutable data for the tested front end and active emitter, measured against the 16 KiB gate. |
| Writable compiler workspace | Peak live bytes, including lexical, parsing, name, type, lowering, diagnostic, and emission state.                         |
| Generated output            | Emitted Z80 program and static-data bytes, separate from compiler storage.                                                 |
| Target runtime              | Shared helpers, service adapter, trap machinery, immutable data, writable state, and relevant execution cost.              |
| Execution                   | A stated measure, such as instruction count or cycles, for representative emitted programs.                                |

Project accounting counts each shared component once and assigns it to an identified account. Reports distinguish resident components, overlays, and mutually exclusive configurations. Peak workspace is the maximum simultaneously live storage, not the sum of buffers whose lifetimes do not overlap.

### 2.5 Streaming compilation model

Bulk storage may be available but slow. The compiler consumes the ordered multipart compilation stream defined by Chapter 4 and emits one logical Z80 program and static-data output. A platform may materialize either stream in external storage. Physical source discovery, ordering, and transport do not require the compiler to retain the whole program in memory.

The first compiler is handwritten Z80 and uses streaming, single-pass compilation wherever the language semantics permit it. Declarations precede use. An explicit forward routine signature supplies the necessary exception without requiring a later whole-program pass. Because that declaration is the sole signature, the compiler retains its parameter names until the abbreviated body begins and performs no body-signature comparison. Its compiler-core and workspace effects remain unmeasured.

The architecture excludes an abstract syntax tree, global type inference, whole-program optimization, and unbounded buffering from the first compiler. The compiler may retain bounded state required for declarations, scopes, forward signatures, control-flow fixups, and emission, provided each capacity is explicit and measured.

### 2.6 Semantic operations and direct emission

Compiler size has priority over compilation speed. The front end records a compact vocabulary of checked semantic operations and the backend turns those operations into Z80 machine code. The operation transcript is a private, bounded compiler representation rather than a portable target or execution format.

Structured control lowers to ordinary comparisons, branches, calls, and checked runtime operations. The first direct backend uses fixed, proof-driven templates and bounded fixups before adding register allocation, branch shortening, whole-program optimization, or peephole optimization. Each increment measures compiler code, immutable data, workspace, generated output, target runtime, and execution cost.

The companion Z80 runtime and backend contract fixes packed data layout, stable service and trap codes, call obligations, and generated-code integrity. Physical register allocation, helper organization, fixup representation, and calling-convention details remain measured implementation choices where that contract leaves them open.

### 2.7 System boundary and portability

The initial system boundary contains only services that Nucleus programs demonstrably require: input, output, termination, trap reporting, and bulk-storage access. Each additional service requires measured need.

The semantic-operation boundary may support later direct backends for other Z80 variants or other targets where target neutrality has no material cost against the compiler-core gate and other bounded accounts. Portability does not justify growth that causes the first compiler to fail its core gate.

Nucleus 0.1 defines no interrupt routine, interrupt or restart vector declaration, interrupt-reentrant calling convention, or interrupt-safe service guarantee. The compiler emits no interrupt vector table. A target may interrupt a Nucleus program only through a handler outside the language that preserves the program's machine state and does not enter a Nucleus routine or service.

A target may assign ordered source parts to banked target regions without changing manifest order, declaration visibility, or source identity. Banking introduces no source construct, address value, or alternate return convention. The target-system specification and Z80 runtime contract define bank placement and may diagnose references that their banked representation cannot preserve safely; such a target restriction does not make the source program invalid under this specification.

### 2.8 Evidence and feature admission

Project reports assign every size, storage, or performance claim one of these evidence classes:

- **Measured:** obtained from an identified build or run with the method recorded.
- **Projected:** calculated from measured components under stated assumptions.
- **Hypothesis:** an expectation not yet tested by an implementation.

A candidate's admission record reports its incremental compiler-core code, required immutable data, peak writable workspace, target-runtime cost, effect on emitted programs, and total-system trade. Source-line count, host executable size, and an instruction sketch are not substitutes for target measurements. Before Nucleus 0.1 is frozen, the project either admits the candidate to the one normative language or omits it.

Nucleus 0.1 admits the explicit recoverable-error mechanism in Chapter 14. The implementation ledger still records its compiler-core, immutable-data, workspace, emitted-code, and runtime costs. General exceptions, stack unwinding, destructors, `finally`, and `defer` remain excluded.

Nucleus 0.1 admits recursive routine calls. The first implementation may stage their construction while it measures activation storage, re-entry state, depth limits, and failure behaviour, but staging does not create a non-recursive language profile. Chapter 13 defines the source semantics, and Chapter 15 defines activation-capacity failure.

Several source-preserving economies belong in the first implementation rather than in language variants. The first compiler uses one precedence-driven loop for binary expressions and classifies a completed call expression before admitting `else fail`; it does not duplicate the precedence ladder or branch on a routine signature before parsing the call. Interned type ordinals versus compact structural metadata stored directly in symbols remains a measured representation choice. The direct backend measures shared tails, table dispatch, helper calls, fall-through layout, and width-specific target sequences. None of these choices may change accepted source, arithmetic width, required diagnostics, array aliases, or observable behavior.

### 2.9 Decision boundary and failure conditions

An architecture decision requires measurements from an identified compiler configuration and representative accepted and rejected source. The report includes the complete compiler-core total, immutable-data contribution, peak writable workspace, target-runtime total, emitted-program size, execution cost under a stated method, capacity limits, and diagnostics produced when those limits are exceeded. Candidate comparisons use equivalent source semantics and accounting boundaries.

The decision record labels every value as Measured, Projected, or Hypothesis and states the assumptions behind projections. Unmeasured values remain open rather than being replaced with invented byte estimates.

The first implementation is not required to compile itself. The project may evaluate self-hosting only after measurements show that the handwritten compiler satisfies its budget and conformance goals. Failure to preserve the minimum programming model, diagnose bounded-resource exhaustion, or keep required compiler code and constants within the one-bank gate rejects the tested architecture; it does not justify a weaker, unnamed language profile.

## 3. Source text and lexical rules

### 3.1 Scope

This chapter defines how the source bytes in each ordered source part become one logical token stream. It defines source bytes, line endings, whitespace, comments, names, reserved words, literals, punctuation, source positions, and lexical errors. Chapter 4 defines the multipart input around those bytes. Later chapters define grammar, name resolution, types, expression precedence, and runtime meaning.

The rules are deterministic and require no backtracking. Rules stated for source text, token identity, or lexical errors apply to every conforming compiler. Project acceptance requires the first compiler to consume the source in order with bounded state and without retaining a complete source copy. This is a Chapter 2 project constraint, not a required internal organization for another compiler. Another compiler may organize tokenization differently, but it must produce the same tokens. One byte of lookahead is sufficient for every token rule in this chapter.

### 3.2 Source bytes

A Nucleus source part is a sequence of bytes in an ASCII-compatible encoding. The accepted source-byte repertoire is:

| Bytes        | Use              |
| ------------ | ---------------- |
| `09`         | horizontal tab   |
| `0A`         | LF line ending   |
| `0D 0A`      | CRLF line ending |
| `20` to `7E` | printable ASCII  |

`0D` is valid only as the first byte of CRLF. A lone CR is a lexical error. Every other byte, including NUL, vertical tab, form feed, DEL, bytes above `7F`, and a UTF-8 byte-order mark, is a lexical error.

EOF is an input condition, not a source byte. An implementation may use an internal sentinel when its source interface cannot return a separate EOF condition, but that sentinel must not be accepted as source text.

This repertoire excludes Unicode identifiers, Unicode normalization, and locale-dependent character classification. Escape sequences may denote byte values outside printable ASCII without placing those values in the source stream.

### 3.3 Lines and source positions

LF and CRLF each form one physical line ending. The tokenizer normalizes either spelling to the same line-break event. A final physical line need not contain a line ending.

Diagnostics must identify a reproducible source position. Each source part starts at byte offset zero, line one, and byte column one. Each token has the stable source-part identity from Section 4.3, a half-open byte span within that part, and a one-based line and byte column for the span's start. Each lexical error identifies:

- the stable source-part identity;
- a zero-based byte offset within that part;
- a one-based line number; and
- a one-based byte column within that line.

When CRLF produces `NEWLINE`, its two bytes occupy one token span, advance the byte offset by two, and advance the line number once. A synthesized source-part-boundary or final `NEWLINE` has a zero-width span at the end of its source part. A horizontal tab advances the byte column by one; the column is not a display-cell count. The optional diagnostic name from Section 4.3 may accompany a diagnostic but does not replace the stable identity. These counters permit streaming diagnostics without a resident source map. An implementation that bounds a counter or source-part length must publish the limit and diagnose overflow.

### 3.4 Whitespace, comments, and logical newlines

ASCII space and horizontal tab are the only horizontal whitespace. They separate tokens where separation is needed and are otherwise ignored. Indentation has no syntactic meaning. Whitespace never joins adjacent names, numbers, or literals into one token.

`//` begins the one ordinary comment form. It is recognized outside character and string literals and consumes bytes up to, but not including, the next physical line ending or EOF. The comment produces no token. A line comment at EOF is complete; it does not require a closing marker. Nucleus 0.1 has no block, nested, or documentation comments.

A logical newline is the only statement terminator. Nucleus has no semicolon terminator and no second interchangeable terminator.

Delimiter state tracks open parentheses and square brackets. A physical line ending produces `NEWLINE` only when no delimiter is open. Inside either delimiter, a physical line ending is whitespace and produces no token. Parentheses and brackets inside a comment or literal do not affect this state. The first compiler represents it with a bounded stack; another compiler may use a different representation.

This is a tokenizer-parser interface rule rather than statement grammar: the tokenizer emits `NEWLINE` under this rule, while later chapters specify which grammar positions accept it. Delimiter state must distinguish `(` from `[`. A closing delimiter with no matching opener, a mismatched closing delimiter, an open delimiter at EOF, or implementation-capacity exhaustion is diagnosed.

Blank and comment-only physical lines produce no `NEWLINE`. Consecutive physical line endings therefore cannot create empty statements. After any token on a delimiter-depth-zero line, its physical line ending produces one `NEWLINE`. Section 4.3 supplies the same line-ending event at a source-part boundary when the part has no final physical line ending. If EOF follows a token line without either event, the tokenizer emits one final `NEWLINE` before `EOF`. EOF following an empty or comment-only final line produces only `EOF`.

Examples:

```nucleus
total = (first +
    second)

value = table[
    index
]
```

Neither physical line ending inside the delimiters produces `NEWLINE`. By contrast, this source contains a logical newline after `+` and is rejected later by the statement or expression grammar:

```nucleus
total = first +
second
```

### 3.5 Identifiers and reserved words

An identifier begins with an ASCII letter. Each following byte is an ASCII letter, decimal digit, or underscore:

```text
identifier ::= ascii-letter (ascii-letter | decimal-digit | "_")*
```

Leading underscores are not identifiers. Nucleus does not assign implementation names through a source spelling convention; compiler-generated names remain outside the source namespace.

Identifiers are case-sensitive and preserve their source spelling. `Player`, `player`, and `PLAYER` are three distinct identifiers. No locale participates in comparison.

The complete preserved spelling is an identifier's identity. An implementation must not fold case, truncate a spelling, compare only a prefix, or treat an unchecked hash match as equality. It may use hashes to locate candidates only if it resolves collisions by exact byte comparison. An implementation may impose a maximum identifier length and a maximum number of retained names. It must publish each limit, and exceeding one is a capacity diagnostic.

After scanning the longest identifier, the tokenizer compares its exact spelling with a fixed reserved-word table. A reserved word is recognized only in the canonical lowercase spelling listed below. A longer name is never split at a keyword boundary: `elseifReady` is one `NAME`, not `elseif` followed by `NAME`.

The Nucleus 0.1 reserved words are:

```text
and      as       assert   boolean   const     continue else
elseif
end      exit     fail      fails     false    for      forward
handle   if       mod      not       or        record
return
step     string   sub      to        true      u16      u8
until    var      while    xor
```

`elseif` is one keyword. `else if` produces the two keywords `else` and `if` and does not form an `elseif` clause. `ELSEIF` is a `NAME`, not a keyword.

Chapter 14 defines the recoverable-error forms that use `fail`, `fails`, and `handle`. `on` and `error` are ordinary identifiers.

Nucleus uses name-led routine invocation and has no `call` keyword. `call` remains an identifier.

### 3.6 Numeric literals

Nucleus admits unsigned decimal, hexadecimal, and binary integer literals:

```text
decimal-literal ::= decimal-digit+
hexadecimal-literal ::= "$" hexadecimal-digit+
binary-literal ::= "%" binary-digit+
integer-literal ::= decimal-literal
                  | hexadecimal-literal
                  | binary-literal
```

Hexadecimal digits may use either letter case. The `$` and `%` prefixes are part of the literal and do not form separate punctuation tokens. A prefix must be followed by at least one digit of its base.

The tokenizer computes an exact unsigned value from zero through 65,535. A decimal literal whose value exceeds 65,535 is a lexical error. A hexadecimal literal may contain at most four digits, and a binary literal may contain at most sixteen digits; an additional digit is an overflow even when it is a leading or trailing zero. Later type checking decides whether the value fits its context, including `u8`, `u16`, an array bound, or a counted-loop parameter.

A leading `+` or `-` is a separate punctuation token and is never part of the literal. Thus `-32768` begins with `-` followed by the literal `32768`; expression and constant rules determine whether that combination is valid.

A letter or underscore immediately following any integer literal makes the numeric token malformed instead of beginning an adjacent identifier. This rejects forms such as `0x2a`, `12u8`, `$ffu8`, and `%10value` with one diagnostic. A decimal digit other than zero or one inside a binary literal is likewise malformed rather than the start of a following decimal token.

Octal and floating-point literals are absent. Numeric separators, exponent notation, decimal points, and type suffixes are absent. In particular, `1_000`, `1.0`, and `42u8` are not alternative integer spellings. The later word operator `mod` is distinct from the `%` binary-literal prefix.

### 3.7 Character and string literals

A character literal uses single quotes and denotes exactly one decoded byte. A string literal uses double quotes and denotes a possibly empty sequence of decoded bytes:

```text
character-literal ::= "'" literal-byte "'"
string-literal    ::= '"' literal-byte* '"'
```

A direct literal byte is printable ASCII from space through `~`, excluding the literal's closing quote and backslash. A single quote may appear directly in a string, and a double quote may appear directly in a character literal.

Both literal forms accept only these escapes:

```text
\0  \n  \r  \t  \'  \"  \\  \xHH
```

`HH` is exactly two hexadecimal digits. The escape letters are lowercase; hexadecimal digits may use either case. The decoded values of `\0`, `\n`, `\r`, and `\t` are 0, 10, 13, and 9. `\xHH` contributes the byte whose value is `HH`.

A character literal must decode to exactly one byte. `''` and `'ab'` are errors. A string literal may decode to zero bytes, so `""` is valid. A physical line ending or EOF before the closing quote is an unterminated-literal error. A backslash followed by a physical line ending does not continue a literal.

The token records decoded bytes. Later chapters determine which character or bounded-string contexts accept those bytes. The tokenizer does not infer a string capacity or type from a literal.

Nucleus 0.1 has no interpolated, raw, or multiline literal family. It has no Unicode escape or encoding conversion. Adjacent string literals remain separate tokens; the tokenizer does not concatenate them.

An implementation may impose a maximum decoded literal length. It must publish the limit and diagnose an excess before discarding, wrapping, or truncating any byte.

### 3.8 Operators, punctuation, and delimiters

The tokenizer recognizes these punctuation tokens:

| Spelling | Token or use                                           |
| -------- | ------------------------------------------------------ |
| `(` `)`  | grouping, calls, declarations, and record initializers |
| `[` `]`  | array types, indexing, and array initializers          |
| `,`      | item and argument separator                            |
| `.`      | record-field selection                                 |
| `+` `-`  | arithmetic punctuation; also unary punctuation         |
| `*` `/`  | arithmetic punctuation                                 |
| `=`      | assignment or equality, according to grammar context   |
| `<>`     | not equal                                              |
| `<` `<=` | less-than comparisons                                  |
| `>` `>=` | greater-than comparisons                               |

Chapter 9 defines which expression operators are admitted, their operand types, precedence, and associativity. Listing a punctuation token here defines its formation, not every grammar position in which it is valid.

At each punctuation start, the tokenizer uses deterministic longest match. It recognizes `//` before `/`, and `<>`, `<=`, and `>=` before their one-character prefixes. No other two-character punctuation token is formed. `!=` and `==` are not comparison spellings.

Braces, colon, semicolon, question mark, hash, at sign, and backtick have no token in this draft. A source byte that begins no name, number, literal, comment, whitespace, line ending, or listed punctuation token is a lexical error. Nucleus 0.1 has no lexical preprocessor directive or macro form.

### 3.9 Token contract

The tokenizer emits the following token categories. Identifier spelling is part of the token contract.

| Category    | Payload                                                       |
| ----------- | ------------------------------------------------------------- |
| `NAME`      | exact preserved identifier spelling and source span           |
| keyword     | fixed reserved-word ordinal and source span                   |
| `NUMBER`    | exact value from 0 through 65,535 and source span             |
| `CHARACTER` | one decoded byte and source span                              |
| `STRING`    | decoded byte sequence and source span                         |
| punctuation | fixed punctuation ordinal and source span                     |
| `NEWLINE`   | source position of the terminating physical line or final EOF |
| `EOF`       | final source position                                         |

Comments and horizontal whitespace produce no tokens. `EOF` is emitted after any synthesized final `NEWLINE` and marks the end of the token stream.

For reuse in Chapter 17, the lexical grammar is:

```text
ascii-letter       ::= "A".."Z" | "a".."z"
decimal-digit      ::= "0".."9"
hexadecimal-digit  ::= decimal-digit | "A".."F" | "a".."f"
binary-digit       ::= "0" | "1"

identifier         ::= ascii-letter
                       (ascii-letter | decimal-digit | "_")*
integer-literal    ::= decimal-digit+
                     | "$" hexadecimal-digit+
                     | "%" binary-digit+
character-literal  ::= "'" literal-byte "'"
string-literal     ::= '"' literal-byte* '"'
literal-byte       ::= direct-literal-byte | escape
escape             ::= "\\0" | "\\n" | "\\r" | "\\t"
                     | "\\'" | '\\"' | "\\\\"
                     | "\\x" hexadecimal-digit hexadecimal-digit
line-comment       ::= "//" source-byte* (line-ending | EOF)
line-ending        ::= LF | CR LF
```

`direct-literal-byte` and the different closing delimiters obey Section 3.7. `source-byte*` in `line-comment` stops before a line ending. `NEWLINE` synthesis and delimiter suppression are stateful interface rules from Section 3.4 rather than context-free productions.

### 3.10 Lexical errors and bounded failure

The first compiler stops after its first lexical diagnostic. Another compiler may continue only to report additional diagnostics; it must not accept the source by guessing, replacing, truncating, or silently resynchronizing tokens, and it must not report successful compilation.

Lexical errors include:

- a byte outside the accepted source repertoire;
- a lone CR;
- a malformed or out-of-range numeric literal;
- an unknown or incomplete escape;
- an empty or multi-byte character literal;
- a character or string literal terminated by a physical line ending or EOF;
- an unrecognized punctuation byte;
- an identifier or literal longer than a documented capacity;
- delimiter-nesting capacity exhaustion, unmatched or mismatched delimiters, or an open delimiter at EOF; and
- source-position or other published tokenizer-capacity exhaustion.

The `//` form cannot be unterminated because a physical line ending or EOF completes it. Text beginning `/*` is not a block comment; it begins `/` and `*` tokens and is rejected if the later grammar has no valid use for them.

Capacity failure must not change token identity. In particular, an overlong name or literal must not be truncated, split, wrapped, or accepted through a hash collision. The diagnostic must identify the capacity that was exceeded.

### 3.11 Token examples

| Source                     | Result or required diagnostic                 |
| -------------------------- | --------------------------------------------- |
| `player_2`                 | one `NAME`                                    |
| `_player`                  | lexical error at `_`                          |
| `elseif`                   | one `ELSEIF` keyword                          |
| `ELSEIF`                   | one `NAME`; keywords require lowercase        |
| `elseifReady`              | one `NAME`                                    |
| `else if`                  | `ELSE IF`; not an `ELSEIF` clause             |
| `42`                       | `NUMBER(42)`                                  |
| `-42`                      | `- NUMBER(42)`                                |
| `$2a`                      | `NUMBER(42)`                                  |
| `0x2a`                     | malformed-number diagnostic                   |
| `%00101010`                | `NUMBER(42)`                                  |
| `$10000`                   | malformed-number diagnostic; too many digits  |
| `%10000000000000000`       | malformed-number diagnostic; too many digits  |
| `'A'`                      | `CHARACTER(65)`                               |
| `'\x41'`                   | `CHARACTER(65)`                               |
| `''`                       | empty-character diagnostic                    |
| `""`                       | empty `STRING`                                |
| `"A\nB"`                   | `STRING` containing bytes 65, 10, 66          |
| `"A\q"`                    | invalid-escape diagnostic                     |
| `a <= b`                   | `NAME <= NAME`                                |
| `a != b`                   | lexical error at `!`                          |
| `a; b`                     | lexical error at `;`                          |
| `a / / b`                  | `NAME / / NAME`; not a comment                |
| `a // note` followed by LF | `NAME NEWLINE`; the comment produces no token |

For this source:

```nucleus
check(
    table[index]
)
```

the token sequence is:

```text
NAME ( NAME [ NAME ] ) NEWLINE EOF
```

The two physical line endings inside delimiters do not appear in the token sequence.

### 3.12 Reserved-word and literal decisions

Chapter 8 admits `assert`. Chapter 9 admits `mod`, `not`, `and`, `or`, and `xor`. Chapter 14 admits `fail`, `fails`, and `handle`. These nine words are reserved. Chapter 11 omits a conditional header marker, so `then` remains an identifier. Nucleus integer literals use decimal digits, `$` hexadecimal, or `%` binary. A later revision that needs another token requires an amendment here and cost accounting for the added scanner, table, test, and diagnostic work.

## 4. Program and file structure

### 4.1 Scope

This chapter defines the source presented in one compilation, the order of top-level declarations, the placement of executable statements, the completion of forward routine declarations, and the structural checks performed at end of input. Chapter 3 defines the byte and token streams. Chapters 5, 8, and 13 define scopes, declarations, and routines in detail.

Nucleus compilation is declaration ordered and streaming. The rules in this chapter require neither backtracking nor a retained whole-program syntax tree.

### 4.2 Compilation unit

A **compilation unit** is one logical Nucleus token stream formed from one or more ordered source parts and ending in one `EOF` token. The compiler processes that stream from beginning to end as a single ordered unit. A compilation unit supplies one outer declaration sequence; a source-part boundary does not begin a scope, clear declarations, or change declaration order. Chapter 5 defines the resulting scopes.

The structural skeleton is:

```text
compilation-unit ::= { top-level-declaration } EOF
```

The complete grammar in Chapter 17 replaces this skeleton. Its declaration productions consume the logical `NEWLINE` tokens defined in Chapter 3.

Blank and comment-only physical lines contribute no top-level item. If the final item has no physical line ending, Chapter 3 requires the tokenizer to emit its final `NEWLINE` before `EOF`.

### 4.3 Multipart compilation stream

The core Nucleus 0.1 compiler does not open source files, search directories, or resolve source dependencies. An external packaging layer supplies one ordered logical compilation stream through these transport-neutral events or records:

```text
begin-compilation
begin-source-part(stable-source-identity, [diagnostic-name])
source-bytes(bytes)
end-source-part
end-compilation
```

A compilation contains one or more source parts. `source-bytes` may occur repeatedly within a part; its chunk boundaries have no lexical or semantic effect. The stable source identity is unique within the compilation and remains unchanged for every diagnostic from that part. The optional diagnostic name is display metadata. Neither value is part of the Nucleus byte stream, creates a token or identifier, opens a scope, or otherwise participates in program semantics.

Each source part must end at a logical source boundary with delimiter depth zero. When its final source bytes do not include LF or CRLF, the compiler input layer supplies one zero-width line-ending event at the end of that part. It supplies no additional event when the part already ends with a physical line ending. Chapter 3 applies its ordinary comment, blank-line, and `NEWLINE` rules to that event. The next part therefore cannot continue a name, number, literal, comment, parenthesized expression, bracketed expression, or other token sequence from the preceding part. `end-source-part` does not emit `EOF`; only `end-compilation` does so after the final part.

Program scope, declaration order, forward completion, and every other source rule continue across source-part boundaries exactly as they do within one part. Declaration before use determines legal part order. An earlier exact forward routine signature permits the later routine references already admitted by Chapters 4, 5, and 13; the compiler does not infer signatures or construct a dependency graph.

The external packaging layer owns physical files, filenames, dependency discovery, dependency ordering, duplicate suppression, and source transport. It must resolve or reject missing physical inputs and must not present duplicate stable source identities. These are packaging failures, not Nucleus source diagnostics, and the core compiler need not diagnose a host filesystem failure. Nucleus 0.1 retains no source-level `import`, `include`, `module`, or namespace declaration.

The compiler may consume each event and byte chunk incrementally. It need not materialize a source part or the complete compilation stream. A later compiler-input or transport specification may assign a concrete binary, serial, tape, image, memory, or host representation, but that representation must preserve this event order, the source bytes, stable identities, optional names, and boundary rule. No MIME syntax, operating system, filesystem, or project-file format is part of the Nucleus 0.1 contract. A host build tool, serial uploader, tape or image builder, CP/M driver, or memory-resident monitor can implement the packaging layer.

The packaging layer must not add declarations, replace tokens, perform textual macro processing, or make accepted source depend on a part's physical origin. A diagnostic from multipart input must carry the stable source-part identity and the Chapter 3 position within that part, allowing the packaging layer to map it back to a physical source when such a mapping exists.

#### 4.3.1 Flat source manifest

The standard authoring convention for this abstract stream is a flat ordered manifest. Each nonblank logical line contains one physical source name. Blank lines are ignored. The build driver processes entries in their written order, resolves every name within one base directory or storage namespace selected for that build, reads the named source, and emits one source part for it. The listed name is the part's diagnostic name. Its stable source identity combines that name with the entry's position, so a driver that permits a duplicate entry can still identify each part.

The manifest has no nesting, glob patterns, variables, conditional entries, dependency discovery, or recursive import meaning. It does not enter the source-byte stream, and the Nucleus tokenizer never sees it. The build driver defines how physical source names and line endings are encoded; a later compiler-input specification may define concrete multipart framing. Those transport choices do not change the ordered-part contract in Section 4.3.

The driver reports a missing physical source or an unresolvable source name before compilation. It may reject a duplicate manifest entry. If it emits the duplicate instead, the compiler processes both parts in order and ordinarily reports duplicate source declarations. A forgotten dependency ordinarily produces an unknown-name diagnostic; a wrong order produces the applicable declaration-before-use diagnostic; and a forward that no later part completes fails at `EOF`. The compiler does not search for another file or reorder parts in response.

### 4.4 Top-level declarations

Only top-level declarations may appear in a compilation unit. The current Nucleus 0.1 declaration families are:

- named constants;
- type declarations admitted by Chapter 6;
- top-level variable declarations admitted by Chapters 6 through 8;
- forward routine declarations; and
- routine definitions.

Executable statements must appear inside a routine body. A call, assignment, conditional, loop, or `return` at top level is invalid. Nucleus has no implicit mainline block formed from loose statements.

### 4.5 Declaration order

Except for a routine use covered by an earlier forward declaration, each name must be declared before use. Chapter 5 defines the declaration point, visibility, and lookup rules.

This rule applies across source-part boundaries because all parts contribute to one ordered compilation unit. Moving a declaration to a later part moves it later in declaration order. Splitting a unit into more parts does not make later names visible sooner.

The types named by a constant, variable, record field, formal parameter, routine result, or forward signature must already be declared at that position. The exact scope and collision rules appear in Chapter 5. Constant-expression restrictions and initialization order appear in Chapter 8.

After a routine's complete signature has been checked, its routine name and signature are available in its body and in later declarations. This permits the body to contain a direct self-call under Chapter 13. A call to another routine whose signature has not appeared requires an earlier forward declaration.

For example, this order satisfies the structural rules:

```nucleus
forward sub emit(value as u8)

sub run()
    var value as u8
    emit(value)
    return
end

sub emit
    return
end
```

The following order does not, because `emit` has no visible signature at the call:

```nucleus
sub run()
    emit(0)
    return
end

sub emit(value as u8)
    return
end
```

These examples establish declaration order only. Later chapters determine the remaining type, initialization, call, and return validity.

### 4.6 Forward routine declarations

A forward routine declaration supplies a routine signature without a body. It is the only source-language exception to ordinary declaration before use. It must appear at top level before the first use that depends on it.

The parameter and result types in a forward declaration must already be available. Once checked, the declaration makes the routine callable at later positions under the same rules as a routine whose body has already appeared. It creates no executable statement and does not begin a routine body.

The forward declaration is the complete and sole signature. It records the routine name, parameter names and ordered types, optional result type, and `fails` effect. The later body begins with the abbreviated header `sub NAME` followed by a logical newline. That name must resolve to exactly one incomplete forward. The parameters named by the forward become the parameter bindings in the body; the body cannot rename or redeclare them.

A routine may have at most one forward declaration and exactly one definition. A second forward declaration, a forward declaration after the definition, a second definition, an abbreviated body without an incomplete forward, or a completion with another name is invalid. Completing a forward declaration does not declare a second routine. An ordinary routine without a forward retains the complete parenthesized header defined in Chapter 13.

Forward declarations apply only to source routines. They do not provide a general forward reference for constants, types, variables, fields, or local names.

### 4.7 Program entry

Every Nucleus 0.1 compilation unit defines exactly one routine named `main`. Its data signature is fixed: it has no parameters and no result. It may include the `fails` effect declared by Chapter 14. The definition must have a body by `EOF`; a forward declaration alone cannot satisfy the entry rule.

Execution enters an implicit implementation startup path, which establishes every program-lifetime initial value before calling `main`. Normal completion of `main` terminates successfully. A failure returned from `main` performs the unhandled-error trap in Chapter 15. The build does not select another entry name, and Nucleus 0.1 defines no library-only compilation unit without `main`.

The startup entry is not a source declaration and cannot be called by source. Nucleus defines no source-visible reset, vector, interrupt, or alternate entry declaration.

Program startup, initialization, termination, and system services are specified in Chapters 16 and 19.

### 4.8 End of input and duplicate completion

`EOF` ends the compilation unit; it does not close an open declaration or block. Reaching `EOF` before a required `end`, closing delimiter, declaration terminator, or routine body is complete makes the source invalid. Chapter 3 handles unclosed lexical delimiters before the parser receives `EOF`.

At `EOF`, the compiler must verify that:

- every forward routine declaration has one abbreviated body definition;
- every routine has at most one body;
- no top-level declaration remains structurally incomplete; and
- exactly one defined `main` satisfies Section 4.7.

The compiler may diagnose a duplicate declaration or mismatched completion as soon as it encounters the later declaration. It must not defer a detectable error merely because end-of-input validation also covers the condition. After any structural error, the initial compiler may stop under the diagnostic policy in Chapter 1; it must not report a successful translation.

### 4.9 Capacity limits and source parts

Documented compiler capacities apply to the complete logical compilation unit. A source-part boundary must not reset a symbol count, forward-signature count, nesting limit, or other unit-wide resource. Dividing the same ordered source among more parts neither increases a language-defined capacity nor creates extra scopes. Chapter 3 source-position counters restart for each part because diagnostics use part-relative positions.

An implementation may bound the complete logical source length, source-part count, source-identity or diagnostic-name length, number of declarations, number of unresolved forwards, or other storage required by this chapter. It must document each limit and issue a capacity diagnostic when the limit is exceeded. Under Chapter 1, that diagnostic does not make an otherwise conforming source program invalid.

The first compiler's 16 KiB core gate does not change these structural rules. Project measurements account for the code and immutable data used to enforce them, while writable tables and source maps remain in their separately reported accounts under Chapter 2.

## 5. Names and scopes

### 5.1 Scope

This chapter defines how declarations bind names and where those bindings are visible. Chapter 3 defines identifier formation and identity. Chapter 4 supplies one ordered compilation unit and the placement of top-level declarations and routine bodies. Chapters 6 through 8 define types, storage, values, lifetime, and declaration forms.

A scope controls where source text may refer to a declaration. It does not determine storage allocation, initialization, storage duration, or value lifetime; Chapter 7 defines those subjects.

Nucleus has no implicit declarations, overloads, generic parameters, nested routines, or source-level module namespaces. Formal parameters and named local variables use the declarations defined by Chapters 8 and 13.

### 5.2 Name identity

Chapter 3 establishes an identifier's exact preserved spelling as its identity. All name binding, collision detection, forward completion, and lookup use that complete case-sensitive identity. Letter case distinguishes names.

An implementation may use a hash or an interned ordinal to locate a candidate binding, but it must confirm equality from the complete preserved spelling. It must not fold case, compare only a prefix, truncate a spelling, or treat an unchecked hash match as equality.

### 5.3 Scope structure

Nucleus uses these scopes:

| Scope        | Bindings                                                                                     | Enclosing scope                                                                               |
| ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Program      | Predefined names, named constants, record types, top-level variables, and routine signatures | None                                                                                          |
| Routine      | The routine's formal parameters and named local variables                                    | Program scope as visible at the routine's source position                                     |
| Record field | The fields declared by one record type                                                       | None for ordinary-name lookup; selection uses the field scope associated with the record type |

One compilation unit has one program scope. A source-part boundary does not open another scope. Chapter 4 defines how ordered source parts contribute to that unit.

Each routine definition has one routine scope. Parameters and locals are binding classes within that scope, not separate nested scopes. Conditional clauses, loops, and other statement blocks do not open name scopes. Local declarations therefore remain in the routine's declaration prefix and cannot appear inside a statement block.

Each record type has its own field scope. A field scope is separate from the ordinary scopes and from every other record's field scope.

### 5.4 One ordinary namespace

Program and routine scopes use one ordinary namespace. A record type, named constant, variable, routine, parameter, or local with a given exact identity prevents another visible ordinary binding from using that identity. Type and value names do not occupy separate namespaces.

Name lookup first finds the one ordinary binding and then checks whether its declaration class is valid in context. A record type used as an expression, a variable used as a type, or a result-free routine used as a value is invalid. The compiler must not continue searching for another declaration of a more convenient class.

Nucleus has no overload sets. Two routines with the same identity conflict even when their parameter or result types differ. Enumeration and subrange types are absent and introduce no member or range namespaces.

Every ordinary binding has one canonical declaration. An abbreviated routine body completes an earlier forward declaration under Section 5.8; it is the only case in which a later header with the same identity is not a duplicate declaration.

For example, the single namespace accepts this pair of names:

```nucleus
record Point
    x as u16
end

var origin as Point
```

Case variants are distinct names, so this declaration is valid:

```nucleus
record Point
    x as u16
end

var point as Point
```

Repeating the exact type name in the same namespace is invalid:

```nucleus
record Point
    x as u16
end

var Point as Point       // invalid: exact duplicate of the type name
```

### 5.5 Declaration visibility

A completed declaration must precede every use. For routines, the checked signature is the declaration: an ordinary header exposes its name before its own body, and a forward header exposes the name before the later definition.

| Declaration                          | Declaration point and later visibility                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Predefined name                      | Before the first source token; visible throughout the unit                                                                                        |
| Named constant or program variable   | After the complete declaration, including its type and any initializer, has been checked                                                          |
| Record type                          | After the complete record declaration, including every field, has been checked                                                                    |
| Routine definition without a forward | After the complete signature has been checked and before the body begins                                                                          |
| Forward routine declaration          | After the complete signature has been checked                                                                                                     |
| Formal parameters                    | Together, after an ordinary header is checked or an abbreviated body header opens its forward; visible in that body's local prefix and statements |
| Local variable                       | After its complete declaration, including any initializer, has been checked; visible in later local declarations and the body                     |
| Record field                         | After the complete record declaration has been checked; visible only through selection on that record type                                        |

A declaration is not visible in its own type, bound, initializer, or other declaration operand. A record type is not visible in its own field list. These rules reject self-reference by non-routine declarations and prevent declaration cycles without a dependency graph or a second declaration pass.

```nucleus
const first = second   // invalid: second is not yet visible
const second = 2

const count = count    // invalid: count is not visible in its initializer
```

Declaration order applies across the whole logical compilation unit. A later declaration does not become visible to an earlier routine merely because an implementation retained the source or built a syntax tree.

### 5.6 Duplicate declarations and shadowing

Two declarations in the same scope conflict when their exact case-sensitive identities are equal. A difference in letter case creates a different name; repeating the same spelling is a duplicate.

Lookup never selects a later declaration in preference to an earlier one. Nucleus has no temporal shadowing, source-level replacement, or latest-definition rule.

A parameter or local must not shadow an ordinary program binding visible at its declaration point. A local must not reuse the identity of a parameter or an earlier local. Because routine bodies contain no nested declaration scopes, no inner-block shadowing case exists.

```nucleus
const limit = 10

sub clamp(limit as u16)       // invalid: parameter shadows visible constant
    return
end
```

The no-shadowing rule is evaluated at the declaration point. A program declaration that appears after an earlier routine is not visible in that routine and does not retroactively invalidate one of its parameter or local names.

Within one record, two fields with the same exact identity conflict. The same field identity may appear in different records, and a field may share an identity with an ordinary binding, because field selection supplies the record type before field lookup.

```nucleus
record Point
    value as u16
end

record Sample
    value as u8            // valid: a different field scope
end

const value = 0     // valid: the ordinary namespace
```

### 5.7 Lookup

The compiler resolves a name at its source position in this order:

| Context                                | Lookup                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A reserved word or built-in type token | Use the token established by Chapter 3; perform no ordinary-name lookup                                |
| A name after `.`                       | Use the selected record's field scope, or require intrinsic `length` when the base is a bounded string |
| An ordinary name inside a routine      | Search visible parameters and locals in the current routine scope, then the visible program scope      |
| An ordinary name at top level          | Search the visible program scope                                                                       |

The no-shadowing rule ensures that the routine and program searches cannot both produce valid bindings for the same identity. Field names are never found by unqualified ordinary lookup.

If lookup finds no binding, the compiler must issue an undeclared-name diagnostic. It must not create a variable, infer a declaration class, or grant visibility to a later declaration. If lookup finds a binding of the wrong class for the context, the compiler must diagnose that class mismatch.

### 5.8 Forward routine signatures

An explicit forward signature is the only source form that creates a name binding before its body. After its complete signature has been checked, it creates the routine's canonical program-scope binding and retains the parameter names and ordered types, optional result type, and `fails` effect. The parameter names do not become program-scope bindings or open a routine scope at the forward declaration.

The later abbreviated body header, `sub NAME`, completes that binding. It does not declare a second routine or repeat any signature component. The name must resolve by exact identity to one incomplete forward. At that point, the forward's parameter names become the formal bindings in the routine scope and remain the only parameter spellings for the body.

A routine may have at most one forward declaration and one definition. A second forward declaration, a forward declaration after a definition, an abbreviated body without one matching incomplete forward, or another completion is invalid. Every forward declaration must have a completing definition in the same compilation unit.

Forward declarations apply only to source routines. Constants, variables, record types, fields, parameters, and locals have no forward form.

This completion matches:

```nucleus
forward sub emit(value as u8)

sub emit
    return
end
```

### 5.9 Self-reference and recursive call graphs

After a routine's complete signature has been checked, its program-scope binding is visible in its own body. Name resolution therefore permits a direct self-reference without a forward declaration.

Mutual references require forward signatures for every later routine that an earlier body names. In this example, `second` is visible through its forward declaration, while `first` is visible after its own header:

```nucleus
forward sub second(value as u16)

sub first(value as u16)
    second(value)
    return
end

sub second
    first(value)
    return
end
```

Under these rules, those names resolve. Chapter 13 admits recursive calls and defines their call semantics; Chapter 7 defines activation storage and lifetime. Implementation staging must not change the name-resolution result.

### 5.10 Reserved, predefined, entry, and generated names

Reserved words, built-in type words, and Boolean literals recognized by Chapter 3 are tokens rather than ordinary bindings. A source declaration cannot use their spellings as identifiers.

Chapter 16 defines the complete standard set of predefined source routines and constants. The compiler establishes those ordinary program-scope bindings before the first source token. User declarations and routine-scope declarations cannot redeclare or shadow them. An implementation extension may add names only under the explicit extension rules in Section 1.7.

`main` is not a predefined binding. Its required lowercase source definition creates the ordinary routine binding and must satisfy Section 4.7. A differently cased name such as `Main` is distinct and does not satisfy the entry rule. No other declaration may use the exact identity `main`.

Compiler-generated temporaries, labels, and helper names remain outside the source namespace. They cannot collide with a source identifier or become visible to source lookup.

### 5.11 Diagnostics and capacity limits

The compiler must diagnose an undeclared use, an exact duplicate, forbidden shadowing, a wrong declaration class, an abbreviated body without one incomplete forward, a second completion, and an uncompleted forward declaration. It may stop after the first diagnostic under Chapter 1.

An implementation may bound identifier length, retained name bytes, ordinary bindings, routine-local bindings, record fields, or unresolved forward signatures. It must document each limit and issue a capacity diagnostic before truncation, wraparound, dropped declarations, or unchecked collision can occur. A capacity failure does not change identifier identity or make an otherwise conforming program invalid.

The implementation may use one bounded ordinary symbol table, a mark for the current routine, and a field table associated with each record type. That layout is non-normative. The observable lookup, collision, visibility, and diagnostic rules above remain the same for any internal representation.

## 6. Types

### 6.1 Scope

This chapter defines the Nucleus 0.1 type set, type identity, compatibility, scalar conversions, aggregate categories, and the static type carried by aggregate aliases. Chapter 7 defines storage duration and lifetime. Chapter 8 defines declarations and initialization. Chapter 9 defines expression syntax and operator typing, and Chapter 13 defines routine syntax and parameter passing.

The type system supports local checking during one streaming source pass. A compiler can determine the type of a name, field, array element, literal in context, or routine result from declarations already processed. It requires neither whole-program inference nor runtime type tags.

### 6.2 Type set

Nucleus 0.1 has three scalar types and three aggregate forms:

| Category  | Types or forms                       |
| --------- | ------------------------------------ |
| Scalar    | `u8`, `u16`, `boolean`               |
| Aggregate | nominal records, `T[N]`, `string[N]` |

The following skeleton records type formation without defining declaration grammar:

```text
type             ::= scalar-type
                   | record-type-name
                   | fixed-array-type
                   | bounded-string-type
scalar-type      ::= "u8" | "u16" | "boolean"
fixed-array-type ::= element-type "[" array-length "]"
element-type     ::= scalar-type | record-type-name | bounded-string-type
bounded-string-type
                 ::= "string" "[" string-capacity "]"
```

An array has one dimension. An array element may be a scalar, record, or bounded string, but not another array. Records may contain fields of any admitted type, including fixed arrays.

`string[N]` is the bounded-text form. `string` is a core reserved word. No other type word is added by this chapter.

### 6.3 Scalar types

`u8` is the unsigned integer type whose values range from 0 through 255. `u16` is the unsigned integer type whose values range from 0 through 65,535. Their widths and ranges do not vary by target.

`boolean` has exactly the values `false` and `true`. It is distinct from both integer types. An integer is not a condition, a Boolean value is not an integer, and Nucleus 0.1 provides no Boolean-to-integer or integer-to-Boolean conversion.

A scalar variable, parameter, field, array element, or routine result holds a scalar value. Scalar assignment and scalar argument passing copy the value. A compiler may use any private register or memory representation that preserves the type and value; that representation does not alter source compatibility.

### 6.4 Literals and scalar conversion

An integer literal is exact and has no fixed integer type until an expected integer type or an expression rule supplies one. In a declaration initializer, scalar argument, assignment, return, array index, or other expected-type position, a literal may take type `u8` or `u16` when its value lies in that type's range. A literal outside the expected range is invalid; it is not truncated or wrapped.

Chapter 9 defines the treatment of an integer literal with no expected type and the result types of operators. This chapter does not assign an expression-wide default type.

A character literal has type `u8` and its value is the decoded byte from Chapter 3. Nucleus has no separate character type. The ordinary `u8`-to-`u16` widening rule permits a character literal where a `u16` value is expected.

The only implicit conversion between declared scalar types is `u8` to `u16`. It preserves every source value and zero-extends in representations where extension is required. The same conversion applies to assignment, initialization, scalar arguments, scalar results, and operands when Chapter 9 admits a mixed-width operation.

Conversion from `u16` to `u8` requires an explicit checked narrowing operation. Chapter 9 defines its expression spelling. When the source value is known and exceeds 255, the compiler must issue a diagnostic. When the value is not known until execution, the generated program must trap before producing or storing a `u8` result if the value exceeds 255. Checked narrowing never means low-byte extraction, modulo reduction, or reinterpretation.

No implicit or explicit scalar conversion changes `boolean` into an integer or an integer into `boolean`. Nucleus 0.1 also has no arbitrary cast or same-width reinterpretation operation.

### 6.5 Values, aggregate storage, and aliases

The source type and the way a source occurrence denotes data are separate properties:

| Category                | Meaning                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Scalar value            | A `u8`, `u16`, or `boolean` value that can be copied by assignment, argument passing, or return.   |
| Owned aggregate storage | Storage containing one record, fixed array, or bounded string for a lifetime defined in Chapter 7. |
| Aggregate alias         | A typed, non-owning binding to existing aggregate storage.                                         |

A scalar named constant has either an exact integer type inferred from its initializer or type `boolean`. A record, fixed array, or bounded-string constant has an explicit aggregate type and complete static initializer under Chapter 8.

Top-level variables and aggregate constants provide owned aggregate storage. Aggregate storage may also occur inline as a record field or fixed-array element. A routine cannot declare aggregate storage or an aggregate-alias local. The permitted declaration sites, initialization rules, mutability, and storage duration appear in Chapters 7 and 8.

An aggregate parameter is a fixed typed alias to caller-provided storage. Its binding cannot be changed, but mutation and exact-type aggregate assignment through it change the caller's object. A routine may also return a transient aggregate alias to existing storage.

Assignment between aggregate designators of the exact same type copies the complete record, fixed array, or bounded string into the destination. The assignment changes the destination object's contents and never rebinds an alias. Routine arguments and aggregate results continue to transfer aliases rather than copying automatically.

An aggregate routine result is a transient typed alias to existing program-lifetime storage. Chapter 7 defines its permitted consumption, and Chapter 13 defines result syntax. Nucleus has no aggregate storage whose lifetime ends with a call, so aggregate results require no separate escape analysis.

### 6.6 Record types

A record declaration creates one nominal type. Two record declarations create different types even when their fields have identical names and types. Record storage and aliases are compatible only with the type created by the same declaration.

Every record has one fixed field sequence and one fixed layout. Each field has a name and one previously declared type. A field may have scalar, record, fixed-array, or bounded-string type. The complete field sequence is known when the record declaration ends.

A record must have finite size. A field therefore must not contain its own record type directly or through a cycle of record and array containment. Variant records, unions, and overlaid layouts are absent.

Selecting a scalar field produces a scalar occurrence of the field's declared type. Selecting an aggregate field produces a storage path or aggregate alias with the field's exact aggregate type. Selection does not expose a byte offset or address to source code.

Chapter 8 defines record declaration and field syntax. Runtime byte offsets and packed layout belong to the Z80 runtime and backend contract.

### 6.7 Fixed-array types

`T[N]` is a one-dimensional fixed array with element type `T` and length `N`. `N` must be a positive compile-time integer from 1 through 65,535. A compiler may publish a smaller capacity for a particular storage region or implementation, but exceeding that capacity is a capacity failure rather than another array type.

The index domain is always zero through `N - 1`. Nucleus has no arbitrary lower bound, subrange index, enumeration index, or range type. The length and element type are part of the array type.

Two fixed-array types are identical when their element types are identical and their lengths are equal. Thus `u8[16]` and `u8[16]` are the same type, while `u8[16]`, `u8[32]`, and `u16[16]` are three different types.

An array index must have type `u8` or `u16`; `u8` widens to `u16` when the checking operation requires it. A constant index outside the array domain is invalid. A dynamic index must be checked before the access unless the compiler proves from information already available at that point that it lies in the domain. A failed dynamic check performs the bounds trap specified by Chapter 15 before any element load or store.

Indexing an array of scalars produces a scalar occurrence with the element type. Indexing an array of records or bounded strings produces a storage path or aggregate alias with the element type. The index operation never produces an untyped address.

### 6.8 Bounded strings

`string[N]` is a fixed-capacity counted sequence of bytes with a current length from 0 through `N`. `N` is a compile-time integer from 1 through 253 and is part of the type. The empty string is a valid value. Payload bytes may have any value from 0 through 255, including zero.

A string literal is a contextual bounded-string initializer. It is compatible with `string[N]` when its decoded byte length does not exceed `N`. A literal that is too long is invalid. The literal does not create an open-ended string type, infer a new capacity, or permit a later capacity mismatch.

Two bounded-string types are identical only when their capacities are equal. An alias to `string[16]` is not compatible with `string[32]`, even when the current contents would fit both. This exact rule keeps the referent extent available from the static type and permits a one-address alias representation.

A bounded string is an aggregate, not a `u8` array. It has no source-level header field, payload field, or terminator field. Nucleus 0.1 provides two intrinsic postfix operations without exposing that representation:

- `text.length` is a read-only `u8` value equal to the current logical byte length.
- `text[index]` selects one existing byte as a `u8` storage path. The index must have type `u8` or `u16` and must be less than the current length. A failed check performs the `bounds` trap before a read or write.

A bounded string's length is established only by static initialization or by whole-object assignment from an identical `string[N]`. A byte assignment replaces exactly one existing byte and does not change the string's length or capacity. These operations provide no append, insertion, resize, truncation, or whole-string comparison. Source code cannot build counted text by filling bytes and then changing the length. Constructed text uses a fixed `u8[N]` array plus a caller-managed scalar length. Whole-string assignment is available only between identical `string[N]` types under Section 7.8. Embedded zero bytes are ordinary content and do not terminate either operation.

The `.length` intrinsic applies only when the postfix base has bounded-string type. On a record base, `.length` remains ordinary lookup in that record's field scope. Any other field suffix on a bounded string is invalid.

Nucleus 0.1 has no `string[]`, open string, slice, general view, or address-and-length source value. A routine that accepts a bounded string names an exact capacity in its parameter type. A broader read-only view may be considered in a later language version after its compiler, carrier, lifetime, and result-ABI costs have been measured.

This chapter fixes the semantic domain and capacity, not the stored layout. Chapter 7 defines storage identity and lifetime, Chapter 8 defines declaration initialization, and the Z80 runtime and backend contract defines the physical representation and byte encoding. That representation preserves embedded zero bytes, logical lengths through 253, and alias-visible byte mutation.

### 6.9 Aggregate aliases and address separation

An aggregate alias has the same source type as its referent and a separate alias category. For example, an alias to a `Person` record permits `Person` field selection, and an alias to `u8[64]` permits indexing with the fixed bound 64. The alias does not create a reference type that can be named independently.

The compiler must retain the referent type through aggregate parameters, field and element selection, scalar and aggregate assignments, calls, and aggregate results. Passing or returning an alias, or using it as an aggregate-copy source or destination, is invalid unless the required aggregate type is identical to its referent type.

A direct backend represents an alias at runtime with one untagged 16-bit address because compiler metadata records the record layout, array length, or string capacity. The runtime carrier has no source spelling and no runtime type tag. Source code cannot read, write, compare, convert, store, return as a scalar, or perform arithmetic on the carrier itself.

An alias carrier and `u16` remain different typed entities even though both occupy one word. No conversion exists in either direction. Address derivation for field and element access is a checked compiler or backend operation, not `u16` arithmetic visible to the program.

### 6.10 Type identity and compatibility

Type identity is determined as follows:

| Type form       | Identity rule                                                      |
| --------------- | ------------------------------------------------------------------ |
| `u8`            | The predefined `u8` type.                                          |
| `u16`           | The predefined `u16` type.                                         |
| `boolean`       | The predefined Boolean type.                                       |
| Record          | The single declaration that introduced the record.                 |
| Fixed array     | Identical element type and identical fixed length.                 |
| `string[N]`     | Identical capacity `N`.                                            |
| Aggregate alias | The exact referent type; aliasing adds a category, not a new type. |

The compiler applies these compatibility rules:

| Context                                                | Required compatibility                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Scalar assignment, initialization, argument, or result | Exact scalar type, fitting exact integer literal or named constant, or implicit `u8`-to-`u16` widening. |
| Checked narrowing to `u8`                              | Explicit operation and successful range check.                                                          |
| Boolean condition or destination                       | `boolean` only.                                                                                         |
| Record field selection                                 | The field's declared type.                                                                              |
| Fixed-array index                                      | `u8` or `u16` index; result has the exact element type.                                                 |
| Bounded-string `.length`                               | Read-only `u8` value equal to the current logical length.                                               |
| Bounded-string index                                   | `u8` or `u16` index below the current length; result is a writable `u8` path.                           |
| Aggregate parameter                                    | Exact referent-type identity.                                                                           |
| Aggregate assignment                                   | Exact type identity; copy the complete aggregate into the destination.                                  |
| Aggregate result                                       | Exact referent-type identity and immediate consumption under Chapter 7.                                 |
| Aggregate by-value argument or result                  | Invalid; calls transfer aggregate aliases.                                                              |

Compatibility is checked at the source operation. The backend does not infer compatibility from equal byte widths, equal layouts, compiler storage ordinals, registers, or runtime addresses.

### 6.11 Excluded type mechanisms

Nucleus 0.1 has none of the following:

- raw pointer or address types visible to source;
- pointer or address arithmetic;
- implicit word/address interchange;
- enumeration or subrange types;
- set types;
- variant records, unions, or overlaid aggregate layouts;
- structural equivalence between distinct record declarations;
- arbitrary casts, type punning, or unchecked narrowing;
- generic types or generic aggregate parameters;
- open arrays, slices, or variable-capacity views;
- heap-allocated or resizable types;
- variable-sized local allocation; or
- unrestricted dynamic data.

An implementation must diagnose a source form that requires one of these mechanisms. Equal storage width or a convenient machine representation does not admit the source operation.

### 6.12 Type metadata and capacity

Exact type identity is checked from retained metadata without reconstructing source text. Record declarations require nominal IDs. Predefined scalars, fixed arrays, and bounded strings have compact, bounded structural descriptions: kind, element type when applicable, and length or capacity. A compiler may store those descriptions directly in symbols and signatures or intern them behind compact ordinals. Measurements of compiler-core bytes, immutable data, writable workspace, and comparison code determine the representation used by the first implementation.

One direct representation fits every admitted type in four bytes. Its kind byte distinguishes the three scalars, records, bounded strings, and the five permitted array-element families. A second byte carries a record ordinal or string capacity where needed, and two bytes carry an array length. Folding the element family into the array kind is valid because arrays cannot contain arrays. It does not remove arrays of records, arrays of bounded strings, or aliases to any aggregate type; alias category is stored separately from referent-type identity.

Four inline bytes are not automatically cheaper than one ordinal per symbol. With mostly distinct types, direct descriptors avoid an interning table; with many repeated types, ordinals reduce writable symbol storage. The measurement package reports both retained-data totals for representative symbol populations. The first compiler also counts the code and scratch state for descriptor construction, interning, exhaustion checks, and equality before selecting either form.

Every selected representation has a published capacity. An ordinal representation diagnoses exhaustion before an ID wraps or aliases another type. An inline representation diagnoses any limit on element-type nesting, length, capacity, symbol entries, record fields, or signatures before truncation changes a compatibility result. A byte-sized type ID remains a candidate, not a language or target requirement.

The numeric type ID has no source meaning and need not match across compilations. Z80 registers and compiler-managed storage locations are untagged; the compiler's symbol and expression metadata supply their current source types. Runtime type tags, reflection, and dynamic type tests are absent.

### 6.13 Examples

These declarations illustrate scalar compatibility:

```nucleus
var byteValue as u8 = 42
var wordValue as u16 = byteValue
var code as u8 = 'A'
var flag as boolean = true
```

Each of the following is invalid under this chapter:

```nucleus
var tooSmall as u8 = 256       // literal does not fit
var narrowed as u8 = wordValue // explicit checked narrowing required
var truth as boolean = 1       // integer is not Boolean
var count as u16 = false       // Boolean is not integer
```

Record identity is nominal:

```nucleus
record LeftPoint
    x as u16
    y as u16
end

record RightPoint
    x as u16
    y as u16
end
```

`LeftPoint` and `RightPoint` are different types despite their equal field lists. An alias or parameter of one type cannot bind storage of the other.

Array and bounded-string bounds are part of their types:

```nucleus
var bytes as u8[16]
var name as string[12]
```

`bytes[0]` through `bytes[15]` are within the declared domain. `bytes[16]` is a compile-time error. A runtime value used as the index is checked before access. `string[12]` and `string[16]` are different types, and a thirteen-byte literal cannot initialize `name`.

For a bounded string `name`, `name.length` reads its logical length and `name[index]` reads or replaces one existing byte. An index equal to the current length traps; assignment through the index does not append or change `name.length`.

## 7. Storage, values, and lifetime

### 7.1 Scope

This chapter defines source-level storage, object identity, value copying, aggregate aliases, storage duration, and lifetime. Chapter 6 defines the types that occupy storage. Chapter 8 defines declaration syntax, constants, initializers, and when a declaration installs a zero or explicit initial value. Chapter 13 defines routine syntax, result syntax, and calls.

The rules in this chapter do not expose physical addresses, banks, Z80 registers, stack positions, activation layouts, or compiler workspace. Those are implementation matters. A conforming implementation preserves the source-level identity and lifetime rules regardless of its storage arrangement.

### 7.2 Values, objects, subobjects, and aliases

Nucleus distinguishes four related concepts:

| Concept               | Source meaning                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Scalar value          | One `u8`, `u16`, or `boolean` value. Scalar values can be copied.                                                                      |
| Object                | Storage associated with a program variable.                                                                                            |
| Subobject             | A record field, fixed-array element, or existing bounded-string byte. A bounded string may itself be an object or aggregate subobject. |
| Typed aggregate alias | A non-owning, fixed binding to an existing record, fixed-array, or bounded-string object or subobject of one of those types.           |

An object has one identity throughout its lifetime. Writing a new scalar value into an object or subobject changes its contents, not its identity. An alias has the exact aggregate type of its target and does not create another object.

Every alias is bound to an object or aggregate subobject when the alias is established. Nucleus has no null, unbound, or reseatable aggregate alias. Source code cannot inspect, compare, convert, or perform arithmetic on the implementation carrier used for an alias.

### 7.3 Owned storage

A top-level variable owns one mutable object with program lifetime. A scalar variable owns one scalar cell. A record, fixed-array, or bounded-string variable owns the complete aggregate object, including every contained subobject. An aggregate constant owns one statically initialized program-lifetime aggregate object whose direct named root is read-only.

Scalar named constants denote values and need not occupy source-observable storage. Aggregate named constants occupy program-lifetime storage containing their complete static values. Their direct named roots are read-only under Section 7.8.

Aggregate storage occurs only in top-level variable or aggregate-constant objects and inline within other aggregate storage. A record field has storage within its containing record. An array element has storage within its containing array. A bounded string has its counted content within its containing string object. A routine cannot declare owned aggregate storage, and Nucleus allocates no activation-lifetime aggregate storage.

### 7.4 Program lifetime

Program-lifetime objects exist before the designated entry routine begins. Their lifetime ends when program execution terminates, whether normally or through a specified trap. Chapter 8 defines their initialization and the point at which each initial value is established before the first source read.

The zero value of each admitted type is:

| Type        | Zero value                                                  |
| ----------- | ----------------------------------------------------------- |
| `u8`, `u16` | integer zero                                                |
| `boolean`   | `false`                                                     |
| record      | the record whose fields recursively have their zero values  |
| `T[N]`      | the array whose elements recursively have their zero values |
| `string[N]` | the empty byte sequence                                     |

This table defines values, not a byte layout or a universal initialization rule. Chapter 8 specifies which declarations receive a zero value and which require an explicit initializer. An implementation must establish the required semantic value without exposing padding, headers, addresses, or backend-specific representations.

### 7.5 Routine activations

Each routine invocation creates a distinct logical activation. An activation contains that invocation's scalar parameters, scalar locals, and aggregate-parameter bindings. It begins when the call establishes the parameters and ends when the routine returns or program execution terminates.

A scalar parameter receives a copied value. Each scalar local belongs to one activation. Its source lifetime begins when execution reaches its declaration and Chapter 8 has established its initial value; its lifetime ends with the activation. A scalar result is copied from the returned expression to the caller. It is not shared storage in the callee.

An aggregate parameter is a typed alias to caller-provided storage. Its binding belongs to the activation, but the target retains program lifetime. A routine has no other named aggregate binding.

Two simultaneously active invocations have distinct logical parameters and scalar locals. This rule applies even when the implementation assigns the same registers or physical storage to invocations that cannot overlap.

Recursive calls use the same activation rule. An implementation preserves distinct logical activation state at every active depth. Caller-save regions, hardware-stack entries, static-slot save areas, or another re-entry mechanism may implement that rule; none is source storage.

These rules divide storage into two practical planes. The aggregate plane contains fixed top-level program-lifetime objects and their aggregate subobjects. The activation plane contains copied scalar parameters, scalar locals, and aggregate-parameter bindings. Calls preserve overlapping activation-plane state; aggregate bytes remain in program storage.

Programs declare every aggregate object at top level, pass required objects or subobjects through aggregate parameters, and use scalar locals for per-invocation work. A routine that needs destination or scratch aggregate storage receives it from its caller. This rule keeps every aggregate allocation visible in the program declaration sequence and prevents hidden shared aggregate state inside recursion.

### 7.6 Aggregate parameter binding

An aggregate alias binds once when a call establishes an aggregate parameter. The argument is a compatible aggregate storage path rooted in a program variable, aggregate constant, or aggregate parameter, a field or fixed-array element reached from such a root, or a transient aggregate result admitted by Section 7.9. Every admitted source ultimately denotes top-level program storage.

The caller evaluates every field selection and checked index used to form the argument once before the call begins. The callee receives the resulting typed alias, and its binding cannot be changed. The target type must exactly match the parameter type under Chapter 6.

An alias does not extend the target's lifetime. Scalar-leaf writes and exact-type aggregate assignment through an aggregate alias are allowed under the ordinary assignment rules, including when the original target was named by an aggregate constant. Read-only status belongs only to the direct constant-rooted source path; it is not carried in the alias type or checked dynamically.

### 7.7 Subobject lifetime and identity

A subobject begins and ends its lifetime with its containing object. Nested containment does not create a separately managed lifetime. An alias to an aggregate record field or fixed-array element remains valid only while the containing object remains alive.

Distinct fields of one record, distinct elements of one fixed array, and distinct byte positions in one bounded string are distinct subobjects. An object overlaps each of its own subobjects, and a nested subobject overlaps every containing object on its path. Sibling fields, sibling array elements, and distinct string bytes do not overlap in source semantics.

Two aliases may denote the same object or overlapping objects. Nucleus provides no alias-identity comparison, but identity is observable through mutation: a scalar write through one path is visible through every other path to that scalar subobject. An implementation must preserve this effect even if it caches a scalar value or uses different carriers for the two paths.

### 7.8 Assignment and aggregate mutation

Scalar assignment copies a value into a scalar destination. The destination may be a scalar variable, parameter, record field, fixed-array element, or existing bounded-string byte. After the assignment, later changes to the source do not change the destination.

Aggregate assignment requires a mutable aggregate destination and an aggregate source of the exact same type. It copies the complete aggregate value into the destination. The direct backend copies exactly the type's packed fixed byte extent. A bounded-string copy includes its logical length and complete fixed-capacity object representation.

The compiler evaluates the destination storage path once, then the source storage path or transient aggregate-alias result once, and validates both complete extents before the first destination byte changes. If evaluation or validation traps, no byte of the aggregate destination changes. A source and destination that denote the same object or subobject produce no change.

Under the Nucleus 0.1 type and containment rules, two designators of one exact aggregate type are either identical or disjoint. A proper partial overlap would require recursive by-value containment, an overlaid layout, a slice, or arbitrary address formation, all of which are absent. Aggregate assignment therefore needs no runtime overlap check.

Aggregate alias binding is not assignment. Once established, an aggregate parameter cannot be rebound. When an aggregate parameter is the destination of aggregate assignment, the copy changes its referent. It does not change the binding.

An assignment whose written target is rooted directly at an aggregate constant name is invalid, whether it names the whole object, a field, an array element, or a bounded-string byte. This is a source-path restriction, not transitive immutability. Passing that constant as an aggregate argument or returning it as an aggregate alias deliberately loses the direct-root marker; a callee may then mutate the target through its ordinary writable parameter. Whether such a write changes bytes, is ignored, or is rejected by the target platform depends on where the implementation places read-only data. Portable programs do not depend on mutation through an alias to an aggregate constant.

### 7.9 Aggregate results

An aggregate routine result is a transient typed alias to existing program-lifetime storage. The result preserves the target's exact aggregate type and denotes the same object.

Program-lifetime storage consists of top-level variable and aggregate-constant objects and their aggregate subobjects. Nucleus 0.1 has no routine-local aggregate declaration, activation-lifetime aggregate, heap aggregate, or variable-sized local, so every aggregate storage path, aggregate-parameter binding, and transient aggregate-alias result denotes program-lifetime storage. An aggregate result therefore always outlives the callee activation. The compiler retains the exact referent type and transient-result category, but it needs no lifetime-tracking bit, signature annotation, or parameter identity for this purpose.

An aggregate return source is a storage path rooted in a visible program variable, aggregate constant, or aggregate parameter, a field or fixed-array element reached from such a root, or a transient aggregate result forwarded from another call. Field selection and checked indexing continue to denote program-lifetime subobjects because every aggregate subobject has the lifetime of its containing object.

The caller must consume a returned aggregate alias immediately. It may discard the result, forward it as an aggregate argument or aggregate return, select a field or element from it, or use it as the source of exact-type aggregate assignment. Assignment is the materialization operation: it copies the complete aggregate into program storage or into the referent of an aggregate parameter. A result cannot be stored as a carrier or survive beyond the containing source operation. Code that needs to retain the value assigns it to a program object or caller-supplied destination.

Immediate consumption does not permit a later call to destroy the transient carrier before it is used. When evaluation of another argument, index, or suffix can call a routine, the compiler must stage or preserve the typed carrier as live implementation state. This staging is not a source alias and ends with the containing operation.

Nucleus has no routine-local aggregate declaration, activation-lifetime aggregate object, aggregate temporary, heap object, or variable-sized local object. Every aggregate result selects storage that already existed before the call.

### 7.10 End of activation bindings

When an activation ends:

- its scalar parameters and scalar locals cease to exist;
- its aggregate-parameter bindings cease to exist;
- storage reached through those aliases is unaffected if that storage has a longer lifetime; and
- a valid returned scalar value or aggregate alias has already been transferred to the caller.

Every aggregate object and subobject remains alive until program termination. Nucleus 0.1 therefore has no source form that can create a dangling aggregate alias. The compiler checks exact referent types, admitted alias-binding sources, and the immediate-consumption rule for transient results; it does not track a separate aggregate-lifetime fact.

Nucleus 0.1 has no manual deallocation, destructors, `finally`, `defer`, variable-sized locals, or other scope-exit action. Returning from a routine performs no hidden source-level cleanup. A backend may restore saved implementation state, but that restoration does not run source operations or change the lifetime rules above.

### 7.11 Examples

The following declarations use program-lifetime record-array storage:

```nucleus
record Entry
    value as u16
end

var entries as Entry[8]

sub entryAt(index as u8) as Entry
    return entries[index]
end
```

`entryAt` returns an alias to one `Entry` subobject of `entries`. The bounds check occurs before the result is formed. The target has program lifetime and remains alive after the call.

An incoming aggregate alias also supplies a valid aggregate result:

```nucleus
sub choose(items as Entry[8], index as u8) as Entry
    return items[index]
end
```

The caller-provided array has program lifetime, so the returned element remains available after the `choose` activation ends.

This statement mutates a scalar leaf through the aggregate alias `item` without copying or rebinding the record:

```nucleus
item.value = 7
```

The assignment changes the caller's selected `Entry`. It does not create another `Entry`.

If `first` and `second` are aggregate parameters of type `Entry` and `otherEntries` is another `Entry[8]` object, these assignments copy complete aggregates:

```nucleus
first = second          // copy one Entry into first's referent
entries = otherEntries  // copy all eight Entry values
```

A routine may copy a selected value into caller-supplied storage without declaring an aggregate local:

```nucleus
sub copyEntry(items as Entry[8], index as u8, destination as Entry)
    destination = items[index]
end
```

`destination` remains bound to the caller's object. The assignment copies one complete `Entry` from the selected array element into that object.

A routine may also forward a selected alias without copying:

```nucleus
sub forwardedEntry(items as Entry[8], index as u8) as Entry
    return choose(items, index)
end
```

The forwarded alias still denotes an element of the caller-provided array. No aggregate object or local alias is created by either call.

### 7.12 Implementation independence and capacities

Language lifetime is independent of a value's physical location. Reusing a register or physical address at different times, overlaying non-overlapping locals, bank placement, and hardware-stack reuse do not merge source objects or activations. Conversely, two source paths to the same object retain shared identity even if a backend represents them differently.

An implementation may bound scalar locals, aggregate-parameter bindings, or the metadata used for their exact types and result categories. It must publish each limit. A compile-time excess requires a capacity diagnostic under Chapter 1. An implementation must not share live activation state or lose an alias binding when a limit is reached.

Runtime activation capacity is implementation-defined under Chapter 13. An implementation may bound simultaneous activation depth, activation-storage consumption, or both. Reaching either published limit at runtime performs the activation-capacity trap defined by Chapter 15. The limits and trap do not change the source lifetime of an activation that begins successfully.

Nucleus 0.1 exposes no raw pointer value, address arithmetic, heap allocation, manual deallocation, open slice or view, variable-sized local, or storage-layout query through this chapter. Field byte offsets, array byte offsets, bounded-string encoding, address carriers, aggregate-copy lowering, and call-state layouts belong to the Z80 runtime and backend contract.

## 8. Constants and declarations

### 8.1 Scope

This chapter defines the Nucleus 0.1 declaration families, their canonical source forms, constant expressions, initializers, and declaration-time binding. Chapter 4 defines the compilation-unit sequence and top-level placement. Chapter 5 defines declaration points, scopes, name identity, and collisions. Chapters 6 and 7 define types, storage ownership, aggregate aliases, and lifetime. Chapter 13 defines routine calls, results, and complete routine semantics.

Nucleus uses explicit declarations. Variables, fields, parameters, locals, routine results, and aggregate constants have explicit types; scalar named constants infer their type from the required initializer. Nucleus has no implicit variables, grouped declarations, destructuring declarations, or general type-alias declaration.

### 8.2 Declaration families and placement

The declaration families are:

| Declaration            | Permitted location                          | Binding or storage established                                             |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| Named constant         | Top level                                   | One inferred scalar value or one explicitly typed read-only aggregate root |
| Compile-time assertion | Top level                                   | No binding or storage; one required compile-time condition                 |
| Program variable       | Top level                                   | One mutable program-lifetime scalar or aggregate object                    |
| Record type            | Top level                                   | One nominal fixed-layout record type and its field scope                   |
| Forward routine        | Top level                                   | One routine signature without a body                                       |
| Routine definition     | Top level                                   | One routine signature and body, or completion of an earlier forward        |
| Formal parameter       | Routine header                              | One scalar activation value or aggregate-alias binding                     |
| Scalar local           | Contiguous routine declaration prefix       | One per-invocation scalar value                                            |
| Record field           | Between a record header and its closing end | One named scalar or aggregate subobject in each object of the record type  |

Only top-level declarations occur in the compilation-unit sequence. Parameters occur only in a routine header. Local declarations form one contiguous prefix after the header and before the first statement. A conditional or loop body cannot contain a declaration, and a declaration after the first statement of a routine is invalid.

Nucleus 0.1 has no routine-local constant declaration or assertion.

### 8.3 Canonical syntax

The following skeleton defines declaration syntax without defining statement grammar or the internal syntax of ordinary expressions:

```text
top-level-declaration ::= const-declaration
                        | assert-declaration
                        | program-var-declaration
                        | record-declaration
                        | forward-routine-declaration
                        | routine-definition

const-declaration     ::= "const" NAME "="
                          scalar-constant-expression NEWLINE
                        | "const" NAME "as" type "="
                          static-initializer NEWLINE

assert-declaration    ::= "assert" scalar-constant-expression NEWLINE

program-var-declaration
                      ::= "var" NAME "as" type
                          [ "=" program-initializer ] NEWLINE

record-declaration    ::= "record" NAME NEWLINE
                          field-declaration
                          { field-declaration }
                          "end" NEWLINE
field-declaration     ::= NAME "as" type NEWLINE

forward-routine-declaration
                      ::= "forward" routine-header NEWLINE
routine-definition    ::= "sub" NAME routine-definition-tail
routine-definition-tail
                      ::= routine-signature-tail NEWLINE routine-body
                        | NEWLINE routine-body
routine-body          ::= { local-declaration }
                          routine-statement-sequence
                          "end" NEWLINE
routine-header        ::= "sub" NAME routine-signature-tail
routine-signature-tail
                      ::= "(" [ formal-parameter
                          { "," formal-parameter } ] ")"
                          [ "as" type ] [ "fails" ]
formal-parameter      ::= NAME "as" type

local-declaration     ::= "var" NAME "as" scalar-type
                          [ "=" local-initializer ] NEWLINE
local-initializer     ::= expression [ "else" "fail" ]

program-initializer   ::= static-initializer
static-initializer    ::= scalar-constant-expression
                        | STRING
                        | record-initializer
                        | array-initializer
record-initializer    ::= "(" static-initializer
                          { "," static-initializer } ")"
array-initializer     ::= "[" static-initializer
                          { "," static-initializer } "]"
```

`type` and `scalar-type` are defined by Chapter 6. The parser selects a program initializer from the declared type. A parenthesized scalar expression and a record initializer share `(` as their first token; the already checked program-variable or component type selects the form without backtracking. `routine-statement-sequence` and `expression` are placeholders for later chapters, not additional declaration syntax.

Each constant, variable, record header, field, and local declaration introduces one name. A routine header introduces one routine name and its individually written parameters. Each field and parameter repeats the canonical `name as Type` form. No comma-separated field or variable group is permitted.

Parentheses and square brackets suppress logical newlines under Chapter 3. A structured initializer may therefore span physical lines without adding newline productions to this grammar.

### 8.4 Named constants

A scalar named constant declaration has this form:

```nucleus
const bufferLength = 64
const readyMask = 128
const enabled = true
```

The initializer determines the constant's type. A Boolean-valued initializer gives the constant type `boolean`. An integer-valued initializer gives it an exact integer type: the value has no fixed `u8` or `u16` type until each use supplies an expected integer type or an expression rule selects one.

An exact named integer constant behaves like an exact integer literal at every use. The same constant may adopt `u8` in one context and `u16` in another when its value fits both. A declaration such as `const Big = 300` is valid; a later use of `Big` where `u8` is required is invalid at that use, while a use where `u16` is required is valid. The compiler reports the position of the incompatible use rather than the constant declaration.

A scalar named constant denotes its compile-time scalar value. It does not declare storage and need not occupy runtime storage. The compiler may materialize the value in generated code or immutable implementation data, but no source operation exposes object identity for it.

The initializer is required and must be a scalar constant expression. Its completed value must be either integer-valued or Boolean-valued. A named constant becomes visible only after the compiler has checked the complete declaration, so its initializer cannot name itself. Chapter 5's declaration-order rule also excludes later names and constant cycles.

Named integer constants replace enumeration members where a program needs symbolic numeric values. A constant declaration does not create an enumeration, subrange, distinct integer type, or overload.

### 8.5 Aggregate constants

An aggregate constant declares one explicitly typed, statically initialized record, fixed array, or bounded string:

```nucleus
const Origin as Point = (0, 0)
const Masks as u8[4] = [$01, $02, $04, $08]
const Prompt as string[8] = "READY"
```

The initializer is required and follows the same complete, type-directed static-initializer rules as a program variable. Every scalar leaf is a compatible scalar constant expression. The declaration cannot use a runtime expression, read storage, call a routine, omit a component, or name the constant being declared. A scalar type after `as` is invalid: scalar constants retain the inferred form from Section 8.4.

The named root is read-only. Source assignment cannot be rooted directly at the aggregate constant name, including assignment to the complete object, one record field, one array element, or one bounded-string byte. The constant remains an ordinary aggregate source: field and index selection, `.length`, exact-type copying, aggregate argument passing, and aggregate return are admitted.

Read-only status is deliberately not part of the aggregate alias type. Passing a constant to an aggregate parameter or returning it as an aggregate result removes the direct-root distinction, so mutation through that alias is permitted by the language and is not dynamically checked. A target that places the bytes in writable memory may observe the change; a target that places them in ROM may ignore or reject the physical write. Portable programs treat aggregate constants as immutable and do not depend on mutation through an alias. This bounded rule avoids a transitive const or permission type system.

### 8.6 Scalar constant expressions

A scalar constant expression contains only:

- an integer, character, or Boolean literal;
- an earlier named constant;
- parentheses; and
- a pure scalar operator or explicit scalar conversion that Chapter 9 admits in constant expressions.

It cannot read a variable, field, array element, or bounded string; call a routine; or perform an observable operation. Nucleus 0.1 constant expressions have no layout, address, offset, or runtime-length query. Fixed array lengths and string capacities use literals or earlier scalar constants instead.

The compiler evaluates a constant expression at compile time with the operand types, result type, overflow rule, and fault rule that Chapter 9 assigns to each admitted operator. It must not substitute host-language overflow, silently widen a typed operation, or fold an expression differently from the corresponding runtime operation. If Chapter 9 assigns no constant-expression rule to an operator, that operator is unavailable in this context.

An exact integer literal or earlier exact named integer constant remains exact until an operator rule or conversion supplies its type. The completed integer value of a named constant returns to the exact category for later uses. The implicit `u8`-to-`u16` conversion from Chapter 6 is permitted. A checked `u16`-to-`u8` conversion is valid at compile time only when its value lies from 0 through 255; otherwise the declaration is invalid. A constant operation that Chapter 9 defines to trap at runtime makes the constant expression invalid when the compiler proves that condition during evaluation.

An array length is a scalar constant expression whose value must lie from 1 through 65,535. A `string[N]` capacity is a scalar constant expression whose value must lie from 1 through 253. The compiler evaluates the bound before constructing the type identity. A later constant, a variable, or a cyclic dependency cannot supply a bound.

The bounded-string capacity is a property of that source type only. It does
not impose a 253- or 255-byte ceiling on a fixed array, record, array of
records, array of bounded strings, or record containing any of those types.
Their complete extents follow recursively from their declared members. An
implementation may still diagnose an otherwise valid declaration when the
complete object cannot fit its published program-data capacity.

### 8.7 Compile-time assertions

A compile-time assertion has this top-level form:

```nucleus
assert Rows * Columns <= 256
```

Its operand must be a Boolean scalar constant expression under Section 8.6. It may therefore use literals, earlier named constants, parentheses, pure scalar operators, and admitted conversions, but it cannot read storage or call a routine. An exact integer expression alone is not a condition: `assert Rows` is invalid, while `assert Rows <= 8` is Boolean-valued.

The compiler evaluates the expression while checking the declaration. A true result accepts the declaration. A false result makes the source invalid and produces an assertion diagnostic at the `assert` keyword. The declaration introduces no name or storage and emits no runtime operation or target code.

Assertions follow ordinary declaration order. They can state relationships among earlier constants, including relationships used to justify fixed capacities, but cannot refer to a later declaration.

### 8.8 Record declarations

A record declaration introduces one nominal type:

```nucleus
record Point
    x as u16
    y as u16
end
```

The declaration contains at least one field. Each field declares one name and one previously declared type. A field declaration has no `var` or `const` keyword, initializer, default value, placement clause, or mutability qualifier. Every object of the record type contains the same fields in declaration order.

The record type becomes visible only after the complete declaration has been checked. It is therefore unavailable in its own field list. This rule, the declaration-before-use rule, and Chapter 6's finite-size requirement reject direct and indirect recursive containment without a second declaration pass.

Record field names use the record's field scope under Chapter 5. An exact duplicate within that field scope is invalid; differently cased field names are distinct. Record layout offsets and backend encoding are outside this chapter.

### 8.9 Program variables

A top-level `var` declaration owns one mutable program-lifetime object. The declared type may be scalar, record, fixed array, or bounded string.

Every program variable has an initial value. With no initializer, the compiler establishes the type's zero value from Section 7.4 before the entry routine begins. The default is therefore integer zero, `false`, an empty bounded string with length zero, or the recursive zero value of a record or fixed array.

An explicit program initializer is permitted only in these forms:

| Declared type             | Permitted initializer                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `u8`, `u16`, or `boolean` | One compatible scalar constant expression                                          |
| `string[N]`               | One fitting string literal                                                         |
| Record                    | One positional record initializer with exactly one initializer per field           |
| Fixed array               | One array initializer with exactly one compatible initializer per declared element |

Program initialization does not evaluate an ordinary runtime expression or read another variable. A string literal establishes both the decoded bytes and their logical length; embedded zero bytes count toward that length. A literal shorter than its capacity is valid, while one that exceeds the capacity is invalid and is never truncated.

A record initializer uses parentheses and supplies fields in declaration order. An array initializer uses square brackets and supplies elements in increasing index order. A nested record, fixed array, or bounded string uses its own initializer at the corresponding position, so the initializer delimiters mirror the finite aggregate type tree. Every scalar leaf is a compatible scalar constant expression. Every record and array level is complete: too few or too many components are invalid, and the compiler neither pads an explicit initializer nor discards components.

Nucleus has no named-field, partial, spread, or runtime aggregate initializer. A static initializer cannot name another aggregate object or call a routine. It is a declaration-only description of one static object image, not a general aggregate expression.

The program variable becomes visible only after the compiler has checked its type and initializer. Its initializer may therefore use earlier scalar constants but cannot use the variable itself or a later declaration.

### 8.10 Routine declarations and parameters

One routine header declares a routine name, an ordered list of zero or more formal parameters, and either no result type or one result type. Every parameter has an explicit `name as Type` declaration. Parameters have no initializer or default argument, and a header has no grouped names or multiple result list.

A scalar parameter denotes a per-invocation copied value. An aggregate parameter establishes a fixed typed alias to caller-provided program-lifetime storage. Scalar-leaf mutation and exact-type aggregate assignment through that alias are permitted; neither changes the binding. Chapter 13 defines calls, result rules, and the value supplied for each parameter; this chapter defines only the bindings written in the header.

A forward routine declaration contains the complete and sole header and no body. The compiler retains its exact routine and parameter names, ordered parameter types, optional result type, and `fails` effect. The later abbreviated `sub NAME` header opens the body under Chapters 4 and 5; the forward's parameter names create that body's parameter bindings. The definition completes the existing routine binding and does not declare another routine or repeat its signature.

A routine definition without an earlier forward makes its checked signature visible before the local-declaration prefix and body. No nested routine declaration is permitted.

### 8.11 Local declarations

After parameter binding, scalar local declarations take effect in source order before the first statement. All local declarations remain in one contiguous prefix.

A scalar local owns one per-invocation scalar value. Its initializer is an ordinary expression or a direct failable call followed by `else fail` under Chapter 14, evaluated once when execution reaches the declaration. The successful result must be compatible with the declared scalar type. If the initializer is omitted, the compiler establishes zero for `u8` or `u16` and `false` for `boolean` at that point.

The declared local type must be `u8`, `u16`, or `boolean`. A record, fixed array, or bounded string is invalid in a local declaration whether or not an initializer is written. Routines receive aggregates only through formal parameters, reach aggregate subobjects through field and index paths, and may return transient aggregate aliases under Chapters 7 and 13.

A local becomes visible only after its complete declaration and initializer have been checked. Its initializer may name parameters, visible program declarations, and earlier locals. It cannot name itself or a later local. A local declaration inside a statement block or after the first statement is invalid.

### 8.12 Initialization order

Scalar constant expressions are evaluated during compilation and perform no source-level runtime operation. The compiler also constructs every aggregate constant's complete static value before source execution begins.

The compiler establishes every program variable's zero or explicit initial value exactly once before the entry routine begins. Aggregate constants and variables follow source declaration order. Static initializers have no source-level effects and cannot read storage, so this order is not otherwise observable. Every program-lifetime object has reached its initial value before source execution can read it. Chapter 7 defines lifetime, and Chapter 19 defines startup semantics and implementation requirements.

On each routine invocation, parameter binding precedes activation-local initialization. Scalar local declarations then take effect in source order, and each receives its zero or evaluated value at its declaration. After the last local declaration, execution continues with the first statement.

### 8.13 Invalid declarations and capacity failures

The compiler must diagnose:

- a declaration in a location not permitted by Section 8.2;
- a missing type;
- a type, bound, initializer, or name that is not visible at its declaration point;
- an exact duplicate name or forbidden shadowing under Chapter 5;
- a nonconstant operand or invalid folded operation in a constant expression;
- a scalar initializer incompatible with its declared type;
- an invalid array length, string capacity, string length, record field count, array element count, or nested initializer shape;
- a record field with an unavailable type or a record with no fields;
- a scalar type written on an aggregate-constant form, a nonconstant aggregate initializer, or an initializer form incompatible with its declared component type;
- assignment rooted directly at an aggregate constant name;
- a record, fixed array, or bounded string used as a local variable type;
- an aggregate argument or result with a nonidentical referent type;
- an attempt to copy between nonidentical aggregate types; and
- an abbreviated body without one matching incomplete forward, a second completion, or an uncompleted forward.

An implementation may bound top-level declarations, record fields, parameters, scalar locals, constant-expression nesting, structured-initializer depth and elements, decoded string bytes, type descriptors, retained signatures, and initialization records. It must publish each limit and issue a capacity diagnostic before truncation, wraparound, omitted initialization, dropped fields, or an incorrect binding can occur. A capacity failure does not change an otherwise conforming declaration into invalid source.

### 8.14 Examples

These top-level declarations are valid under this chapter:

```nucleus
const cellCount = 8
record Cell
    value as u16
    active as boolean
end

const defaultCell as Cell = (0, false)
const bitMasks as u8[4] = [1, 2, 4, 8]
const banner as string[8] = "READY"
var cells as Cell[cellCount]
var origin as Cell = (0, false)
var templates as Cell[2] = [(1, true), (2, false)]
var flags as u8[4] = [1, 2, 4, 8]
var prompt as string[8] = "READY"
var title as string[12] = "NUCLEUS"
var attempts as u8
```

`defaultCell`, `bitMasks`, and `banner` are aggregate constants whose direct named roots cannot be assignment targets. `cells` and `attempts` begin with their zero values, including every field of every `Cell`. `origin`, `templates`, `flags`, `prompt`, and `title` are mutable program-lifetime objects with the written initial contents. `title` begins with seven decoded bytes.

A routine manipulates selected aggregate storage directly through a parameter path:

```nucleus
sub update(items as Cell[cellCount], index as u8)
    var count as u16 = 0

    items[index].value = count
    return
end
```

The checked assignment updates the selected element of the caller's array. The routine creates no `Cell` object or local aggregate binding.

A program object or array element may supply an aggregate parameter:

```nucleus
record State
    code as u8
end

var primary as State
var states as State[4]

sub inspect(item as State)
    return
end

sub main()
    inspect(primary)
    inspect(states[2])
end
```

Each call binds `item` to existing program storage. Neither call copies a `State`.

A forward declaration supplies the sole signature, and its abbreviated definition supplies the body:

```nucleus
forward sub inspectState(item as State)

sub inspectState
    return
end
```

The following declarations illustrate valid and invalid boundary cases. They are not one compilation unit:

```nucleus
const Limit = 8
var limit as u16                    // valid: names are case-sensitive
var Limit as u16                    // invalid: exact duplicate

const flags as u8[4] = [1, 2, 4, 8]    // valid aggregate constant
const prompt as string[8] = "READY"    // valid aggregate constant
const missingType = [1, 2]              // invalid: aggregate type is required
const typedScalar as u8 = 1              // invalid: scalar constants infer type

const first = second         // later name is unavailable
const second = first         // the first error prevents a cycle

const noElements = 0
var empty as u8[noElements]         // fixed arrays must be nonempty
var lateBound as u8[laterLength]    // later constant is unavailable
const laterLength = 4

var shortText as string[4] = "READY" // decoded literal is too long
var copiedCell as Cell = cells[0]   // static initializers cannot read aggregate storage
defaultCell.value = 1               // invalid: direct constant-rooted write

sub invalidLocal()
    var aggregateLocal as Cell      // invalid: locals must be scalar
    return
end
```

Inside a routine, both `var current as Cell = cells[0]` and `var aggregateLocal as Cell` are invalid because every local must have scalar type. At top level, `var copiedCell as Cell = cells[0]` would read aggregate storage during static initialization and is independently invalid. Aggregate parameters and program variables remain valid aggregate-assignment destinations of the exact same type.

## 9. Expressions

### 9.1 Scope

This chapter defines expression syntax, precedence, associativity, operand and result types, scalar conversions, designator formation, and evaluation order. Chapter 6 defines the type set and compatibility rules. Chapter 7 defines storage identity and aggregate aliases. Chapter 10 defines assignment and the statement contexts that contain expressions. Chapter 13 defines routine signatures, argument passing, and result transfer.

Nucleus uses one predictive expression grammar for ordinary, initializer, argument, index, condition, and return contexts. A context may restrict the resulting category or supply an expected type, but it does not select another precedence ladder. The grammar requires no backtracking or retained syntax tree.

### 9.2 Expression grammar

The reusable expression fragment is:

```text
expression             ::= or-expression
or-expression          ::= and-expression { ( "or" | "xor" ) and-expression }
and-expression         ::= not-expression { "and" not-expression }
not-expression         ::= "not" not-expression | comparison
comparison             ::= additive [ comparison-operator additive ]
comparison-operator    ::= "=" | "<>" | "<" | "<=" | ">" | ">="
additive               ::= multiplicative
                           { ( "+" | "-" ) multiplicative }
multiplicative         ::= unary { ( "*" | "/" | "mod" ) unary }
unary                  ::= ( "+" | "-" ) unary | postfix-expression
postfix-expression     ::= primary { postfix-suffix }
primary                ::= NUMBER | CHARACTER | "true" | "false"
                         | NAME | conversion | "(" expression ")"
conversion             ::= ( "u8" | "u16" ) "(" expression ")"
postfix-suffix         ::= argument-list | "[" expression "]" | "." NAME
argument-list          ::= "(" [ expression { "," expression } ] ")"
```

Chapter 17 incorporates this fragment into the complete grammar. The semantic restrictions below reject suffix combinations that the compact syntactic loop can recognize but Nucleus does not admit.

A string literal is not a general expression primary. Chapter 8 permits it as a bounded-string initializer. A later system or bounded-string operation may accept a string literal in an explicitly defined operand position without turning it into a copyable aggregate value.

### 9.3 Names, calls, and postfix operations

The compiler resolves each `NAME` before interpreting its postfix suffixes. A visible scalar constant, scalar variable, parameter, or local supplies its declared scalar type. A visible aggregate object or alias supplies its exact aggregate type and storage category. A visible routine name must be followed immediately by an argument list; routine names are not values.

An argument-list suffix in an ordinary expression invokes only an infallible source routine named by the primary. Nucleus has no routine values, indirect calls, callable results, overload resolution, or invocation of an arbitrary parenthesized expression. A second argument-list suffix is invalid. Chapter 13 defines argument and result compatibility, and Chapter 14 gives failable calls their restricted statement, initializer, assignment, and return positions.

An index suffix requires a fixed-array or bounded-string storage path or typed alias. Its expression must have type `u8` or `u16`. For a fixed array, the result has the array's exact element type; the compiler diagnoses a statically out-of-range index and emits a checked access for a dynamic index unless it proves the index is in range. For a bounded string, the result is a `u8` storage path and the implementation checks the index against the current logical length before every access unless it proves that access safe. A failed check occurs before the element or byte is read or written.

A field suffix on a record storage path or typed record alias resolves the field name only in that record's field scope and produces the field's declared type. A `.length` suffix on a bounded-string storage path or alias produces its read-only `u8` logical length. Other field suffixes on bounded strings are invalid. Selection does not expose an offset, header, or address to source code.

Index and field suffixes may follow an aggregate result from a routine call. The result remains a transient typed alias to the object established by Chapter 13; the suffix does not copy that object. A scalar result cannot be indexed or selected, and a result-free call cannot take another suffix.

### 9.4 Expression categories and storage paths

Expression checking records both a type and one of these source categories:

| Category                         | Permitted use                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact integer constant           | Adopts an admitted integer type from context or the rules in Section 9.7.                                                                              |
| Scalar value                     | May be copied, converted, compared, passed, returned, or stored in a compatible scalar destination.                                                    |
| Scalar storage path              | Reads as its scalar value in an expression and may be a writable destination when its root is mutable.                                                 |
| Aggregate storage path           | May be indexed, selected, copied by exact-type assignment, passed as an aggregate argument, or returned under Chapter 7's consumption rules.           |
| Transient aggregate-alias result | Denotes compatible storage for one containing operation and may be selected, indexed, copied by exact-type assignment, passed, returned, or discarded. |
| Result-free invocation           | Is valid as a complete call statement, or in Chapter 14's result-free failable propagating `return`.                                                   |

A **storage path** begins with a visible program variable, aggregate constant, parameter, or local and continues through zero or more field and index suffixes. Each suffix preserves the root object's identity while selecting a subobject. An aggregate-constant-rooted path is readable but not a direct assignment target. A scalar constant and a routine call are not storage-path roots. A call that returns an aggregate alias may be selected or indexed in a value context, but Chapter 10 does not admit it as an assignment root.

A bare aggregate storage path is valid where a rule requires compatible aggregate storage, an alias, or the source or destination of exact-type aggregate assignment. It is not a general expression value. Nucleus has no aggregate comparison, truth test, automatic argument copy, or automatic result copy.

### 9.5 Explicit integer conversions

`u16(expression)` performs the explicit form of the `u8`-to-`u16` conversion. Its operand must have type `u8` or `u16`. A `u8` operand is widened without changing its value; a `u16` operand is unchanged.

`u8(expression)` performs checked narrowing. Its operand must have type `u8` or `u16`. A `u8` operand is unchanged. A known `u16` value outside 0 through 255 makes the source invalid. For a value known only at runtime, the generated program checks the range and performs the Chapter 15 narrowing trap before producing a result when the value is outside that range.

Both forms evaluate their operand once. They do not reinterpret bits, extract a low byte, wrap, or expose a machine representation. `boolean(expression)`, record conversions, array conversions, string-capacity conversions, and conversions between `u16` and an aggregate-alias carrier are absent.

The type words in these two forms are fixed tokens, not routine names. A user declaration cannot override them, and conversion syntax does not participate in routine lookup.

### 9.6 Precedence and associativity

Precedence from highest to lowest is:

1. routine invocation, indexing, field selection, and parenthesized grouping;
2. unary `+` and unary `-`;
3. multiplication, division, and modulo;
4. addition and subtraction;
5. one comparison;
6. `not`;
7. `and`;
8. `or` and `xor`.

Binary arithmetic, `and`, `or`, and `xor` associate from left to right. Unary `+`, unary `-`, and `not` associate from right to left. A comparison contains at most one comparison operator and therefore has no associativity.

`not` binds less tightly than comparison. Thus `not left = right` means `not (left = right)`. An integer complement used as a comparison operand requires parentheses, as in `(not mask) = expected`.

The repeated forms in Section 9.2 preserve left association without a left-recursive predictive grammar. The first handwritten compiler implements the binary levels with one precedence-driven loop and a compact operator table; comparison's single-use rule and Boolean short-circuit emission remain explicit cases in that loop. Separate parsing remains appropriate for primary, postfix, unary, and right-recursive `not`. Another conforming compiler may use a different parser family only if it accepts the same token sequences and produces the same association and evaluation order.

### 9.7 Exact-integer resolution

An exact integer literal or exact named integer constant adopts an expected `u8` or `u16` type when its value fits. The expected type may come from a declaration initializer, scalar destination, parameter, result, conversion operand, or a typed operand in the same arithmetic operation. An expected type never narrows an already typed operand implicitly.

For an integer operation:

- when one operand has integer type and the other is an exact integer constant, the constant adopts that type when it fits;
- when the operands have types `u8` and `u16`, the `u8` operand widens and the operation uses `u16`;
- when both operands are exact integer constants, an expected integer result type applies when both operands fit; otherwise the operation uses `u16`; and
- when a standalone exact integer literal has no expected type, it uses `u16`.

An exact value that does not fit the selected type makes the source invalid. The compiler does not truncate the literal or select a wider intermediate type after the context has fixed a narrower operation.

A character literal has type `u8`. It follows the ordinary implicit widening rule when combined with or supplied to `u16`. `true` and `false` have type `boolean` and never adopt an integer type.

### 9.8 Integer arithmetic

`+`, `-`, `*`, `/`, and `mod` accept integer operands. After literal resolution and implicit widening, both operands have the same type and the result has that type.

Addition, subtraction, multiplication, and unary minus use arithmetic modulo 256 for `u8` and modulo 65,536 for `u16`. Unary minus is subtraction from zero in the selected width. Unary plus preserves the operand and its type. These rules define wraparound; overflow is neither undefined nor a narrowing conversion.

Division produces the unsigned integer quotient with any remainder discarded. Modulo produces the unsigned remainder from the same division. A zero divisor for either operation performs the `division-by-zero` trap specified by Chapter 15 at the divisor. When the divisor is a compile-time constant zero, the source is invalid and the compiler issues the same diagnostic at that divisor instead of emitting a guaranteed trap.

The result width is determined before evaluation. Arithmetic does not widen merely because a mathematical result would exceed that width. A program that requires a wider result widens an operand explicitly or supplies a `u16` operand before the operation.

### 9.9 Comparison

The six comparison operators accept compatible integer operands and produce `boolean`. Literal resolution and `u8`-to-`u16` widening follow Section 9.7. Integer comparison uses unsigned ordering.

Boolean operands support only `=` and `<>`. Both operands must have type `boolean`. Boolean ordering is invalid.

Records, fixed arrays, bounded strings, aggregate aliases, and alias carriers have no comparison operation in Nucleus 0.1. Equal layout, equal capacity, or identity of the referred object does not add an equality operator. A bounded-string content operation, if admitted at the system boundary, defines its own result and does not change this rule.

Comparison chaining is invalid. `minimum <= value <= maximum` is not two comparisons; after the first comparison, the left side would be Boolean and the grammar permits no second comparison operator. The equivalent valid form is `minimum <= value and value <= maximum`.

### 9.10 `not`, `and`, `or`, and `xor`

`not` accepts one `boolean`, `u8`, or `u16` operand. For `boolean`, it exchanges `true` and `false`. For an integer, it complements every bit in the operand's declared width and produces the same integer type.

`and` and `or` accept either two Boolean operands or two compatible integer operands. Mixed Boolean and integer operands are invalid. Integer operands use literal resolution and widening from Section 9.7, combine corresponding bits, evaluate both operands, and produce the resolved integer type.

`xor` accepts only two compatible integer operands. It uses the same literal resolution and widening rules, evaluates both operands from left to right, combines corresponding bits by exclusive OR, and produces the resolved integer type. A Boolean operand is invalid. This deliberate restriction avoids placing an eager Boolean operator at the same precedence as short-circuiting Boolean `or`.

Boolean `and` and `or` short-circuit. The left operand is evaluated first:

| Operator | Left value | Right operand | Result                            |
| -------- | ---------- | ------------- | --------------------------------- |
| `and`    | `false`    | not evaluated | `false`                           |
| `and`    | `true`     | evaluated     | the right operand's Boolean value |
| `or`     | `true`     | not evaluated | `true`                            |
| `or`     | `false`    | evaluated     | the right operand's Boolean value |

An operand that is not evaluated performs no call, storage access, bounds check, conversion check, arithmetic trap, or other source operation. The Boolean and integer meanings are selected by static types and create no parsing ambiguity.

Shifts, rotations, power, and symbolic Boolean operators are absent. A later proposal for one of these operators requires its own measured admission and a Chapter 3 token amendment when it uses a word.

### 9.11 Evaluation order

Nucleus fixes evaluation order:

- a unary operand is evaluated before its operator;
- binary operands are evaluated from left to right, subject to Boolean short-circuiting;
- a postfix base is evaluated before its suffixes, and suffixes are applied from left to right;
- each index expression is evaluated and checked when its suffix is reached;
- routine arguments are evaluated from left to right under Chapter 13; and
- an explicit conversion evaluates its operand before checking or producing the result.

If an earlier operation traps, later operands and suffixes are not evaluated. Field selection performs no source-level read by itself, but evaluation of its base and any preceding index or call remains observable.

A backend may reorder operations only when it proves that no result, call, mutation, storage access, check, trap, or other observable behaviour can distinguish the order. The permitted implementation arrangement does not change source semantics.

### 9.12 Constant expressions

The scalar operators and conversions in this chapter are available to the scalar constant expressions defined by Chapter 8. The compiler applies the same literal resolution, width, wraparound, comparison, and short-circuit rules used at runtime.

A constant division by zero is invalid. A checked `u8` conversion of a known value outside 0 through 255 is invalid. A short-circuited constant operand is not evaluated and therefore cannot contribute a fault.

Routine calls and storage paths remain unavailable in constant expressions. The presence of a pure-looking routine or a program variable with a constant initializer does not extend the constant-expression grammar.

### 9.13 Invalid expressions and capacity limits

The compiler must diagnose:

- a name of the wrong declaration class for its expression position;
- a routine name without its argument list or an argument-list suffix on a non-routine;
- an invalid field, index, suffix sequence, or aggregate use;
- an operand-type mismatch or a literal that does not fit its resolved type;
- a chained comparison;
- an implicit narrowing or unavailable conversion;
- a result-free call used as a value;
- an aggregate used where a scalar value is required; and
- a statically provable bounds, narrowing, or division failure.

An implementation may bound expression nesting, prefix depth, postfix depth, arguments, and retained expression-checking state. It must publish each limit and issue a capacity diagnostic before a stack, counter, temporary pool, or type record overflows. Capacity exhaustion must not change precedence, omit a check, truncate an argument list, or alter an expression's type.

### 9.14 Examples

For `u16` values `a`, `b`, and `c`, these expressions associate as shown:

```nucleus
a - b - c       // (a - b) - c
a / b * c       // (a / b) * c
- -a            // -( -a ) in u16 arithmetic
not not flag    // not (not flag)
```

Postfix operations share one left-to-right path:

```nucleus
cells[index].value
entryAt(index).value
measure(cells[index].value)
```

`entryAt` must return an aggregate alias with the selected record type, and `measure` must have a compatible visible signature. The index is checked before field selection or argument transfer.

These forms illustrate comparison and conversion rules:

```nucleus
minimum <= value and value <= maximum
u16(byteValue) + wordValue
u8(wordValue)
(not (mask and readyMask)) = 0
```

The first expression contains two non-chained comparisons. The third performs checked narrowing. In the last expression, parentheses make the integer complement the left comparison operand; without them, `not` would apply to the Boolean comparison result.

Each of these forms is invalid:

```nucleus
first < second < third  // comparisons do not chain
flag + 1               // Boolean is not integer
recordValue = other    // aggregate equality is absent
routineName            // a routine name is not a value
boolean(value)          // Boolean conversion is absent
```

## 10. Statements

### 10.1 Scope

This chapter defines statement syntax, statement sequencing, name-led dispatch, assignment, routine-call statements, and execution order. Chapters 11 and 12 define the compound conditional and loop statements. Chapter 13 completes the rules for calls and `return`. Chapter 12 completes the rules for `exit` and `continue`.

Executable statements occur only in a routine body. Chapter 8 requires every local declaration to precede the first statement, so a statement sequence contains no declarations and opens no name scope.

### 10.2 Statement grammar

The reusable statement fragment is:

```text
statement-sequence      ::= { statement }
statement               ::= name-statement name-statement-tail
                          | other-simple-statement NEWLINE
                          | if-statement
                          | while-statement
                          | for-statement
name-statement          ::= assignment-statement
                          | routine-call-statement
name-statement-tail     ::= NEWLINE
                          | "else" "fail" NEWLINE
                          | "handle" NAME NEWLINE
                            statement-sequence "end" NEWLINE
other-simple-statement  ::= return-statement
                          | "exit"
                          | "continue"
                          | fail-statement
assignment-statement    ::= assignment-target "=" expression
assignment-target       ::= NAME { postfix-suffix }
routine-call-statement  ::= NAME argument-list
return-statement        ::= "return" [ expression ]
```

Chapters 11 through 14 define the referenced productions and semantic restrictions. Chapter 17 replaces this fragment with the complete grammar for failable invocations, propagation, and immediate `handle` attachment.

A simple statement consumes one logical `NEWLINE`. An immediate handler consumes the newline after its call site and the newline after its closing `end`. Other compound statements consume the `NEWLINE` after their own closing `end`. Blank and comment-only physical lines produce no token under Chapter 3 and therefore do not create empty statements. A statement sequence may contain no statements; this permits an empty conditional clause, loop body, or handler body without a placeholder operation.

Nucleus has no semicolon, colon separator, multiple statements on one logical line, one-line compound statement, or empty-statement token.

### 10.3 Name-led dispatch

When a statement begins with `NAME`, the compiler resolves that name before selecting the statement form:

| Resolved declaration                                                         | Required continuation                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Source routine                                                               | Its argument list, forming a routine-call statement.                                           |
| Mutable scalar variable, parameter, or local                                 | Zero or more field or index suffixes, followed by `=`.                                         |
| Aggregate object or alias                                                    | Zero or more field or index suffixes ending at a mutable scalar or aggregate, followed by `=`. |
| Scalar constant, aggregate constant root, type, or another declaration class | No assignment or call statement form; the compiler diagnoses the class mismatch.               |

This dispatch uses the declaration class already established by Chapters 5 and 8. It requires no token backtracking. A routine name followed by `=` is invalid, and a variable followed by an argument list is invalid; the compiler does not reinterpret either name as another declaration class.

Nucleus has no `call` keyword. An already declared routine name followed by its parenthesized argument list is the canonical invocation statement.

### 10.4 Assignment

An assignment target is a mutable scalar path rooted in a program variable, parameter, or scalar local, or an aggregate path rooted in a program variable or aggregate parameter. A path rooted directly at an aggregate constant name is never an assignment target, including after field or index selection. The parser uses the Chapter 9 postfix-suffix path; the storage-path rule rejects every call suffix and any field or index suffix unsuitable for the preceding type. A bounded-string byte selected through a writable root is writable; `text.length` is not.

A scalar local used as the counter of an enclosing counted loop is read-only until that loop ends. An assignment rooted at that exact local is invalid in the loop body, including inside a nested statement. Chapter 12 defines the corresponding counter rule and nested-loop restriction.

The compiler evaluates an assignment in this order:

1. evaluate the target path from left to right, including every index expression and bounds check;
2. evaluate the right-hand expression;
3. apply the destination compatibility and checked-conversion rules; and
4. store the scalar result or copy the aggregate into the selected destination.

The target path is evaluated once. A call or mutation in an index expression therefore occurs before any operation in the right-hand expression. If target evaluation traps, the right-hand expression is not evaluated. If the right-hand expression or a checked conversion traps, the destination is not changed, although effects from the earlier target evaluation remain.

A scalar destination uses the scalar compatibility rules from Chapter 6. An aggregate destination requires a writable aggregate storage path. Its source must be an aggregate storage path or transient aggregate result with the exact same aggregate type. The compiler validates the complete source and destination extents before copying the fixed object representation. Assignment through an alias changes its referent and never rebinds the alias. Self-assignment has no effect.

In this statement position, `=` is the assignment operator. Inside an expression, it is equality under Chapter 9. Assignment is not an expression and produces no value. Chained assignment, compound assignment such as `+=`, increment and decrement statements, and assignment inside a condition or argument are absent.

Assignment to a record, fixed array, bounded string, or aggregate alias copies a complete value only when the source has the exact same type. A string-byte assignment still replaces one selected byte without changing the string's length or capacity. No assignment changes an alias binding.

### 10.5 Routine-call statements

A routine-call statement invokes one visible source routine with the argument list defined by Chapters 9 and 13. A result-free routine is valid in this form. A scalar value or transient aggregate-alias result may also be discarded; discarding the result does not suppress argument evaluation, routine effects, checks, or traps.

Only the invocation itself forms the statement. A scalar arithmetic expression, comparison, storage read, conversion, field selection, or index operation cannot stand as a statement. An aggregate result cannot be selected and then discarded as an expression statement. These restrictions keep name-led dispatch distinct from general expression parsing.

### 10.6 `return`, `fail`, `exit`, and `continue`

`return` leaves the current routine successfully under Chapter 13. Its permitted expression form depends on the routine's declared result. `fail` leaves a failable routine unsuccessfully under Chapter 14. Neither form is loop control.

`exit` and `continue` apply only to the innermost enclosing loop under Chapter 12. They do not leave a routine or terminate the program. Either word outside a loop is invalid.

All four are complete simple statements. No label, condition, target name, or trailing expression may follow `exit` or `continue`.

### 10.7 Execution and bounded failure

Statements in a sequence begin in source order. A compound statement completes before the following statement begins. A `return`, `fail`, taken `exit`, taken `continue`, or trap prevents normal execution of the remaining statements on that path.

A compiler may emit semantic operations as it checks each statement. It need not retain a statement tree. Forward branches may use bounded fixup state under Chapter 2, provided capacity exhaustion produces a diagnostic rather than an unresolved or incorrect branch.

The compiler must diagnose an invalid statement start, a wrong-class name, a missing assignment operator or argument list, a non-writable assignment target, an assignment to an active counted-loop counter, an incompatible right-hand expression, a forbidden general expression statement, and any context-invalid `return`, `fail`, `exit`, or `continue`.

An implementation may bound statement nesting, active control contexts, branch fixups, and retained emission state. It must publish each limit and issue a capacity diagnostic before overflow changes statement association, branch targets, or execution order.

### 10.8 Examples

These are valid simple statements when the names have compatible declarations:

```nucleus
count = count + 1
cells[index].value = nextValue()
cells[index] = template
updateDisplay()
measure(count)
return
exit
continue
```

`measure(count)` remains a routine-call statement even when `measure` has a result; the result is discarded. `exit` and `continue` require an enclosing loop, and bare `return` requires a result-free routine.

These forms are invalid:

```nucleus
count + 1                 // general expression statement
call updateDisplay()      // no call keyword
left = right = 0          // assignment is not an expression
cells = shorterCells      // invalid when the fixed-array types differ
cells[index]              // storage read is not a statement
```

## 11. Conditional control

### 11.1 Scope

This chapter defines the Nucleus `if` statement, its repeated `elseif` clauses, its optional `else` clause, condition evaluation, and clause selection. Chapter 9 defines Boolean expressions. Chapter 10 defines statement sequences. Chapter 17 supplies the complete grammar.

Nucleus uses one multiline conditional form. It has no conditional expression, pattern matching, or general multi-way selection statement.

### 11.2 Syntax

The conditional grammar is:

```text
if-statement    ::= "if" expression NEWLINE statement-sequence
                    { "elseif" expression NEWLINE statement-sequence }
                    [ "else" NEWLINE statement-sequence ]
                    "end" NEWLINE
```

`elseif` is one token. The complete chain has one closing `end`. Each clause body is a statement sequence and may be empty. A clause body opens no declaration scope; Chapter 5's routine scope remains in effect throughout the chain.

A logical `NEWLINE` terminates each condition header. Physical line endings inside parentheses or brackets remain suppressed under Chapter 3, so a parenthesized condition may span physical lines without changing this grammar.

### 11.3 Conditions

Every `if` and `elseif` condition must have type `boolean`. Nucleus does not treat zero, a nonzero integer, an aggregate, an alias carrier, or a routine name as a condition. A call used in a condition must return `boolean`.

The compiler evaluates a condition only when control reaches its clause. It evaluates that expression once, with the order, short-circuiting, checks, and traps defined by Chapter 9. A trap in a condition prevents selection of any clause body.

### 11.4 Clause selection

Execution tests the `if` condition first. If it is `true`, the corresponding body executes and control continues after the closing `end`. If it is `false`, execution tests each `elseif` condition in source order until one is `true`. After a true condition, its body executes and no later condition or body is evaluated.

When every written condition is `false`, the `else` body executes if present. With no `else`, the statement performs no body operation. After the selected body completes normally, execution continues with the statement following the closing `end`.

Effects from an evaluated false condition remain observable. Conditions after a selected true clause are not evaluated and perform no calls, storage accesses, checks, or traps.

### 11.5 Flat and nested forms

The flat form is:

```nucleus
if firstCondition
    firstAction()
elseif secondCondition
    secondAction()
else
    fallbackAction()
end
```

A genuinely nested conditional has another `if` statement and another `end` in a clause body:

```nucleus
if outerCondition
    if innerCondition
        innerAction()
    end
else
    fallbackAction()
end
```

An `if` that is the sole statement of an `else` body can express the same simple truth conditions as a flat `elseif` chain. Nucleus retains `elseif` because the token marks the clause directly, one `end` closes the chain, and the parser can process repeated clauses with one iterative path. The two spellings do not create different Boolean semantics.

`else if` is not an alternative spelling for `elseif`. It produces two tokens. After `else`, this grammar requires `NEWLINE`; a nested `if` begins as a statement on a following logical line and has its own `end`.

### 11.6 Conditional header termination

Nucleus conditional headers do not use `then`. The logical newline already separates the condition from its body, and Chapter 9 has no conditional expression whose tokens could extend across that boundary. A `then` keyword would add a reserved word and grammar token without resolving a parsing choice.

Consequently, `then` remains an identifier under Chapter 3. A Boolean variable named `then` may appear as the complete condition in `if then`; the following logical newline terminates that header.

### 11.7 Lowering boundary

The source semantics require ordered condition evaluation and selection of at most one body. A compiler may lower the statement to comparisons, conditional branches, and ordinary branches while parsing it. The internal semantic-operation interface requires no dedicated `if`, `elseif`, or `else` operation.

Branch fixups and active clause state are implementation details. They must preserve the source order above, skip every unselected body, and continue after the one closing `end`.

### 11.8 Excluded conditional mechanisms

Nucleus 0.1 has no:

- one-line `if` form;
- postfix or statement-modifier condition;
- conditional expression;
- `select` or `case` statement;
- pattern matching;
- fall-through selection; or
- implicit integer truth test.

A restricted dense nonnegative selection form remains a possible later candidate under Chapter 2. It is not standard syntax unless a later specification revision admits it after measurement.

### 11.9 Invalid conditionals and capacity limits

The compiler must diagnose a non-Boolean condition, `elseif` after `else`, more than one `else`, `else if` used as a flat-clause spelling, a missing logical newline, a missing closing `end`, and any clause token outside its conditional context.

An implementation may bound nested conditional depth, clause count, and branch-fixup state. It must publish each limit and issue a capacity diagnostic before overflow changes clause association, skips a selected body, evaluates an unselected condition, or emits an unresolved branch.

### 11.10 Examples

This chain evaluates `ready` first and `waiting` only when `ready` is false:

```nucleus
if ready
    run()
elseif waiting
    poll()
else
    stop()
end
```

An empty body is valid:

```nucleus
if unchanged
elseif needsUpdate
    update()
end
```

These headers are invalid:

```nucleus
if count              // u16 is not a condition
if ready then         // then is an identifier, not a header marker
else if waiting       // not the flat elseif token
```

## 12. Loop control

### 12.1 Scope

This chapter defines the two Nucleus 0.1 loop forms, counted-loop direction and bounds, and the required `exit` and `continue` statements. Chapter 9 defines expressions, and Chapter 10 defines statement sequences.

Nucleus has one pre-test conditional loop and one counted loop. Both use ordinary comparisons and direct Z80 branches; neither requires a dedicated loop runtime mechanism.

### 12.2 Grammar

The reusable loop fragment is:

```text
while-statement       ::= "while" expression NEWLINE
                          statement-sequence
                          "end" NEWLINE

for-statement         ::= "for" NAME "=" expression
                          for-bound expression
                          [ "step" step-constant ] NEWLINE
                          statement-sequence
                          "end" NEWLINE
for-bound             ::= "to" | "until"
step-constant         ::= [ "+" | "-" ] step-magnitude
step-magnitude        ::= NUMBER | NAME
```

A `NAME` used as a step magnitude must denote an earlier `u8` or `u16` named constant. The optional sign belongs to the counted-loop header and is not a runtime signed value. A written numeric magnitude follows Chapter 3's admitted integer-literal forms.

Each loop body is a statement sequence and may be empty. A loop opens no name scope, and its `end` closes only that loop.

### 12.3 `while`

A `while` condition must have type `boolean`. The condition is evaluated before every possible iteration. When it produces `true`, the body executes. Normal completion of the body returns control to the condition. When the condition produces `false`, execution continues after the loop.

The loop may execute zero times. Calls, checks, mutations, and traps performed by each evaluated condition remain observable. A condition is evaluated once per test; a trap prevents entry to the body or any later iteration.

An indefinite loop uses `while true`. Nucleus has no separate unconditional-loop keyword.

### 12.4 Counted-loop counter and operands

The counter name must resolve to a scalar local of type `u8` or `u16`. A program variable, parameter, constant, Boolean, aggregate, alias, routine, field path, or indexed path is invalid. The loop introduces no declaration, so the local must appear in the routine's declaration prefix.

The counter becomes read-only to source statements from the beginning of the loop body through its closing `end`. The body may read it and pass its scalar value, but it cannot assign to it. A nested counted loop cannot reuse the same local as its counter because its initialization would be another write. The compiler enforces both restrictions by comparing the resolved local binding with the counters in its active loop contexts; it needs no call-graph analysis because another routine cannot name a caller's local.

The start expression must be assignment-compatible with the counter type. The bound must be an integer expression. A typed `u8` counter may be compared with a `u16` bound through the ordinary widening rule. An exact bound remains mathematical for the loop comparison and need not fit the counter because the bound is never stored in it.

The compiler evaluates the start expression and then the bound expression exactly once when the loop begins. It performs both evaluations before storing the converted start in the counter. A bound expression that reads the counter therefore reads its pre-loop value. If either evaluation or the start conversion traps, the counter is not initialized by the loop and the body does not begin.

`step` defaults to mathematical `+1`. A written step is a compile-time signed constant. The compiler resolves a named magnitude under Chapter 5, applies the optional sign, and requires a nonzero magnitude from 1 through 65,535. `step 0` and `step -0` are invalid. The signed step is loop-control metadata; Nucleus does not acquire a signed runtime scalar type.

### 12.5 Counted-loop tests

`to` makes the bound inclusive. `until` makes it exclusive. The step sign selects the comparison:

| Step direction | `to` continues while | `until` continues while |
| -------------- | -------------------- | ----------------------- |
| Positive       | counter `<=` bound   | counter `<` bound       |
| Negative       | counter `>=` bound   | counter `>` bound       |

The compiler stores the converted start in the counter and performs this test before the first iteration. A start already beyond the bound in the selected direction therefore executes zero iterations and leaves the counter holding the start value.

After normal body completion, and after `continue`, the implementation computes the next counter value mathematically and tests it against the bound before storing it. A value that fails the next test ends the loop without being stored. A value that would continue must fit the counter type. Every such overflow is the runtime `loop-range` trap defined by Chapter 15, even when the compiler can prove it from source constants. The trap occurs only if execution reaches the increment path; an earlier `exit`, `return`, `fail`, or other terminating transfer from the body prevents that increment and its trap.

This order prevents the loop machinery from wrapping an unsigned counter at its terminal boundary. Because the body cannot change the counter, the value reaching the increment still satisfies the comparison that admitted the current iteration. The implementation may use that invariant when comparing the remaining distance with the constant step.

After the loop, the counter retains the last value stored. A zero-iteration loop leaves the converted start. `exit` also leaves the current counter value unchanged.

### 12.6 `to`, `until`, and collection traversal

The canonical traversal of indices from zero through a length minus one uses the exclusive form:

```nucleus
for index = 0 until itemCount
    visit(index)
end
```

The inclusive form directly expresses a closed ordinal interval. Positive and negative steps use the same surface forms; the sign, not the spelling `to` or `until`, determines direction.

The start and bound are not reevaluated after the loop begins. A change to storage read by the original bound expression does not change the saved bound for the active loop.

Nucleus has no `for in`, iterator protocol, range object, callback traversal, anonymous counter, omitted start, omitted bound, implicit array-length bound, or source form that declares the counter. The counter and both endpoint expressions are explicit.

### 12.7 `exit` and `continue`

Every Nucleus loop supports bare `exit` and bare `continue`. They are unlabeled and apply to the innermost enclosing loop.

`exit` transfers control to the statement after that loop's closing `end`. It does not leave the routine or terminate the program.

In a `while` loop, `continue` transfers control to the next condition test. In a counted `for` loop, it transfers control to the increment-and-next-test path from Section 12.5. It does not skip the increment.

Either statement outside a loop is invalid. Nucleus has no labelled transfer, numeric loop depth, `break` synonym, or transfer directly to an outer loop. An early `return` under Chapter 13 remains the way to leave the routine from inside nested loops.

The grammar adds only the two simple statements, and their lowering uses the active loop's existing continue and exit branch targets. This low incremental structure is a settled language decision; target-byte cost remains subject to the Chapter 2 ledger.

### 12.8 Lowering boundary

A counted loop has the same source effect as ordered start and bound evaluation, counter initialization, a direction-specific comparison, a conditional branch, a body in which the counter is read-only, a checked mathematical increment, and a backward branch. `to` and `until` differ only in whether the bound comparison is inclusive.

The semantic-operation interface requires no dedicated `for`, `while`, `exit`, or `continue` operation. A compiler may emit ordinary comparisons and branches, provided it preserves one-time operand evaluation, the test and store order, and the transfer targets above.

### 12.9 Excluded loop forms

Nucleus 0.1 has no:

- `repeat until` or `do while` loop;
- post-test loop;
- general unconditional `loop` statement;
- collection or iterator loop;
- omission-based counted-loop variant; or
- labelled loop or labelled transfer.

These omissions leave `while` for condition-controlled iteration and one mechanically specified `for` for counted traversal.

### 12.10 Invalid loops and capacity limits

The compiler must diagnose a non-Boolean `while` condition, a counter that is not a scalar local of type `u8` or `u16`, assignment to an active counter, reuse of an active counter by a nested loop, an incompatible start or bound, an unavailable or nonconstant step magnitude, a zero step, a missing header `NEWLINE` or closing `end`, and `exit` or `continue` outside a loop.

An implementation may bound loop nesting, retained saved bounds, active counter bindings, active branch targets, and fixup state. It must publish each limit and issue a capacity diagnostic before overflow changes a loop's bound, direction, target, or counter update.

### 12.11 Examples

With `level`, `index`, `row`, and `position` declared as scalar locals, these counted loops visit ascending, exclusive, and descending ranges:

```nucleus
for level = 1 to 10
    loadLevel(level)
end

for index = 0 until itemCount
    visit(index)
end

for row = 7 to 0 step -1
    clearRow(row)
end
```

This direction mismatch executes zero iterations:

```nucleus
for position = 7 to 0 step 1
    unreachableAction()
end
```

Nested transfer targets the inner loop:

```nucleus
while active
    for index = 0 until itemCount
        if skip(index)
            continue
        elseif stop(index)
            exit
        end
        visit(index)
    end
    update()
end
```

The `continue` advances and retests the `for`; the `exit` leaves that `for` and proceeds to `update()`.

These forms are invalid:

```nucleus
for index = 0 until itemCount
    index = index + 1       // the active counter is read-only
end

for index = 0 until itemCount
    for index = 0 until 4   // a nested loop cannot reuse it
    end
end
```

A program variable or parameter is likewise unavailable as a counted-loop counter. A `while` loop remains available when a program needs to update its progress variable explicitly.

## 13. Routines and calls

### 13.1 Scope

This chapter defines routine declarations as callable interfaces, invocation, argument binding, results, `return`, routine completion, recursive calls, and source-level activation behaviour. Chapters 4, 5, and 8 define declaration order, forwards, names, headers, parameters, and local declarations. Chapters 6 and 7 define value copying, aggregate aliases, and lifetime.

Nucleus has one routine family. A routine declares no result or one result type. It has no overload, nested declaration, multiple-result form, implicit result variable, routine-name assignment, routine value, indirect call, or callback type.

### 13.2 Routine syntax

The routine fragment is:

```text
routine-header       ::= "sub" NAME routine-signature-tail
routine-signature-tail
                     ::= "(" [ formal-parameter
                         { "," formal-parameter } ] ")"
                         [ "as" type ] [ "fails" ]
formal-parameter     ::= NAME "as" type

forward-routine      ::= "forward" routine-header NEWLINE
routine-definition   ::= "sub" NAME routine-definition-tail
routine-definition-tail
                     ::= routine-signature-tail NEWLINE routine-body
                       | NEWLINE routine-body
routine-body         ::= { local-declaration }
                         statement-sequence "end" NEWLINE

routine-invocation   ::= NAME argument-list
argument-list        ::= "(" [ expression { "," expression } ] ")"
return-statement     ::= "return" [ expression ]
```

Chapter 8 remains authoritative for declaration placement and the local-declaration prefix. The fragments here complete their call and result meaning. Parentheses are required in every complete header and invocation, including a routine with no parameters or arguments. The abbreviated header is available only to the body that completes an earlier forward.

An omitted result type declares a result-free routine. A written type declares one result of that exact scalar or aggregate type. The optional `fails` effect is defined by Chapter 14. The header has no separate procedure/function keyword and no result-name declaration.

### 13.3 Visible signatures and invocation

A routine invocation begins with a visible routine name whose complete signature has already been checked. An earlier forward declaration supplies that signature when the definition appears later. The compiler does not infer a signature from arguments or defer checking until another pass.

The invocation must supply exactly one argument for each formal parameter, in declaration order. Nucleus has no optional, named, variadic, grouped, or default arguments. An infallible result-free routine may be used only as the complete call statement from Chapter 10. An infallible result-bearing routine may be used as an expression or as a call statement that discards the result. Chapter 14 restricts every failable call to a position with one explicit failure consumer.

A call expression takes its static result type directly from the signature. A scalar result is a scalar value. An aggregate result is a transient typed alias and may take the field or index suffixes admitted by Chapter 9. It must then be consumed under Section 13.6; a routine name without its argument list is invalid in every expression and statement context.

### 13.4 Argument evaluation and compatibility

Arguments are evaluated from left to right. Each scalar argument is evaluated and converted if permitted, and its resulting value is retained before evaluation of the next argument. Each aggregate argument evaluates its storage path, including field selection and checked indexing, and establishes the alias value supplied to the parameter.

If argument evaluation traps, no later argument is evaluated and the routine body does not begin. Effects from earlier arguments remain observable.

A scalar argument must have the exact parameter type, be an exact literal that fits it, or use the implicit `u8`-to-`u16` widening. Passing `u16` to `u8` requires explicit checked `u8(...)`. Boolean and integer arguments do not convert between each other.

An aggregate argument must be an aggregate storage path or a transient aggregate-alias result with exact referent-type identity. It does not copy the record, fixed array, or bounded string. The callee's parameter becomes a fixed alias to the same object or subobject. Scalar-leaf mutation and exact-type aggregate assignment through that parameter are visible through every other path to the same storage.

Nucleus has no parameter modes, implicit read-only aggregate parameter, write permission, copy-in/copy-out aggregate parameter, or hidden source-level pointer conversion.

### 13.5 Activation semantics

A successful call begins one logical activation after all arguments have been evaluated. The activation contains that invocation's copied scalar parameters, aggregate-parameter bindings, and scalar locals. Activation-local initialization follows Section 8.12 before the first statement begins.

Each simultaneously active invocation has distinct activation state. Calling another routine does not change the caller's scalar parameters, scalar locals, or aggregate-parameter bindings. The callee may change program-lifetime storage that it can name or reach through an aggregate argument, and those mutations remain visible to the caller.

The caller resumes after the invocation when the callee returns normally. For an expression call, the result is transferred before evaluation continues in the containing expression. For a call statement, any result is discarded after transfer.

### 13.6 `return` and results

A result-free routine uses bare `return`, or reaches its closing `end`. Every `return expression` is invalid in a result-free routine, including an expression that is a failable invocation. A failable result-free call must consume failure as its own statement before a later successful `return`.

A result-bearing routine uses `return expression`. Bare `return` is invalid. The expression is evaluated once before the activation ends and must be compatible with the declared result type. It cannot be a failable invocation: failure must be propagated or handled by an earlier statement, and `return` represents success only.

A scalar result follows the scalar destination rules: exact type, fitting exact literal, or implicit `u8`-to-`u16` widening. Checked narrowing must be written explicitly. The caller receives a copied scalar value.

An aggregate result must be an aggregate storage path or transient aggregate-alias result with exact referent-type identity. The storage path is rooted in a visible program variable, aggregate constant, or aggregate parameter. The caller receives a transient alias to the same existing program-lifetime object, not a copy. Section 7.9 establishes the lifetime of every admitted aggregate result without another result check.

The caller may consume that transient alias only by discarding it as a complete call statement, passing it directly to an aggregate parameter, forwarding it as an aggregate return, applying an immediate field or index suffix, or using it as the source of exact-type aggregate assignment. It cannot be retained in a source variable. To retain the returned value, the caller assigns the call result into a program object or caller-supplied aggregate destination, causing the complete copy defined by Section 7.8.

If evaluating a later argument or suffix performs another call, the compiler preserves the transient carrier until its containing operation consumes it. Backend liveness or argument staging provides that protection; it does not create a source-visible pointer or extend the result beyond the operation.

`return` may appear anywhere in a routine statement sequence, including inside a conditional or loop. It ends the current activation immediately after transferring the result, if any. It does not execute later statements in the routine.

### 13.7 Value-routine completion

A value routine is invalid when its closing `end` is reachable without executing `return expression`. Nucleus does not supply an implicit value, result variable, or default return.

The static rule uses a bounded structured fallthrough summary:

- `return expression` does not fall through;
- assignment and call statements fall through;
- an `if` does not fall through only when it has an `else` and every clause body does not fall through;
- an `if` without `else` may fall through; and
- every `while` and `for` is treated as able to finish, regardless of a constant condition or its body.

A statement sequence can reach its end when control can pass through every statement on a path. Once a statement on a path does not fall through, later statements on that path do not restore fallthrough. This rule permits one streaming summary per nested statement and requires no control-flow graph.

The conservative loop rule is part of Nucleus 0.1 validity. A value routine whose only non-returning path is an apparently indefinite loop still requires a structurally reachable `return expression` after that loop or another arrangement that satisfies the rules above.

### 13.8 Forward definitions and recursion

A forward declaration contains the routine's complete and sole signature, including its parameter names. Its later body begins with `sub NAME` and a logical newline. That name must resolve to exactly one incomplete forward under Chapters 4, 5, and 8. The stored parameter names bind the body; no parameter, result, or `fails` clause is repeated. The forward declaration and body definition denote one routine.

The body does not repeat the signature, so the compiler performs no body-signature comparison. A streaming compiler must retain the forward's parameter names as well as its type and effect metadata until it compiles the body. The net compiler-core and workspace effects remain unmeasured.

After its complete signature has been checked, a routine may call itself directly. Mutually recursive routines require an earlier forward signature for every routine called before its definition. Recursive calls use the ordinary argument, activation, result, and lifetime rules; Nucleus has no separate recursive syntax.

Recursion is admitted in Nucleus 0.1. Implementation staging may postpone its construction in the first compiler, but standard language mode must not reinterpret or permanently reject recursive source within the implementation's documented compile-time capacities.

### 13.9 Activation capacity

Runtime activation capacity is implementation-defined. An implementation may bound the number of simultaneously active routine invocations, the storage consumed by their activation state, or both. It must publish every bound and provide at least the capacity needed by every complete accepted program in Chapter 21 under its stated inputs. Before beginning a call that would exceed a published bound, the program performs the activation-capacity trap specified by Chapter 15; it must not overwrite a live activation, alias one activation's locals with another, or continue with partial parameter binding.

The trap point is after argument evaluation and before the new activation begins. Effects from evaluated arguments remain observable, while the callee performs no local initialization or body statement.

This runtime limit does not create a non-recursive language profile. A compiler accepts recursive call graphs subject to its ordinary compile-time capacities; active depth is a runtime property.

### 13.10 Cleanup and lowering boundary

Nucleus routines have no destructors, `finally`, `defer`, exception unwinding, variable-sized local allocation, or other source-level scope-exit action. A `return` therefore performs no hidden source cleanup before transferring control.

The source semantics permit an all-caller-save implementation. A backend may save live implementation values before a call, place arguments, invoke the callee, capture a result before restoring overlapping state, and restore the caller afterward. Recursive calls may use the same rule for each activation. These operations are backend mechanics, not source-visible registers, clobber declarations, or parameter modes.

The compiler may lower calls and returns to regular semantic operations while parsing. This specification does not define register assignments, save regions, hardware-stack use, helper entry points, or the physical calling convention. The Z80 runtime and backend contract supplies the required target-level effects.

### 13.11 Invalid calls and capacity limits

The compiler must diagnose an unavailable or non-routine callee, a missing argument list, wrong arity, an incompatible scalar argument or result, an aggregate argument or result with the wrong referent type, a result-free call used as a value, the wrong `return` form, a value routine whose end is reachable, an abbreviated body without one incomplete forward, and a duplicate or missing forward completion.

An implementation may bound parameters, arguments, active expression-call nesting, retained signatures, fallthrough-summary depth, and compile-time call-graph metadata. It must publish each limit and issue a capacity diagnostic before dropping an argument, corrupting a signature, losing a result, merging live state, or changing a call target. Runtime activation capacity follows Section 13.9 rather than this compile-time capacity rule.

### 13.12 Examples

A result-free routine and a value routine use the same declaration family:

```nucleus
sub display(value as u8)
    return
end

sub maximum(left as u16, right as u16) as u16
    if left >= right
        return left
    else
        return right
    end
end
```

Both paths through `maximum` return a compatible value. The result may be used directly:

```nucleus
largest = maximum(first, second)
```

An aggregate result preserves alias identity:

```nucleus
sub entryAt(index as u8) as Entry
    return entries[index]
end

sub update(items as Entry[8], index as u8)
    items[index].value = entryAt(index).value
end
```

`entryAt` returns an alias to program-lifetime storage. The call itself copies no `Entry`; an aggregate assignment using that result copies into its destination.

To retain the complete returned value, the caller provides destination storage:

```nucleus
sub retain(index as u8, destination as Entry)
    destination = entryAt(index)
end
```

`destination` remains bound to the caller's object. The assignment materializes the transient result without declaring an aggregate local.

Direct and mutual recursion use ordinary signatures:

```nucleus
forward sub odd(value as u16) as boolean

sub even(value as u16) as boolean
    if value = 0
        return true
    end
    return odd(value - 1)
end

sub odd
    if value = 0
        return false
    end
    return even(value - 1)
end
```

These forms are invalid:

```nucleus
sub missing(value as u8) as u8
    if value = 0
        return 1
    end
end                              // value path reaches end

sub procedure()
    return 1                     // result-free routine
end

sub value() as u8
    return                       // value routine requires an expression
end
```

## 14. Recoverable errors

### 14.1 Two failure classes

A **recoverable error** is an expected unsuccessful result that source code may propagate or handle. A **trap** is a non-recoverable safety failure defined by Chapter 15. Error handling does not intercept, convert, or resume after a trap.

Nucleus represents a recoverable error with a `u8` code carried beside a routine's ordinary success result. The code has no separate error-set type. Programs give codes stable names with top-level `u8` constants; Chapter 16 also defines the standard service codes. The value zero is permitted, although the standard codes are nonzero.

### 14.2 Failable signatures

A routine that can return a recoverable error writes `fails` at the end of its header:

```text
routine-header ::= "sub" NAME "(" [ formal-parameter
                   { "," formal-parameter } ] ")"
                   [ "as" type ] [ "fails" ]
```

`fails` is part of the routine signature. A forward declaration records it once; the later abbreviated body header cannot repeat it. An ordinary routine without a forward includes it in its complete header. The clause does not change the declared parameters or optional success-result type.

Absent a trap, a failable invocation completes in exactly one of two ways:

- **success**, with the ordinary scalar value, aggregate alias, or no result declared by the header; or
- **failure**, with one `u8` error code and no success result.

An infallible routine has only successful completion. It cannot use `fail` or propagate a callee's failure.

### 14.3 Producing failure

The statement

```text
fail-statement ::= "fail" expression
```

ends the current failable routine with failure. The expression is evaluated once and must be compatible with `u8`; an exact literal must fit, and `u16` requires explicit checked narrowing. The activation ends after the code is obtained. No later statement in that routine executes.

`fail` in an infallible routine is invalid. A trap while evaluating the code remains a trap and does not become a recoverable error.

Named codes are ordinary constants:

```nucleus
const badDigit = 1
const tooLarge = 2

sub parseDigit(value as u8) as u8 fails
    if value < '0' or value > '9'
        fail badDigit
    end
    return value - '0'
end
```

### 14.4 Required consumption

Every call of a failable routine must consume failure at that call site. Nucleus provides exactly two forms:

1. `else fail` propagates the code from the current failable routine.
2. Immediate `handle NAME ... end` handles the code locally.

A failable invocation cannot appear inside an argument, arithmetic operation, comparison, condition, index, general conversion, or other larger expression. It may be only:

- the complete initializer of a scalar local declaration, followed by `else fail`;
- the complete right side of an assignment, followed by `else fail` or `handle`;
- the complete routine-call statement, followed by `else fail` or `handle`.

Local declarations admit propagation but not handling. `return` admits no failable invocation: it represents success only. An unconsumed failable invocation, two consumers on one invocation, or a failable invocation in any other position is invalid. Program-variable and constant initializers cannot call routines under Chapter 8 and therefore cannot be failable.

### 14.5 Propagation

The propagation suffix is:

```text
failure-propagation ::= "else" "fail"
```

On success, the surrounding declaration or assignment uses the callee's ordinary result, or the call statement continues. On failure, `else fail` immediately returns the same `u8` code from the enclosing routine. The enclosing routine must declare `fails`.

```nucleus
sub loadByte() as u8 fails
    var value as u8 = readStorageByte() else fail
    return value
end
```

Propagation is explicit at every intermediate call. Nucleus has no implicit propagation, error-set inclusion, code remapping, handler stack, or unwinding.

### 14.6 Local handling

`handle NAME` occurs on the same logical line as the assignment or routine-call statement whose direct failable invocation it handles:

```text
failure-handler ::= "handle" NAME NEWLINE
                    statement-sequence "end" NEWLINE
```

The name must resolve to an existing writable `u8` scalar variable, parameter, or local. A scalar local serving as an active counted-loop counter is read-only and cannot be the error destination. The clause declares no binding and opens no scope. This rule preserves the declaration-prefix and scope rules from Chapters 5 and 8.

On success, the call supplies its ordinary result, the assignment occurs when present, and the handler body is skipped. On failure, no success-result store occurs, then the compiler stores the error code in the named `u8` destination and executes the handler body. This ordering also applies when the assignment destination and error destination are the same variable: the variable receives the error code. Normal completion of the body continues after its closing `end`. A `return`, `fail`, `exit`, or `continue` inside the body has its ordinary enclosing context.

```nucleus
sub copyOne()
    var code as u8
    var value as u8

    value = readStorageByte() handle code
        return
    end

    writeOutputByte(value) handle code
        return
    end
end
```

The handled call must be the complete right side of the assignment or the complete call statement. The handler begins after that line's `NEWLINE`; attachment state never survives the newline. A handler cannot attach to a local declaration, `return`, compound statement, infallible call, propagated call, or another statement.

### 14.7 Results, flow, and entry failure

Ordinary `return` denotes successful completion only. A result-free failable routine may use bare `return` or reach its closing `end`. A result-bearing failable routine must return a compatible success result or fail on every path under the fallthrough rules in Section 13.7, extended so `fail` does not fall through. A caller that needs to propagate a failable result does so in a preceding local initializer, assignment, or call statement, then returns only the successful result.

`else fail` can exit on failure and continue on success, so it does not by itself make following source unreachable. A `handle` body can complete normally unless it has a non-fallthrough statement on every path.

The fixed `main` routine may declare `fails`. A failure returned from `main` has no source caller and performs the unhandled-error trap in Chapter 15 with the returned code. A successful return from `main` terminates normally.

### 14.8 Lowering boundary

The source semantics require a success/failure discriminant and a `u8` code for each failable result. The Z80 runtime and backend contract defines their required target behavior while leaving the carrier choice private. Carry plus a byte register is one possible calling convention, not source semantics.

Failure propagation is an ordinary conditional return. Local handling is an ordinary conditional branch. Nucleus has no exception object, stack walk, cleanup action, hidden handler registration, or resumable failure state. The all-caller-save-compatible call semantics in Chapter 13 apply to both outcomes.

### 14.9 Invalid forms and capacities

The compiler must diagnose:

- `fail` or `else fail` in an infallible routine;
- a failure code incompatible with `u8`;
- a failable invocation in a nested expression or unsupported context;
- a failable invocation with no consumer or more than one consumer;
- `handle` attached to an ineligible statement;
- a propagating `return` form;
- an error destination that is unavailable, non-writable, not `u8`, or an active counted-loop counter;
- a `fails` clause or other signature text repeated on an abbreviated forward body; and
- a result-bearing failable routine that can reach its end without success or failure.

An implementation may bound retained failable signatures, nested handlers, failure fixups, and active error destinations. It must publish each limit and issue a capacity diagnostic before exhaustion can discard a check, route a code to the wrong caller, or execute the wrong handler.

## 15. Safety failures and traps

### 15.1 Trap semantics

A **trap** terminates Nucleus source execution immediately. Source code cannot catch, handle, resume, mask, or convert it to a recoverable error. A trap performs no stack unwinding and runs no source cleanup action.

The implementation reports a stable symbolic trap reason and the best available location for the operation that failed. When source mapping is available, the report must identify the source span. Otherwise, it must identify the generated instruction location. Numeric trap encodings, transport records, monitor integration, and physical output belong to the Z80 runtime and backend contract.

Effects completed before the failing operation remain observable. The failing operation performs no result store unless its rule below says otherwise. No later source operation executes.

### 15.2 Required trap reasons

Nucleus 0.1 defines these trap reasons:

| Reason                | Condition and point                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bounds`              | A dynamic fixed-array index or bounded-string byte index is outside zero through current length minus one. The trap precedes the read, write, or alias formation. |
| `narrowing`           | A dynamic checked `u8(...)` operand exceeds 255. The trap precedes production or storage of the narrowed result.                                                  |
| `division-by-zero`    | A runtime divisor for `/` or `mod` is zero. The trap precedes production of a quotient or remainder.                                                              |
| `loop-range`          | A counted-loop next value would continue but does not fit the counter type. The trap precedes the counter store.                                                  |
| `activation-capacity` | A call would exceed a published activation-depth or activation-storage limit. The trap occurs after argument evaluation and before the new activation begins.     |
| `unhandled-error`     | `main` returns failure. The report includes the returned `u8` code.                                                                                               |

A conforming implementation may use more detailed internal causes, but it must preserve these public reason identities. It must not report a required reason as another reason merely because two checks share a helper.

### 15.3 Compile-time proof

When the compiler proves a bounds, narrowing, division, or modulo failure from source constants, the source is invalid and compilation produces a diagnostic. It must not emit an executable whose first relevant action is a guaranteed trap. Counted-loop `loop-range` failure is different: it remains a runtime trap because earlier control flow in the loop body may prevent execution from reaching the increment. When the compiler proves an operation safe, it may omit the runtime check.

If validity depends on runtime data, the program remains conforming and the check is part of its specified execution. Optimization must preserve the trap reason, ordering, and prior observable effects.

### 15.4 Ordering details

Chapter 9's left-to-right rules determine which of several possible failures occurs first. Assignment checks its target path before its right side; aggregate assignment validates both complete extents before changing the destination. Calls evaluate every argument before the activation-capacity check. A counted loop checks the mathematical next value before storing it. Boolean short-circuiting suppresses every check in an operand that is not evaluated.

A recoverable service error follows Chapter 14 and is not a trap while a source caller can consume it. Only failure reaching the end of `main` becomes `unhandled-error`. A trap raised within a failable routine bypasses its failure channel and every `handle` body.

### 15.5 Host failures

The execution environment must preserve a trap even if its reporting device or output stream is unavailable. It may fall back to a monitor code, halt state, or other documented target mechanism. Reporting failure must not resume the Nucleus program or replace the original symbolic reason with an unrelated success outcome.

## 16. System boundary

### 16.1 Boundary model

Nucleus 0.1 defines a small portable service boundary for byte-stream input and output, slow bulk storage, successful termination, and trap reporting. Programs invoke typed predefined routines and use predefined constants. The source language exposes no service numbers, ports, firmware entry points, raw addresses, file descriptors, device registers, or machine-specific memory map.

Nucleus source contains no physical placement, and a target description contains no source-symbol reference. The source manifest selects and orders declarations; the target description supplies bounded execution regions. Neither input can name or rewrite entities owned by the other.

The **Nucleus System Services 0.1** set is versioned with this language revision. A conforming execution environment supplies every service in Section 16.3 with the stated source contract and the initial stream states stated there. Later additions require a language revision or an explicit extension under Section 1.7 and measured admission under Chapter 2.

### 16.2 Predefined error codes

The compiler establishes these `u8` constants before the first source token:

| Name             | Value | Meaning                                                                      |
| ---------------- | ----: | ---------------------------------------------------------------------------- |
| `endOfInput`     |     1 | The selected input stream has no further byte.                               |
| `inputFailure`   |     2 | Standard input could not supply a byte for a reason other than end of input. |
| `outputFailure`  |     3 | Standard output could not accept a byte.                                     |
| `storageFailure` |     4 | A bulk-storage read, write, rewind, or seek failed.                          |

The names occupy the ordinary program namespace and cannot be redeclared or shadowed. They are named recoverable-error codes, not enumeration members or a distinct error type.

### 16.3 Predefined routines

The compiler establishes these routine signatures before the first source token:

```nucleus
sub readInputByte() as u8 fails
sub writeOutputByte(value as u8) fails
sub readStorageByte() as u8 fails
sub rewindStorageInput() fails
sub writeStorageByte(value as u8) fails
sub seekStorageOutput(offset as u16) fails
```

The declarations above state interfaces; they are not source definitions and do not require completing bodies in the compilation unit.

Standard input starts with its cursor before the first supplied byte. `readInputByte` obtains the next byte from standard input. It may block until a byte, end-of-input condition, or input failure is available. It succeeds with the byte and advances the cursor, fails with `endOfInput` at the end, else fails with `inputFailure` for another input error. Failure leaves the cursor unchanged.

Standard output starts empty and is append-only. `writeOutputByte` appends one byte to standard output. It succeeds after the byte has been accepted else fails with `outputFailure`. Successful writes occur in call order; failure leaves the output unchanged.

The bulk-storage routines operate on one logical input stream and one logical output stream selected by the execution environment. Both cursors start at offset zero. The output supplied to a Chapter 21 conformance run starts empty. `readStorageByte` advances the input cursor after a successful byte and reports `endOfInput` or `storageFailure` otherwise. `rewindStorageInput` moves the input cursor to offset zero or reports `storageFailure`.

`writeStorageByte` overwrites the existing byte when the output cursor is below the current end, appends when the cursor is exactly at the end, and advances the cursor by one on success. It never inserts a byte or truncates later bytes. `seekStorageOutput` moves that cursor to an existing offset or exactly to the current end; seeking past the end fails with `storageFailure`. Every failed bulk-storage operation is atomic: it leaves its affected cursor and all output contents unchanged.

These contracts support streaming programs without exposing a filesystem. Nucleus 0.1 source cannot open, close, name, enumerate, create, or delete files. A launcher or build tool selects the streams outside the source language.

### 16.4 Program startup and termination

The implementation enters its implicit startup path before `main`. Startup establishes explicit program-variable initializers, establishes zero values for the remaining program variables, and then transfers to `main`. These operations are complete before source execution begins and are not source-callable. The environment supplies no command-line arguments or implicit source values. Source code obtains input only through the predefined services.

Normal return from `main` terminates successfully. Nucleus 0.1 has no source statement for process exit status or immediate successful termination. Failure returned from `main` and every safety trap terminate unsuccessfully under Chapter 15.

The external representation of success, recoverable-error codes, and trap reasons is implementation-defined only where the Z80 runtime and backend contract explicitly says so. That representation must preserve the source-level distinction among normal termination, unhandled recoverable error, and each required trap reason.

### 16.5 Portability and implementation

An environment may implement services with CP/M calls, a monitor, port I/O, host callbacks, or another mechanism. It may buffer transfers if buffering preserves call order, failure points, and visible bytes. Those choices do not add source names or expose their addresses.

Arbitrary BIOS calls, machine-code-call declarations, inline assembly, memory peeks and pokes, port access, and callbacks are excluded from the safe source boundary. A later service must have a typed target-independent contract and pass the measured admission rule before it enters the standard set.

The target adapter may place the program in ROM, loaded RAM, or bank-switched ROM while preserving the same startup and source semantics. In a banked target, the adapter assigns source parts to banks and the backend selects local or far calls. Source code supplies neither a bank number nor a target address. A far-called routine receives the ordinary source arguments and returns through its ordinary routine ABI.

## 17. Complete grammar

### 17.1 Notation and lexical boundary

Quoted words and punctuation are terminals. Uppercase names are token categories from Chapter 3. Lowercase hyphenated names are nonterminals. `{ X }` means zero or more repetitions, `[ X ]` means optional, parentheses group alternatives, and `|` separates alternatives.

The lexical forms are:

```text
ascii-letter       ::= "A".."Z" | "a".."z"
decimal-digit      ::= "0".."9"
hexadecimal-digit  ::= decimal-digit | "A".."F" | "a".."f"
binary-digit       ::= "0" | "1"

identifier         ::= ascii-letter
                       { ascii-letter | decimal-digit | "_" }
integer-literal    ::= decimal-digit { decimal-digit }
                     | "$" hexadecimal-digit { hexadecimal-digit }
                     | "%" binary-digit { binary-digit }
character-literal  ::= "'" literal-byte "'"
string-literal     ::= '"' { literal-byte } '"'
escape             ::= "\\0" | "\\n" | "\\r" | "\\t"
                     | "\\'" | '\\"' | "\\\\"
                     | "\\x" hexadecimal-digit hexadecimal-digit
line-comment       ::= "//" { source-byte } (line-ending | EOF)
line-ending        ::= LF | CR LF
```

Sections 3.2 through 3.10 define `literal-byte`, accepted source bytes, maximal token formation, case-sensitive keyword and identifier recognition, numeric range, and lexical errors. Hexadecimal digits also occur in escapes, but an escape remains part of a character or string literal rather than an integer token.

The tokenizer emits `NAME`, `NUMBER`, `CHARACTER`, `STRING`, keyword and punctuation terminals, `NEWLINE`, and `EOF`. It emits `NEWLINE` only at delimiter depth zero, collapses blank or comment-only lines, and synthesizes a source-part-boundary or final logical newline when Sections 3.4 and 4.3 require one. Source-part events and metadata remain outside the token grammar. Those stateful rules are part of the token contract and are not context-free productions.

### 17.2 Syntactic grammar

```text
compilation-unit
    ::= { top-level-declaration } EOF

top-level-declaration
    ::= const-declaration
      | assert-declaration
      | program-var-declaration
      | record-declaration
      | forward-routine
      | routine-definition

const-declaration
    ::= "const" NAME const-declaration-tail
const-declaration-tail
    ::= "=" expression NEWLINE
      | "as" type "=" static-initializer NEWLINE

assert-declaration
    ::= "assert" expression NEWLINE

program-var-declaration
    ::= "var" NAME "as" type [ "=" program-initializer ] NEWLINE
program-initializer
    ::= static-initializer
static-initializer
    ::= expression
      | STRING
      | record-initializer
      | array-initializer
record-initializer
    ::= "(" static-initializer
        { "," static-initializer } ")"
array-initializer
    ::= "[" static-initializer
        { "," static-initializer } "]"

record-declaration
    ::= "record" NAME NEWLINE
        field-declaration { field-declaration }
        "end" NEWLINE
field-declaration
    ::= NAME "as" type NEWLINE

forward-routine
    ::= "forward" routine-header NEWLINE
routine-definition
    ::= "sub" NAME routine-definition-tail
routine-definition-tail
    ::= routine-signature-tail NEWLINE routine-body
      | NEWLINE routine-body
routine-body
    ::= { local-declaration } statement-sequence "end" NEWLINE
routine-header
    ::= "sub" NAME routine-signature-tail
routine-signature-tail
    ::= "(" [ formal-parameter
        { "," formal-parameter } ] ")"
        [ "as" type ] [ "fails" ]
formal-parameter
    ::= NAME "as" type

local-declaration
    ::= "var" NAME "as" scalar-type
        [ "=" local-initializer ] NEWLINE
local-initializer
    ::= expression [ failure-propagation ]

type
    ::= type-atom [ "[" expression "]" ]
type-atom
    ::= scalar-type | NAME | bounded-string-type
scalar-type
    ::= "u8" | "u16" | "boolean"
bounded-string-type
    ::= "string" "[" expression "]"

statement-sequence
    ::= { statement }
statement
    ::= name-statement name-statement-tail
      | other-simple-statement NEWLINE
      | if-statement
      | while-statement
      | for-statement

name-statement
    ::= assignment-statement
      | routine-call-statement
name-statement-tail
    ::= NEWLINE
      | failure-propagation NEWLINE
      | failure-handler
other-simple-statement
    ::= return-statement
      | "exit"
      | "continue"
      | fail-statement

assignment-statement
    ::= assignment-target "=" assignment-source
assignment-target
    ::= NAME { field-suffix | index-suffix }
assignment-source
    ::= expression

routine-call-statement
    ::= NAME argument-list
return-statement
    ::= "return" [ return-source ]
return-source
    ::= expression
fail-statement
    ::= "fail" expression

failure-propagation
    ::= "else" "fail"
failure-handler
    ::= "handle" NAME NEWLINE
        statement-sequence "end" NEWLINE

if-statement
    ::= "if" expression NEWLINE statement-sequence
        { "elseif" expression NEWLINE statement-sequence }
        [ "else" NEWLINE statement-sequence ]
        "end" NEWLINE

while-statement
    ::= "while" expression NEWLINE
        statement-sequence
        "end" NEWLINE

for-statement
    ::= "for" NAME "=" expression
        for-bound expression
        [ "step" step-constant ] NEWLINE
        statement-sequence
        "end" NEWLINE
for-bound
    ::= "to" | "until"
step-constant
    ::= [ "+" | "-" ] (NUMBER | NAME)

expression
    ::= or-expression
or-expression
    ::= and-expression { ("or" | "xor") and-expression }
and-expression
    ::= not-expression { "and" not-expression }
not-expression
    ::= "not" not-expression | comparison
comparison
    ::= additive [ comparison-operator additive ]
comparison-operator
    ::= "=" | "<>" | "<" | "<=" | ">" | ">="
additive
    ::= multiplicative { ("+" | "-") multiplicative }
multiplicative
    ::= unary { ("*" | "/" | "mod") unary }
unary
    ::= ("+" | "-") unary | postfix-expression
postfix-expression
    ::= primary { postfix-suffix }
primary
    ::= NUMBER | CHARACTER | "true" | "false"
      | NAME | conversion | "(" expression ")"
conversion
    ::= ("u8" | "u16") "(" expression ")"
postfix-suffix
    ::= argument-list | index-suffix | field-suffix
argument-list
    ::= "(" [ expression { "," expression } ] ")"
index-suffix
    ::= "[" expression "]"
field-suffix
    ::= "." NAME
```

The grammar uses the general `expression` nonterminal for scalar constant leaves and type bounds. Chapter 8's constant-context predicate rejects variables, calls, nonconstant operations, and values outside the required range. The declared type and current aggregate component select a scalar expression, string literal, parenthesized record initializer, or bracketed array initializer. This type-directed choice resolves the shared opening `(` of a parenthesized scalar expression and a record initializer without backtracking. `type` permits at most one array suffix outside a bounded-string atom, which admits arrays of scalars, records, and bounded strings but not arrays of arrays.

### 17.3 Semantic predicates

The grammar uses these declared semantic predicates:

| Predicate                      | Decision                                                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isCallableName`               | At statement head, select a routine-call statement; in an expression, admit a call suffix only on a visible routine and retain its result and failure category.              |
| `isWritableName`               | At statement head, select assignment only when the resolved declaration is a mutable scalar or aggregate root; an aggregate constant root is rejected before suffix parsing. |
| `isRecordTypeName`             | Accept a `NAME` as a type atom only when it resolves to a visible record type.                                                                                               |
| `isInitializerForDeclaredType` | Select and check the scalar, string, positional record, recursive array, or zero-default rule from the declared variable, aggregate constant, or current component type.     |
| `isConstantContext`            | In constants, type bounds, array lengths, string capacities, and program initializers, admit only the compile-time operands and operations from Chapter 8.                   |
| `isIntegerConstantName`        | Admit a `NAME` as a counted-loop step magnitude only when it denotes an earlier `u8` or `u16` constant.                                                                      |
| `isIncompleteForwardName`      | Admit `sub NAME NEWLINE` as a body header only when the exact name resolves to one incomplete forward; install that forward's stored parameter bindings for the body.        |

Field lookup after `.` uses the selected record type, except that a bounded-string base admits only the intrinsic read-only suffix `.length`. Index selection uses a fixed-array domain or a bounded string's current logical length according to the base type; this distinction needs no grammar change. Static initializer checking descends the finite declared type tree and records the expected component before parsing each nested initializer. The `NAME` in `step-constant` must denote an earlier integer constant. A call suffix first produces a call expression with the visible signature's result and failure category. The checker then rejects a failable call unless an eligible initializer, assignment, or complete call statement immediately consumes that direct call under Chapter 14. A return source is always an ordinary successful expression and cannot contain a failable invocation. These are static semantic checks over an otherwise deterministic token stream, not token backtracking.

### 17.4 Predictive analysis

The repository grammar analyzer mechanically expanded the grammar above to 171 BNF rules over 94 nonterminals. It found no nullable-prefix left-recursion cycle, unreachable nonterminal, or unproductive nonterminal. The only predicate-resolved conflict sites are the name-led statement choice and the type-directed initializer choice. The focused test reads this Chapter 17 block directly, so the analyzer evidence does not create a second grammar authority.

| Nonterminal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Lookahead | Conflict                                           | Resolution                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------- | ----------------------------------- |
| `name-statement`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `NAME`    | assignment versus routine call                     | `isWritableName` / `isCallableName` |
| `static-initializer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `(`       | record initializer versus parenthesized expression | `isInitializerForDeclaredType`      |
| No unexplained FIRST/FIRST or FIRST/FOLLOW conflict remains. The expression repetitions expand to right-recursive analysis rules while their semantic actions preserve the left association specified in Section 9.6. Unary and `not` recursion remains right-recursive by design. `or` is exclusively the Boolean operator. A same-line `else fail` is selected only after a complete name-led statement or local initializer, while `else` at the start of the following logical line remains an `if` clause. The newline makes those cases deterministic without backtracking. The completed source before `else fail` must be exactly one direct failable invocation. Other reported conflicts require their named predicate or an audited equivalent; a compiler must report a specification defect rather than change the language silently. |

The analyzer result checks the collected grammar's formal shape. It does not prove the static compatibility, lifetime, capacity, or flow rules consolidated in Chapter 18.

## 18. Static semantics

### 18.1 Compilation order

The compiler processes one logical compilation unit in token order across the ordered source parts from Section 4.3. Source-part metadata has no static meaning. Every use requires an earlier visible declaration, except that an exact forward routine signature makes that routine callable before its body. An ordinary header or earlier forward makes the routine's signature visible before its local prefix and body. At `EOF`, every forward must be completed and exactly one `main` definition satisfying Section 4.7 must exist.

Top-level declarations occur only in the compilation-unit sequence. Parameters occur only in routine headers. Local declarations form one contiguous prefix before the first statement. Record fields occur only inside their record declaration. Conditional and loop bodies contain statements and open no declaration scope.

### 18.2 Names and declaration classes

Identifiers use their complete case-sensitive source spelling as identity. Program and routine scopes have one ordinary namespace; record fields have one field scope per record type. No ordinary declaration overloads, redefines, or shadows another visible ordinary declaration with the same exact identity. Definition order never changes which declaration governs a later use. A suffix name uses the statically selected record type's field scope or the bounded-string `length` intrinsic.

Name-led parsing first resolves the visible binding, then checks its declaration class. A routine name starts a call. A mutable scalar or aggregate storage path starts an assignment. An aggregate constant starts a readable aggregate path but is rejected as a direct-root assignment target. A record type is valid only in a type position. A failable call is parsed as an ordinary call and then checked for exactly one failure consumer under Chapter 14. Failure to find a binding, finding the wrong class, or finding a later declaration is invalid source.

The standard service names and error constants from Chapter 16 are visible before source declarations. `main` is source-defined and must have no parameters and no result.

### 18.3 Types and compatibility

Every expression, storage path, symbol, parameter, local, field, and routine result has one static type. Scalar values have type `u8`, `u16`, or `boolean`. Records are nominal. Fixed-array identity consists of exact element type and length. Bounded-string identity consists of exact capacity.

Scalar compatibility permits exact type, a fitting exact integer literal or named constant, and implicit `u8`-to-`u16` widening. Checked `u8(...)` is the only `u16`-to-`u8` conversion. Boolean and integer types do not convert. Aggregate arguments, results, parameter bindings, and assignments require exact type identity. Aggregate assignment copies the complete value. Aggregate parameters are fixed aliases, while aggregate results are transient aliases that must be consumed immediately.

The compiler checks every operator, condition, assignment, argument, result, field, index, initializer, and failure code locally. A failable invocation supplies no ordinary expression value until its failure has been consumed under Chapter 14.

### 18.4 Storage and aliases

A program variable or aggregate constant owns program-lifetime storage. A scalar parameter or local owns one activation value. An aggregate parameter is a fixed typed alias established for the activation. A returned aggregate alias is transient and cannot establish a source binding. Alias binding is not assignment. A writable aggregate storage path may be an assignment destination, and an aggregate storage path or transient aggregate-alias result of the exact same type may be its source. Direct paths rooted at an aggregate constant are readable but not writable; aliases derived from them do not retain that marker. A routine-local declaration with aggregate type is invalid.

Field and checked-index selection preserve the root identity and exact selected type. A bounded-string index selects an existing writable `u8` byte when the index is below the string's current length; `.length` yields a read-only `u8` value. Every aggregate object and subobject has program lifetime, so a returned aggregate alias needs no separate lifetime metadata.

### 18.5 Constants, bounds, and initialization

Scalar named constants are top-level values with types inferred from restricted constant initializers. Boolean-valued constants retain type `boolean`; integer-valued constants remain exact at later uses. Aggregate constants have explicit record, fixed-array, or bounded-string types and complete static initializers. Constant evaluation may use literals, earlier scalar constants, admitted pure scalar operators, parentheses, and checked scalar conversions. It may not read storage or call a routine.

Array lengths and string capacities are positive constant values in the ranges set by Chapter 6. Constant fixed-array indices outside their domains are invalid. A bounded-string byte index is checked at runtime against the current logical length, even when the index expression is constant, unless the compiler proves the current length makes it safe at that program point.

Program variables use the zero or complete static initializer forms in Chapter 8. Aggregate constants require the same complete structured form. Scalar locals use zero, an ordinary compatible expression, or a direct compatible failable result followed by `else fail`. Structured aggregate initialization occurs only for top-level variables and aggregate constants. An aggregate assignment materializes a transient result when retention is required.

### 18.6 Routine and failure checking

A call must match the visible signature in arity and parameter order. Scalar arguments copy compatible values. Aggregate arguments bind aliases of the exact referent type. A forward declaration is the sole complete signature. Its abbreviated `sub NAME` body header must resolve to that exact incomplete forward, and the stored forward parameter names bind the body.

Every failable invocation has exactly one failure consumer. `else fail` requires a failable enclosing routine and is admitted only after a complete direct failable call in a scalar-local initializer, assignment right side, or call statement. Same-line `handle NAME` is admitted only after an eligible assignment or call statement and requires an existing writable `u8` destination that is not an active counted-loop counter. Failable invocations are invalid in returns, larger expressions, and argument lists.

A result-bearing routine is invalid if its closing `end` is reachable without `return expression` or, when it declares `fails`, `fail`. Structured fallthrough follows Section 13.7. Loops remain conservatively able to finish. `return` and `fail` do not fall through; a call with `else fail` may succeed and fall through.

### 18.7 Control contexts

An `if` or `elseif` condition and a `while` condition must be Boolean. A counted-loop counter must be a scalar local of type `u8` or `u16`. It is read-only to source statements while that loop is active and cannot be reused as a nested counted-loop counter. Its step is a nonzero signed compile-time constant. A provable counted-loop increment overflow remains valid source and traps only if execution reaches that increment. `exit` and `continue` require an enclosing loop and target the innermost one.

No label, goto, exception region, or hidden cleanup edge changes these contexts. The compiler may summarize active loops and fallthrough with bounded stacks, but capacity exhaustion must produce a diagnostic before it changes a target or validity result.

### 18.8 Invalid source and capacities

A grammar, visibility, declaration-class, type, lifetime, constant, flow, failure-consumption, or context violation makes the source invalid. The compiler issues a diagnostic and must not present an executable as a successful translation.

An implementation may bound complete source length, source-part count and metadata length, identifier length, symbols, types, fields, forwards, retained forward parameter-name bytes, parameters, scalar locals, expression depth, statement nesting, fixups, constants, structured-initializer depth and elements, emitted code size, total emitted image size, and other retained compile-time state. It must document every limit that can reject otherwise conforming source and issue a capacity diagnostic before truncation, wraparound, dropped state, or changed semantics. Those limits must still compile every complete accepted Chapter 21 program. Runtime activation capacity is separately implementation-defined, must accommodate the accepted corpus, and traps under Chapter 15 beyond any published activation-depth or activation-storage limit.

## 19. Runtime semantics

### 19.1 Startup and observable behaviour

Execution begins after the implementation has established every program variable's required initial value in declaration order. The environment then calls `main`. Observable behaviour consists of ordered system-service effects, object copies and mutations visible through source paths, normal termination, recoverable-error outcomes consumed by source, and required traps.

Normal return from `main` terminates successfully. Failure from `main` and a safety trap terminate unsuccessfully. The source language defines no other program-termination operation.

### 19.2 Evaluation and assignment

Expressions evaluate in the order specified by Section 9.11. Binary operands are left-to-right except for Boolean short-circuit suppression. Postfix suffixes apply left-to-right, and each index is checked when reached. Arguments evaluate left-to-right before a call begins.

Integer arithmetic uses the fixed widths and wraparound rules in Chapter 9. Comparisons use unsigned integer order or Boolean equality as applicable. Checked narrowing, division, indexing, and counted-loop increment perform their required checks before producing or storing a result.

Scalar assignment evaluates and checks the complete target path, then evaluates the right side, then converts and stores. Aggregate assignment evaluates its complete destination path first and its source second. It validates both complete extents before changing the destination, then copies exactly the byte representation of their common nominal type. Self-assignment has no effect. The type rules make two distinct same-type aggregate subobjects disjoint, so partial overlap cannot arise in Nucleus 0.1.

A failure or trap before a success-result store or aggregate copy leaves the destination unchanged, while effects already completed remain visible. A handled failable scalar assignment then stores its error code in the handler destination; if both destinations name the same scalar, that scalar receives the error code.

### 19.3 Objects and aliases

Program variables exist throughout execution. Each routine call creates a distinct logical activation containing copied scalar parameters, scalar locals, and aggregate-parameter bindings. Aggregate aliases denote existing program objects or aggregate subobjects and preserve identity. Mutation of a scalar leaf is visible through every path to that leaf.

Aggregate arguments and results transfer aliases, not object contents. A returned aggregate alias transiently denotes the original program-lifetime object after the callee activation ends. It may be discarded, forwarded, selected, passed onward, or consumed by aggregate assignment, but it cannot become a stored local binding. Aggregate assignment copies object contents into the destination referent and does not rebind either operand. Bounded-string byte mutation through any alias is visible through every alias to the same object; it replaces an existing byte without changing length or capacity. No runtime type tag accompanies an alias, and the source language provides no operation that inspects its carrier.

### 19.4 Calls, returns, and recursion

A call starts after all arguments have been evaluated and the activation-capacity check succeeds. Parameter binding precedes activation-local initialization. Scalar locals initialize in source order, and the first statement begins after the local prefix.

`return` transfers an optional success result and ends the activation. A result-free routine also returns successfully at its closing `end`. `return` is success-only: a caller propagates a failable value in an earlier local initializer or assignment, or propagates a result-free call as its own statement, before returning successfully. Direct and mutual recursion use the same rules and create distinct active state at each depth. Backend save regions, register files, stacks, and return encodings must preserve these semantics but are not source-visible.

### 19.5 Conditional and loop execution

An `if` chain tests conditions in source order until one is true, executes at most one body, and skips every later condition. A `while` tests before each iteration. A counted `for` evaluates its start and bound once, initializes the counter, tests before the first iteration, and uses the direction and inclusive or exclusive rule from Chapter 12.

Normal completion and `continue` in a counted loop use the increment-and-next-test path. `exit`, `return`, and `fail` can leave the body without running that path. Source statements cannot change the scalar-local counter while the loop is active. A counted-loop next value is tested mathematically before storage, preventing unsigned wrap from creating another iteration; a continuing value outside the counter type performs `loop-range` at runtime even when statically predictable.

### 19.6 Recoverable errors

A failable call returns success or one `u8` error code. On success, the ordinary result, if any, is transferred before surrounding evaluation continues. On failure, `else fail` returns the same code from the caller, while `handle NAME` performs no success-result store, stores the code, and executes its handler. No success result exists on the failure path.

Error propagation ends activations through ordinary return control. It performs no stack unwinding, source cleanup, or handler search. A trap bypasses this channel. Failure reaching the external caller of `main` becomes the `unhandled-error` trap.

### 19.7 System services and traps

The predefined services execute in call order and follow Chapter 16's initial-state, cursor, byte, success, and atomic-failure rules. Standard output appends. Bulk output overwrites below its end and appends at its end without insertion or truncation. Host buffering or target-specific calls may not reorder visible bytes or change a recoverable result into silent success.

A trap stops source execution at the failing operation. The environment reports the required reason and best available location. Earlier completed effects remain; no later source operation or source-level cleanup executes.

## 20. Feature ledger

### 20.1 Required Nucleus 0.1 language

The following mechanisms are required in the single Nucleus 0.1 language:

| Area         | Required forms and rules                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source       | Ordered multipart compilation input with stable part identities and part-relative diagnostics; flat ordered build manifest; ASCII-compatible bytes, `//` comments, logical newlines, case-sensitive preserved names, lowercase keywords, decimal, hexadecimal, and binary integers, byte characters, bounded string literals, fixed punctuation. |
| Structure    | One program scope and ordered declaration sequence across source parts, declaration before use, sole-signature forwards with abbreviated bodies, fixed `main()` entry, no executable top level.                                                                                                                                                  |
| Types        | `u8`, `u16`, `boolean`, nominal fixed records, checked fixed arrays, mutable bounded `string[N]` with current length and byte indexing, exact aggregate aliases, and exact-type aggregate value copying.                                                                                                                                         |
| Declarations | Inferred scalar constants, explicitly typed aggregate constants with read-only direct roots, compile-time assertions, program variables, complete positional recursive static initializers, record fields, formal parameters, contiguous scalar locals, routine definitions and forwards.                                                        |
| Expressions  | Calls, checked array and bounded-string indexing, field selection and string `.length`, explicit integer conversions, unary `+`/`-`, arithmetic including quotient and remainder, one comparison, `not`, `and`, `or`, and integer-only `xor`.                                                                                                    |
| Statements   | Scalar and exact-type aggregate assignment, name-led calls, `return`, `fail`, `exit`, and `continue`.                                                                                                                                                                                                                                            |
| Control      | Flat `if`/`elseif`/`else`, pre-test `while`, counted `for` over a read-only scalar-local counter with `to` or `until` and optional constant `step`.                                                                                                                                                                                              |
| Routines     | Formal arguments, named scalar locals, no result or one typed result, early return, direct and mutual recursion, and one complete forward signature whose parameter names bind its abbreviated body.                                                                                                                                             |
| Failure      | Explicit `fails`, `fail`, same-line `else fail`, and immediate `handle NAME ... end`; success-only `return` and required safety traps remain separate.                                                                                                                                                                                           |
| System       | Nucleus System Services 0.1 with deterministic initial cursors and output writes, normal entry return, unhandled-error termination, and stable trap reasons.                                                                                                                                                                                     |

No conforming compiler may expose a standard profile that omits one of these mechanisms.

### 20.2 Implementation-defined limits

An implementation selects and documents capacities, not syntax or semantics. Permitted limits include complete source length, source-part count and metadata length, identifier length, symbol and type counts, record fields, array and string storage capacity below a target's available resources, parameters, scalar locals, nesting, fixups, structured-initializer depth and elements, emitted code size, total emitted image size, simultaneous activation depth, and activation-storage consumption. Every limit must be high enough to compile and execute the complete accepted Chapter 21 programs under their stated inputs. A compile-time excess above that floor produces a capacity diagnostic; runtime activation-capacity excess above that floor traps at runtime.

Diagnostic wording, private compiler representations, generated-code organization, service transport, and the external presentation of status are implementation-defined where earlier chapters leave them to the Z80 runtime and backend contract. These choices must preserve the source rules.

### 20.3 Post-0.1 candidates

These forms are omitted from 0.1 and may be reconsidered only by a future language revision after measured admission:

The maintainer of this language specification owns source-language admission. The maintainer of the Z80 runtime and backend contract co-owns decisions that change the target representation or System Services interface.

| Candidate                                                               | Required decision evidence and owner                                                                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dense nonnegative selection                                             | Compiler cost versus emitted jump-table savings on representative programs; language-specification maintainer in a future revision.                                        |
| Routine-local aggregate objects or fixed local aggregate aliases        | Representative-program need, declaration and initialization rules, recursion effects, compiler-core cost, and activation cost; language maintainer.                        |
| Open arrays, slices, or capacity-erased string views                    | Source typing, multiword carrier, lifetime, call/result ABI, compiler and target-runtime cost; language and runtime-contract maintainers in a coordinated future revision. |
| Bounded-string growth, resize, append, and capacity-changing operations | Typed contract, alias effects, emitted cost, and reusable-program evidence; language-specification maintainer in a future revision.                                        |
| Additional system services                                              | Portable typed contract and complete compiler, runtime, and target cost; System Services maintainer in a future service revision.                                          |

These candidates are not provisional 0.1 syntax. Extensions may prototype them only under Section 1.7.

### 20.4 Excluded mechanisms

Nucleus 0.1 excludes language levels and compiler-selected profiles; modules, imports, namespaces, macros, and textual includes; raw pointers, address arithmetic, memory or port access, inline assembly, arbitrary machine-code calls, interrupt routines, vector declarations, source-visible bank selection, and unrestricted casts; enumeration, subrange, set, union, variant, overlaid, generic, heap, resizable, open-array, slice, and dynamic types; transitive immutability or const-qualified alias types, routine-local aggregate declarations, activation-lifetime owned aggregates, general aggregate expressions or constructors, partial or named-field initializers, destructuring, inferred variable declarations, nested routines, overloads, routine values, callbacks, indirect calls, parameter modes, and multiple results.

It also excludes assignment expressions, chained comparisons, conditional expressions, general expression statements, `call` and `then` keywords, `select`/`case`, pattern matching, repeat/do loops, `for in`, omitted counted-loop operands, counted-loop counters drawn from program variables or parameters, source assignment to an active counter, nested reuse of an active counter, labels, goto, labelled exit, exceptions, throw/catch, unwinding, destructors, `finally`, `defer`, resumable traps, and runtime type tags.

Implementation alternatives such as register allocation, helper organization, hardware-stack use, fixup representation, and physical calling convention are not source features. The Z80 runtime and backend contract records the selected target obligations, and project decisions use measurements without creating Nucleus dialects.

## 21. Conformance examples

### 21.1 Complete accepted program

This program exercises records, complete aggregate initializers, exact-type aggregate assignment, a checked fixed array, an aggregate alias parameter and result, scalar locals, a counted loop, a conditional chain, a call, and observable output:

```nucleus
record Cell
    value as u8
end

var template as Cell = (1)
var cells as Cell[4] = [(0), (0), (0), (0)]

sub cellAt(index as u8) as Cell
    return cells[index]
end

sub setCell(cell as Cell, value as u8)
    cell.value = value
end

sub main()
    var index as u8
    var code as u8

    for index = 0 until 4
        cells[index] = template
        setCell(template, index + 1)
    end

    cells[0].value = cellAt(0).value
    if cells[0].value = 1
        writeOutputByte('Y') handle code
            return
        end
    elseif cells[0].value = 0
        writeOutputByte('N') handle code
            return
        end
    end
end
```

Each aggregate assignment copies `template` into the selected array element before `template` is changed for the next iteration. The expected standard output is the byte for `Y`, provided the output service succeeds.

### 21.2 Recoverable error and propagation

```nucleus
const badByte = 10

sub checkedByte() as u8 fails
    var value as u8 = readInputByte() else fail
    if value = 0
        fail badByte
    end
    return value
end

sub emitByte() fails
    var value as u8 = checkedByte() else fail
    writeOutputByte(value) else fail
end

sub main() fails
    emitByte() else fail
end
```

For the minimum conformance-corpus run, standard input supplies byte `A` and the output service succeeds; the expected standard output is `A`. More generally, success copies one input byte to output. End of input or a service error propagates its standard code, a zero byte produces `badByte`, and any failure reaching `main` performs the `unhandled-error` trap with that code.

### 21.3 Recursion and control flow

```nucleus
forward sub odd(value as u16) as boolean

sub even(value as u16) as boolean
    if value = 0
        return true
    end
    return odd(value - 1)
end

sub odd
    if value = 0
        return false
    end
    return even(value - 1)
end

sub main()
    var index as u16
    var code as u8

    for index = 0 to 5
        if odd(index)
            continue
        elseif index = 4
            exit
        end
    end

    writeOutputByte(u8(index)) handle code
        return
    end
end
```

The program is valid and writes byte value 4 when the output service succeeds. The Chapter 21 conformance floor requires enough activation capacity for this execution; an implementation may perform `activation-capacity` only beyond its published, conformant limit.

### 21.4 Bounded-string aliasing and byte mutation

```nucleus
var text as string[4] = "A\0B"
var snapshot as string[4]

sub textAlias() as string[4]
    return text
end

sub mutate(value as string[4])
    value[1] = 'Z'
end

sub main() fails
    snapshot = textAlias()

    if snapshot.length = 3 and snapshot[1] = 0
        mutate(textAlias())
    end

    if text[1] = 'Z' and snapshot[1] = 0
        writeOutputByte('Y') else fail
    end
end
```

The literal's embedded zero is an ordinary byte, so its logical length is three. Assignment materializes `textAlias()` by copying it into the program-level `snapshot` object. Passing a second result directly to `mutate` forwards the transient alias without copying, so mutation changes `text` while `snapshot` retains its copied zero byte. The expected standard output is `Y`.

### 21.5 Result-free call propagation

```nucleus
sub emitMarker() fails
    writeOutputByte('R') else fail
end

sub relayMarker() fails
    emitMarker() else fail
    return
end

sub main() fails
    relayMarker() else fail
end
```

When output succeeds, `emitMarker` has no result, `relayMarker` returns successfully, and the expected standard output is `R`. An output failure propagates unchanged through both callers.

### 21.6 Same-destination error handling

```nucleus
const sampleFailure = 7

sub alwaysFails() as u8 fails
    fail sampleFailure
end

sub main() fails
    var code as u8

    code = alwaysFails() handle code
        writeOutputByte(code) else fail
        return
    end

    writeOutputByte(0) else fail
end
```

The failed assignment performs no success-result store and then stores `sampleFailure` in `code`, even though `code` is both destinations. The expected standard output is byte value 7.

### 21.7 Bulk-output cursor state

```nucleus
sub main() fails
    writeStorageByte('A') else fail
    writeStorageByte('B') else fail
    seekStorageOutput(0) else fail
    writeStorageByte('Z') else fail
end
```

The conformance output begins empty with its cursor at zero. The first two calls append `AB`; the seek returns to zero; the final call overwrites the first byte without inserting or truncating. The expected bulk output is `ZB`, with its cursor at offset one.

### 21.8 Runtime loop-range reachability

```nucleus
sub main()
    var index as u8

    for index = 250 to 300 step 10
        exit
    end
end
```

This program is valid and terminates normally with `index` equal to 250. Without the `exit`, the first increment would store 260 if it fit and the loop would continue, so execution would perform `loop-range`; the compiler must not reject the source merely because it can prove that possible runtime path.

### 21.9 Specified trap cases

Each listing below is valid source. The external conformance harness supplies the stated standard-input byte and observes the trap report.

```nucleus
var bytes as u8[2]

sub main() fails
    var index as u8 = readInputByte() else fail
    bytes[index] = 1
end
```

With input byte 2, the required result is `bounds` before the store.

```nucleus
sub divide(value as u16, divisor as u16) as u16
    return value / divisor
end

sub main() fails
    var divisor as u16 = readInputByte() else fail
    var result as u16 = divide(8, divisor)
end
```

With input byte zero, the required result is `division-by-zero`.

```nucleus
sub remainder(value as u16, divisor as u16) as u16
    return value mod divisor
end

sub main() fails
    var divisor as u16 = readInputByte() else fail
    var result as u16 = remainder(8, divisor)
end
```

With input byte zero, the required result is likewise `division-by-zero` at `mod`.

### 21.10 Complete rejected programs

Each program is rejected for the stated independent reason.

Failable call without consumption:

```nucleus
sub readOne() as u8 fails
    var value as u8 = readInputByte() else fail
    return value
end

sub main()
    var value as u8
    value = readOne()
end
```

Aggregate assignment between different nominal types:

```nucleus
record LeftCell
    value as u8
end

record RightCell
    value as u8
end

var left as LeftCell
var right as RightCell

sub main()
    left = right
end
```

Incomplete structured initializer:

```nucleus
record Color
    red as u8
    green as u8
    blue as u8
end

var color as Color = (1, 2)

sub main()
end
```

Aggregate local declaration:

```nucleus
record Cell
    value as u8
end

var cell as Cell

sub cellAlias() as Cell
    return cell
end

sub main()
    var held as Cell = cellAlias()
end
```

Every local must be scalar. A valid materializing form declares `held` as a program variable and assigns `cellAlias()` to it inside a routine.

Value routine with a reachable end:

```nucleus
sub choose(flag as boolean) as u8
    if flag
        return 1
    end
end

sub main()
end
```

Later declaration used before a forward signature:

```nucleus
sub main()
    later()
end

sub later()
end
```

Wrong entry signature:

```nucleus
sub main(argument as u8)
end
```

Assignment to an active counted-loop counter:

```nucleus
sub main()
    var index as u8

    for index = 0 until 4
        index = index + 1
    end
end
```

The counter is a valid scalar local, but it is read-only while its loop is active. A program variable or parameter used as the counter, or reuse of `index` by a nested counted loop, is independently invalid.

Exact integer constant outside the expected range at its use:

```nucleus
const Big = 300
var x as u8

sub main()
    x = Big
end
```

The constant declaration is valid. The assignment is invalid at the use of `Big` because 300 does not fit the destination's expected `u8` type.

Hexadecimal overflow:

```nucleus
const value = $10000

sub main()
end
```

Binary overflow:

```nucleus
const value = %10000000000000000

sub main()
end
```

Both programs fail lexically at the literal prefix. A hexadecimal literal has at most four digits, and a binary literal has at most sixteen.

### 21.11 Multipart input presentation

The conformance harness must also present the complete accepted program in Section 21.1 as at least two ordered source parts. It splits the program after a delimiter-depth-zero logical newline, assigns a distinct stable identity to each part, and otherwise preserves every source byte and the declared order. The expected output remains `Y`.

For the diagnostic case, the harness introduces an undeclared name in the second part. The compiler diagnostic must identify the second part's stable identity and the position of that name within the part. A separate run may use different physical files or transport chunks, but those changes must not alter tokens, declaration visibility, validity, or program behaviour.

The harness must also construct the same ordered parts from this flat manifest, using one selected base directory:

```text
model.nu

main.nu
```

It emits `model.nu` first and `main.nu` second. The blank line adds no part. The manifest text is not presented to the Nucleus tokenizer, and diagnostics for the second part use `main.nu` as its diagnostic name.

### 21.12 Case-sensitive names and forward parameters

This complete program uses three distinct case variants and a forward parameter binding:

```nucleus
forward sub render(Player as u8) as u8

var player as u8 = 1
var PLAYER as u8 = 2

sub render
    return Player + player + PLAYER
end

sub main() fails
    writeOutputByte(render(3)) else fail
end
```

The expected standard output is byte value 6. The lowercase keywords are recognized as keywords; `Player`, `player`, and `PLAYER` are distinct identifiers. The abbreviated body obtains `Player` from the forward signature.

Changing the body header to `sub Render` makes the program invalid because no incomplete forward named `Render` exists. Writing `SUB render` is also invalid: `SUB` is a `NAME`, not the keyword `sub`.

### 21.13 Caller-supplied aggregate destination

This program copies and changes a record through aggregate parameters without declaring aggregate storage inside the routine:

```nucleus
record Counter
    value as u8
end

var source as Counter = (1)
var destination as Counter

sub copyAndIncrement(input as Counter, output as Counter)
    output = input
    output.value = output.value + 1
end

sub main() fails
    copyAndIncrement(source, destination)
    if source.value = 1 and destination.value = 2
        writeOutputByte('Y') else fail
    end
end
```

`input` and `output` are fixed aliases to caller storage. Complete assignment copies `source` into `destination`, after which the scalar-field assignment changes only `destination`. The expected standard output is `Y`.

### 21.14 Aggregate selection and forwarding

This program returns and forwards an alias to one selected array element:

```nucleus
record Sample
    value as u8
end

var samples as Sample[2] = [(3), (7)]

sub select(items as Sample[2], index as u8) as Sample
    return items[index]
end

sub forwardSelection(items as Sample[2], index as u8) as Sample
    return select(items, index)
end

sub replace(item as Sample, value as u8)
    item.value = value
end

sub main() fails
    replace(forwardSelection(samples, 1), 9)
    if samples[1].value = 9
        writeOutputByte('Y') else fail
    end
end
```

Both result-bearing routines transfer transient aliases to storage inside `samples`. `replace` receives the forwarded alias and mutates the selected original object without an aggregate copy. The expected standard output is `Y`.

### 21.15 Inferred constant types

This program uses one exact integer constant in both integer widths and retains a separate Boolean constant:

```nucleus
const sharedValue = 200
const enabled = true
var byteUse as u8 = sharedValue
var wordUse as u16 = sharedValue

sub main() fails
    if enabled and byteUse = 200 and wordUse = 200
        writeOutputByte('Y') else fail
    end
end
```

`sharedValue` adopts `u8` for `byteUse` and `u16` for `wordUse`. `enabled` has type `boolean`. The expected standard output is `Y`.

### 21.16 Integer literal spellings

This program exercises hexadecimal and binary literals at ordinary and maximum word values:

```nucleus
const hexMask = $FF
const binaryMask = %10110000
const hexMaximum = $ffff
const binaryMaximum = %1111111111111111

sub main() fails
    if hexMask = 255 and binaryMask = 176 and hexMaximum = 65535 and binaryMaximum = 65535
        writeOutputByte(binaryMask) else fail
    end
end
```

All three literal spellings produce the same exact integer category. The expected standard output is byte value 176.

### 21.17 Integer exclusive OR

This program exercises constant and runtime `xor` at both integer widths. It also distinguishes left association at the shared `or` and `xor` precedence level:

```nucleus
const folded = 3 xor 1 or 1
var byteValue as u8 = $a5
var wordValue as u16 = $f0f0

sub main() fails
    byteValue = byteValue xor $ff
    wordValue = wordValue xor $ffff
    if folded = 3 and byteValue = $5a and wordValue = $0f0f
        writeOutputByte(byteValue) else fail
    end
end
```

The expected standard output is byte value 90.

Boolean operands are invalid:

```nucleus
sub main()
    if true xor false
    end
end
```

The second program is rejected at `xor` because exclusive OR is integer-only.

### 21.18 Integer remainder

This program exercises constant and runtime `mod` at both integer widths:

```nucleus
const folded = 100 mod 7
var byteValue as u8 = 250
var wordValue as u16 = 1000

sub main() fails
    byteValue = byteValue mod 16
    wordValue = wordValue mod 256
    if folded = 2 and byteValue = 10 and wordValue = 232
        writeOutputByte(byteValue) else fail
    end
end
```

The expected standard output is byte value 10.

A constant zero divisor is invalid:

```nucleus
const bad = 1 mod 0

sub main()
end
```

The second program is rejected at the zero divisor with the same division-by-zero diagnostic used by `/ 0`.

### 21.19 Compile-time assertions

This program states and uses a relationship between two earlier constants:

```nucleus
const Rows = 8
const Columns = 16
assert Rows * Columns = 128

sub main() fails
    writeOutputByte(Rows * Columns) else fail
end
```

The assertion is true, emits no target code, and the expected standard output is byte value 128.

A false assertion is invalid:

```nucleus
const Rows = 17
assert Rows <= 16

sub main()
end
```

The second program is rejected at `assert` with an assertion-failed diagnostic.

The assertion expression must be Boolean-valued:

```nucleus
const Rows = 8
assert Rows

sub main()
end
```

The third program is rejected at `assert` because an exact integer is not a Boolean condition.

### 21.20 Aggregate constants

This program reads record, array, and bounded-string constants, copies a constant into mutable storage, and deliberately demonstrates the non-transitive alias rule:

```nucleus
record Pair
    left as u8
    right as u16
end

const Origin as Pair = (7, 300)
const Values as u8[3] = [1, 2, 3]
const Text as string[3] = "A\0B"
var target as Pair

sub mutate(item as Pair)
    item.left = 9
end

sub main() fails
    target = Origin
    if target.left = 7 and Values[1] = 2 and Text.length = 3 and Text[2] = 'B'
        mutate(Origin)
        if Origin.left = 9 and target.left = 7
            writeOutputByte('Y') else fail
        end
    end
end
```

The direct named roots are readable aggregate sources. `target = Origin` copies the complete value. Passing `Origin` to `mutate` loses the direct-root read-only marker, so the mutation is permitted; this conformance execution uses writable proof storage and therefore observes the change. Portable programs do not depend on that mutation when a target places constants in physical read-only memory. The expected standard output is `Y`.

A direct constant-rooted assignment is invalid:

```nucleus
record Pair
    value as u8
end

const Origin as Pair = (1)

sub main()
    Origin.value = 2
end
```

The second program is rejected at `Origin`. The same rule rejects assignment to the whole constant, an array element, or a bounded-string byte reached directly from its constant name.
