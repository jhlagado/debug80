[Appendices](README.md)

# Appendix A — Custom DAP Request Reference

All custom DAP requests use the `customRequest` method on the VS Code debug session. The command string follows the pattern `debug80/{name}`. All requests return an empty body on success unless the response body column says otherwise. On error, the adapter calls `sendErrorResponse` with error ID `1` and a plain-English message string.

---

## Core adapter commands

These commands are handled by `AdapterRequestController` regardless of platform.

| Command | Args | Response body | What it does |
|---------|------|---------------|-------------|
| `debug80/terminalInput` | `{ text: string }` | — | Sends text to the terminal emulator |
| `debug80/terminalBreak` | — | — | Signals BREAK (Ctrl+C) to the terminal |
| `debug80/romSources` | — | `{ sources: RomSourceEntry[] }` | Returns available ROM/listing sources for the project header |
| `debug80/rebuildWarm` | — | `{ ok: boolean; summary: string; detail?: string; rebuiltPath?: string; location?: RebuildIssueLocation }` | Reassembles and hot-reloads the program without restarting the session |

---

## TEC-1 platform commands

Registered by `createTec1PlatformProvider` → `registerCommands`. Only present when `"platform": "tec1"`.

| Command | Args | Response body | What it does |
|---------|------|---------------|-------------|
| `debug80/tec1Key` | `{ code: number }` | — | Emulates a keypad key press; pass `KEY_RESET` to trigger a hardware reset |
| `debug80/tec1Reset` | — | — | Cold-resets the TEC-1 to the entry point |
| `debug80/tec1Speed` | `{ mode: 'slow' \| 'fast' }` | — | Switches clock speed (slow ≈ 400 kHz, fast ≈ 4 MHz) |
| `debug80/tec1SerialInput` | `{ text: string }` | — | Queues bytes for the 9600-baud bitbang serial receive line |
| `debug80/tec1MemorySnapshot` | see below | see below | Returns a memory/register snapshot for the memory inspector |

---

## TEC-1G platform commands

Registered by `createTec1gPlatformProvider` → `registerCommands`. Only present when `"platform": "tec1g"`.

| Command | Args | Response body | What it does |
|---------|------|---------------|-------------|
| `debug80/tec1gKey` | `{ code: number }` | — | Emulates a keypad key press; pass `KEY_RESET` to reset |
| `debug80/tec1gMatrixKey` | `{ key: string; pressed: boolean; shift?: boolean; ctrl?: boolean; alt?: boolean }` | — | Emulates a matrix keyboard key press or release with modifier state |
| `debug80/tec1gMatrixMode` | `{ enabled: boolean }` | — | Enables or disables matrix keyboard input mode |
| `debug80/tec1gReset` | — | — | Cold-resets the TEC-1G to the entry point |
| `debug80/tec1gSpeed` | `{ mode: 'slow' \| 'fast' }` | — | Switches clock speed |
| `debug80/tec1gSerialInput` | `{ text: string }` | — | Queues bytes for the 4800-baud serial receive line |
| `debug80/tec1gMemorySnapshot` | see below | see below | Returns a memory/register snapshot for the memory inspector |

---

## Memory snapshot args and response

Both `debug80/tec1MemorySnapshot` and `debug80/tec1gMemorySnapshot` take the same args and return the same shape.

**Args:**

| Field | Type | Description |
|-------|------|-------------|
| `before` | `number?` | Address to centre the view on |
| `count` | `number?` | Number of cells to return per view |
| `rowSize` | `number?` | Bytes per display row (8 or 16) |
| `views` | `string[]?` | Named memory sections to include |
| `lookupSymbols` | `boolean?` | Include symbol table in response |
| `includeRegisters` | `boolean?` | Include register values in response |

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

[Appendices](README.md)
