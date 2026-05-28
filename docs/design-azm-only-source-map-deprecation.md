# AZM-Only Source Map Removal Plan

## Decision

Debug80 should no longer reconstruct debugger source maps from assembler
listings. AZM is now the supported assembler and emits native `.d8.json` maps.
That file is the source of truth for source breakpoints, current source
location, F12 navigation, hover data, Variables, Watches, call stack labels, and
ROM source stepping.

The old listing-derived path is not a supported fallback. If a required D8 map
is missing or invalid, Debug80 should report that the target needs to be built
with AZM. It should not parse `.lst` files, regenerate maps, silently use stale
compatibility caches, or recover by guessing source paths.

## Target Contract

A runnable Debug80 target has:

- a program artifact, normally Intel HEX or binary;
- a native Debug80 source map, `<artifactBase>.d8.json`;
- source files resolvable from the project root and configured source roots;
- optional platform/ROM D8 maps for monitor code and bundled ROM sources.

The assembler owns map correctness. Debug80 consumes and validates D8 maps.

## What Must Be Removed

The following are compatibility mechanisms, not desired architecture:

- primary source map generation from `.lst` files;
- stale-map fallback from D8 to listing parsing;
- Layer 2 listing/source recovery in the active launch path;
- Debug80-generated compatibility D8 maps from listing content;
- `.lst` breakpoint binding as a first-class debugger workflow;
- `extraListings` as the platform ROM mapping mechanism;
- project scaffolding that materializes or configures ROM listings as debug
  metadata;
- user-facing schema/docs that present listing files as normal launch inputs;
- tests whose only purpose is proving listing-derived source maps still work.

## What Can Stay

Some listing-adjacent concepts are not fallback paths and can remain:

- D8 fields such as `lstLine`, `lstText`, or shared listing text tables, because
  they are data inside the native map;
- syntax highlighting for `.lst` files as a viewer convenience, if still useful;
- low-level Intel HEX loading code;
- parser tests for historical files only if they are no longer connected to the
  debug launch path.

## Staged Removal

### Stage 1: Runtime Cut To Native D8 Only

Goal: stop the active launch path from deriving maps from listings.

- Replace `buildMappingFromListing` behavior with native D8 loading.
- Keep existing function names only where changing them would balloon the first
  patch.
- If the primary D8 map is absent or invalid, return an empty mapping and log a
  clear build-required message.
- For extra ROM metadata, load native D8 maps beside configured legacy entries
  but do not parse listing content as fallback.
- Keep source-root handling so bundled MON3 D8 maps still bind breakpoints.
- Update tests to prove native D8 behavior and missing-map behavior.

Expected result: Debug80 no longer fabricates source maps from `.lst` files.

### Stage 2: Rename The Model

Goal: make names match reality.

- Introduce `debugMap`, `debugMaps`, or `romDebugMaps` config fields.
- Migrate bundled profiles to point at `.d8.json`.
- Keep `extraListings` only as a temporary migration alias that is translated to
  adjacent `.d8.json` paths.
- Rename internal `listingPath` usage where it now means artifact base or map
  sidecar location.

Expected result: new code and config no longer teach the listing mental model.

### Stage 3: Remove Listing Breakpoint And ROM Listing Workflows

Goal: source files and D8 maps become the only debugger workflow.

- Remove breakpoint binding directly against `.lst` files.
- Change “Open ROM Listing/Source” into “Open ROM Source” backed by D8/source
  metadata.
- Stop materializing bundled `.lst` files into new projects.
- Keep bundled `.lst` files only if they are documentation/reference assets.

Expected result: users debug source, not listings.

### Stage 4: Delete Legacy Modules And Tests

Goal: remove cruft after all runtime callers are gone.

- Delete listing-to-map generation code.
- Delete active-path Layer 2 recovery code.
- Delete stale listing cache checks.
- Delete tests that only validate fallback behavior.
- Remove user-facing schema/docs for `listing` and `extraListings`.
- Remove the `asm80` assembler alias and related docs.

Expected result: Debug80 has one source-map architecture.

## First PR Scope

The first PR should implement Stage 1 only:

- no listing-derived source map fallback at runtime;
- native primary D8 required for project source mapping;
- native extra D8 maps loaded for ROM/platform sources;
- clear logs when a D8 map is missing or invalid;
- regression coverage for source breakpoints and bundled MON3 breakpoints.

It should not attempt the large rename from `listing` to `debugMap` yet. That is
the next PR, after behavior is already D8-only.
