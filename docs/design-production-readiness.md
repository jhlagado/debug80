# Design: Production-Ready VS Code Extension

**Status:** Active design note  
**Scope:** Packaging, dependencies, platform compatibility, and unfinished design consolidation  
**Last updated:** 2026-05-10

## Goal

Debug80 should be installable from the VS Code Marketplace without requiring users to install
external assembler tools, clone sibling repositories, or know about the local development setup.
The extension should work predictably on macOS, Linux, and Windows.

## Current Direction

The extension keeps modern TypeScript source syntax, but continues to emit the VS Code extension host
as CommonJS for now. That is a packaging/runtime choice, not a source-code style preference.
Assembler-specific module-system differences are isolated behind backend adapters:

- `asm80` is CommonJS-compatible and is linked in-process by `src/debug/launch/asm80-backend.ts`.
- `@jhlagado/zax` is ESM and is linked in-process by `src/debug/launch/zax-backend.ts` using dynamic
  `import()`.
- Debug80 launch/rebuild code talks only to the async `AssemblerBackend` interface.

This avoids global CLI dependencies while deferring a full Debug80 ESM migration to a separate,
deliberate compatibility project.

## Publishability Requirements

1. **Bundled runtime dependencies**
   - `asm80` and `@jhlagado/zax` must remain in `dependencies`, not `devDependencies`.
   - `npm run package` must include both packages in the VSIX.
   - Published behavior must not depend on `PATH`, `npm link`, or globally installed CLIs.

2. **Assembler artifact contract**
   - asm80 writes HEX, compact BIN, and LST from in-process compiled output.
   - ZAX writes HEX, LST, native D8M, and lowered `.z80` from in-memory artifacts.
   - HEX/D8M are authoritative for sparse address spaces; raw BIN is a convenience artifact and has
     no embedded load address.

3. **Windows compatibility**
   - All generated paths must use Node `path` APIs for filesystem operations.
   - Serialized map/source paths should use Debug80 portable-path helpers where they cross artifact
     or webview boundaries.
   - VSIX validation should be run on Windows CI before marketplace release.

4. **Extension-host behavior**
   - Extension activation must not assume an activity-bar view is present.
   - Debug80 should remain usable from the secondary side bar and the command palette.
   - Project initialization must work from an empty folder with no `.vscode` folder requirement.

5. **Verification before release**
   - `npm run package:check`
   - Inspect VSIX contents for required runtime dependencies and bundled assets.

## Module-System Policy

Debug80 does not need to migrate to ESM to be modern at the source level. The source is TypeScript
modules already. A runtime ESM migration is still worth evaluating, but it is not a prerequisite for
direct-linked assemblers or marketplace readiness.

If pursued, the ESM migration should be its own issue and should include:

- replacing `__dirname` / `__filename` assumptions;
- checking `createRequire` usages;
- validating VS Code extension activation in the extension host;
- validating Vitest and webview build behavior;
- confirming asm80 can still be loaded cleanly;
- packaging and installing the produced VSIX on macOS, Linux, and Windows.

## Active Design Documents

These documents still describe active or recently active decisions:

- `docs/design-debug80-ide-ux.md`
- `docs/design-project-workflow.md`
- `docs/design-platform-ui-runtime-behaviors.md`
- `docs/design-zax-source-support.md`
- `docs/design-prefer-native-d8-maps.md`
- `docs/design-assembler-abstraction.md`
- `docs/codebase-status-and-e2e-plan.md`

`docs/codebase-improvement-plan.md` is historical plus residual cleanup guidance; it should not be
treated as the active backlog.

## Deferred Work

- Evaluate full Debug80 ESM runtime output.
- Add a stable top-level ZAX library export so Debug80 can import `@jhlagado/zax` rather than deep
  `dist/src/...` modules.
- Follow `docs/release-process.md` for local VSIX testing and eventual Marketplace publishing.
- Add Windows-specific smoke testing for project creation, assembly, source mapping, and launch.
