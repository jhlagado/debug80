# Atom-first Nucleus and Debug80 roadmap audit

Status: current-goal completion audit, final gates passed on `main` at
`cb91f2cbf7bd7ecac213b5cc8272de1bad2299d7` before this audit document was
committed.

Scope: this document audits the roadmap for making Atom the first-class
assembler path for Nucleus and Debug80. It does not claim the later Atom-only
state where all AZM compatibility backends, comparison tools, and strict
contract sidecars have been removed.

## Current result

Atom is the normal path for Nucleus publication, Nucleus runtime linking,
Debug80 `.asm` assembly when selected by flavour, and the Atom command-line
package. AZM remains available where it still provides explicit compatibility
coverage, byte-comparison history, or strict-contract authority.

## Requirement audit

| Requirement | Current state | Evidence |
|---|---|---|
| Nucleus has a safe include convention that preserves extent labels. | Complete for the current host-prepared model. Nucleus accepts leading `//% import "path"` only, leaves compiler-visible source as Nucleus source, and rejects malformed or late source-preparation directives before compiler input exists. | `packages/nucleus/src/source-preparation.ts`; `packages/nucleus/test/proof-harness.test.ts`; `packages/nucleus/test/application.test.ts`; `docs/specifications/z80-source-preparation.md` |
| Late include composition has permanent Atom execution. | Complete. The main harness uses `runPermanentAtomProof`; the smaller NOBJ and LL(1) tests use the same option builder. | See proof-test evidence below. |
| Implementation-module late includes have explicit module-boundary decisions. | Complete for the current migration boundary. Permanent Atom source exists under `packages/nucleus/atom-asm`, and the materialize/check scripts enforce that generated Atom source stays synchronized with the checked migration metadata. | `packages/nucleus/atom-asm/`; `packages/nucleus/scripts/atom-migration-materialize.mjs`; `packages/nucleus/scripts/atom-migration-proof-run.mjs`; `packages/nucleus/src/atom-proof-options.ts` |
| Runtime-wrapper include batch is clean enough for the Atom-first path. | Complete for the current path. `loadCanonicalRuntimeImage` defaults to Atom, packages both runtime source trees, and loads the AZM runtime assembler only inside the explicit AZM compatibility branch. | `packages/nucleus/src/nucleus-runtime.ts`; `packages/nucleus/test/nobj.test.ts`; `packages/nucleus/test/azm-boundary.test.ts` |
| Atom expression policy stays single-pass unless evidence justifies redesign. | Complete for this roadmap. The current architecture keeps expression handling within Atom's single-pass host/native source-preparation model; no two-symbol patch redesign is part of the current proven path. | `packages/atom/docs/architecture.md`; `packages/atom/docs/host-source-preparation.md`; `docs/specifications/atom-platform-architecture.md` |
| More Nucleus assembly has permanent Atom source while preserving fallback. | Complete for the current first-class path. Active Nucleus proof publication and runtime linking default to Atom; explicit AZM fallback remains for compatibility and strict-contract comparison. | `packages/nucleus/src/publication.ts`; `packages/nucleus/src/proof.ts`; `packages/nucleus/src/legacy-proof-assembler.ts`; `docs/specifications/azm-direct-dependency-inventory.json` |
| Shared host architecture boundaries are consolidated. | Complete for the current boundary. Atom and Nucleus share source-preparation and output-service concepts through `z80-tool-services`, while their preprocessing profiles remain separate. Native Z80-facing paths do not require JSON project parsing. | `docs/specifications/z80-source-preparation.md`; `docs/specifications/tool-service-boundary.md`; `docs/specifications/atom-platform-architecture.md`; `packages/atom/src/host/application/resolve-atom-project.mjs`; `packages/nucleus/src/source-preparation.ts` |
| Debug80 treats Atom as a first-class `.asm` assembler with flavour selection and positive outputs. | Complete for the current extension path. Debug80 schema and tests cover assembler selection, Atom backend publication, `.asm` sources, and positive output paths. | `apps/debug80-vscode/package.json`; `apps/debug80-vscode/src/debug/session/types.ts`; `apps/debug80-vscode/tests/debug/atom-backend.test.ts`; `apps/debug80-vscode/tests/debug/nucleus-backend.test.ts`; `apps/debug80-vscode/tests/debug/config-validation.test.ts` |
| Atom release hardening remains green. | Complete for this audit. `npm run release:check -w atom-z80` passed, including native source/object/CPM checks, host tests, strict contracts, host-native measurement, and self-host measurement. | `packages/atom/package.json`; `packages/atom/docs/release-checklist.md`; `packages/atom/test/host-package.test.mjs` |

## Remaining AZM surface

The current AZM surface is intentionally inventoried rather than hidden. It is
not part of the normal Atom-first route unless a caller explicitly asks for AZM
or invokes a compatibility/comparison tool.

The inventory classifies each direct `@jhlagado/azm` import outside
`packages/azm`:

- Debug80 explicit AZM backend compatibility.
- Atom oracle and strict-contract checks.
- Nucleus legacy proof and runtime comparison boundaries.
- Glimmer compatibility.
- archived or development tooling.

The broader Atom-only cleanup phase can remove these only after Atom has an
independent replacement for the remaining comparison and strict-contract
evidence.

## Proof-test evidence

Permanent Atom proof execution is checked in:

- `packages/nucleus/test/proof-harness.test.ts`
- `packages/nucleus/test/nobj-proof-runner.test.ts`
- `packages/nucleus/test/ll1-stage7.test.ts`

## Final gate results

These gates passed on the current tree:

1. Atom release gate: `npm run release:check -w atom-z80`.
   - Host tests: 338 passed.
   - Measured Atom native account: 11,682 code/table bytes, 714 fixed
     workspace bytes, 12,396 linked resident bytes, and 3,988 physical bytes
     below 16 KiB.
   - Self-host equivalence: pinned AZM core, translated source, and second Atom
     generation all matched.
2. Nucleus Atom migration gate: `npm run check:atom -w @jhlagado/nucleus`.
   - Permanent source check: 291 files, 0 issues, 0 differences.
   - Comparison: 29 manifests checked, 26 byte-identical, 3 measurement
     artifacts skipped.
   - Execution: 26 permanent Atom proof images passed, 3 measurement artifacts
     skipped.
3. Nucleus publication/proof gate:
   - `npm run typecheck` from `packages/nucleus`.
   - `npx vitest run test/proof-harness.test.ts test/nobj-proof-runner.test.ts
     test/ll1-stage7.test.ts test/publication-cli.test.ts
     test/application.test.ts test/azm-boundary.test.ts --reporter=verbose`.
   - Result: 88 tests passed.
4. Debug80 package gate: `npm run package:check -w debug80`.
   - Extension tests: 1,008 passed, 1 skipped.
   - Webview tests: 298 passed, 1 skipped.
   - VSIX verification: 701 packaged entries checked.
5. AZM dependency inventory: `node scripts/check-azm-dependency-inventory.mjs`.
   - Result: 21 direct AZM compatibility paths classified.

The first-class Atom roadmap is complete under this audit. The next goal should
be the separate Atom-only cleanup phase.
