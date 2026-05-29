# AZM-Only Source Map Architecture

## Decision

Debug80 consumes AZM's native `.d8.json` source maps as the debugger source of
truth. AZM is the supported assembler. The assembler owns map correctness;
Debug80 validates and indexes the D8 data.

If a required D8 map is missing or invalid, Debug80 reports that the selected
target needs to be rebuilt with AZM. It does not regenerate maps, use project
cache files, or guess source paths as a recovery mechanism.

## Target Contract

A runnable Debug80 target has:

- a program artifact, normally Intel HEX or binary;
- a native Debug80 source map, `<artifactBase>.d8.json`;
- source files resolvable from the project root and configured source roots;
- optional platform/ROM D8 maps for monitor code and bundled ROM sources.

## Removed Compatibility Paths

The old compatibility mechanisms have been removed from active behavior:

- generated project-local source-map cache files;
- fallback source-map reconstruction from assembler text output;
- old source-text recovery passes in the launch path;
- Debug80-generated compatibility D8 maps;
- breakpoint binding against generated assembler text files;
- platform ROM mapping through separate assembler text artifacts;
- project scaffolding that configures ROM assembler text as debugger metadata;
- tests whose only purpose was proving the old fallback path.

## Compatibility Fields That Remain

D8 v1 still contains historical field names such as `lstLine`, `lstText`, and
`lstTextId`. Those names are part of the external D8 schema and are not a
runtime fallback path. Inside Debug80, imported D8 segments store that data as
assembler source context.

## Current State

- Active launch source mapping loads native D8 only.
- Missing or invalid D8 maps produce clear build-required logs.
- Bundled profiles point at ROM binaries, source files, and native D8 maps.
- The source-map cache directory is not created or written.
- The source manager, symbol index, breakpoints, stack display, F12 navigation,
  hovers, Variables, Watches, and conditional breakpoints all read the active
  D8 map.

## Future Work

Future map improvements should be made in AZM and represented in D8. Debug80
should prefer richer D8 fields over adding another text-import path.
