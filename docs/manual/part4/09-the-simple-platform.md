[Part IV](README.md) | [The TEC-1 Platform →](10-the-tec-1-platform.md)

# Chapter 9 — The Simple Platform

The simple platform is the default when no `platform` field is specified in the project configuration. It provides a plain Z80 environment — configurable memory regions, an entry point, and optional terminal I/O — without emulating any specific hardware. It is the right platform for programs that communicate via text or that target a generic Z80 system.

The platform lives in `src/platforms/simple/`.

---

## Memory layout

The simple platform's memory is defined by an array of regions in `SimplePlatformConfig`:

```typescript
interface SimplePlatformConfig {
  regions?: SimpleMemoryRegion[];
  appStart?: number;
  entry?: number;
  binFrom?: number;
  binTo?: number;
  extraListings?: string[];
}
```

Each region has a start address, an end address, and a type. The type controls whether the region is treated as ROM (read-only) or RAM. If no regions are configured, the platform defaults to a 2KB ROM at 0x0000–0x07FF and 31.75KB of RAM from 0x0800 upward.

The `appStart` field specifies the application entry point for warm restart capture — the address where the user program begins execution after the ROM has initialised. It defaults to 0x0900. The `entry` field overrides the initial PC.

The ROM ranges derived from the region configuration are passed to `createZ80Runtime()` as `romRanges`. Writes to ROM addresses are silently ignored.

### Binary output regions

The simple platform has an optional `binFrom`/`binTo` pair. When both are specified, the assembler is invoked a second time to produce a raw binary file covering that address range:

```
assemblerBackend.assembleBin({ asmPath, hexPath, binFrom, binTo })
```

This is used when the target hardware loads a raw binary at a specific address rather than parsing an Intel HEX file. The binary and HEX outputs are produced from the same source file in the same build step.

---

## Hardware

The simple platform has no hardware emulation. There is no display, no keyboard, no speaker. All I/O is optional and terminal-based.

### Terminal I/O

When a terminal configuration is present, the platform routes serial-style I/O through a terminal emulator. The `onTerminalOutput` callback in the I/O handler configuration receives text output as the program executes. The `debug80/terminalInput` and `debug80/terminalBreak` DAP requests inject input back into the program.

The terminal configuration (`TerminalConfig`) specifies the port addresses for input and output, baud rate, and other parameters. Without this configuration the terminal is inert.

### No custom DAP commands

The simple platform registers no custom platform commands in the `PlatformRegistry`. The `registerCommands()` method is a no-op. All interaction happens through the fixed commands registered at session startup (`debug80/terminalInput`, `debug80/terminalBreak`, `debug80/memoryWrite`, etc.).

---

## Extra listings

The `extraListings` field accepts additional assembly listing file paths to include in source mapping. This is how a project that links against a library can make the library's source visible to the debugger — by including the library's listing alongside the main program listing.

Extra listings are resolved during the launch pipeline and added to the source manager. The breakpoint manager and stack trace builder can then resolve addresses from any of the listed source files.

---

## Provider

`createSimplePlatformProvider()` in `src/platforms/simple/provider.ts` constructs the `ResolvedPlatformProvider`:

- `id`: `'simple'`
- `extraListings`: Resolved from `simpleConfig.extraListings`
- `runtimeOptions`: ROM ranges derived from the configured regions
- `registerCommands`: No-op
- `buildIoHandlers`: Delegates to the shared platform I/O builder with terminal callbacks
- `resolveEntry`: Returns the configured entry address, or the start of the first ROM range
- `finalizeRuntime`: Not implemented (simple platform requires no post-creation setup)

The `payload` sent to the extension host via `debug80/platform` identifies the platform as `'simple'` and triggers the webview to render the terminal panel (if any).

---

## What simple is for

The simple platform is appropriate for:

- Programs that do not target specific hardware and communicate via terminal
- Library development where you want breakpoints and register inspection but no hardware simulation
- Learning and experimentation with Z80 assembly
- Programs that define their own I/O mapping through custom regions

If you need to simulate a TEC-1 or TEC-1G — including display output, key input, and timing-accurate hardware — use those platforms instead.

---

[Part IV](README.md) | [The TEC-1 Platform →](10-the-tec-1-platform.md)
