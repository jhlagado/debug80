---
layout: default
title: 'Appendix A — Custom DAP Request Reference'
parent: 'Appendices'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 1
---

[Appendices](index.md)

# Appendix A — Custom DAP Request Reference

All custom DAP requests use the `customRequest` method on the VS Code debug session. The command string follows the pattern `debug80/{name}`. All requests return an empty body on success unless the response body column says otherwise. On error, the adapter calls `sendErrorResponse` with error ID `1` and a plain-English message string.

This appendix covers adapter custom requests, not ordinary VS Code extension commands. Commands such as `debug80.sendHexViaCoolTerm`, `debug80.selectTarget`, and `debug80.runToSelectedStackFrame` are registered through VS Code's command system; some of them call these adapter requests internally, while others run entirely in the extension host.

---

## Core adapter commands

These commands are handled by `AdapterRequestController` regardless of platform.

| Command                   | Args                                                                              | Response body                                                                                              | What it does                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug80/terminalInput`   | `{ text: string }`                                                                | —                                                                                                          | Sends text to the terminal emulator                                                                                                         |
| `debug80/terminalBreak`   | —                                                                                 | —                                                                                                          | Signals BREAK (Ctrl+C) to the terminal                                                                                                      |
| `debug80/romSources`      | —                                                                                 | `{ sources: RomSourceEntry[] }`                                                                            | Returns available ROM/source-map sources for the project header                                                                             |
| `debug80/rebuildWarm`     | —                                                                                 | `{ ok: boolean; summary: string; detail?: string; rebuiltPath?: string; location?: RebuildIssueLocation }` | Reassembles and hot-reloads the program without restarting the session                                                                      |
| `debug80/runToStackFrame` | `{ frameId: number }`                                                             | —                                                                                                          | Runs to a selected mapped stack-return frame from the Call Stack context menu                                                               |
| `debug80/memorySnapshot`  | see below                                                                         | see below                                                                                                  | Returns memory/register/symbol data for the webview memory inspectors                                                                       |
| `debug80/registerWrite`   | `{ register: string; value: string }`                                             | —                                                                                                          | Writes a supported Z80 register while paused; numeric values are hex strings, and flag registers accept the flag-string form used by the UI |
| `debug80/memoryWrite`     | `{ address: string \| number; value: string \| number; allowReadOnly?: boolean }` | —                                                                                                          | Writes one byte of emulated memory while paused; string addresses/bytes are plain hex without a `0x` prefix                                 |

---

## TEC-1 platform commands

Registered by `createTec1PlatformProvider` → `registerCommands`. Only present when `"platform": "tec1"`.

| Command                   | Args                         | Response body | What it does                                                              |
| ------------------------- | ---------------------------- | ------------- | ------------------------------------------------------------------------- |
| `debug80/tec1Key`         | `{ code: number }`           | —             | Emulates a keypad key press; pass `KEY_RESET` to trigger a hardware reset |
| `debug80/tec1Reset`       | —                            | —             | Cold-resets the TEC-1 to the entry point                                  |
| `debug80/tec1Speed`       | `{ mode: 'slow' \| 'fast' }` | —             | Switches clock speed (slow ≈ 400 kHz, fast ≈ 4 MHz)                       |
| `debug80/tec1SerialInput` | `{ text: string }`           | —             | Queues bytes for the 9600-baud bitbang serial receive line                |

---

## TEC-1G platform commands

Registered by `createTec1gPlatformProvider` → `registerCommands`. Only present when `"platform": "tec1g"`.

| Command                    | Args                                                                                | Response body | What it does                                                           |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| `debug80/tec1gKey`         | `{ code: number }`                                                                  | —             | Emulates a keypad key press; pass `KEY_RESET` to reset                 |
| `debug80/tec1gMatrixKey`   | `{ key: string; pressed: boolean; shift?: boolean; ctrl?: boolean; alt?: boolean }` | —             | Emulates a matrix keyboard key press or release with modifier state    |
| `debug80/tec1gMatrixMode`  | `{ enabled: boolean }`                                                              | —             | Sets the MON-3 Matrix CONFIG input, normally from accordion visibility |
| `debug80/tec1gReset`       | —                                                                                   | —             | Cold-resets the TEC-1G to the entry point                              |
| `debug80/tec1gSpeed`       | `{ mode: 'slow' \| 'fast' }`                                                        | —             | Switches clock speed                                                   |
| `debug80/tec1gSerialInput` | `{ text: string }`                                                                  | —             | Queues bytes for the 4800-baud serial receive line                     |

---

## Memory snapshot args and response

All platform memory panels use the generic `debug80/memorySnapshot` request. The platform UI manifest tells the webview which snapshot command to use; the built-in Simple, TEC-1 and TEC-1G panels all point at this shared command.

**Args:**

| Field              | Type        | Description                         |
| ------------------ | ----------- | ----------------------------------- |
| `before`           | `number?`   | Address to centre the view on       |
| `count`            | `number?`   | Number of cells to return per view  |
| `rowSize`          | `number?`   | Bytes per display row (8 or 16)     |
| `views`            | `string[]?` | Named memory sections to include    |
| `lookupSymbols`    | `boolean?`  | Include symbol table in response    |
| `includeRegisters` | `boolean?`  | Include register values in response |

**Response body:**

```typescript
{
  before: number;
  rowSize: number;
  views: Array<{
    name: string;
    address: number;
    cells: Array<{
      address: number;
      value: number;
      isBreakpoint: boolean;
    }>;
  }>;
  symbols: Array<{ name: string; address: number }>;
  registers?: RegisterSnapshot;
}
```

---

[Appendices](index.md)
