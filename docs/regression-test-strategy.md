# Debug80 Regression Test Strategy

Debug80 needs layered regression coverage because it spans pure TypeScript logic, a Debug Adapter
Protocol server, VS Code extension activation, webview UI code, packaged runtime dependencies, and
platform-specific emulation. No single test style can cover all of that reliably.

## Goals

- Catch source mapping, breakpoint, launch, rebuild, and packaging regressions before merge.
- Prove the packaged VSIX contains the runtime dependencies users need.
- Exercise the extension inside a real VS Code Extension Development Host before release.
- Keep fast unit tests fast, and reserve slower VS Code-hosted tests for integration gates.

## Test Layers

| Layer | Tool | Purpose | Gate |
|---|---|---|---|
| Unit and contract tests | Vitest | CPU, mapping, assembler backends, config, webview helpers | Every PR |
| Adapter E2E | Vitest DAP harness | Launch, breakpoints, stepping, restart, memory/register writes | Every PR |
| Webview contract tests | Vitest + DOM environment | Project controls, message contracts, UI state invariants | Every PR |
| VS Code host integration | `@vscode/test-electron` / `@vscode/test-cli` | Activation, commands, views, workspace behavior in real VS Code | PR or release gate |
| VSIX content check | `vsce ls` verification script | Published package includes runtime dependencies and excludes dev debris | Every release candidate |
| Packaged VSIX smoke | Installed VSIX in clean VS Code profile | Proves installed extension works, not just source tree | Release gate |

## Required Regression Scenarios

### Launch and Assembly

- asm80 target assembles in-process and writes HEX, LST, compact BIN.
- ZAX target assembles through direct library linking and writes HEX, LST, D8M, lowered `.z80`.
- Sparse `ORG` programs preserve address-bearing HEX and compact raw BIN semantics.
- Failed assembly reports structured diagnostics.

### Source Mapping and Breakpoints

- Breakpoint in the target source verifies and stops.
- Breakpoint in an included source verifies and stops.
- Native D8 maps are preferred over regenerated maps.
- `lstLine` fallback remains supported for D8 segments.
- Windows-style and portable paths resolve consistently.

### Runtime and Debug Requests

- Launch with `stopOnEntry`.
- Continue to breakpoint.
- Step, step over, and step out.
- Warm rebuild restarts the target.
- Register writes apply to the runtime.
- RAM writes apply; ROM writes obey protect/unprotect policy.

### Performance Regression Contracts

Debug80 should treat performance as a regression surface, not only as manual UX feedback. The
highest-risk pattern is accidentally rebuilding large structures or re-rendering large payloads
inside high-frequency loops.

- Z80 runtime tests should guard decoder/cache reuse and instruction throughput.
- Source-map and symbol lookup tests should guard repeated breakpoint/memory lookups from becoming
  linear scans over large maps.
- Memory/register snapshot tests should guard payload generation from rebuilding avoidable state on
  every refresh.
- Webview tests should guard project controls, registers, memory rows, and display renderers from
  re-rendering unchanged DOM/canvas state unnecessarily.
- Integration smoke tests should run a representative TEC-1G target for a fixed window and record
  instruction rate, effective emulated speed, yield lag, and UI update rate.
- Runtime instrumentation should remain available for manual diagnosis via `DEBUG80_PERF=1`, while
  severe starvation warnings should remain visible in the Debug80 output channel.

These tests should use broad regression thresholds rather than fragile absolute benchmarks. The goal
is to catch order-of-magnitude mistakes such as rebuilding decoder tables per instruction, not to
fail CI because one runner is slightly slower.

### Project and Webview State

- Initialized project shows project and target selectors.
- Uninitialized project hides the target selector and shows platform/init controls.
- Platform selector is rendered exactly once.
- Project selector recovers from stale `Open Folder` state when valid project state arrives.
- Restart and stop-on-entry controls do not cause implicit target restarts unless intended.

### VS Code Extension Host

- Extension activates in an empty workspace without crashing.
- Commands are registered.
- Debug80 view contribution can be opened.
- Workspace folder/project discovery works in a real VS Code API context.
- Project creation works from an empty folder.

### Packaging

- VSIX includes `node_modules/asm80`.
- VSIX includes `node_modules/@jhlagado/zax`.
- VSIX includes `out`, `resources`, `roms`, `schemas`, `syntaxes`, `README.md`, `LICENSE.txt`,
  and `THIRD_PARTY_NOTICES.md`.
- VSIX excludes `src`, `tests`, `docs`, `coverage`, `.fallow`, `.claude`, `.cursor`, `.github`,
  and `.vscode`.

## CI Shape

1. **PR matrix:** macOS, Ubuntu, Windows
   - `npm ci`
   - `npm run lint`
   - `npm run build`
   - `npm test`

2. **Package gate:** Ubuntu
   - `npm ci`
   - `npm run package:check`
   - VSIX content verification script

3. **VS Code host smoke:** macOS and Windows first, Ubuntu later under Xvfb
   - `npm ci`
   - `npm run build`
   - `npm run test:vscode`

4. **Release tag gate:** all of the above
   - Upload VSIX to GitHub Release.
   - Marketplace publish only after protected approval.

## Parallel Implementation Lanes

| Lane | Ownership | Output |
|---|---|---|
| A | Packaging gate | VSIX content verification script and package-check wiring |
| B | VS Code host harness | Real Extension Development Host smoke tests |
| C | Adapter E2E | Include-file breakpoint and artifact launch scenarios |
| D | Webview regressions | Project selector/platform/target state invariants |
| E | Windows/path hardening | Path normalization and D8/source-map portability tests |
| F | Performance contracts | Runtime/cache/webview throughput checks and starvation instrumentation |

Each lane should stay isolated until review. Integration happens only after the lane-specific
verification command passes.
