# Nucleus Host API 1

## Status and authority

This document defines the supported Node and command-line interfaces for the
standalone Nucleus 0.1 compiler package. The language specification governs
source syntax and meaning. The target-system specification governs target
layout. This interface transports those inputs to the authoritative Z80
compiler and returns its committed artifacts.

Host API 1 does not expose compiler workspace addresses, trace collection or
AZM symbols. Those details may change while the interface in this document
remains compatible.

## Compiler object

Create one compiler object and reuse it for successive builds:

```ts
import { createNucleusCompiler } from "@jhlagado/nucleus";

const compiler = createNucleusCompiler();
const result = await compiler.build({
  sources: [
    {
      name: "src/main.nu",
      source: new TextEncoder().encode("sub main()\nend\n"),
    },
  ],
  target,
  artifacts: { hex: true, d8: true },
});
```

`sources` is an ordered array. `name` is the exact diagnostic source identity;
D8 renders its path separators as `/`. When D8 is requested, these portable
names must be unique, so `a\\b.nu` and `a/b.nu` conflict. `source` accepts a
string or `Uint8Array`. The host preserves source bytes, CRLF handling and
synthesized final-newline behaviour defined by Nucleus 0.1.

`artifacts.hex` requests a flat Intel HEX launch image. `artifacts.d8` requests
one D8 artifact for a flat target or one artifact for every physical bank. NOBJ
is always present after a successful build and remains the canonical compiler
result.

`compileNucleus()` remains available as the low-level compatibility API. New
tool integrations should use the compiler object because its result classifies
all supported failure kinds.

## Results and failures

A successful result contains:

- in-memory NOBJ and each requested launch or debug artifact;
- the validated materialized NOBJ image;
- executed instruction and T-state counts.

A failed result has one of these `kind` values:

| Kind            | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `source`        | The Z80 compiler rejected source and returned an exact positioned diagnostic. |
| `configuration` | The target, source set, artifact request, or target capacity is invalid.      |
| `execution`     | The emulator, compiler image or output adapter failed to complete normally.   |

The stable API returns these failures rather than mixing source-result objects
with unclassified `Error` and `RangeError` exceptions. A source failure carries
the numeric code, source-part ordinal, diagnostic name, byte offset, line and
byte column emitted by the Z80 compiler.

`formatNucleusDiagnostic()` formats a diagnostic for people.
`nucleusDiagnosticMessage()` returns its descriptive message. Hosts should keep
the numeric code in logs and machine-readable output.

## Target profiles

`parseNucleusTargetProfile()` parses and validates JSON.
`validateNucleusTarget()` validates an existing JavaScript value. A profile may
declare this schema identity:

```json
{
  "schema": "nucleus-target/v1",
  "imageBase": 32768,
  "imageCapacity": 4096,
  "imageFill": 255,
  "writableBase": 16384,
  "writableCapacity": 4096,
  "establishStack": true,
  "services": {
    "readInputByte": 28672,
    "writeOutputByte": 28675,
    "readStorageByte": 28678,
    "rewindStorageInput": 28681,
    "writeStorageByte": 28684,
    "seekStorageOutput": 28687,
    "success": 28690,
    "unhandledFailure": 28693,
    "trap": 28696,
    "farCall": 28699,
    "farJump": 28702
  }
}
```

`imageFill` is an optional byte and defaults to 255. A banked profile uses two
to four banks; a flat profile omits `bankCount`, `entryBank`, and `partBanks`.
A flat writable region
wholly inside the image selects loaded mode; a wholly separate region selects
ROM mode. Partial overlap is invalid, and banked writable storage must remain
outside the bank window.

Validation rejects unknown fields, non-word addresses, zero-length regions, invalid bank ordinals,
source-bank count mismatches and regions that extend beyond the Z80 address
space. A launch build requires all eleven service addresses. The library's
omitted-target defaults remain available to conformance tests, but they are
synthetic addresses rather than a machine integration.

## Project files

A project file records ordered source, target and output identities:

```json
{
  "schema": "nucleus-project/v1",
  "root": ".",
  "sources": ["src/model.nu", "src/main.nu"],
  "target": "nucleus-target.json",
  "outputs": {
    "nobj": "build/program.nobj",
    "hex": "build/program.hex",
    "d8": "build/program.d8.json"
  }
}
```

Paths are resolved from `root`, which is resolved from the project file's
directory. Source order is significant. The project file performs packaging;
it adds no import, module or dependency-search rule to the language.

`parseNucleusProject()` validates the document without reading its files. The
CLI and Debug80 read sources in the declared order.

## Compiler information

`await compiler.info()` returns:

- host API and language versions;
- runtime identity;
- one SHA-256 fingerprint for each normal or D8 compiler image together with
  the exact symbol map paired with it;
- host source, execution and target limits;
- flat and banked target capabilities.

Release builds contain compiler images generated from the checked AZM source.
`npm run check:compiler-images` assembles both layouts afresh and rejects stale
embedded bytes or symbol maps. AZM remains the build-time authority; the Node
package and Debug80 execute the generated Z80 images directly.

The repository retains `dist` so a commit-pinned Git dependency can run without
assembling the compiler during npm's isolated Git preparation. The
`prepublishOnly` gate verifies and rebuilds those files before registry
publication, and CI verifies that the embedded compiler images match the AZM
sources.

Until `@jhlagado/debug80-runtime` is published, its peer entry is marked
optional to npm so Git dependency preparation does not try to download it from
the registry. The runtime remains operationally required: Debug80 supplies its
workspace package, and any other host must supply the same compatible package.

## Filesystem publication

The compiler API returns bytes and text without writing files.
`publishNucleusBuildOutputs()` optionally publishes NOBJ, HEX and the complete
flat-or-banked D8 group as one recoverable best-effort transaction. It writes
temporary files beside their destinations, backs up the previous generation,
promotes the new set and restores the previous set after a caught promotion
failure. Sequential filesystem renames are not atomic to concurrent readers or
across a process or machine failure.

Debug80 validates every in-memory D8 artifact through its normal D8 validator
before calling this publication function.

## Command line

```text
nucleus build [options] source.nu [more.nu ...]
nucleus build --project nucleus-project.json
nucleus target validate target.json
nucleus capabilities --json
```

The existing `-o`, `--hex-output`, `--d8-output` and `--target-profile`
switches remain compatible. Host integrations can select
`--diagnostic-format json` or `--json`. JSON mode also covers usage,
configuration, filesystem and compiler-execution failures. Human-readable
diagnostics include a descriptive message and stable numeric code.

Exit status zero means success. Status one means the requested build failed.
Status two means command use, configuration, filesystem or compiler execution
failed before a successful build could be published.
