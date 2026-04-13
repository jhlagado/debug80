[Part VII](README.md) | [Custom Commands, UI Panels, and Source Mapping →](17-custom-commands-ui-and-mapping.md)

# Chapter 16 — Adding a New Platform

A platform in debug80 is a self-contained module that provides memory layout, I/O port handlers, optional hardware emulation, and the custom DAP commands the webview uses to drive it. This chapter walks through the full process of adding one.

The guide uses a placeholder name `myplatform` throughout. Replace it with your platform's actual identifier.

---

## What a platform provides

Before writing any code, understand what the platform contract requires:

1. **Memory layout** — which address ranges are ROM, which are RAM, and where the entry point is.
2. **I/O handlers** — `IN` and `OUT` port callbacks that the Z80 runtime calls when the program accesses hardware.
3. **Custom DAP commands** — requests the webview can send to drive hardware (key presses, resets, speed changes).
4. **Config normalisation** — taking the raw `debug80.json` config block and applying defaults.

An optional fifth responsibility is a sidebar UI panel. That is covered in Chapter 17.

---

## File layout

Follow the existing platform convention:

```
src/platforms/myplatform/
├── provider.ts      # Creates the ResolvedPlatformProvider
├── runtime.ts       # Config normalisation; hardware state and I/O handlers
└── constants.ts     # Shared constants (clock speed, port addresses, etc.)
```

The `simple` platform is the smallest reference — read it before writing anything. The `tec1` platform is the best reference for a hardware-oriented platform with ports, display state, and a custom event loop.

---

## Step 1: Define your config types

In `src/platforms/myplatform/runtime.ts`, define the raw and normalised config shapes:

```typescript
import type { SimpleMemoryRegion } from '../simple/types.js';

export interface MyplatformConfig {
  regions?: SimpleMemoryRegion[];
  entry?: number;
  appStart?: number;
}

export interface MyplatformConfigNormalized {
  regions: SimpleMemoryRegion[];
  romRanges: Array<{ start: number; end: number }>;
  entry: number;
  appStart: number;
}
```

The raw form has all fields optional — these come directly from the user's `debug80.json`. The normalised form has all fields required and is what the rest of the platform code works with.

Write a `normalizeMyplatformConfig()` function that takes a `MyplatformConfig | undefined` and returns a `MyplatformConfigNormalized`. Apply sensible defaults: a ROM at `0x0000–0x3FFF`, a RAM at `0x4000–0xFFFF`, and entry at `0x0000` is a reasonable starting point for most Z80 hardware.

The `romRanges` field on the normalised config is derived from whichever `regions` entries have `kind: 'rom'`. The Z80 runtime uses this array to ignore writes to protected addresses.

---

## Step 2: Define hardware state

If your platform has stateful hardware (display, keyboard, speaker), define a state struct:

```typescript
export interface MyplatformState {
  // Display
  displayValue: number;
  // Input
  keyCode: number;
  // ...
  cycleClock: CycleClock;
  clockHz: number;
  speedMode: 'fast' | 'slow';
  lastUpdateMs: number;
  pendingUpdate: boolean;
}
```

If your platform is purely computational (no hardware to emulate), omit this entirely and use the `simple` platform as your model instead.

---

## Step 3: Implement I/O handlers

The Z80 runtime calls `ioRead(port)` and `ioWrite(port, value)` whenever the program executes `IN` or `OUT`. Define these in `runtime.ts`:

```typescript
export function createMyplatformIoHandlers(
  state: MyplatformState,
  callbacks: PlatformIoCallbacks
): { ioRead: (port: number) => number; ioWrite: (port: number, value: number) => void } {
  return {
    ioRead(port) {
      switch (port & 0xFF) {
        case 0x00: return readKeyboardPort(state);
        default:   return 0xFF;
      }
    },
    ioWrite(port, value) {
      switch (port & 0xFF) {
        case 0x01: handleDisplayPort(state, value, callbacks); break;
      }
    },
  };
}
```

After any write that changes visible hardware state, call `queueUpdate()` to schedule a UI refresh. Throttle updates to ~60fps using the `shouldUpdate()` utility from `src/platforms/tec-common/`:

```typescript
function queueUpdate(state: MyplatformState, callbacks: PlatformIoCallbacks): void {
  state.pendingUpdate = true;
  if (shouldUpdate(state)) {
    sendUpdate(state, callbacks);
  }
}
```

`sendUpdate()` assembles a payload and calls `callbacks.onMyplatformUpdate(payload)`. The extension host receives this as a DAP event and forwards it to the webview.

If your platform has no hardware display, the `buildIoHandlers` implementation can use `buildPlatformIoHandlers` from `src/platforms/tec-common/provider.ts` directly, as the `simple` platform does.

---

## Step 4: Implement the provider

`src/platforms/myplatform/provider.ts` exports a single factory function:

```typescript
import type { LaunchRequestArguments } from '../../debug/launch-args.js';
import type { ResolvedPlatformProvider } from '../provider.js';
import { normalizeMyplatformConfig } from './runtime.js';

export function createMyplatformPlatformProvider(
  args: LaunchRequestArguments
): ResolvedPlatformProvider {
  const config = normalizeMyplatformConfig(args.myplatform);

  return {
    id: 'myplatform',
    payload: { id: 'myplatform' },
    extraListings: [],
    runtimeOptions: { romRanges: config.romRanges },

    registerCommands(registry, context) {
      // Covered in Chapter 17
    },

    async buildIoHandlers(callbacks) {
      // Build and return I/O handler set
      const state = createMyplatformState(config);
      const handlers = createMyplatformIoHandlers(state, callbacks);
      return {
        ioRead: handlers.ioRead,
        ioWrite: handlers.ioWrite,
        tick: () => myplatformTick(state),
        state,
      };
    },

    resolveEntry: () => config.entry,

    finalizeRuntime(context) {
      // Install memory hooks if needed (shadow RAM, banking, etc.)
    },
  };
}
```

The `tick()` function returned from `buildIoHandlers` is called once per CPU instruction. Return `{ nonMaskable: true }` from it when your hardware needs to trigger an NMI (as the TEC-1 keyboard does). Return `undefined` when nothing special is needed.

---

## Step 5: Register in the manifest

Open `src/platforms/manifest.ts`. Add your platform to the `platformEntries` Map:

```typescript
platformEntries.set('myplatform', {
  id: 'myplatform',
  displayName: 'My Platform',
  loadProvider: async (args) => {
    const { createMyplatformPlatformProvider } = await import('./myplatform/provider.js');
    return createMyplatformPlatformProvider(args);
  },
});
```

The dynamic import keeps the platform code out of the initial extension bundle. It is loaded only when a `myplatform` debug session actually starts.

That is all the wiring required. No changes to `package.json` are needed — the extension discovers platforms entirely through the manifest at runtime.

---

## Step 6: Declare the config block in launch args

Open `src/debug/launch-args.ts` and add your config field to `LaunchRequestArguments`:

```typescript
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  // ... existing fields ...
  myplatform?: MyplatformConfig;
}
```

Users can now write:

```json
{
  "type": "z80",
  "request": "launch",
  "platform": "myplatform",
  "myplatform": {
    "entry": 0,
    "appStart": 16384
  }
}
```

---

## Step 7: Test the skeleton

At this point, with `registerCommands` left empty and no webview UI, the platform should be functional enough to:

- Launch a debug session (`debug80.startDebug`)
- Assemble and load the program
- Run, pause, step, and set breakpoints
- Receive I/O port calls

Verify with a minimal Z80 program that writes to a port and halts. Check the debug console for errors from the launch pipeline. Common issues at this stage:

- Config normalisation returning an invalid `romRanges` array (start > end, overlapping ranges)
- `resolveEntry()` returning `undefined` when no `entry` was specified and no default was applied
- The `buildIoHandlers` function returning a promise that rejects due to missing state initialisation

---

## Platform naming conventions

| Item | Convention | Example |
|------|-----------|---------|
| Platform ID | lowercase, no hyphens | `myplatform` |
| Config key in `debug80.json` | same as ID | `"myplatform": { ... }` |
| Config type | `{Platform}Config` | `MyplatformConfig` |
| Normalised type | `{Platform}ConfigNormalized` | `MyplatformConfigNormalized` |
| Provider function | `create{Platform}PlatformProvider` | `createMyplatformPlatformProvider` |
| Custom commands | `debug80/{platformId}{Verb}` | `debug80/myplatformReset` |

---

## Using shared utilities

The `src/platforms/tec-common/` package provides utilities shared by TEC-1 and TEC-1G. Any hardware platform should use these rather than reimplementing:

| Utility | Purpose |
|---------|---------|
| `shouldUpdate(state)` | Throttle UI updates to ~60fps |
| `microsecondsToClocks(µs, hz)` | Convert microseconds to cycle count |
| `millisecondsToClocks(ms, hz)` | Convert milliseconds to cycle count |
| `calculateSpeakerFrequency(delta, hz)` | Compute speaker Hz from edge timing |
| `createTecSerialDecoder(baud, hz)` | Bitbang UART decoder |
| `TEC_FAST_HZ` / `TEC_SLOW_HZ` | Standard TEC clock speeds (4 MHz / 400 kHz) |

`CycleClock` from `src/platforms/cycle-clock.ts` is the right tool for any hardware timer that needs cycle-accurate scheduling (key release, speaker silence, serial bit timing).

---

## Summary

- A platform is a `ResolvedPlatformProvider` with six required fields: `id`, `payload`, `extraListings`, `runtimeOptions`, `registerCommands`, `buildIoHandlers`, and `resolveEntry`. `finalizeRuntime` is optional.
- Config is defined in two shapes: raw (all optional, from `debug80.json`) and normalised (all required, with defaults applied). The normalised form derives `romRanges` from regions marked `kind: 'rom'`.
- I/O handlers implement `ioRead`/`ioWrite` callbacks. Hardware state is private to the platform; the only output channel is `callbacks.onMyplatformUpdate()`.
- Register the platform in `manifest.ts` with a dynamic import so it is loaded only when needed.
- Declare the config field in `LaunchRequestArguments` so the launch pipeline passes it through.
- No `package.json` changes are required for a new platform.

---

[Part VII](README.md) | [Custom Commands, UI Panels, and Source Mapping →](17-custom-commands-ui-and-mapping.md)
