# Glimmer

**Documentation: [debug80.com/glimmer-book](https://debug80.com/glimmer-book/)** —
the Glimmer book starts from an empty file and builds up to two complete games.

Glimmer is a small reactive language that generates readable Z80 assembly. Its
initial purpose is to help us learn how to build a practical Z80 game engine
while keeping the assembly visible.

The first target is game writing for the TEC-1G. The format should also leave
room for other Z80 systems as Debug80 expands its supported platforms.

Longer term, Glimmer is expected to become a Debug80-facing format: a structured
way to describe blocks, state records, bindings, effects, resources, and
generated Z80 glue for interactive programs.

Documentation:

- [Glimmer Book](https://debug80.com/glimmer-book/) — the course, from first program to finished games
- [Glimmer Interactive Runtime Specification](docs/glimmer.md) — the design foundation
- [Roadmap](docs/roadmap.md) — milestones and platform findings
- [Glim Grammar Reference](docs/reference/glim-grammar.md) — formal grammar and syntax design rules
- [Glimmer Engineering Manual](docs/codebase/) — codebase reference, kept current with the source
- [Glimmer Manual](docs/manual/) — user manual for the first publishable line

The project is game-first because games exercise timing, input, graphics,
sprites, state, sound, packaging, and performance. It is not intended to be
game-only.

## Status

Version 0.6.0 is the scheduling-contract and behavioural-confidence line.
Glimmer distinguishes source-order-independent trigger delivery from the
live-memory execution order of Z80 bodies, warns when same-phase blocks are
scheduled together with a shared update target and rejects different
unconditional routes that would make the destination source-order dependent.
The release is exercised through Debug80's public headless runtime by bounded
Dot, Tetro, Sprite Chase and scheduling scenarios. Glimmer continues to target
AZM 0.3.4 and Debug80 treats `.glim` as a native source format.

The language: scalar, array, and typed state (layout types compiled to
AZM `.type` records), pulses, timers and ramps, held/rising key
bindings, compute/effect/render blocks with verbatim Z80 bodies,
callable routines, cards (screens/modes with `enter` blocks and `goto`
navigation), sound cues, curve tables, matrix shapes, multi-file
programs (`part`), and hand-written AZM module imports.

The toolchain: `glimmer build` generates assembly, checks its declared and
inferred register contracts, assembles to `.hex`/`.bin`/`.d8.json`, and
rewrites the Debug80 map so **breakpoints and stepping land in your `.glim`
source** for block bodies while generated glue stays in readable assembly. The
same pipeline is available through `@jhlagado/glimmer/build` and Debug80's
Glimmer backend. Atom supports ordered hand-written modules and preserves their
source identities in D8 maps. The AZM compatibility backend remains available
for programs that use layout-type directives or other forms without an Atom
equivalent.

Version 0.4.0 completed the data story: pieces, sprites, tiles, and
LCD messages are declarations — `shape` rotation groups generate the
corpus piece-engine tables, `sprite`/`tile` resources generate patterns,
colour groups, and the VRAM upload, `text` brings the LCD slice — and
the generated `sprite_at`/`tile_at`/`lcd_row` AZM ops keep every piece
of sugar visible in the generated file. Tetro and sprite-chase play the
corpus feature set with only irreducible engine code hand-written.

Version 0.3.0 added the second display: `display tms9918` (the
TEC-Deck VDP) generates a vblank-paced loop with a commit phase that
flushes shadow tables to VRAM — proving the profile architecture on two
opposite display models (the matrix the CPU _is_, the VDP the CPU
_writes to_) — and build errors inside block bodies are now reported at
the `.glim` line, the same way breakpoints resolve there.

Examples, smallest first: `counter.glim` (generic profile),
`dot.glim`, `slide.glim`, `trail.glim` (TEC-1G matrix profile
features), then the games — `snake.glim`, `tetro.glim`, and
`sprite-chase.glim` (TMS9918). The repo's `debug80.json` carries a
target for each.

## Getting Started

Glimmer requires Node.js 20 or newer.

```sh
npm ci
npm run build
node dist/src/cli.js build --assembler atom examples/dot.glim
```

The command writes assembly, Intel HEX, binary, and a D8 debug map. Without
`build`, Glimmer stops after generation and register-contract checking.
Omitting `--assembler` selects the AZM compatibility backend.

The generated assembly is readable: API equates, change-flag constants,
state storage, the runtime loop, binding polling, phase dispatch, wrapped user
blocks, and frame cleanup, in that order. Inspect
`examples/counter.main.asm` after building to see the whole runtime.

## The Meta-Source Format (v0)

```
program CounterToy

state Count : byte = 0 changed

pulse IncPressed

bind key KEY_1 rising -> IncPressed

effect ApplyIncrement
    on IncPressed
    updates Count
begin
    ld hl,Count
    inc (hl)
    ld a,(hl)
    cp 10
    jr c,_done
    xor a
    ld (hl),a
_done:
end
```

The AZM form keeps block bodies byte-for-byte. The Atom form preserves their
instructions while translating local labels and generated names to Atom's
format. Every block can therefore have its own `_done` label in Glimmer source.
Blocks run when any of their `on` cells changed; `updates`
cells are marked changed after the block runs.

## Development

```sh
npm run typecheck
npm run lint
npm test          # includes AZM and Atom assembly round trips

# The generated file declares its contract policy and routine boundaries.
# The CLI checks register contracts automatically; --no-check stops after
# generation. The compatibility backend can also be invoked directly:
npx azm --reg-profile mon3 examples/dot.main.asm
npm run format:check
```

## License

GPL-3.0-only. See [LICENSE](LICENSE).
