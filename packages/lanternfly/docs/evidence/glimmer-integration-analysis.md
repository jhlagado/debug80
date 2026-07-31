# Glimmer integration analysis

This note records constraints found in Glimmer's implementation
documentation and relevant parser, generator, loader and build tests.

## A parallel body language

Glimmer's current contract intentionally keeps real Z80 visible and names AZM
as its canonical output. Lanternfly should begin as an optional body language and
separate package, not as a silent change to that contract.

The two positions can coexist:

- Glimmer continues to accept direct AZM bodies;
- a marked Lanternfly body is compiled before Glimmer emits the final substrate;
- generated AZM remains readable and checkable on the first backend;
- native imports and body pass-through remain available;
- a future unified surface may still be called Glimmer.

This avoids requiring the current roadmap to declare assembly obsolete. Lanternfly
earns wider use through corpus coverage and backend quality.

## Body selection must be explicit

Today `begin` means that every following line through a bare `end` is verbatim
AZM. Lanternfly cannot be inferred from whether a line happens to parse as assembly.
The body dialect needs an explicit marker.

Candidate harness spellings include:

```text
begin lanternfly
    ...
end
```

or:

```text
lanternfly
    ...
end
```

The first preserves the existing block shape and makes pass-through explicit by
absence of a qualifier. The exact spelling is a Glimmer integration decision,
not part of Lanternfly's standalone grammar, and remains provisional.

Lanternfly uses nested constructs such as `IF ... END IF` and `SELECT ... END
SELECT`. None conflict with Glimmer's current body terminator because only a
line containing the single word `end` closes the body. A Lanternfly routine
declaration embedded in a body would need care because a bare `END` could be
ambiguous; the first integration should compile one body at a time and keep
module/routine declarations outside the block.

## Fall-through and early exit

Glimmer appends update propagation and the final return after every body.
Direct bodies must fall through. Lanternfly inherits that harness contract but should
not expose it as an assembly restriction.

A body-level `EXIT BODY` or `RETURN` with no value must jump to a compiler-owned
epilogue label immediately before Glimmer's wrapper. It must never emit a
machine return that skips `updates`.

User-defined Lanternfly functions and procedures have their own return convention and
are not Glimmer blocks. Their `RETURN` exits the routine normally. The parser
and intermediate representation must distinguish these two contexts.

## Explicit mapping replaces verbatim mapping

Current `computeBlockMappings` verifies that every body line appears
byte-for-byte in generated AZM, then moves corresponding Debug80 segments from
the `.asm` file to the `.glim` file. Lanternfly invalidates that assumption because
one statement may lower to several instructions and some statements emit no
code.

The Lanternfly compiler must return explicit mapping records. Glimmer's build stage
then composes them with the AZM map instead of searching for source text.
Tests should cover:

- one statement to several instruction segments;
- constant-folded statements with no machine segment;
- a service call whose adapter expands inline;
- a statement in a Glimmer part;
- an error in generated AZM mapped back to the originating Lanternfly expression;
- wrapper instructions remaining attributed to generated assembly.

## Typed manifests

The current Glimmer program model already stores state scalar widths, array
bounds, layout names and generated resources. It does not carry the richer
information Lanternfly needs for all services and addresses.

An integration manifest should contain:

- symbol name and visibility;
- scalar signedness and width;
- complete array dimensions and element type;
- exact record fields, offsets, size, alignment and padding;
- data, code, opaque resource and address-space distinctions;
- near/far representation for references;
- constant value and optional qualified group;
- service parameter/result types, compile-time-constant requirements,
  visible effects and backend ABI;
- volatile or externally changed state metadata.

The manifest is a language-independent harness interface. AZM, C, BASIC and
other substrates can each implement it.

## Semantic access summaries

Glimmer currently scans only direct assembly stores to warn about missing
`updates`. Lanternfly's typed paths identify the target of field and index assignments even when the
lowering uses an indirect pointer. It should return normalized read and write
sets.

For `Cursor.y = Cursor.y - 1`, the detailed write is `Cursor.y` and the
Glimmer-normalized write is `Cursor`. For `Board[i].colour = value`, it is
`Board[*].colour` and then `Board`.

Glimmer compares the normalized set with the declared `updates` list. The
declaration remains authoritative because:

- a listed cell may be deliberately re-raised without a store;
- an imported call may mutate state through a native path;
- mixed Lanternfly and native bodies must follow one scheduling contract.

## Program and module placement

Glimmer emits wrapped blocks before imported modules and profile libraries.
Lanternfly's declaration-before-use rule requires imported and earlier routine
signatures at the source boundary. Generated structured branches, wrapper
epilogues and host library symbols may still require assembler or linker
fixups. Those machine fixups do not grant source visibility to later Lanternfly
declarations.

The current Glimmer generator emits one configurable `.org`, defaulting to
`$4000`. Lanternfly needs a stronger integration contract. The selected target
profile defines legal memory regions; Glimmer contributes wrappers, state,
bodies, resources and profile libraries to one placement plan; each hosted
Lanternfly body contributes size and class requirements but no independent
origin. The AZM output serializes planned segments with `.org`, and its final
initialized-byte map, reserved-address set and symbol table are checked against
the plan.

The first Lanternfly integration can compile individual bodies plus separately
declared Lanternfly modules. It should inherit Glimmer's `part` merge semantics rather
than invent a second file-composition model inside bodies. Namespaced Lanternfly
libraries can be designed independently when reuse requires them.

## Validation lanes

Existing tests prove that every acceptance program generates byte-identical AZM
and assembles under strict register contracts. Lanternfly needs parallel lanes:

1. parse/type/lowering unit tests for each language rule;
2. golden Lanternfly-to-AZM listings for representative bodies;
3. strict AZM assembly and contract checking of generated output;
4. source-map and diagnostic composition tests;
5. differential state/device scenarios against the native body version;
6. additional backend snapshots and executable tests as backends arrive.

Tetro, Snake and Sprite Chase should retain their native versions as behavioural
oracles during the transition.

## Independence test

No core Lanternfly parse or type-check test should import Glimmer. A standalone host
must be able to provide a manifest and compile a body or module.

No core Glimmer scheduling test should depend on Lanternfly syntax. Integration tests
belong at the package boundary.
