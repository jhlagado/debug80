# Platform Specification (v0.1)

This document defines the "platform" abstraction for Debug80. A platform is a
hosted Z80 environment: memory map, I/O devices, reset/boot rules, and any
machine-specific behavior. The debugger core (DAP + CPU + mapping) stays
unchanged; only the platform supplies the environment.

The format is intentionally simple: select a `platform` in `debug80.json`, then
provide a platform-specific config block. No feature flags.

## Goals

- Support multiple Z80 target environments without changing the core debugger.
- Keep launch config minimal by using the existing target selection.
- Make the terminal-only environment configurable.
- Allow machine profiles (CP/M, Microbee, TEC-1) to be added incrementally.

## Selection and configuration

Platform selection is per target in `debug80.json`:

```json
{
  "defaultTarget": "app",
  "targets": {
    "app": {
      "asm": "src/main.asm",
      "outputDir": "build",
      "artifactBase": "main",
      "platform": "terminal",
      "terminal": {
        "rxPort": 16,
        "txPort": 17,
        "statusPort": 18,
        "newline": "\n"
      }
    }
  }
}
```

`platform` is a string id. The matching config object uses the same key as the
platform id (e.g. `terminal`, `cpm`, `microbee`, `tec1`).

## Folder structure

Platforms live under `src/platforms/`:

```
src/
  platforms/
    terminal/
      index.ts
      devices/
    cpm/
      index.ts
      devices/
    microbee/
      index.ts
      devices/
    tec1/
      index.ts
      devices/
```

Each platform can have its own dependencies. For now all platforms are loaded
and registered on extension startup.

## Core interfaces

The platform interface is minimal but explicit. This is a spec, not exact code:

```ts
export interface PlatformDefinition {
  id: string;
  name: string;
  description?: string;
  create(config: unknown, ctx: PlatformContext): PlatformRuntime;
}

export interface PlatformRuntime {
  memory: MemoryModel;
  io: IODeviceBus;
  onLoad?(ctx: PlatformContext): Promise<void> | void;
  onReset?(ctx: PlatformContext): void;
  interrupts?: InterruptModel;
  memoryMap?: MemoryRegion[];
}
```

### Memory model

The memory model is authoritative for reads/writes during emulation:

```ts
export interface MemoryModel {
  read8(addr: number): number;
  write8(addr: number, value: number): void;
  load?(addr: number, bytes: Uint8Array): void;
  reset?(): void;
}
```

`memoryMap` (optional) describes ROM/RAM regions for diagnostics and UI:

```ts
export interface MemoryRegion {
  name: string;
  start: number;
  end: number; // exclusive
  kind: "rom" | "ram" | "io" | "banked" | "unknown";
  bank?: number;
  readOnly?: boolean;
}
```

### I/O devices

The I/O bus routes IN/OUT port access to devices:

```ts
export interface IODeviceBus {
  readPort(port: number): number;
  writePort(port: number, value: number): void;
  tick?(): void;
}
```

Devices register on the bus with port ranges and callbacks. A platform may
include a timer device, keyboard device, disk device, etc.

### Interrupts

Optional interrupt model for machines that raise INT/NMI:

```ts
export interface InterruptModel {
  raiseINT(): void;
  raiseNMI(): void;
  clearINT(): void;
}
```

## Platform configs (v0.1)

### Terminal platform

The current terminal implementation becomes a configurable platform.

```json
{
  "platform": "terminal",
  "terminal": {
    "rxPort": 16,
    "txPort": 17,
    "statusPort": 18,
    "statusBits": { "rxReadyBit": 0, "txReadyBit": 1 },
    "newline": "\n",
    "echo": true,
    "inputBufferSize": 256,
    "writeThrottleMs": 0
  }
}
```

Notes:
- `newline` defines what the terminal sends for Enter.
- `echo` controls local echo in the webview terminal.
- `statusBits` allows different bit conventions per platform.

### CP/M (draft)

CP/M is a well-known Z80 environment with a TPA that usually starts at 0x0100.
Exact BIOS/BDOS wiring varies by machine, so the platform keeps these as
configurable values.

```json
{
  "platform": "cpm",
  "cpm": {
    "entry": 256,
    "biosEntry": 0,
    "bdosEntry": 5,
    "console": {
      "mode": "port",
      "rxPort": 0,
      "txPort": 1,
      "statusPort": 2
    }
  }
}
```

Notes:
- `entry` is the program start address (default 0x0100).
- `biosEntry` and `bdosEntry` are optional and can be ignored until a BDOS
  emulation layer is implemented.

### Microbee (draft)

Microbee is a richer platform with banked ROM/RAM, video memory, keyboard, and
floppy controller. The v0.1 target is a stub profile with a realistic memory
map and port allocation left as configurable values.

```json
{
  "platform": "microbee",
  "microbee": {
    "rom": "roms/microbee.rom",
    "ramSize": 65536,
    "banked": true,
    "keyboard": { "port": 0 },
    "video": { "port": 16 }
  }
}
```

### TEC-1 (draft)

TEC-1 is simple and well suited for early emulation:
- ROM: 0x0000 - 0x07ff
- RAM: 0x0800 - 0x0fff (2 KB)

```json
{
  "platform": "tec1",
  "tec1": {
    "rom": "roms/tec1.rom",
    "ramStart": 2048,
    "ramEnd": 4096,
    "keypad": { "port": 0 },
    "display": { "port": 1 }
  }
}
```

## Build and launch flow

1) User selects a target in the debug config (via `projectConfig` + `target`).
2) Debug80 reads `platform` and instantiates the platform runtime.
3) Platform sets up memory and devices, then the CPU runs normally.
4) Mapping, breakpoints, and stepping are unchanged.

## v0.1 expectations

- Terminal platform is configurable and is the default.
- Platform registry exists with stubs for CP/M, Microbee, TEC-1.
- The platform config lives in `debug80.json` per target.
- No dynamic loading yet; all platform modules are bundled.

## Future expansion

- Dynamic loading of platform modules (optional).
- External platform packages.
- Common device library (terminal, keyboard, display, disk).
- Memory map visualization in the debugger UI.
