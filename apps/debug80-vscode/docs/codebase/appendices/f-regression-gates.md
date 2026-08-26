---
layout: default
title: 'Appendix F — Regression Gates'
parent: 'Appendices'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 6
---

[← Appendix E](e-release-and-local-vsix.md) | [Appendices](index.md)

# Appendix F — Regression Gates

Debug80 spans pure TypeScript logic, a Debug Adapter Protocol server, VS Code extension activation,
webview UI code, packaged runtime dependencies, and platform emulation. The test strategy is
therefore layered: fast contract tests catch most regressions, while VS Code-hosted and packaged
VSIX checks cover behavior that only appears in the real extension environment.

The source-of-truth strategy lives in `apps/debug80-vscode/docs/regression-test-strategy.md`.

---

## Test layers

| Layer                    | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| Unit and contract tests  | CPU, mapping, assembler backends, configuration, webview helpers           |
| Runtime package tests    | Shared Z80, loaders, headless session, and platform-runtime invariants     |
| Headless integration     | AZM or Glimmer build output running through the shared runtime             |
| Adapter E2E tests        | Launch, breakpoints, stepping, restart, memory/register writes             |
| Webview contract tests   | Project controls, message contracts, UI state invariants                   |
| VS Code host integration | Activation, commands, views, workspace behavior through real VS Code APIs  |
| VSIX content check       | Runtime dependencies and packaged assets are present; dev debris is absent |
| Packaged workspace smoke | Packed package consumers exercise published CLI and runtime entry points   |
| Packaged VSIX smoke      | Installed extension behaves like the user-facing product                   |

---

## High-value regression scenarios

The most important scenarios to keep guarded are:

- AZM assembles through the packaged linked library backend, not global CLIs;
- Glimmer assembles `.glim` sources into `.hex`, `.bin`, `.asm`, and `.d8.json` with diagnostics attributed back to authored Glimmer lines;
- packed Glimmer tarballs still compile and run a headless TEC-1G scheduling scenario, so release packaging preserves the published `build` entry points and runtime dependencies;
- headless sessions built from `@jhlagado/debug80-runtime/headless` execute the same TEC-1G runtime semantics that the extension uses, including symbol-addressed memory inspection and matrix/video timing boundaries;
- sparse `ORG` programs preserve address-bearing HEX/D8M behavior;
- breakpoints verify and stop in target and included source files;
- Windows-style and portable paths resolve consistently;
- register writes apply to the runtime;
- RAM writes apply and ROM writes obey the protection policy;
- command-driven project setup stays non-interactive when callers supply kit and source choices;
- the CP/M 2.2 launch path publishes the host `.com` artifact, installs it into a private guest disk, preserves BIOS source mapping during the resulting terminal session, and keeps the CP/M terminal webview aligned with full-screen editor control traffic;
- `debug80.getStatus` returns machine-readable project state without scraping the webview DOM;
- AZM contract-update builds return proposed source rewrites without writing files behind the extension host's back;
- initialized, uninitialized, and empty-workspace project states render correctly;
- platform selection is only shown where it is meaningful;
- VSIX packaging includes assembler dependencies and ROM resources.

The VS Code host integration layer now includes two high-value command-path contracts:

- `tests/integration-vscode/suite/project-pipeline.js` scaffolds a project through `debug80.createProject`, builds the target through `debug80.buildTarget`, and reads the resulting state back through `debug80.getStatus({ quiet: true })`.
- `tests/integration-vscode/suite/cpm22-pipeline.js` boots a real CP/M 2.2 guest, verifies the BIOS-mapped terminal transcript, exercises the bundled Atom single-source, large-source, and multipart build paths end to end, then opens the terminal panel and drives the bundled editor through search, replacement, save, quit, and new-file creation.
- `tests/extension/terminal-panel-html.test.ts` treats the terminal webview HTML as a contract: it checks the `cpm22` 80×24 parser, reverse-video rendering, raw control-key mapping, paste forwarding, and the separate debug break message path.

---

## Performance as a regression surface

Performance regressions are product bugs in Debug80. The risky pattern is repeated rebuilding or
rerendering inside high-frequency loops: runtime execution, display scanning, memory/register
refreshes, source-map lookups, and webview DOM updates.

Regression tests should use broad thresholds. The goal is to catch order-of-magnitude mistakes,
such as rebuilding decoder tables per instruction or rendering unchanged memory rows on every tick,
not to fail because one CI runner is slightly slower.

Manual diagnosis should continue to use runtime instrumentation such as `DEBUG80_PERF=1`, with
severe starvation warnings visible in the Debug80 output channel. For cross-package regressions, prefer
the root `npm run check` gate before narrowing down to `npm test -w debug80`, runtime-package tests,
`npm run package:glimmer-headless`, or one of the headless integration workspaces.
