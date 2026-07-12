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

The source-of-truth strategy lives in `debug80/docs/regression-test-strategy.md`.

---

## Test layers

| Layer                    | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| Unit and contract tests  | CPU, mapping, assembler backends, configuration, webview helpers           |
| Adapter E2E tests        | Launch, breakpoints, stepping, restart, memory/register writes             |
| Webview contract tests   | Project controls, message contracts, UI state invariants                   |
| VS Code host integration | Activation, commands, views, workspace behavior through real VS Code APIs  |
| VSIX content check       | Runtime dependencies and packaged assets are present; dev debris is absent |
| Packaged VSIX smoke      | Installed extension behaves like the user-facing product                   |

---

## High-value regression scenarios

The most important scenarios to keep guarded are:

- AZM assembles through the packaged linked library backend, not global CLIs;
- Glimmer assembles `.glim` sources into `.hex`, `.bin`, `.asm`, and `.d8.json` with diagnostics attributed back to authored Glimmer lines;
- sparse `ORG` programs preserve address-bearing HEX/D8M behavior;
- breakpoints verify and stop in target and included source files;
- Windows-style and portable paths resolve consistently;
- register writes apply to the runtime;
- RAM writes apply and ROM writes obey the protection policy;
- initialized, uninitialized, and empty-workspace project states render correctly;
- platform selection is only shown where it is meaningful;
- VSIX packaging includes assembler dependencies and ROM resources.

---

## Performance as a regression surface

Performance regressions are product bugs in Debug80. The risky pattern is repeated rebuilding or
rerendering inside high-frequency loops: runtime execution, display scanning, memory/register
refreshes, source-map lookups, and webview DOM updates.

Regression tests should use broad thresholds. The goal is to catch order-of-magnitude mistakes,
such as rebuilding decoder tables per instruction or rendering unchanged memory rows on every tick,
not to fail because one CI runner is slightly slower.

Manual diagnosis should continue to use runtime instrumentation such as `DEBUG80_PERF=1`, with
severe starvation warnings visible in the Debug80 output channel.
