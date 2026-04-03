# Debug80 Platform Extension API

This guide explains how to add new Debug80 platforms without editing the core
extension directly. It covers the runtime/provider contract, the extension API
surface added in the lazy-loading work, and the optional UI registration path
for custom sidebar panels.

## 1. Overview

Debug80 now resolves platforms through lazy manifests instead of a hard-coded
switch statement in the adapter or extension layer.

There are two related registries:

- Adapter/runtime registry: [src/platforms/manifest.ts](../src/platforms/manifest.ts)
  stores `PlatformManifestEntry` records and lazy-loads `ResolvedPlatformProvider`
  implementations.
- Extension/UI registry: [src/extension/platform-view-manifest.ts](../src/extension/platform-view-manifest.ts)
  stores optional sidebar UI loaders for platforms that need a custom panel.

That split matters because many platforms only need runtime behavior. If your
machine can live with the generic terminal workflow, you only need to register a
 platform provider. If it needs a machine-specific sidebar panel, you can also
register platform UI modules.

Lazy loading improves startup time in two ways:

- The debug adapter does not import every platform runtime on activation.
- The extension does not construct every platform sidebar UI on startup.

Both registries are activated on demand, when a session or panel actually needs
the platform.

## 2. Built-in platforms

Debug80 currently ships three built-in platform ids:

- `simple`
  - Runtime code: [src/platforms/simple/provider.ts](../src/platforms/simple/provider.ts) and [src/platforms/simple/runtime.ts](../src/platforms/simple/runtime.ts)
  - Intended for generic ROM/RAM layouts plus terminal I/O.
  - Uses the generic terminal panel rather than a custom sidebar UI.
- `tec1`
  - Runtime code: [src/platforms/tec1/provider.ts](../src/platforms/tec1/provider.ts) and [src/platforms/tec1/runtime.ts](../src/platforms/tec1/runtime.ts)
  - UI modules: [src/platforms/tec1/ui-panel-html.ts](../src/platforms/tec1/ui-panel-html.ts), [src/platforms/tec1/ui-panel-state.ts](../src/platforms/tec1/ui-panel-state.ts), [src/platforms/tec1/ui-panel-messages.ts](../src/platforms/tec1/ui-panel-messages.ts)
  - Provides keypad, display, serial, and memory-panel workflows.
- `tec1g`
  - Runtime code: [src/platforms/tec1g/provider.ts](../src/platforms/tec1g/provider.ts) and [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts)
  - UI modules: [src/platforms/tec1g/ui-panel-html.ts](../src/platforms/tec1g/ui-panel-html.ts), [src/platforms/tec1g/ui-panel-state.ts](../src/platforms/tec1g/ui-panel-state.ts), [src/platforms/tec1g/ui-panel-messages.ts](../src/platforms/tec1g/ui-panel-messages.ts)
  - Adds matrix keyboard, LCD, GLCD, banking, RTC, and cartridge flows.

The built-ins are registered during activation in [src/extension/extension.ts](../src/extension/extension.ts) and in the adapter manifest at [src/platforms/manifest.ts](../src/platforms/manifest.ts).

## 3. Writing a new platform

The minimum adapter-side unit is a `ResolvedPlatformProvider`. The exact type is
defined in [src/platforms/provider.ts](../src/platforms/provider.ts), but the
important members are:

- `id`
  - The platform string used in `debug80.json`.
- `payload`
  - The session payload sent to the extension as `debug80/platform`.
  - At minimum this includes `{ id }`.
- `registerCommands()`
  - Registers custom DAP requests in the platform registry.
- `buildIoHandlers()`
  - Returns the Z80 port handlers and any platform runtime handles.
- `resolveEntry()`
  - Returns the actual entry point to boot.
- `loadAssets()`
  - Optional hook for ROMs, cartridge images, or other external artifacts.
- `finalizeRuntime()`
  - Optional hook for post-runtime wiring such as memory overlays.

In practice, most platforms also expose normalized config on the provider so the
launch path can feed ROM overlays, listings, and runtime options into the core.

### Provider checklist

- Implement `buildIoHandlers()` to map Z80 port reads/writes into your machine's
  peripheral behavior.
- Keep custom requests in `registerCommands()` so adapter command routing stays
  platform-local.
- Use `resolveEntry()` instead of hard-coding entry logic into the launch
  sequence.
- Use `loadAssets()` for optional files that may be absent or user-supplied.
- Use `finalizeRuntime()` when runtime hooks depend on both loaded assets and an
  already-created Z80 runtime.

## 4. Registering a platform via the extension API

The public extension API is returned from `activate()` in
[src/extension/extension.ts](../src/extension/extension.ts):

```ts
export interface Debug80Api {
  registerPlatform: (entry: PlatformManifestEntry) => void;
  listPlatforms: () => PlatformManifestEntry[];
}
```

Another VS Code extension can consume it with standard inter-extension APIs:

```ts
import * as vscode from 'vscode';
import type { Debug80Api } from 'debug80/out/extension/extension';

export async function activate(): Promise<void> {
  const debug80Extension = vscode.extensions.getExtension<Debug80Api>('jhlagado.debug80');
  if (!debug80Extension) {
    return;
  }

  const debug80 = await debug80Extension.activate();

  debug80.registerPlatform({
    id: 'myplatform',
    displayName: 'My Z80 Platform',
    loadProvider: async (args) => {
      const { createMyPlatformProvider } = await import('./provider');
      return createMyPlatformProvider(args);
    },
  });
}
```

Your wrapper extension should declare `jhlagado.debug80` in
`extensionDependencies` so Debug80 is available before you register the platform.

### Worked example: a minimal platform that reuses the Simple runtime

The smallest useful example is often a wrapper around the existing Simple
runtime. That lets you prove registration, launch selection, and packaging
before you build custom hardware emulation.

```ts
// provider.ts
import type { LaunchRequestArguments } from 'debug80/out/debug/types';
import type { ResolvedPlatformProvider } from 'debug80/out/platforms/provider';
import { createSimplePlatformProvider } from 'debug80/out/platforms/simple/provider';

export function createBlinkBoxPlatformProvider(
  args: LaunchRequestArguments
): ResolvedPlatformProvider {
  const base = createSimplePlatformProvider(args);
  return {
    ...base,
    id: 'blinkbox',
    payload: { id: 'blinkbox' },
  };
}
```

```ts
// extension.ts in your wrapper extension
import type { PlatformManifestEntry } from 'debug80/out/platforms/provider';

export const blinkBoxEntry: PlatformManifestEntry = {
  id: 'blinkbox',
  displayName: 'BlinkBox',
  loadProvider: async (args) => {
    const { createBlinkBoxPlatformProvider } = await import('./provider');
    return createBlinkBoxPlatformProvider(args);
  },
};
```

And the target config becomes:

```json
{
  "platform": "blinkbox",
  "simple": {
    "regions": [
      { "start": 0, "end": 2047, "kind": "rom" },
      { "start": 2048, "end": 65535, "kind": "ram" }
    ],
    "appStart": 2304,
    "entry": 0
  }
}
```

That example does not add custom UI or peripherals yet. It proves the extension
API contract first, then you can replace the wrapped Simple provider with your
own runtime as the platform grows.

## 5. Platform UI panels (optional)

Platforms that need a custom sidebar panel can also register UI modules through
[src/extension/platform-view-manifest.ts](../src/extension/platform-view-manifest.ts).

The relevant types are:

- `PlatformUiEntry`
- `PlatformUiModules`
- `registerPlatformUi()`
- `loadPlatformUi()`

The built-in TEC-1 and TEC-1G UIs are registered from
[src/extension/extension.ts](../src/extension/extension.ts). A platform UI entry
typically provides:

- `getHtml()`
- `createUiState()`
- `resetUiState()`
- `applyUpdate()`
- `createMemoryViewState()`
- `handleMessage()`
- `buildUpdateMessage()`
- `buildClearMessage()`
- `snapshotCommand`

Conceptually, the registration looks like this:

```ts
registerPlatformUi({
  id: 'blinkbox',
  loadUiModules: async () => {
    const [html, state, messages, memory] = await Promise.all([
      import('./ui-panel-html'),
      import('./ui-panel-state'),
      import('./ui-panel-messages'),
      import('./ui-panel-memory'),
    ]);

    return {
      getHtml: html.getBlinkBoxHtml,
      createUiState: state.createBlinkBoxUiState,
      resetUiState: state.resetBlinkBoxUiState,
      applyUpdate: state.applyBlinkBoxUpdate,
      createMemoryViewState: memory.createMemoryViewState,
      handleMessage: messages.handleBlinkBoxMessage,
      buildUpdateMessage: state.buildBlinkBoxUpdateMessage,
      buildClearMessage: state.buildBlinkBoxClearMessage,
      snapshotCommand: 'debug80/tec1MemorySnapshot',
    };
  },
});
```

Use this only when the platform genuinely needs a machine-specific sidebar. Many
platforms can stay on the generic terminal path.

## 6. Packaging a platform as an NPM package

The cleanest packaging model is:

1. One package for the platform implementation.
2. One thin VS Code wrapper extension that depends on Debug80 and registers the
   platform during activation.

Recommended structure:

- `debug80-myplatform`
  - exports `createMyPlatformProvider`
  - may also export `PlatformUiEntry` helpers if you ship custom UI
- `debug80-myplatform-vscode`
  - declares `extensionDependencies: ["jhlagado.debug80"]`
  - imports the provider package
  - calls `await debug80.activate()` and then `registerPlatform(...)`

This keeps emulator/runtime code reusable outside the VS Code wrapper and keeps
your platform package testable without the extension host.

## 7. Testing a platform in isolation

Debug80 already contains good patterns for provider- and UI-level testing.

Useful references:

- Provider contract tests: [tests/platforms/provider.test.ts](../tests/platforms/provider.test.ts)
- Platform host/runtime wiring: [tests/debug/platform-host.test.ts](../tests/debug/platform-host.test.ts)
- Extension UI lazy-loading: [tests/extension/platform-view-provider.test.ts](../tests/extension/platform-view-provider.test.ts)
- Message routing: [tests/extension/platform-view-messages.test.ts](../tests/extension/platform-view-messages.test.ts)
- Platform-specific runtime tests: [tests/platforms](../tests/platforms)

Recommended approach:

1. Start with provider tests that assert `resolveEntry()`, custom command
   registration, and I/O construction.
2. Add runtime/peripheral tests for the actual memory and port semantics.
3. Add UI HTML/state/message tests only if the platform has a custom sidebar.
4. Add one smoke launch target in a fixture workspace once the provider is stable.

## 8. Related docs

- [docs/platforms.md](./platforms.md) for the platform model and config spec
- [docs/platform-development-guide.md](./platform-development-guide.md) for runtime/UI implementation guidance
- [docs/technical.md](./technical.md) for the extension and adapter architecture