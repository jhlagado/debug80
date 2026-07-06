# Glim Grammar Reference

Grammar for the `.glim` format: the implemented v0 language first, then
the proposed constructs from `sketches/`, clearly separated. The parser
(`src/parse.ts`) is the final authority for the implemented section.

The purpose of this document is evaluation: every symbol and keyword
should justify itself here. If a rule is hard to state, the syntax is
too complex.

## Design rules

The syntax budget is deliberately small:

1. **Every statement starts with a keyword.** A reader can always tell
   what a line is from its first word. There is no punctuation-led
   syntax.
2. **Three symbols, one meaning each.**

   | Symbol | Meaning       | Read it as    | Appears in                    |
   | ------ | ------------- | ------------- | ----------------------------- |
   | `:`    | has type      | "is a"        | `state Count : byte`          |
   | `=`    | initial value | "starting at" | `state Count : byte = 0`      |
   | `->`   | fires         | "fires"       | `bind key KEY_2 rising -> Up` |

   `->` always points from an event source to the pulse it fires. It
   never means assignment, never means a function, never appears in a
   declaration of data. If a future construct wants an arrow with a
   different meaning, it must use a different spelling.

3. **Commas only separate name lists** (`on DotX, DotY`).
4. **`;` starts a comment**, as in AZM — one comment convention across
   both languages.
5. **Everything between `begin` and `end` is verbatim AZM.** No Glim
   syntax exists inside a body; anything that looks like sugar there is
   an AZM op or routine that Glimmer emitted from a declaration.
6. **Line-oriented, no nesting.** Indentation is not significant; it is
   style. The only multi-line construct is the effect (header lines,
   then one body).

A reading test for the whole language: every declaration should read
aloud as an English sentence.

```
state DotY : byte = 3 dirty_on_start
;  "DotY is a byte, starting at 3, dirty on start."

bind key KEY_2 rising -> Up
;  "Binding: key 2, on a new press, fires Up."

effect MoveUp
    on Up
    writes DotY
;  "Effect MoveUp, in the logic phase, on Up, writes DotY."
```

The effect header answers three questions, one per line: `phase` is
**when** in the frame it runs, `on` is **why** it runs (the trigger —
the one line that cannot be inferred, because the body never mentions
it), and `writes` is **what** it changes (the outward contract that
propagates dirtiness to later effects). `phase` defaults to `logic` —
ordinary game logic is what an effect is unless it says otherwise; only
`derive` and `render` need stating. `on` and `writes` are always
explicit.

## Implemented grammar (v0)

```text
program-file    ::= line*
line            ::= blank-line | comment-line | statement

statement       ::= program-decl
                  | platform-decl
                  | display-decl
                  | state-decl
                  | pulse-decl
                  | bind-decl
                  | effect-decl

program-decl    ::= "program" identifier
platform-decl   ::= "platform" platform-name        ; "tec1g-mon3"
display-decl    ::= "display" display-name          ; "matrix8x8"

state-decl      ::= "state" identifier ":" cell-type
                    ( "=" number )? ( "dirty_on_start" )?
cell-type       ::= "byte" | "word"

pulse-decl      ::= "pulse" identifier

bind-decl       ::= "bind" "key" key-name "rising" "->" identifier
key-name        ::= identifier                      ; validated per platform

effect-decl     ::= "effect" identifier
                    effect-header*
                    "begin" newline
                    azm-line*
                    "end"
effect-header   ::= "phase" phase-name              ; default: logic
                  | "on" name-list
                  | "writes" name-list
phase-name      ::= "derive" | "logic" | "render"
name-list       ::= identifier ( "," identifier )*

identifier      ::= [A-Za-z_][A-Za-z0-9_]*
number          ::= decimal | "$" hex | "0x" hex | "%" binary
```

Semantic constraints enforced after parsing:

- exactly one `program`; `platform` and `display` at most once, and only
  together
- state/pulse names share one namespace and must be unique
- `bind` targets must be declared pulses
- `on` names must be declared cells; `writes` names must be states
- an effect needs at least one `on` trigger; `phase` defaults to `logic`
- `end` terminates a body when it is the only word on the line

## The dataflow, in one paragraph

`bind` turns an input event into a pulse. A pulse or a written state
becoming dirty is what makes effects run: an effect runs in its phase
when any `on` cell is dirty, and after it runs its `writes` cells are
marked dirty, which can make later-phase effects run in the same frame.
Pulses and dirty bits clear at the end of every frame. That is the whole
model; `->` is its only symbol.

## Proposed grammar (sketches — not implemented)

From `sketches/tetro.glim` and `sketches/sprite-chase.glim`. Each
proposal is held to the same symbol rules; note that `timer` composes
all three symbols with their standard meanings and nothing new.

```text
bind-decl       ::= "bind" "key" key-name trigger "->" identifier
trigger         ::= "rising" | "held" "period" number

timer-decl      ::= "timer" identifier ":" cell-type "=" number
                    "->" identifier ( "once" )?
                  ; "Gravity is a byte, starting at 32, fires
                  ;  GravityFire (once)."

routine-decl    ::= "routine" identifier
                    contract-comment?
                    "begin" newline azm-line* "end"

card-decl       ::= "card" identifier
                  ; a section header, not a block: the card contains
                  ; every following declaration until the next card-decl
                  ; or end of file. No closing keyword.
enter-effect    ::= "enter" effect-decl

shape-decl      ::= "shape" identifier "color" color-name
                    rotation-row* "end"
sound-decl      ::= "sound" identifier "len" number "div" number
text-decl       ::= "text" identifier string
sprite-decl     ::= "sprite" identifier "color" color-name
                    pixel-row* "end"
tile-decl       ::= "tile" identifier "color" color-name
                    ( "on" color-name )? pixel-row* "end"
```

## Settled syntax decisions (2026-07-06)

- **"Card" means a screen/mode, HyperCard-sense — only that.** A card is
  a mode the running program is in (Splash, Playing, GameOver); exactly
  one is active, tracked by the built-in `CurrentCard` state cell. The
  unit of code is a **fragment** (informally, a snippet) — never a
  "routine card". One word, one meaning, like the symbols.

- **`phase logic` is the default** (revised 2026-07-06; an earlier
  decision made phase mandatory). Logic is what an effect is unless it
  says otherwise; only `derive` and `render` need stating. Writing
  `phase logic` explicitly remains legal.
- **`on` replaced `depends`.** Shorter, reads aloud naturally, still
  pairs with `writes`.
- **Bindings target pulses only.** No direct-bind-to-effect shortcut:
  `->` always fires a pulse, preserving its single meaning. Minimal
  programs pay a little pulse plumbing; the model stays uniform.
- **`writes` stays explicit** even where a static scan of the body could
  infer it: it is the effect's outward contract and covers writes
  through pointers. A future lint should warn when a body visibly
  writes a declared cell that is not listed.

- **Cards are sections, not blocks (2026-07-06).** `card <Name>` starts
  a section that runs to the next `card` line or end of file — no
  closing keyword. `end` therefore keeps a single meaning: it only ever
  terminates a `begin` body ("end of assembly"). The language stays
  nesting-free (rule 6) even with cards.

Open syntax questions to settle before implementing:

- **`->` vs a word.** `bind key KEY_2 rising fires Up` reads aloud
  better; `->` is more scannable and matches the dataflow diagrams.
  Current position: keep `->`, precisely because it has exactly one
  meaning. Revisit if user testing shows confusion.
- **Phase as a modifier on the effect line.** `effect DrawDot render`
  instead of a `phase render` header line. Saves one line per
  non-logic effect; costs a second place to look for the phase.
  Floated 2026-07-06, undecided — revisit with the broader effect-syntax
  pass.
