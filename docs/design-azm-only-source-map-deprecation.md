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
- optional auxiliary platform D8 maps for monitor code and bundled platform
  sources.

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

## Fallback Policy

Debug80 should distinguish resilience fallbacks from legacy compatibility
fallbacks.

The central rule is: Debug80 may be tolerant about user-interface state and
optional metadata, but it must be strict about compiled artifacts and source-map
truth. If AZM did not emit a valid program artifact and native D8 map, Debug80
should report the build problem rather than guessing.

Allowed fallbacks are local, user-facing recovery choices that do not invent
debug data. They keep the UI usable while preserving the last known build
contract. Examples:

- choose the remembered workspace, default target, or only target when the user
  has not explicitly selected one;
- fall back from a VS Code view focus command to opening the Run and Debug view;
- show the nearest mapped anchor or configured source file when a stack frame has
  no exact executable line, while still making the frame look approximate;
- use safe UI defaults when optional project fields such as memory window size
  are absent or invalid.

Allowed tolerance by area:

| Area | Tolerance | User-facing behavior |
| --- | --- | --- |
| Workspace/project selection | High | Prefer remembered workspace, then default project, then the only detected project. Do not treat temporary VS Code focus/state loss as project removal. |
| Target selection | Medium | Prefer the selected target. If absent, use the default target or a single discovered target. If multiple targets exist and none is selected, ask the user. |
| Build artifacts | Low | HEX/BIN and native D8 are required for debugging. Missing or invalid artifacts should produce a clear build error. |
| Source maps | Low | Use only AZM-native D8 maps. A stale map may be used with a warning; a missing or invalid map must not be reconstructed. |
| Breakpoints | Medium | Bind only to mapped executable addresses. If no exact line exists, use a nearby source-map anchor only when the UI clearly represents the result as approximate/pending. |
| Navigation, hovers, variables, watches | Medium | Use the active target's D8 map. If symbol metadata is incomplete, show less detail rather than scanning source text to invent missing meaning. |
| Stack/call display | Medium | Use mapped return addresses and label lookup. Data-like stack entries may be shown as approximate raw addresses. |
| Platform UI | High | Use safe display defaults for absent optional settings. Do not let a missing optional UI setting block launch. |
| VS Code view placement/focus | High | Try the preferred view command, then fall back to showing the closest standard VS Code view. |

Removed or disallowed fallbacks are compatibility paths that fabricate source-map
truth or preserve obsolete project formats. Examples:

- rebuilding source maps from listings or assembler text output;
- writing or reading project-local `.debug80/cache` maps;
- accepting Debug80-generated D8 maps as a replacement for AZM native D8 output;
- discovering `.debug80.json` as a project config file;
- using ROM assembler text artifacts as debugger metadata instead of bundled
  native D8 maps.

When a fallback is allowed, it should be visible enough to explain surprising
behavior. For example, source-map staleness should be logged or warned as
"source map may be stale"; a missing source map should say "build the target";
an approximate stack entry should remain visibly approximate. Silent fallback is
only appropriate for harmless UI defaults.

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
