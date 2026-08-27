# Atom CLI v1

Status: accepted target contract

Date: 2026-08-27

## Principles

- A command names one root source and positively names the artifacts wanted.
- No artifact is produced merely so that a suppression switch can disable it.
- Output filenames select serialization by their suffix.
- Repeatable build policy belongs in a Node project, not in a long command.
- Z80-native frontends are positional and contain no general option parser.
- The CLI selects preparation, target, rendering, and publication; it never
  changes Atom language or encoding semantics.

## Node-hosted command

```text
atom [OPTIONS] INPUT.ASM [OUTPUT...]
atom --project PROJECT.json [OUTPUT...]
```

Examples:

```text
atom main.asm
atom main.asm build/main.hex
atom main.asm build/main.bin build/main.hex
atom main.asm build/main.com build/main.lst
atom -DDEBUG=1 main.asm build/main.bin
atom --project atom.json
```

With a direct source and no output, Atom writes `build/<stem>.bin`. With a
project and no command output, Atom uses the project's positive output list,
falling back to BIN when the project has none. Explicit command outputs replace
project output defaults.

Each explicit path selects exactly one format using the longest recognized
suffix:

| Suffix     | Format                         |
| ---------- | ------------------------------ |
| `.bin`     | flat binary                    |
| `.hex`     | Intel HEX                      |
| `.com`     | CP/M-validated flat executable |
| `.nobj`    | Atom NOBJ                      |
| `.lst`     | listing                        |
| `.d8.json` | Debug80 map                    |

Suffix matching is case-insensitive. An unknown or missing suffix, duplicate
format, duplicate path, or normalized path collision is a command error. There
is no `--emit`, `--nobin`, `--nohex`, `--nod8`, `--out-dir`, or format-specific
subcommand.

The ordinary option set is:

```text
-p, --project FILE
-t, --target NAME
-DNAME[=VALUE]
-h, --help
-V, --version
```

`--project` and a positional input are mutually exclusive. Target geometry,
entry convention, fill, banking, and path confinement belong to a target or
project, rather than routine `--origin`, `--capacity`, `--entry`, `--fill`, and
`--root` switches. Source `ORG` determines program placement; the BIN renderer
uses the lowest generated or reserved address rather than requiring the user to
repeat that address on the command line.

Self-hosting is maintainer behavior exposed as `atom self-host` or a repository
verification command, not an ordinary build option.

## Node project

JSON is a Node-only convenience. A project may provide an entry, target,
definitions, and positive output paths:

```json
{
  "entry": "src/main.asm",
  "target": "tecm8",
  "outputs": ["build/main.bin", "build/main.hex", "build/main.d8.json"],
  "definitions": {
    "DEBUG": 0
  }
}
```

Paths are relative to the project file. Command definitions override project
definitions. Z80-native profiles do not parse or receive the JSON bytes.

## COM output

COM is a host renderer over the same logical generation as BIN. It adds no
header and enforces:

- flat bank zero;
- load address `$0100`;
- entry address `$0100`;
- no generated or reserved address below `$0100`;
- a final address inside the selected CP/M target limit; and
- the selected target fill policy for gaps and reservations.

When no target was selected, requesting `.com` supplies the generic CP/M load
and entry constraint. It never replaces an explicit incompatible project or
command target. Machine-specific target profiles may impose a lower TPA limit.

## Z80-native command

The standard CP/M profile accepts:

```text
ATOM
ATOM SOURCE
ATOM SOURCE OUTPUT.COM
ATOM ?
```

`ATOM` retains the `INPUT.ASM` to `OUTPUT.COM` convenience. `ATOM HELLO` means
`HELLO.ASM` to `HELLO.COM`. A root source follows active `%INCLUDE` directives;
the command accepts no second source-composition form.

The standard CP/M image emits COM only. It has no definition, target geometry,
listing, D8, HEX, NOBJ, or suppression switches. Its target, provider, fill,
and output module are properties of the linked native profile.

The TEC-native command follows the same positional shape, with the selected
native profile defining its default and supported output suffixes.

The current CP/M command-tail parser is measured at 303 resident code bytes.
The revised command and include-root handling have an initial gate of no more
than 64 additional command-parser bytes. Include resolution and its workspace
are measured separately from the command parser and from the Atom core.

## Results and failure

Node-hosted Atom returns:

| Exit | Meaning                                                           |
| ---: | ----------------------------------------------------------------- |
|    0 | success, help, or version                                         |
|    1 | preparation, assembly, rendering, service, or publication failure |
|    2 | invalid command or project configuration                          |

Diagnostics go to stderr; ordinary status and committed paths go to stdout.
All requested artifacts are rendered and staged before publication begins. A
failed assembly publishes none.

CP/M has no portable CCP process-status convention. The native frontend prints
one concise diagnostic, preserves the preceding COM through its transaction,
and returns `A=0` on success, `A=1` on build or I/O failure, and `A=2` on command
misuse for monitors and tests that can observe it.

## Migration

Atom is pre-1.0, so CLI v1 is adopted before it becomes Debug80's default.
During one compatibility checkpoint, existing Node switches may translate to
an anonymous project/target with a deprecation diagnostic, and the existing
artifact bundle remains available to repository automation. Debug80 and all
in-repository scripts must request exact artifacts before the default changes
to BIN only.

The CP/M source-list command remains only until the include-driven native path
passes its multipart, diagnostic, capacity, transaction, and size proofs. It is
then deleted rather than retained as a second public input model.
