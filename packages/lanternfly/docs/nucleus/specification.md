# Nucleus 0.1 Language Specification

## Planned contents

1. [Status and conformance](#1-status-and-conformance)
2. [Design constraints](#2-design-constraints)
3. [Source text and lexical rules](#3-source-text-and-lexical-rules)
4. [Program and file structure](#4-program-and-file-structure)
5. [Names and scopes](#5-names-and-scopes)
6. [Types](#6-types)
7. [Storage, values, and lifetime](#7-storage-values-and-lifetime)
8. [Constants and declarations](#8-constants-and-declarations)
9. Expressions
10. Statements
11. Conditional control
12. Loop control
13. Routines and calls
14. Recoverable errors
15. Safety failures and traps
16. System boundary
17. Complete grammar
18. Static semantics
19. Runtime semantics
20. Feature ledger
21. Conformance examples

## 1. Status and conformance

### 1.1 Status

This specification is a working draft. Nucleus 0.1 has not been frozen or released as a standard, and later revisions may change rules recorded here. Several planned chapters are still unwritten, so this revision does not yet support a complete conformance determination.

The language under design is named **Nucleus 0.1**. "V2" was a working label for an architecture paper and is not the public language name. Nucleus is not a Lanternfly or Candlemoth bootstrap level. It has one source language: no Level Zero, Level One, selectable language profiles, or compiler-selected subsets of standard syntax exist.

### 1.2 Scope

This specification defines the source-language syntax, static semantics, runtime semantics, required diagnostics, and specified safety failures of Nucleus 0.1. It defines the conditions for a source program or compiler to claim Nucleus 0.1 conformance.

The separate Nucleus VM Specification defines the bytecode instruction set, encoding, and virtual-machine execution rules. Non-normative implementation plans and design papers record compiler strategies and project constraints; they do not add source-language semantics.

The first implementation is a handwritten Z80 compiler. Project acceptance requires its compiler core and required immutable constants to fit in one 16 KiB bank, while its VM or interpreter has a separate budget. That gate does not create a smaller Nucleus dialect or alter the meaning of a conforming program. Chapter 2 and the implementation plan carry the detailed budget rules.

### 1.3 Authority

When repository materials disagree, apply this order:

1. This specification governs Nucleus 0.1 source syntax and semantics.
2. The Nucleus VM Specification governs bytecode and VM execution. It cannot change the meaning required by this specification.
3. The implementation plan is non-normative. It records construction order, budgets, measurements, and implementation choices.
4. Architecture and design-rationale papers, including the paper formerly labelled V2, explain decisions but do not override either specification.
5. Conformance tests provide evidence that an implementation follows the specifications. A conflicting test is a test defect, not a language amendment.
6. Lanternfly documentation and materials from the earlier experiment that will be archived as Old Nucleus provide non-normative provenance and development history.

An unwritten rule cannot be supplied by a lower-ranked document. Until this specification states the rule, the point remains unresolved for Nucleus 0.1 conformance.

### 1.4 Normative words

This specification uses four requirement words:

| Word         | Meaning                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| **must**     | The rule is required for conformance.                                                                            |
| **must not** | The described form or behaviour is prohibited.                                                                   |
| **may**      | The form or implementation choice is permitted but not required.                                                 |
| **should**   | The rule is recommended. A departure needs a documented reason and must not violate a `must` or `must not` rule. |

Declarative syntax and semantic rules are normative even when they contain none of these words. Notes, rationale, examples, implementation sketches, and historical remarks are non-normative unless they explicitly state a rule.

### 1.5 Conforming source programs

A conforming Nucleus 0.1 source program:

- uses only syntax and features admitted by this specification;
- satisfies the complete grammar and all applicable static-semantic rules;
- depends only on specified behaviour or on a choice that this specification explicitly marks as implementation-defined;
- does not depend on an extension or an unadmitted design candidate.

Exceeding one compiler's documented capacity does not affect a program's language conformance. The compiler may reject the program with a capacity diagnostic; that diagnostic reports an implementation limit rather than a source-language violation.

Because the grammar and semantic chapters are not yet complete, no program can use this revision alone to establish full Nucleus 0.1 conformance. Rules already stated in completed chapters still govern their subjects.

### 1.6 Conforming compilers

A compiler claiming Nucleus 0.1 conformance must:

- accept and translate every conforming source program within its documented capacity limits;
- preserve the specified observable results, side effects, and runtime traps of each accepted program;
- issue a diagnostic for compile-time invalid source rather than silently translating it with another meaning;
- issue a diagnostic when a documented capacity limit prevents translation;
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

### 1.11 VM and native backends

A compiler that emits Nucleus bytecode must preserve this specification's source semantics and satisfy the separate VM Specification for the bytecode it emits. The VM Specification governs the execution mechanism; this specification governs the source-language meaning.

A compiler using a later native backend may emit Z80 or another target directly. It need not retain or serialize bytecode, but it must preserve the same source semantics, diagnostics, and specified traps. Adding a backend does not create another Nucleus language profile.

### 1.12 Provenance and non-requirements

Nucleus inherits selected syntax and design ideas from Lanternfly. Lanternfly documentation is not normative for Nucleus, and Lanternfly behaviour does not fill a gap in this specification.

This working draft makes no claim that the language definition is complete. It does not require the first compiler to be written in Nucleus or compile its own source. It also does not require every conforming compiler to use the project's initial VM path.

## 2. Design constraints

### 2.1 Scope

This chapter records three kinds of constraint: properties preserved by the Nucleus 0.1 language design, acceptance gates for the first handwritten Z80 compiler, and evidence required before a provisional feature enters the language. Later chapters define the source language and its semantics. The separate Nucleus VM Specification defines the bytecode machine.

The implementation gates in this chapter apply to the first compiler project. They are not language-conformance requirements for every Nucleus compiler. A compiler may conform to Nucleus 0.1 on another host without using Z80 code, banked memory, or the same internal architecture.

Nucleus 0.1 is one language. Measurements may change the draft before it is frozen, but they do not create language levels, implementation-selected syntax profiles, or optional dialects. Each candidate is either admitted to the single language or omitted.

### 2.2 Language-shaping constraints

Nucleus remains a safe, practical language for routine TEC-1 programs. Its minimum programming model includes `u8`, `u16`, and Boolean values; formal arguments; named local variables; routines with no result or one typed result; fixed-layout records; checked fixed arrays; bounded strings or views; assignment and calls; `if`/`elseif`/`else`; `while`; counted `for`; `return`; and the unlabeled, innermost-loop forms of `exit` and `continue`. Silently removing one of these requirements does not make an oversized compiler acceptable. If a faithful implementation cannot fit, that result requires compiler-architecture redesign or rejection of the architecture hypothesis.

The language design uses deterministic parsing with canonical forms, minimal lookahead, and no backtracking. A smaller production count is useful only when it preserves the required programming model. Grammar terseness is not an independent design goal.

A conforming compiler must perform every source-safety check for which compilation provides sufficient information. Safety conditions that depend on runtime values must produce defined traps. Source code has no raw pointer arithmetic or unchecked reinterpretation. Later chapters define the checks, traps, and source types.

Every implementation capacity must have an explicit limit and a diagnostic for excess. Exhausting a symbol table, input limit, nesting limit, or other bounded resource must not alter program meaning or produce silently incorrect output.

### 2.3 Compiler-core gate

Project acceptance requires the first compiler's executable core and every immutable table or constant required while compiling to fit together in one 16 KiB bank. Placing required code or immutable data in another bank does not satisfy this gate.

For each tested configuration, the compiler-core total includes the front end, the active emitter, and all immutable data that either component requires. A mutually exclusive native or later backend may have a separate total. The report identifies the resident configuration and includes every shared or required component.

The first implementation may use a CP/M-like 64 KiB address-space model as its initial abstraction. This model does not bind Nucleus source semantics to a particular TEC-1 memory map. TEC-1 banking motivates the one-bank compiler-core gate; additional banks may hold separately budgeted components, but they are not a fallback for an oversized core.

### 2.4 Separate resource accounts

Resources outside the compiler-core gate may use other RAM or banks where the platform permits, but they remain bounded, measured, and reported. Separate accounting does not make a resource free or unlimited.

| Account                     | Required report                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Compiler core               | Executable code and required immutable data for the tested front end and active emitter, measured against the 16 KiB gate. |
| Writable compiler workspace | Peak live bytes, including lexical, parsing, name, type, lowering, diagnostic, and emission state.                         |
| Generated output            | Emitted bytecode or native program bytes, separate from compiler storage.                                                  |
| VM/interpreter              | Executable code, immutable data, writable state, and relevant execution cost.                                              |
| Native or later backend     | A separate total for each mutually exclusive configuration, including its required constants and workspace.                |
| Execution                   | A stated measure, such as instruction count or cycles, for representative emitted programs.                                |

Project accounting counts each shared component once and assigns it to an identified account. Reports distinguish resident components, overlays, and mutually exclusive configurations. Peak workspace is the maximum simultaneously live storage, not the sum of buffers whose lifetimes do not overlap.

### 2.5 Streaming compilation model

Bulk storage may be available but slow. The primary bytecode path consumes one logical source stream and emits one logical bytecode stream. A platform may materialize either stream in external storage. Multiple source files and imports do not require the compiler to retain the whole program in memory.

The first compiler is handwritten Z80 and uses streaming, single-pass compilation wherever the language semantics permit it. Declarations precede use. An explicit forward routine signature supplies the necessary exception without requiring a later whole-program pass.

The architecture excludes an abstract syntax tree, global type inference, whole-program optimization, and unbounded buffering from the first compiler. The compiler may retain bounded state required for declarations, scopes, forward signatures, control-flow fixups, and emission, provided each capacity is explicit and measured.

### 2.6 Semantic operations and the VM boundary

Compiler simplicity has priority over VM execution speed. The primary target is a regular vocabulary of checked semantic operations serialized as compact bytecode. Target-specific irregularity belongs in the separately budgeted VM or a later backend only when measurement shows that placement reduces total front-end machinery.

Structured control lowers to ordinary semantic operations; no dedicated high-level control opcode is required. The bytecode front end initially performs no Z80 register allocation, native instruction selection, branch shortening, relocation planning, native calling-convention analysis, or peephole optimization. A later direct-Z80 backend may consume the same semantic operations as they are produced. Its independent measurement covers code, constants, workspace, output, and execution cost.

VM organization remains an experimental choice. The current hypothesis favors a memory-backed virtual-register file with explicit stacks or save regions where nesting and re-entry require them. This is neither a source-global register model nor a settled pure operand-stack design. This chapter fixes no virtual-register count, page layout, slot width, or opcode encoding.

### 2.7 System boundary and portability

The initial system boundary contains only services that the compiler and VM demonstrably require: input, output, termination, trap reporting, and bulk-storage access. Each additional service requires measured need.

The semantic-operation boundary may support later native or non-Z80 backends where target neutrality has no material cost against the TEC-1 constraints. Portability does not justify growth that causes the first compiler to fail its core gate.

### 2.8 Evidence and feature admission

Project reports assign every size, storage, or performance claim one of these evidence classes:

- **Measured:** obtained from an identified build or run with the method recorded.
- **Projected:** calculated from measured components under stated assumptions.
- **Hypothesis:** an expectation not yet tested by an implementation.

A candidate's admission record reports its incremental compiler-core code, required immutable data, peak writable workspace, VM or backend cost, effect on emitted programs, and total-system trade. Source-line count, host executable size, and an opcode sketch are not substitutes for target measurements. Before Nucleus 0.1 is frozen, the project either admits the candidate to the one normative language or omits it.

Recoverable error handling remains a strong candidate. Project acceptance requires a measured attempt to include it before the project decides whether to admit or omit it. This status does not admit general exceptions, stack unwinding, destructors, `finally`, or `defer`. If recoverable errors are admitted, Chapter 14 defines their semantics.

Recursion may be staged while the project measures activation storage, re-entry state, depth limits, and failure behavior. Staging does not impose a permanent language prohibition. The frozen Nucleus 0.1 specification will state the final decision.

### 2.9 Decision boundary and failure conditions

An architecture decision requires measurements from an identified compiler configuration and representative accepted and rejected source. The report includes the complete compiler-core total, immutable-data contribution, peak writable workspace, VM or backend totals, emitted-program size, execution cost under a stated method, capacity limits, and diagnostics produced when those limits are exceeded. Candidate comparisons use equivalent source semantics and accounting boundaries.

The decision record labels every value as Measured, Projected, or Hypothesis and states the assumptions behind projections. Unmeasured values remain open rather than being replaced with invented byte estimates.

The first implementation is not required to compile itself. The project may evaluate self-hosting only after measurements show that the handwritten compiler satisfies its budget and conformance goals. Failure to preserve the minimum programming model, diagnose bounded-resource exhaustion, or keep required compiler code and constants within the one-bank gate rejects the tested architecture; it does not justify a weaker, unnamed language profile.

## 3. Source text and lexical rules

### 3.1 Scope

This chapter defines how a Nucleus source byte stream becomes a token stream. It defines source bytes, line endings, whitespace, comments, names, reserved words, literals, punctuation, source positions, and lexical errors. Later chapters define grammar, name resolution, types, expression precedence, and runtime meaning.

The rules are deterministic and require no backtracking. Rules stated for source text, token identity, or lexical errors apply to every conforming compiler. Project acceptance requires the first compiler to consume the source in order with bounded state and without retaining a complete source copy. This is a Chapter 2 project constraint, not a required internal organization for another compiler. Another compiler may organize tokenization differently, but it must produce the same tokens. One byte of lookahead is sufficient for every token rule in this chapter.

Nucleus inherits several spellings from Lanternfly, but Lanternfly documentation and the current Candlemoth tokenizer are evidence rather than authority. Rules in this chapter become Nucleus rules only when this chapter states them. Provisional rules are marked explicitly.

### 3.2 Source bytes

A Nucleus source file is a sequence of bytes in an ASCII-compatible encoding. The accepted source-byte repertoire is:

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

Diagnostics must identify a reproducible source position. Each token has a half-open byte span in the original stream and a one-based line and byte column for the span's start. Each lexical error identifies:

- a zero-based byte offset in the original byte stream;
- a one-based line number; and
- a one-based byte column within that line.

When CRLF produces `NEWLINE`, its two bytes occupy one token span, advance the byte offset by two, and advance the line number once. A synthesized final `NEWLINE` has a zero-width span at EOF. A horizontal tab advances the byte column by one; the column is not a display-cell count. These counters permit streaming diagnostics without a resident source map. An implementation that bounds a counter or source length must publish the limit and diagnose overflow.

### 3.4 Whitespace, comments, and logical newlines

ASCII space and horizontal tab are the only horizontal whitespace. They separate tokens where separation is needed and are otherwise ignored. Indentation has no syntactic meaning. Whitespace never joins adjacent names, numbers, or literals into one token.

`//` begins the one ordinary comment form. It is recognized outside character and string literals and consumes bytes up to, but not including, the next physical line ending or EOF. The comment produces no token. A line comment at EOF is complete; it does not require a closing marker. Nucleus 0.1 has no block, nested, or documentation comments.

A logical newline is the only statement terminator. Nucleus has no semicolon terminator and no second interchangeable terminator.

Delimiter state tracks open parentheses and square brackets. A physical line ending produces `NEWLINE` only when no delimiter is open. Inside either delimiter, a physical line ending is whitespace and produces no token. Parentheses and brackets inside a comment or literal do not affect this state. The first compiler represents it with a bounded stack; another compiler may use a different representation.

This is a tokenizer-parser interface rule rather than statement grammar: the tokenizer emits `NEWLINE` under this rule, while later chapters specify which grammar positions accept it. Delimiter state must distinguish `(` from `[`. A closing delimiter with no matching opener, a mismatched closing delimiter, an open delimiter at EOF, or implementation-capacity exhaustion is diagnosed.

Blank and comment-only physical lines produce no `NEWLINE`. Consecutive physical line endings therefore cannot create empty statements. After any token on a delimiter-depth-zero line, its physical line ending produces one `NEWLINE`. If EOF follows such a line without a physical line ending, the tokenizer emits one final `NEWLINE` before `EOF`. EOF following an empty or comment-only final line produces only `EOF`.

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

Identifier and reserved-word comparison is ASCII case-insensitive. The tokenizer folds `A` through `Z` to `a` through `z` and leaves every other accepted byte unchanged. No locale participates, and spelling case does not create a distinct name.

The complete folded identifier is its identity. An implementation must not truncate a spelling, compare only a prefix, or treat an unchecked hash match as equality. It may use hashes to locate candidates only if it resolves collisions by exact comparison. An implementation may impose a maximum identifier length and a maximum number of retained names. It must publish each limit, and exceeding one is a capacity diagnostic.

After scanning the longest identifier, the tokenizer compares its folded spelling with a fixed reserved-word table. A longer name is never split at a keyword boundary: `elseifReady` is one `NAME`, not `ELSEIF NAME`.

The current Nucleus 0.1 reserved words are:

```text
as       boolean  const     continue  else     elseif
end      exit     false     for       forward  if
record   return   step      string    sub      to
true     u16      u8        until     var      while
```

`elseif` is one keyword. `else if` produces the two tokens `ELSE` and `IF` and does not form an `ELSEIF` clause. Case folding means that `ELSEIF` and `elseif` produce the same token.

When explicitly selected for measurement under Section 1.10, the recoverable-error candidate uses these four reserved words:

```text
error    fail     fails     on
```

These words are not yet part of the standard reserved-word table, and their prototype reservation does not admit recoverable-error syntax. If Chapter 14 admits the candidate, the words enter the standard table; if it omits the candidate, they remain identifiers.

This chapter does not reserve `call`. If Chapter 13 adopts a `call` keyword, that choice requires an amendment to this table; until then, `call` is an identifier.

The current Candlemoth tokenizer supplies evidence for ASCII case folding and bounded name scanning, but two implementation shortcuts are not Nucleus rules. It accepts `_` as a first byte because one class represents both name-start and name-continuation characters, and it can silently conflate two names whose hash pairs collide. A compiler claiming Nucleus conformance must enforce the spelling above and exact folded identity.

### 3.6 Numeric literals

Nucleus admits unsigned decimal integer literals. When explicitly selected for measurement under Section 1.10, the provisional hexadecimal candidate adds the `$` form:

```text
decimal-literal     ::= decimal-digit+
hexadecimal-literal ::= "$" hexadecimal-digit+
integer-literal     ::= decimal-literal
                      | hexadecimal-literal  (* provisional *)
```

Hexadecimal digits are `0` through `9`, `A` through `F`, and `a` through `f`. The `$` prefix is a provisional recommendation because hexadecimal directly represents byte and word values on the target system. It is not yet standard Nucleus 0.1 syntax. The tokenizer measurement reports its incremental code and table cost under Sections 2.3 and 2.8 before the freeze decision.

Until admission, every `$` rule and example in this chapter applies only when the hexadecimal candidate is selected explicitly for measurement. Standard mode diagnoses its use as an unadmitted extension under Section 1.7.

The tokenizer computes an exact unsigned value from zero through 65,535. A literal whose value exceeds 65,535 is a lexical error. Later type checking decides whether the value fits its context, including `u8`, `u16`, an array bound, or a counted-loop parameter.

A leading `+` or `-` is a separate punctuation token and is never part of the literal. Thus `-32768` begins with `-` followed by the literal `32768`; expression and constant rules determine whether that combination is valid.

A hexadecimal literal has at least one digit after `$`. A letter or underscore immediately following a decimal literal, or a non-hexadecimal name character immediately following a hexadecimal literal, makes the numeric token malformed instead of beginning an adjacent identifier. This rejects forms such as `0x2a`, `$2g`, and `12u8` with one diagnostic.

Binary, octal, and floating-point literals are absent. Numeric separators, exponent notation, decimal points, and type suffixes are absent. In particular, `%1010`, `1_000`, `1.0`, and `42u8` are not alternative integer spellings.

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

The token records decoded bytes. Later chapters determine which character or bounded-string contexts accept those bytes and whether a particular representation excludes zero. The tokenizer does not infer a string capacity or type from a literal.

Nucleus 0.1 has no interpolated, raw, or multiline literal family. It has no Unicode escape or encoding conversion. Adjacent string literals remain separate tokens; the tokenizer does not concatenate them.

An implementation may impose a maximum decoded literal length. It must publish the limit and diagnose an excess before discarding, wrapping, or truncating any byte.

### 3.8 Operators, punctuation, and delimiters

The tokenizer recognizes these punctuation tokens:

| Spelling | Token or use                                         |
| -------- | ---------------------------------------------------- |
| `(` `)`  | grouping, calls, and declarations                    |
| `[` `]`  | array types and indexing                             |
| `,`      | item and argument separator                          |
| `.`      | record-field selection                               |
| `+` `-`  | arithmetic punctuation; also unary punctuation       |
| `*` `/`  | arithmetic punctuation                               |
| `=`      | assignment or equality, according to grammar context |
| `<>`     | not equal                                            |
| `<` `<=` | less-than comparisons                                |
| `>` `>=` | greater-than comparisons                             |

Chapter 9 defines which expression operators are admitted, their operand types, precedence, and associativity. Listing a punctuation token here defines its formation, not every grammar position in which it is valid.

At each punctuation start, the tokenizer uses deterministic longest match. It recognizes `//` before `/`, and `<>`, `<=`, and `>=` before their one-character prefixes. No other two-character punctuation token is formed. `!=` and `==` are not comparison spellings.

Braces, colon, semicolon, question mark, hash, at sign, and backtick have no token in this draft. A source byte that begins no name, number, literal, comment, whitespace, line ending, or listed punctuation token is a lexical error. Nucleus 0.1 has no lexical preprocessor directive or macro form.

### 3.9 Token contract

The tokenizer emits the following token categories. The parser must not depend on the token's original case.

| Category    | Payload                                                       |
| ----------- | ------------------------------------------------------------- |
| `NAME`      | exact folded identifier identity and source span              |
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

identifier         ::= ascii-letter
                       (ascii-letter | decimal-digit | "_")*
integer-literal    ::= decimal-digit+
                     | "$" hexadecimal-digit+  (* provisional *)
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
| `ELSEIF`                   | one `ELSEIF` keyword                          |
| `elseifReady`              | one `NAME`                                    |
| `else if`                  | `ELSE IF`; not an `ELSEIF` clause             |
| `42`                       | `NUMBER(42)`                                  |
| `$2a`                      | provisional hexadecimal: `NUMBER(42)`         |
| `-42`                      | `- NUMBER(42)`                                |
| `$`                        | provisional hexadecimal: malformed number     |
| `0x2a`                     | malformed-number diagnostic                   |
| `%00101010`                | lexical error; binary literals are absent     |
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

### 3.12 Decisions still required before 0.1 freeze

Four lexical questions remain narrow and explicit:

1. **Recoverable-error words.** If Chapter 14 admits the candidate under Section 1.10, `fail`, `fails`, `on`, and `error` enter the standard reserved-word table. If Chapter 14 omits it, the four words remain identifiers.
2. **Word operators.** The Chapter 9 operator inventory determines whether words such as `not`, `and`, `or`, or `mod` enter the reserved-word table. Each admitted word becomes a fixed reserved word; an omitted word remains an identifier. This chapter does not assign operator meaning in advance.
3. **Conditional header marker.** The Chapter 11 grammar decision is whether `if` and `elseif` headers require `then` before `NEWLINE`. `then` is not reserved in the current table. Admitting it requires one keyword-table entry and a corresponding grammar token.
4. **Hexadecimal prefix.** The measurement under Sections 2.3 and 2.8 covers the incremental scanner and table cost of `$` literals. The freeze decision retains the prefix if that cost is compatible with the compiler-core gate; otherwise Nucleus 0.1 has decimal literals only.

Except for these four provisional decisions, the lexical forms in this chapter govern the current 0.1 draft. A later chapter that needs another token requires an amendment here and cost accounting for the added scanner, table, test, and diagnostic work.

## 4. Program and file structure

### 4.1 Scope

This chapter defines the source presented in one compilation, the order of top-level declarations, the placement of executable statements, the completion of forward routine declarations, and the structural checks performed at end of input. Chapter 3 defines the byte and token streams. Chapters 5, 8, and 13 define scopes, declarations, and routines in detail.

Nucleus compilation is declaration ordered and streaming. The rules in this chapter require neither backtracking nor a retained whole-program syntax tree.

### 4.2 Compilation unit

A **compilation unit** is one logical Nucleus token stream ending in one `EOF` token. The compiler processes that stream from beginning to end as a single ordered unit. A compilation unit supplies one outer declaration sequence; a physical file boundary does not begin a scope, clear declarations, or change declaration order. Chapter 5 defines the resulting scopes.

The structural skeleton is:

```text
compilation-unit ::= { top-level-declaration } EOF
```

The complete grammar in Chapter 17 will replace this skeleton. Its declaration productions consume the logical `NEWLINE` tokens defined in Chapter 3.

Blank and comment-only physical lines contribute no top-level item. If the final item has no physical line ending, Chapter 3 requires the tokenizer to emit its final `NEWLINE` before `EOF`.

### 4.3 Physical files and stream assembly

The core Nucleus 0.1 compiler accepts one logical source stream. It does not open source files, search directories, or resolve source dependencies while parsing that stream.

A build tool may assemble the stream from one or more physical files. It must preserve their declared order and must not join tokens across a file boundary. When the preceding file does not end at a physical line boundary, the tool must insert a line ending before the next file's first byte. Tokenization then proceeds as if the assembled bytes had been supplied in one file.

Nucleus 0.1 has no source-level `import`, `include`, `module`, or namespace declaration. File lists, search paths, dependency resolution, and any mapping from logical source positions back to physical filenames are toolchain inputs outside the language. If a project tool calls a dependency an import, it must resolve and order that dependency before invoking the core compiler. A tool may retain a source-position mapping for diagnostics, but the compiler's conformance does not depend on a particular project-file or package format.

This arrangement does not permit textual macro processing. A stream assembler may combine source files and preserve source-position metadata; it must not add declarations, replace tokens, or make the accepted language depend on the file from which a token came.

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

This rule applies across physical file boundaries because all files contribute to one ordered compilation unit. Moving a declaration to a later file moves it later in declaration order. Splitting a unit into more files does not make later names visible sooner.

The types named by a constant, variable, record field, formal parameter, routine result, or forward signature must already be declared at that position. The exact scope and collision rules appear in Chapter 5. Constant-expression restrictions and initialization order appear in Chapter 8.

After a routine header has been checked, its routine name and complete signature are available in its body and in later declarations. This permits the body to contain a direct self-call if Chapter 13 admits recursion. A call to another routine whose header has not appeared requires an earlier forward declaration.

For example, this order satisfies the structural rules:

```nucleus
forward sub emit(value as u8)

sub run()
    var value as u8
    emit(value)
    return
end

sub emit(value as u8)
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

The completing definition must appear later in the same compilation unit. Its header must match the forward declaration in:

- routine-name identity under Chapter 3's case-folding rule;
- formal-parameter count, order, names, and types;
- the absence or presence of a result and, when present, its type; and
- every other source-level signature property admitted by Chapter 13.

A routine may have at most one forward declaration and exactly one definition. A second forward declaration, a forward declaration after the definition, a second definition, or a definition with a mismatched header is invalid. Completing a forward declaration does not declare a second routine.

Forward declarations apply only to source routines. They do not provide a general forward reference for constants, types, variables, fields, or local names.

### 4.7 Program entry

Nucleus has no executable top-level statements, so an executable build requires one defined routine to be designated as its entry. The entry requires a body by the end of the compilation unit; an uncompleted forward declaration cannot be an entry.

The entry-selection mechanism and eligible signature remain open before the 0.1 freeze. The two compact candidates are:

1. a fixed conventional routine name with a fixed signature; or
2. a routine name supplied as build input, also constrained to a fixed signature.

Neither candidate needs another source keyword or a module system. The eventual rule will state whether an entry takes parameters or returns a result, how a missing or ineligible entry is diagnosed, and whether a compilation unit may be translated as a library-like artifact with no entry. Project evaluation reports the compiler-core and build-tool cost. Until this choice is specified, Chapter 1's incomplete-draft rule prevents a full conformance determination for executable programs.

Program startup, program-lifetime storage initialization, observable termination, and the system calls available to the entry are runtime and system-boundary subjects for Chapters 7, 15, 16, and 19.

### 4.8 End of input and duplicate completion

`EOF` ends the compilation unit; it does not close an open declaration or block. Reaching `EOF` before a required `end`, closing delimiter, declaration terminator, or routine body is complete makes the source invalid. Chapter 3 handles unclosed lexical delimiters before the parser receives `EOF`.

At `EOF`, the compiler must verify that:

- every forward routine declaration has one matching definition;
- every routine has at most one body;
- no top-level declaration remains structurally incomplete; and
- the selected entry satisfies Section 4.7 once the entry rule is settled.

The compiler may diagnose a duplicate declaration or mismatched completion as soon as it encounters the later declaration. It must not defer a detectable error merely because end-of-input validation also covers the condition. After any structural error, the initial compiler may stop under the diagnostic policy in Chapter 1; it must not report a successful translation.

### 4.9 Capacity limits and file organization

Documented compiler capacities apply to the complete logical compilation unit. A physical file boundary must not reset a symbol count, forward-signature count, nesting limit, source-position counter, or other unit-wide resource. Dividing the same ordered source among more files neither increases the language-defined capacity nor creates extra scopes.

An implementation may bound the logical source length, number of physical-file mappings retained by its build tool, number of declarations, number of unresolved forwards, or other storage required by this chapter. It must document each limit and issue a capacity diagnostic when the limit is exceeded. Under Chapter 1, that diagnostic does not make an otherwise conforming source program invalid.

The first compiler's 16 KiB core gate does not change these structural rules. Project measurements account for the code and immutable data used to enforce them, while writable tables and source maps remain in their separately reported accounts under Chapter 2.

### 4.10 Provenance

Lanternfly Level 0 and the current Candlemoth source provide evidence that ordered physical files can form one streaming compilation unit and that unresolved forwards can be checked at its end. Nucleus adopts those two mechanisms through the rules above. It does not inherit Lanternfly's modules, imports, language levels, entry manifest, or Candlemoth's historical global-register source model.

## 5. Names and scopes

### 5.1 Scope

This chapter defines how declarations bind names and where those bindings are visible. Chapter 3 defines identifier formation and identity. Chapter 4 supplies one ordered compilation unit and the placement of top-level declarations and routine bodies. Chapters 6 through 8 define types, storage, values, lifetime, and declaration forms.

A scope controls where source text may refer to a declaration. It does not determine storage allocation, initialization, storage duration, or value lifetime; Chapter 7 defines those subjects.

Nucleus has no implicit declarations, overloads, generic parameters, nested routines, or source-level module namespaces. The historical Candlemoth global `b` and `w` register arrays are not predefined Nucleus names and do not replace formal parameters or named local variables.

### 5.2 Name identity

Chapter 3 establishes an identifier's exact ASCII-folded spelling as its identity. All name binding, collision detection, forward completion, and lookup use that complete identity. Original letter case does not distinguish names.

An implementation may use a hash or an interned ordinal to locate a candidate binding, but it must confirm equality from the complete folded identity. It must not compare only a prefix, truncate a spelling, or treat an unchecked hash match as equality.

### 5.3 Scope structure

Nucleus uses these scopes:

| Scope        | Bindings                                                                                     | Enclosing scope                                                                               |
| ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Program      | Predefined names, named constants, record types, top-level variables, and routine signatures | None                                                                                          |
| Routine      | The routine's formal parameters and named local variables                                    | Program scope as visible at the routine's source position                                     |
| Record field | The fields declared by one record type                                                       | None for ordinary-name lookup; selection uses the field scope associated with the record type |

One compilation unit has one program scope. A physical file boundary does not open another scope. Chapter 4 defines how source files, if more than one, contribute to that ordered unit.

Each routine definition has one routine scope. Parameters and locals are binding classes within that scope, not separate nested scopes. Conditional clauses, loops, and other statement blocks do not open name scopes. Local declarations therefore remain in the routine's declaration prefix and cannot appear inside a statement block.

Each record type has its own field scope. A field scope is separate from the ordinary scopes and from every other record's field scope.

### 5.4 One ordinary namespace

Program and routine scopes use one ordinary namespace. A record type, named constant, variable, routine, parameter, or local with a given folded identity prevents another visible ordinary binding from using that identity. Type and value names do not occupy separate namespaces.

Name lookup first finds the one ordinary binding and then checks whether its declaration class is valid in context. A record type used as an expression, a variable used as a type, or a result-free routine used as a value is invalid. The compiler must not continue searching for another declaration of a more convenient class.

Nucleus has no overload sets. Two routines with the same identity conflict even when their parameter or result types differ. Enumeration and subrange types are absent and introduce no member or range namespaces.

Every ordinary binding has one canonical declaration. A matching routine definition completes an earlier forward declaration under Section 5.8; it is the only case in which a later header with the same identity is not a duplicate declaration.

For example, the single namespace accepts this pair of names:

```nucleus
record Point
    x as u16
end

var origin as Point
```

It rejects this declaration because `Point` and `point` have the same folded identity:

```nucleus
record Point
    x as u16
end

var point as Point       // duplicate ordinary name
```

### 5.5 Declaration visibility

A completed declaration must precede every use. For routines, the checked signature is the declaration: an ordinary header exposes its name before its own body, and a forward header exposes the name before the later definition.

| Declaration                          | Declaration point and later visibility                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Predefined name                      | Before the first source token; visible throughout the unit                                                                    |
| Named constant or program variable   | After the complete declaration, including its type and any initializer, has been checked                                      |
| Record type                          | After the complete record declaration, including every field, has been checked                                                |
| Routine definition without a forward | After the complete signature has been checked and before the body begins                                                      |
| Forward routine declaration          | After the complete signature has been checked                                                                                 |
| Formal parameters                    | Together, after the complete routine header has been checked; visible in the local-declaration prefix and body                |
| Local variable                       | After its complete declaration, including any initializer, has been checked; visible in later local declarations and the body |
| Record field                         | After the complete record declaration has been checked; visible only through selection on that record type                    |

A declaration is not visible in its own type, bound, initializer, or other declaration operand. A record type is not visible in its own field list. These rules reject self-reference by non-routine declarations and prevent declaration cycles without a dependency graph or a second declaration pass.

```nucleus
const first as u16 = second   // invalid: second is not yet visible
const second as u16 = 2

const count as u16 = count    // invalid: count is not visible in its initializer
```

Declaration order applies across the whole logical compilation unit. A later declaration does not become visible to an earlier routine merely because an implementation retained the source or built a syntax tree.

### 5.6 Duplicate declarations and shadowing

Two declarations in the same scope conflict when their folded identities are equal. A difference only in letter case is therefore a duplicate, not a second name.

A parameter or local must not shadow an ordinary program binding visible at its declaration point. A local must not reuse the identity of a parameter or an earlier local. Because routine bodies contain no nested declaration scopes, no inner-block shadowing case exists.

```nucleus
const limit as u16 = 10

sub clamp(limit as u16)       // invalid: parameter shadows visible constant
    return
end
```

The no-shadowing rule is evaluated at the declaration point. A program declaration that appears after an earlier routine is not visible in that routine and does not retroactively invalidate one of its parameter or local names.

Within one record, two fields with the same folded identity conflict. The same field identity may appear in different records, and a field may share an identity with an ordinary binding, because field selection supplies the record type before field lookup.

```nucleus
record Point
    value as u16
end

record Sample
    value as u8            // valid: a different field scope
end

const value as u16 = 0     // valid: the ordinary namespace
```

### 5.7 Lookup

The compiler resolves a name at its source position in this order:

| Context                                | Lookup                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A reserved word or built-in type token | Use the token established by Chapter 3; perform no ordinary-name lookup                           |
| A field name after `.`                 | Use only the field scope of the statically selected record type                                   |
| An ordinary name inside a routine      | Search visible parameters and locals in the current routine scope, then the visible program scope |
| An ordinary name at top level          | Search the visible program scope                                                                  |

The no-shadowing rule ensures that the routine and program searches cannot both produce valid bindings for the same identity. Field names are never found by unqualified ordinary lookup.

If lookup finds no binding, the compiler must issue an undeclared-name diagnostic. It must not create a variable, infer a declaration class, or grant visibility to a later declaration. If lookup finds a binding of the wrong class for the context, the compiler must diagnose that class mismatch.

### 5.8 Forward routine signatures

An explicit forward signature is the only source form that creates a name binding before its full definition. After its complete signature has been checked, it creates the routine's canonical program-scope binding. Its parameter names are signature components; they do not become program-scope bindings and open no routine scope because the forward declaration has no body.

The later routine definition completes that binding. It does not declare a second routine. The completing header must match the forward signature in folded routine identity, parameter count and order, folded parameter identities, parameter types, optional result type, and every other source-level signature property defined by Chapter 13.

A routine may have at most one forward declaration and one definition. A second forward declaration, a forward declaration after a definition, a definition without an applicable forward when the name is already bound, or a mismatched completing header is invalid. Every forward declaration must have a completing definition in the same compilation unit.

Forward declarations apply only to source routines. Constants, variables, record types, fields, parameters, and locals have no forward form.

This completion matches:

```nucleus
forward sub emit(value as u8)

sub emit(value as u8)
    return
end
```

This completion does not:

```nucleus
forward sub emit(value as u8)

sub emit(byte as u8)          // invalid: parameter identity differs
    return
end
```

### 5.9 Self-reference and recursive call graphs

After a routine definition's complete signature has been checked, its program-scope binding is visible in its own body. Name resolution therefore permits a direct self-reference without a forward declaration.

Mutual references require forward signatures for every later routine that an earlier body names. In this example, `second` is visible through its forward declaration, while `first` is visible after its own header:

```nucleus
forward sub second(value as u16)

sub first(value as u16)
    second(value)
    return
end

sub second(value as u16)
    first(value)
    return
end
```

Under these rules, those names resolve. Chapter 13 determines whether recursive calls are admitted and defines their call semantics; Chapter 7 defines activation storage and lifetime. Implementation staging must not change the name-resolution result.

### 5.10 Reserved, predefined, and generated names

Reserved words, built-in type words, and Boolean literals recognized by Chapter 3 are tokens rather than ordinary bindings. A source declaration cannot use their spellings as identifiers.

Nucleus 0.1 has no implementation-selected predefined source names. If another chapter admits a fixed predefined routine, constant, or service name, the compiler establishes that ordinary program-scope binding before the first source token. User declarations and routine-scope declarations cannot redeclare or shadow it. An implementation extension may add names only under the explicit extension rules in Section 1.7.

Compiler-generated temporaries, labels, and helper names remain outside the source namespace. They cannot collide with a source identifier or become visible to source lookup.

### 5.11 Diagnostics and capacity limits

The compiler must diagnose an undeclared use, a duplicate or case-only collision, forbidden shadowing, a wrong declaration class, a forward-signature mismatch, and an uncompleted forward declaration. It may stop after the first diagnostic under Chapter 1.

An implementation may bound identifier length, retained name bytes, ordinary bindings, routine-local bindings, record fields, or unresolved forward signatures. It must document each limit and issue a capacity diagnostic before truncation, wraparound, dropped declarations, or unchecked collision can occur. A capacity failure does not change identifier identity or make an otherwise conforming program invalid.

The implementation may use one bounded ordinary symbol table, a mark for the current routine, and a field table associated with each record type. That layout is non-normative. The observable lookup, collision, visibility, and diagnostic rules above remain the same for any internal representation.

### 5.12 Provenance

Lanternfly's declaration-order checks, forward signatures, and per-record field scopes provide implementation evidence for these rules. Nucleus does not inherit Lanternfly's modules, imports, split type and value namespaces, nested routine machinery, enum-member namespaces, or traversal-binding scopes.

The current Candlemoth implementation uses bounded linear lookup and discards transient local entries after each routine body. Its local shadowing, hash-only name equality, separate type-name path, and source-visible global-register programming model are superseded and are not Nucleus semantics.

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

The spelling `string[N]` settles the bounded-text question previously left open by Chapter 3. `string` is a core reserved word. No other type word is added by this chapter.

### 6.3 Scalar types

`u8` is the unsigned integer type whose values range from 0 through 255. `u16` is the unsigned integer type whose values range from 0 through 65,535. Their widths and ranges do not vary by target.

`boolean` has exactly the values `false` and `true`. It is distinct from both integer types. An integer is not a condition, a Boolean value is not an integer, and Nucleus 0.1 provides no Boolean-to-integer or integer-to-Boolean conversion.

A scalar variable, parameter, field, array element, or routine result holds a scalar value. Scalar assignment and scalar argument passing copy the value. A backend may use any VM slot or machine representation that preserves the type and value; that representation does not alter source compatibility.

### 6.4 Literals and scalar conversion

An integer literal is exact and has no fixed integer type until an expected integer type or an expression rule supplies one. In a declaration initializer, scalar argument, assignment, return, array index, or other expected-type position, a literal may take type `u8` or `u16` when its value lies in that type's range. A literal outside the expected range is invalid; it is not truncated or wrapped.

Chapter 9 will define the treatment of an integer literal with no expected type and the result types of operators. This chapter does not assign an expression-wide default type.

A character literal has type `u8` and its value is the decoded byte from Chapter 3. Nucleus has no separate character type. The ordinary `u8`-to-`u16` widening rule permits a character literal where a `u16` value is expected.

The only implicit conversion between declared scalar types is `u8` to `u16`. It preserves every source value and zero-extends in representations where extension is required. The same conversion applies to assignment, initialization, scalar arguments, scalar results, and operands when Chapter 9 admits a mixed-width operation.

Conversion from `u16` to `u8` requires an explicit checked narrowing operation. Chapter 9 will define its expression spelling. When the source value is known and exceeds 255, the compiler must issue a diagnostic. When the value is not known until execution, the generated program must trap before producing or storing a `u8` result if the value exceeds 255. Checked narrowing never means low-byte extraction, modulo reduction, or reinterpretation.

No implicit or explicit scalar conversion changes `boolean` into an integer or an integer into `boolean`. Nucleus 0.1 also has no arbitrary cast or same-width reinterpretation operation.

### 6.5 Values, aggregate storage, and aliases

The source type and the way a source occurrence denotes data are separate properties:

| Category                | Meaning                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| Scalar value            | A `u8`, `u16`, or `boolean` value that can be copied by assignment, argument passing, or return.   |
| Owned aggregate storage | Storage containing one record, fixed array, or bounded string for a lifetime defined in Chapter 7. |
| Aggregate alias         | A typed, non-owning binding to existing aggregate storage.                                         |

A named constant has type `u8`, `u16`, or `boolean`; records, fixed arrays, bounded strings, and aggregate aliases cannot be declared as constants.

Top-level variables may provide owned aggregate storage. Aggregate storage may also occur inline as a record field or fixed-array element. The permitted declaration sites, initialization rules, mutability, and storage duration appear in Chapters 7 and 8.

A local declaration of record, fixed-array, or bounded-string type creates an aggregate alias rather than owned local aggregate storage. An aggregate parameter is also an alias to caller-provided storage. These aliases have fixed referent types and cannot be rebound through assignment.

Nucleus has no ordinary aggregate value copy. Assignment does not copy a complete record, fixed array, or bounded string, and a routine does not return one by value. Programs update scalar fields, scalar elements, or bounded-string content through operations admitted by later chapters. A later bulk operation must be explicit and does not change the type rules in this chapter.

An aggregate routine result is a typed alias to existing storage. The returned referent must remain alive after the call. Chapter 7 defines the lifetime and escape check; Chapter 13 defines result syntax. A result that would refer to storage ending with the call is invalid.

### 6.6 Record types

A record declaration creates one nominal type. Two record declarations create different types even when their fields have identical names and types. Record storage and aliases are compatible only with the type created by the same declaration.

Every record has one fixed field sequence and one fixed layout. Each field has a name and one previously declared type. A field may have scalar, record, fixed-array, or bounded-string type. The complete field sequence is known when the record declaration ends.

A record must have finite size. A field therefore must not contain its own record type directly or through a cycle of record and array containment. Variant records, unions, and overlaid layouts are absent.

Selecting a scalar field produces a scalar occurrence of the field's declared type. Selecting an aggregate field produces a storage path or aggregate alias with the field's exact aggregate type. Selection does not expose a byte offset or address to source code.

Chapter 8 defines record declaration and field syntax. Runtime byte offsets, alignment, and layout descriptors belong to the VM specification or backend.

### 6.7 Fixed-array types

`T[N]` is a one-dimensional fixed array with element type `T` and length `N`. `N` must be a positive compile-time integer from 1 through 65,535. A compiler may publish a smaller capacity for a particular storage region or implementation, but exceeding that capacity is a capacity failure rather than another array type.

The index domain is always zero through `N - 1`. Nucleus has no arbitrary lower bound, subrange index, enumeration index, or range type. The length and element type are part of the array type.

Two fixed-array types are identical when their element types are identical and their lengths are equal. Thus `u8[16]` and `u8[16]` are the same type, while `u8[16]`, `u8[32]`, and `u16[16]` are three different types.

An array index must have type `u8` or `u16`; `u8` widens to `u16` when the checking operation requires it. A constant index outside the array domain is invalid. A dynamic index must be checked before the access unless the compiler proves from information already available at that point that it lies in the domain. A failed dynamic check performs the bounds trap specified by Chapter 15 before any element load or store.

Indexing an array of scalars produces a scalar occurrence with the element type. Indexing an array of records or bounded strings produces a storage path or aggregate alias with the element type. The index operation never produces an untyped address.

### 6.8 Bounded strings

`string[N]` is a fixed-capacity counted sequence of bytes with a current length from 0 through `N`. `N` is a compile-time integer from 1 through 255 and is part of the type. The empty string is a valid value. Payload bytes may have any value from 0 through 255, including zero.

A string literal is a contextual bounded-string initializer. It is compatible with `string[N]` when its decoded byte length does not exceed `N`. A literal that is too long is invalid. The literal does not create an open-ended string type, infer a new capacity, or permit a later capacity mismatch.

Two bounded-string types are identical only when their capacities are equal. An alias to `string[16]` is not compatible with `string[32]`, even when the current contents would fit both. This exact rule keeps the referent extent available from the static type and permits a one-address alias representation.

A bounded string is an aggregate, not a `u8` array. It has no source-level header field, payload field, terminator field, or byte-index operation. Chapters 8 through 10 and 16 may define explicit initialization, content, comparison, and system-boundary operations without exposing its representation.

Nucleus 0.1 has no `string[]`, open string, slice, general view, or address-and-length source value. A routine that accepts a bounded string names an exact capacity in its parameter type. A broader read-only view may be considered in a later language version after its compiler, carrier, lifetime, and result-ABI costs have been measured.

This chapter fixes the semantic domain and capacity, not the stored layout. Chapter 7 defines storage identity and lifetime, Chapter 8 defines declaration initialization, and the VM specification or backend defines the physical representation and byte encoding. Any representation must preserve embedded zero bytes and lengths through 255.

### 6.9 Aggregate aliases and address separation

An aggregate alias has the same source type as its referent and a separate alias category. For example, an alias to a `Person` record permits `Person` field selection, and an alias to `u8[64]` permits indexing with the fixed bound 64. The alias does not create a reference type that can be named independently.

The compiler must retain the referent type through local aliases, aggregate parameters, field and element selection, assignments admitted for scalar leaves, calls, and aggregate results. An alias passed or returned where another aggregate type is required is invalid unless the two referent types are identical.

A backend may represent an alias at runtime with one untagged address-sized value because compiler metadata records the record layout, array length, or string capacity. The runtime carrier has no source spelling and no runtime type tag. Source code cannot read, write, compare, convert, store, return as a scalar, or perform arithmetic on the carrier itself.

An alias carrier and `u16` remain different typed entities even if both occupy one word in a VM slot. No conversion exists in either direction. Address derivation for field and element access is a checked compiler or backend operation, not `u16` arithmetic visible to the program.

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

| Context                                                | Required compatibility                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Scalar assignment, initialization, argument, or result | Exact scalar type, contextual fitting literal, or implicit `u8`-to-`u16` widening.  |
| Checked narrowing to `u8`                              | Explicit operation and successful range check.                                      |
| Boolean condition or destination                       | `boolean` only.                                                                     |
| Record field selection                                 | The field's declared type.                                                          |
| Fixed-array index                                      | `u8` or `u16` index; result has the exact element type.                             |
| Aggregate parameter or local alias                     | Exact referent-type identity.                                                       |
| Aggregate result                                       | Exact referent-type identity and a referent that passes Chapter 7's lifetime check. |
| Ordinary aggregate assignment or by-value result       | Invalid; Nucleus 0.1 provides neither operation.                                    |

Compatibility is checked at the source operation. The backend does not infer compatibility from equal byte widths, equal layouts, VM slot numbers, or runtime addresses.

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

An implementation must diagnose a source form that requires one of these mechanisms. Equal storage width or a convenient VM representation does not admit the source operation.

### 6.12 Type metadata and capacity

The first compiler's current implementation target represents source types with compact ordinals. Reserved ordinals identify the predefined scalar types; record declarations receive nominal IDs; and fixed-array and bounded-string descriptors are interned by their identity rules. Symbols and routine signatures record these IDs, while the streaming expression checker carries a value or alias category with its type ID.

A byte-sized type ID is the initial implementation target. The implementation must document its maximum number of simultaneously retained type descriptors and diagnose exhaustion before an ID wraps, aliases another type, or changes a compatibility result. The same rule applies to bounded record-field, array-descriptor, and signature tables.

The numeric type ID has no source meaning and need not match across compilations. VM registers and slots are untagged storage locations; the compiler's symbol and expression metadata supply their current source types. Runtime type tags, reflection, and dynamic type tests are absent.

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

## 7. Storage, values, and lifetime

### 7.1 Scope

This chapter defines source-level storage, object identity, value copying, aggregate aliases, storage duration, and lifetime. Chapter 6 defines the types that occupy storage. Chapter 8 defines declaration syntax, constants, initializers, and when a declaration installs a zero or explicit initial value. Chapter 13 defines routine syntax, result syntax, and calls.

The rules in this chapter do not expose physical addresses, banks, virtual-register numbers, stack positions, frame layouts, or compiler workspace. Those are implementation matters. A conforming implementation preserves the source-level identity and lifetime rules regardless of its storage arrangement.

### 7.2 Values, objects, subobjects, and aliases

Nucleus distinguishes four related concepts:

| Concept               | Source meaning                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Scalar value          | One `u8`, `u16`, or `boolean` value. Scalar values can be copied.                                                            |
| Object                | Storage associated with a declared variable.                                                                                 |
| Subobject             | A record field or fixed-array element. A bounded string may itself be an object or an aggregate subobject.                   |
| Typed aggregate alias | A non-owning, fixed binding to an existing record, fixed-array, or bounded-string object or subobject of one of those types. |

An object has one identity throughout its lifetime. Writing a new scalar value into an object or subobject changes its contents, not its identity. An alias has the exact aggregate type of its target and does not create another object.

Every alias is bound to an object or aggregate subobject when the alias is established. Nucleus has no null, unbound, or reseatable aggregate alias. Source code cannot inspect, compare, convert, or perform arithmetic on the implementation carrier used for an alias.

### 7.3 Owned storage

A top-level variable owns one object with program lifetime. A scalar variable owns one scalar cell. A record, fixed-array, or bounded-string variable owns the complete aggregate object, including every contained subobject.

Named constants are scalar-only. A named constant denotes a value and need not occupy source-observable storage. Materializing that value in memory does not give it object identity visible to a Nucleus program.

Aggregate storage occurs only in program-lifetime objects and inline within other aggregate storage. A record field has storage within its containing record. An array element has storage within its containing array. A bounded string has its counted content within its containing string object. Nucleus does not allocate owned aggregate storage for a routine-local declaration.

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

Each routine invocation creates a distinct logical activation. An activation contains that invocation's scalar parameters, scalar locals, and aggregate-alias bindings. It begins when the call establishes the parameters and ends when the routine returns or program execution terminates.

A scalar parameter receives a copied value. Each scalar local belongs to one activation. Its source lifetime begins when execution reaches its declaration and Chapter 8 has established its initial value; its lifetime ends with the activation. A scalar result is copied from the returned expression to the caller. It is not shared storage in the callee.

An aggregate parameter is a typed alias to caller-provided storage. A routine-local declaration of record, fixed-array, or bounded-string type also establishes a typed alias rather than allocating an aggregate object in the activation. The alias binding belongs to the activation, but the target retains its own lifetime.

Two simultaneously active invocations have distinct logical parameters, scalar locals, and local alias bindings. This rule applies even when the implementation assigns the same virtual-register numbers or physical storage to invocations that cannot overlap.

Recursion remains subject to the admission decision in Section 2.8. An implementation that admits recursion preserves distinct logical activation state at every active depth. Caller-save regions, hardware-stack entries, static-slot save areas, or another re-entry mechanism may implement that rule; none is source storage.

### 7.6 Aggregate alias binding

An aggregate alias binds once, when its parameter or local declaration is established. The target is a compatible aggregate storage path rooted in:

- a program-lifetime variable;
- an incoming aggregate parameter;
- another in-scope aggregate alias; or
- an aggregate field or fixed-array element reached from one of those roots.

The compiler evaluates every field selection and checked index used to form a local alias once at binding. Later changes to an index variable do not retarget the alias. The target type must exactly match the alias type under Chapter 6.

An alias does not extend the target's lifetime. Current aggregate storage belongs to variables, so scalar-leaf writes through an aggregate alias are allowed under the ordinary assignment rules.

### 7.7 Subobject lifetime and identity

A subobject begins and ends its lifetime with its containing object. Nested containment does not create a separately managed lifetime. An alias to an aggregate record field or fixed-array element remains valid only while the containing object remains alive.

Distinct fields of one record and distinct elements of one fixed array are distinct subobjects. An object overlaps each of its own subobjects, and a nested subobject overlaps every containing object on its path. Sibling fields and sibling array elements do not overlap in source semantics.

Two aliases may denote the same object or overlapping objects. Nucleus provides no alias-identity comparison, but identity is observable through mutation: a scalar write through one path is visible through every other path to that scalar subobject. An implementation must preserve this effect even if it caches a scalar value or uses different carriers for the two paths.

### 7.8 Assignment and aggregate mutation

Scalar assignment copies a value into a scalar destination. The destination may be a scalar variable, parameter, record field, or fixed-array element. After the assignment, later changes to the source do not change the destination.

Aggregate alias binding is not assignment. Once established, an aggregate parameter or local alias cannot be rebound. An assignment whose destination is a bare record, fixed array, bounded string, or aggregate alias is invalid: it neither changes an alias binding nor copies an aggregate object.

Nucleus 0.1 has no implicit whole-record, whole-array, or whole-string copy. Programs mutate aggregates through scalar fields, scalar array elements, and explicit bounded-string operations specified in later chapters. An explicitly admitted library routine can perform an element-wise or content operation, but it remains an ordinary checked operation and does not add aggregate value assignment to the language.

### 7.9 Aggregate results and escape checking

An aggregate routine result is a typed alias to existing storage. The returned target must outlive the callee activation. The result preserves the target's exact aggregate type and denotes the same object.

A returned aggregate alias is valid when its target is:

- program-lifetime storage; or
- storage reached through an incoming aggregate parameter, including one of its aggregate fields or fixed-array elements.

Every valid incoming aggregate parameter is ultimately rooted in program-lifetime storage because Nucleus has no routine-local owned aggregate, heap aggregate, or variable-sized local. Returning a local alias is permitted only when its binding is statically derived from program-lifetime storage or an incoming aggregate parameter. Returning the local binding ends that binding; the result denotes the target object, not the callee's alias carrier.

A compiler needs only one local lifetime fact for an aggregate alias expression: whether it is statically derived from program-lifetime storage. An incoming aggregate parameter has that property. Field selection, checked indexing, and local alias binding preserve it. An aggregate return is invalid when the compiler cannot prove the property. Once the compiler has checked a routine body, callers may rely on its aggregate result being a valid typed alias to program-lifetime storage; no result-provenance syntax or parameter identity is required in the routine signature.

Nucleus has no routine-local owned aggregate object, aggregate temporary, heap object, or variable-sized local object. A local declaration such as an unbound record, array, or bounded string is therefore invalid rather than an allocation whose address could escape. The absence of local aggregate allocation removes the principal dangling-result case; the lifetime check still applies to every aggregate return.

### 7.10 End of lifetime and dangling aliases

When an activation ends:

- its scalar parameters and scalar locals cease to exist;
- its local and parameter alias bindings cease to exist;
- storage reached through those aliases is unaffected if that storage has a longer lifetime; and
- a valid returned scalar value or aggregate alias has already been transferred to the caller.

No source operation may use an object or subobject after its lifetime ends. Creating, returning, storing, or retaining an aggregate alias whose target does not outlive that use is invalid. A compiler must diagnose a statically detectable lifetime violation rather than emit a dangling carrier.

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

The caller-provided array outlives the `choose` activation.

This statement mutates a scalar leaf through the aggregate alias `item` without copying or rebinding the record:

```nucleus
item.value = 7
```

The assignment changes the caller's selected `Entry`. It does not create another `Entry`.

If `first` and `second` are aggregate aliases and `otherEntries` is another `Entry[8]` object, the following forms are invalid:

```nucleus
first = second          // no alias rebinding or whole-record copy
entries = otherEntries  // no whole-array copy
```

A routine cannot create shorter-lived aggregate storage and return it:

```nucleus
sub invalidResult() as Entry
    var scratch as Entry    // invalid: an aggregate local cannot be unbound
    return scratch
end
```

The invalid declaration does not allocate an `Entry` in the activation. Chapter 8 defines the binding syntax for a valid aggregate local. A routine that needs scratch aggregate storage receives it through an aggregate parameter or uses declared program-lifetime storage.

### 7.12 Implementation independence and capacities

Language lifetime is independent of a value's physical location. Reusing a physical address or VM slot at different times, overlaying non-overlapping locals, bank placement, and hardware-stack reuse do not merge source objects or activations. Conversely, two source paths to the same object retain shared identity even if a backend represents them differently.

An implementation may bound active call depth, scalar locals, aggregate-alias bindings, or the metadata used for lifetime checks. It must publish each limit. A compile-time excess requires a capacity diagnostic under Chapter 1. An implementation must not share live activation state, wrap a depth counter, or produce a dangling alias when a limit is reached.

One lifetime decision remains attached to recursion admission: if activation depth can exceed a configured limit only at runtime, admission requires a specified failure and a trap defined in Chapter 15. Until then, prototype recursion follows Section 1.10 rather than adding an unspecified runtime failure to Nucleus 0.1.

Nucleus 0.1 exposes no raw pointer value, address arithmetic, heap allocation, manual deallocation, open slice or view, variable-sized local, arbitrary aggregate copy, or storage-layout query through this chapter. Field byte offsets, array byte offsets, bounded-string encoding, VM carriers, calling opcodes, and save-region layouts belong to the VM specification or a backend contract.

## 8. Constants and declarations

### 8.1 Scope

This chapter defines the Nucleus 0.1 declaration families, their canonical source forms, constant expressions, initializers, and declaration-time binding. Chapter 4 defines the compilation-unit sequence and top-level placement. Chapter 5 defines declaration points, scopes, name identity, and collisions. Chapters 6 and 7 define types, storage ownership, aggregate aliases, and lifetime. Chapter 13 defines routine calls, results, and complete routine semantics.

Nucleus uses explicit declarations and explicit types. It has no inferred declarations, implicit variables, grouped declarations, destructuring declarations, or general type-alias declaration.

### 8.2 Declaration families and placement

The declaration families are:

| Declaration           | Permitted location                          | Binding or storage established                                            |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| Named constant        | Top level                                   | One typed compile-time scalar value                                       |
| Program variable      | Top level                                   | One mutable program-lifetime scalar or aggregate object                   |
| Record type           | Top level                                   | One nominal fixed-layout record type and its field scope                  |
| Forward routine       | Top level                                   | One routine signature without a body                                      |
| Routine definition    | Top level                                   | One routine signature and body, or completion of an earlier forward       |
| Formal parameter      | Routine header                              | One scalar activation value or aggregate-alias binding                    |
| Scalar local          | Contiguous routine declaration prefix       | One per-invocation scalar value                                           |
| Aggregate-alias local | Contiguous routine declaration prefix       | One per-invocation immutable binding to existing aggregate storage        |
| Record field          | Between a record header and its closing end | One named scalar or aggregate subobject in each object of the record type |

Only top-level declarations occur in the compilation-unit sequence. Parameters occur only in a routine header. Local declarations form one contiguous prefix after the header and before the first statement. A conditional or loop body cannot contain a declaration, and a declaration after the first statement of a routine is invalid.

Nucleus 0.1 has no routine-local constant declaration.

### 8.3 Canonical syntax

The following skeleton defines declaration syntax without defining statement grammar or the internal syntax of ordinary expressions:

```text
top-level-declaration ::= const-declaration
                        | program-var-declaration
                        | record-declaration
                        | forward-routine-declaration
                        | routine-definition

const-declaration     ::= "const" NAME "as" type "="
                          constant-initializer NEWLINE

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
routine-definition    ::= routine-header NEWLINE
                          { local-declaration }
                          routine-statement-sequence
                          "end" NEWLINE
routine-header        ::= "sub" NAME "(" [ formal-parameter
                          { "," formal-parameter } ] ")"
                          [ "as" type ]
formal-parameter      ::= NAME "as" type

local-declaration     ::= "var" NAME "as" scalar-type
                          [ "=" expression ] NEWLINE
                        | "var" NAME "as" aggregate-type
                          "=" aggregate-storage-path NEWLINE

constant-initializer  ::= scalar-constant-expression
program-initializer   ::= scalar-constant-expression
                        | STRING
                        | scalar-array-initializer
scalar-array-initializer
                      ::= "[" scalar-constant-expression
                          { "," scalar-constant-expression } "]"
```

`type`, `scalar-type`, and `aggregate-type` are defined by Chapter 6. The parser selects the initializer form from the declared type. `routine-statement-sequence`, `expression`, and `aggregate-storage-path` are placeholders for later chapters, not additional declaration syntax.

Each constant, variable, record header, field, and local declaration introduces one name. A routine header introduces one routine name and its individually written parameters. Each field and parameter repeats the canonical `name as Type` form. No comma-separated field or variable group is permitted.

Square brackets suppress logical newlines under Chapter 3. A scalar-array initializer may therefore span physical lines without adding newline productions to this grammar.

### 8.4 Named constants

A named constant declaration has this form:

```nucleus
const bufferLength as u16 = 64
const readyMask as u8 = 128
const enabled as boolean = true
```

The declared type must be `u8`, `u16`, or `boolean`. The `as` clause is required; Nucleus does not infer a constant's declared type. The declared type supplies the expected type for contextual literals and for the final compatibility check.

A named constant denotes its compile-time scalar value. It does not declare storage and need not occupy runtime storage. The compiler may materialize the value in generated code or immutable implementation data, but no source operation exposes object identity for it.

The initializer is required and must be a scalar constant expression compatible with the declared type. A named constant becomes visible only after the compiler has checked the complete declaration, so its initializer cannot name itself. Chapter 5's declaration-order rule also excludes later names and constant cycles.

Named integer constants replace enumeration members where a program needs symbolic numeric values. A constant declaration does not create an enumeration, subrange, distinct integer type, or overload.

### 8.5 Aggregate constants are absent

Nucleus 0.1 named constants are scalar only. `const` cannot declare a record, fixed array, or bounded string. The language has no separate read-only aggregate-storage declaration.

A program that needs an initialized string or scalar table declares a program variable under Section 8.8. That object is mutable storage even when the program never writes it. Historical Lanternfly constant tables do not establish a read-only aggregate-storage family for Nucleus.

### 8.6 Scalar constant expressions

A scalar constant expression contains only:

- an integer, character, or Boolean literal;
- an earlier named constant;
- parentheses; and
- a pure scalar operator or explicit scalar conversion that Chapter 9 admits in constant expressions.

It cannot read a variable, field, array element, or bounded string; call a routine; or perform an observable operation. Nucleus 0.1 constant expressions have no layout, address, offset, or runtime-length query. Fixed array lengths and string capacities use literals or earlier scalar constants instead.

The compiler evaluates a constant expression at compile time with the operand types, result type, overflow rule, and fault rule that Chapter 9 assigns to each admitted operator. It must not substitute host-language overflow, silently widen a typed operation, or fold an expression differently from the corresponding runtime operation. If Chapter 9 assigns no constant-expression rule to an operator, that operator is unavailable in this context.

An exact integer literal remains exact until the declared destination, an operator rule, or a conversion supplies its type. The implicit `u8`-to-`u16` conversion from Chapter 6 is permitted. A checked `u16`-to-`u8` conversion is valid at compile time only when its value lies from 0 through 255; otherwise the declaration is invalid. A constant operation that Chapter 9 defines to trap at runtime makes the constant expression invalid when the compiler proves that condition during evaluation.

An array length is a scalar constant expression whose value must lie from 1 through 65,535. A `string[N]` capacity is a scalar constant expression whose value must lie from 1 through 255. The compiler evaluates the bound before constructing the type identity. A later constant, a variable, or a cyclic dependency cannot supply a bound.

### 8.7 Record declarations

A record declaration introduces one nominal type:

```nucleus
record Point
    x as u16
    y as u16
end
```

The declaration contains at least one field. Each field declares one name and one previously declared type. A field declaration has no `var` or `const` keyword, initializer, default value, placement clause, or mutability qualifier. Every object of the record type contains the same fields in declaration order.

The record type becomes visible only after the complete declaration has been checked. It is therefore unavailable in its own field list. This rule, the declaration-before-use rule, and Chapter 6's finite-size requirement reject direct and indirect recursive containment without a second declaration pass.

Record field names use the record's field scope under Chapter 5. A case-insensitive duplicate within that field scope is invalid. Record layout offsets and backend encoding are outside this chapter.

### 8.8 Program variables

A top-level `var` declaration owns one mutable program-lifetime object. The declared type may be scalar, record, fixed array, or bounded string.

Every program variable has an initial value. With no initializer, the compiler establishes the type's zero value from Section 7.4 before the entry routine begins. The default is therefore integer zero, `false`, an empty bounded string, or the recursive zero value of a record or fixed array.

An explicit program initializer is permitted only in these forms:

| Declared type                          | Permitted initializer                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `u8`, `u16`, or `boolean`              | One compatible scalar constant expression                                    |
| `string[N]`                            | One fitting string literal                                                   |
| Fixed array with scalar element type   | One flat list of exactly the declared number of compatible constant elements |
| Record or array with aggregate element | None; omit the initializer to select recursive zero initialization           |

Program initialization does not evaluate an ordinary runtime expression or read another variable. A string or array initializer cannot name another aggregate object. Nucleus has no record-constructor initializer, designated-field initializer, implicit aggregate copy, or partial array initializer. A fixed-array list that is too short or too long is invalid; the compiler neither pads nor discards elements.

The program variable becomes visible only after the compiler has checked its type and initializer. Its initializer may therefore use earlier scalar constants but cannot use the variable itself or a later declaration.

### 8.9 Routine declarations and parameters

One routine header declares a routine name, an ordered list of zero or more formal parameters, and either no result type or one result type. Every parameter has an explicit `name as Type` declaration. Parameters have no initializer or default argument, and a header has no grouped names or multiple result list.

A scalar parameter denotes a per-invocation copied value. An aggregate parameter establishes a fixed typed alias to caller-provided program-variable storage. Scalar-leaf mutation through that alias is permitted. Chapter 13 defines calls, result rules, and the value supplied for each parameter; this chapter defines only the bindings written in the header.

A forward routine declaration contains the complete header and no body. The later definition must match it under Chapters 4 and 5, including case-folded routine and parameter identities, parameter count and order, parameter types, and the optional result type. The definition completes the existing routine binding; it does not declare another routine.

A routine definition without an earlier forward makes its checked signature visible before the local-declaration prefix and body. No nested routine declaration is permitted.

### 8.10 Local declarations

Local declarations execute in source order at the start of each invocation, after parameter binding and before the first statement. They remain in one contiguous prefix.

A scalar local owns one per-invocation scalar value. Its initializer is an ordinary expression evaluated once when execution reaches the declaration. The expression must be compatible with the declared scalar type. If the initializer is omitted, the compiler establishes zero for `u8` or `u16` and `false` for `boolean` at that point.

An aggregate local owns no aggregate storage. Its initializer is mandatory and must be a compatible aggregate storage path rooted as Section 7.6 permits. The compiler evaluates and checks the path once when execution reaches the declaration, then establishes an immutable typed alias binding to that object or subobject. Later changes to an index used in the initializer do not retarget the alias.

An aggregate local's binding cannot be reassigned. Its target is mutable program-variable storage reached directly or through another aggregate alias. Mutation through a scalar field or scalar element is permitted.

A local becomes visible only after its complete declaration and initializer have been checked. Its initializer may name parameters, visible program declarations, and earlier locals. It cannot name itself or a later local. A local declaration inside a statement block or after the first statement is invalid.

### 8.11 Initialization order

Constant expressions are evaluated during compilation and perform no source-level runtime operation.

The compiler establishes each program variable's zero or explicit initial value exactly once before the entry routine begins. The semantic order is top-level declaration order. Every program variable has reached its initial value before source execution can read it. Chapter 7 defines lifetime, and Chapter 19 defines startup semantics and implementation requirements.

On each routine invocation, parameter binding precedes local initialization. Local declarations then execute once each in source order. A scalar local receives its zero or evaluated value at its declaration. An aggregate local evaluates its storage path and fixes its alias binding at its declaration. After the last local declaration, execution continues with the first statement.

### 8.12 Invalid declarations and capacity failures

The compiler must diagnose:

- a declaration in a location not permitted by Section 8.2;
- a missing type, required initializer, or alias target;
- a type, bound, initializer, or name that is not visible at its declaration point;
- a duplicate name, case-only collision, or forbidden shadowing under Chapter 5;
- a nonconstant operand or invalid folded operation in a constant expression;
- a scalar initializer incompatible with its declared type;
- an invalid array length, string capacity, string length, or array element count;
- a record field with an unavailable type or a record with no fields;
- an aggregate `const` or a program aggregate initializer not admitted by Section 8.8;
- an aggregate alias whose target type is not identical to its declared type;
- an attempt to rebind an aggregate alias or copy a complete aggregate; and
- a forward completion that does not match its signature.

An implementation may bound top-level declarations, record fields, parameters, locals, aggregate aliases, constant-expression nesting, initializer elements, decoded string bytes, type descriptors, retained signatures, and initialization records. It must publish each limit and issue a capacity diagnostic before truncation, wraparound, omitted initialization, dropped fields, or an incorrect binding can occur. A capacity failure does not change an otherwise conforming declaration into invalid source.

### 8.13 Examples

These top-level declarations are valid under this chapter:

```nucleus
const cellCount as u16 = 8
record Cell
    value as u16
    active as boolean
end

var cells as Cell[cellCount]
var flags as u8[4] = [1, 2, 4, 8]
var prompt as string[8] = "READY"
var title as string[12] = "NUCLEUS"
var attempts as u8
```

`cells` and `attempts` begin with their zero values, including every field of every `Cell`. `flags`, `prompt`, and `title` are mutable program-lifetime objects with the written initial contents. `title` begins with seven decoded bytes.

A local aggregate declaration binds existing storage rather than copying it:

```nucleus
sub update(index as u8)
    var count as u16 = 0
    var current as Cell = cells[index]

    current.value = count
    return
end
```

The index is evaluated and checked once when `current` is declared. Assignment to `current.value` updates the selected element of `cells`; it does not rebind `current` or copy a `Cell`.

A program object or an array element may supply the alias target:

```nucleus
record State
    code as u8
end

var primary as State
var states as State[4]

sub inspect()
    var whole as State = primary
    var selected as State = states[2]
    return
end
```

A matching forward declaration and definition repeat the complete header:

```nucleus
forward sub inspectState(item as State)

sub inspectState(item as State)
    return
end
```

The following marked forms are invalid. They illustrate separate errors and are not one compilation unit:

```nucleus
const Limit as u16 = 8
var limit as u16                    // case-insensitive duplicate

const flags as u8[4] = [1, 2, 4, 8] // named constants are scalar only
const prompt as string[8] = "READY"  // bounded-string constants are absent

const first as u16 = second         // later name is unavailable
const second as u16 = first         // the first error prevents a cycle

const noElements as u16 = 0
var empty as u8[noElements]         // fixed arrays must be nonempty
var lateBound as u8[laterLength]    // later constant is unavailable
const laterLength as u16 = 4

var shortText as string[4] = "READY" // decoded literal is too long
var copiedCell as Cell = cells[0]   // top-level record copy initialization is absent

sub invalidLocal()
    var aggregateLocal as Cell      // aggregate local requires a target
    return
end
```

Inside a routine, `var current as Cell = cells[0]` is alias binding and is valid. At top level, the same initializer would request an aggregate object initialization from another object and is invalid. Assignment such as `current = cells[1]` is also invalid: it performs neither alias rebinding nor whole-record copying.
