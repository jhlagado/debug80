[← The Extension Host UI](12-the-extension-host-ui.md) | [Part V](README.md)

# Chapter 13 — The Webview Panels

The webview runs in a sandboxed iframe. It has no access to the Node.js runtime, no file system, and no direct connection to the debug adapter — only a `postMessage` channel to the extension host. Within those constraints, it renders the hardware panels, handles user input, and manages the memory inspector.

This chapter covers the webview's internal architecture: the common infrastructure shared by all panels, and the platform-specific rendering and input code for TEC-1 and TEC-1G.

---

## Common infrastructure

Three modules in `webview/common/` are shared by all platform panels.

### VS Code API bridge (`common/vscode.ts`)

```typescript
export function acquireVscodeApi(): VscodeApi {
  return acquireVsCodeApi();  // VS Code global injected into webview context
}
```

`acquireVsCodeApi()` is a global function injected by VS Code into every webview. It returns an object with three methods:

- `postMessage(msg)` — send a message to the extension host
- `getState()` — retrieve persisted state from the webview context (survives reloads)
- `setState(state)` — save state that will be restored if the webview is reloaded

The result is acquired once at module load time and passed to every component that needs to communicate outward.

### Session status controller (`common/session-status.ts`)

The session status button appears in the tab bar of every platform panel. `createSessionStatusController()` manages it:

```typescript
const controller = createSessionStatusController(vscode, buttonElement);
controller.setStatus('running');   // disables button, updates label
controller.setStatus('not running'); // re-enables button, click sends startDebug
```

The button is enabled only when `status === 'not running'`. In all other states it is disabled — the session is either starting, active, or paused. A click when enabled sends `{ type: 'startDebug' }` to the extension host.

Labels and tooltips are set for all four states:

| Status | Label | Behaviour |
|--------|-------|-----------|
| `'not running'` | "Start debugging" | Clickable |
| `'starting'` | "Starting…" | Disabled |
| `'running'` | "Running" | Disabled |
| `'paused'` | "Paused" | Disabled |

### Seven-segment digit factory (`common/digits.ts`)

`createDigit()` builds one SVG seven-segment digit element. Each segment is a `<polygon>` with a `data-mask` attribute holding its bitmask:

| Segment | Mask |
|---------|------|
| Top | 0x01 |
| Top-left | 0x02 |
| Middle | 0x04 |
| Top-right | 0x08 |
| Decimal point | 0x10 |
| Bottom-left | 0x40 |
| Bottom-right | 0x20 |
| Bottom | 0x80 |

To update a digit, each segment's `on` CSS class is toggled based on the incoming byte:

```typescript
function updateDigit(el: Element, value: number): void {
  el.querySelectorAll('[data-mask]').forEach(seg => {
    const mask = parseInt((seg as HTMLElement).dataset.mask ?? '0', 10);
    seg.classList.toggle('on', Boolean(value & mask));
  });
}
```

The segment encoding matches the TEC-1 hardware: bit 0 is the top segment, bit 7 is the bottom segment, and so on in the same order the hardware uses.

### Serial I/O helpers (`common/serial.ts`)

`appendSerialText(element, text, maxLength)` appends text to a `<pre>` element and auto-scrolls to the bottom. If the total length would exceed `maxLength`, the oldest text is trimmed from the front. This prevents the serial display from growing without bound.

---

## Webview file structure

Each platform has its own directory under `webview/`:

```
webview/
  common/           Shared utilities and styles
  tec1/             TEC-1 panel
    index.html      HTML template
    index.ts        Entry point — initialisation, message handling, update applying
    panel-layout.ts Tab switching and memory row sizing
    lcd-renderer.ts HD44780 canvas renderer (16×2)
    matrix-renderer.ts 8×8 single-colour LED matrix renderer
    audio.ts        Web Audio API speaker tone generator
    serial-ui.ts    Serial input/output wiring
    styles.css
  tec1g/            TEC-1G panel
    index.html
    index.ts        Entry point (721 lines)
    matrix-ui.ts    RGB LED matrix + matrix keyboard controller
    glcd-renderer.ts ST7920 GLCD canvas renderer (128×64)
    lcd-renderer.ts HD44780 canvas renderer (20×4) with CGRAM support
    hd44780-a00.ts  HD44780 A00 ROM character table
    st7920-font.bin ST7920 GLCD font binary
    visibility-controller.ts Dynamic section show/hide
    serial-ui.ts
    styles.css
```

Each `index.ts` is the entry point. It acquires the VS Code API, queries the DOM, wires up event listeners, creates rendering components, and installs the `window.message` handler. All platform logic is local to the webview — no shared code between TEC-1 and TEC-1G beyond what lives in `common/`.

---

## HTML template structure

Both `index.html` files follow the same structure:

```html
<div class="project-header">
  <button id="selectProject">...</button>
  <select id="homeTargetSelect"></select>
</div>
<div class="tabs">
  <button class="tab" data-tab="ui">UI</button>
  <button class="tab" data-tab="memory">CPU</button>
  <button class="session-status" id="sessionStatus">...</button>
</div>
<div class="panel panel-ui" id="panel-ui"> ... hardware UI ... </div>
<div class="panel panel-memory" id="panel-memory"> ... registers + memory ... </div>
```

The `project-header` div contains the workspace root button and the target selector — always visible regardless of which tab is active. The `tabs` row selects between the hardware UI panel and the CPU/memory panel.

Only one `panel` div is active at a time; CSS classes control visibility.

---

## The project header

The project header renders the current workspace context and lets the user change it without leaving the panel.

**Root button** — shows the name of the selected workspace folder (or "No workspace" if none). Clicking it sends `{ type: 'selectProject', rootPath }` to the extension host, which triggers the workspace selection command.

**Target selector** — a `<select>` element populated from the `targets[]` array in the `projectStatus` message. When the user picks a target, the webview sends `{ type: 'selectTarget', rootPath, targetName }`.

When a `projectStatus` message arrives:

1. The root button text is updated to show the current root name.
2. The target `<select>` is repopulated with options from `targets[]`.
3. The current target, if present, is pre-selected.
4. If no project is found, the selector is hidden.

---

## Tab switching

`createPanelLayoutController()` in `webview/tec1/panel-layout.ts` manages tab state.

`setTab(tab, notify)`:
- Applies the `active` CSS class to the selected tab button.
- Applies the `active` CSS class to the matching panel div.
- If `notify` is true, posts `{ type: 'tab', tab }` to the extension host so the provider can update `tec1ActiveTab` and adjust memory polling.
- If switching to the memory tab, immediately requests a memory snapshot.

`updateMemoryLayout(forceRefresh)`:
- Called on window resize.
- Chooses 8 or 16 bytes per row based on panel width (breakpoint at ~500px).
- If the row size changed, requests a new snapshot.

---

## The TEC-1 panel

### UI tab

**Display.** Six `createDigit()` elements are appended to `#display`. Each update message replaces their values via `updateDigit()`.

**Keypad.** Built dynamically in `index.ts`. The layout is:

```
RST  [spacers]
AD   F E D C
GO   B A 9 8
UP   7 6 5 4
DOWN 3 2 1 0
SHIFT
```

`AD`/`GO`/`UP`/`DOWN` map to key codes 0x13, 0x12, 0x10, 0x11. Hex digits 0–F map to 0x00–0x0F. SHIFT toggles a latch that XORs bit 5 of the next key code sent.

Physical keyboard events are also captured: digits and letters map directly, Enter→GO, ArrowUp→UP, ArrowDown→DOWN, Tab→AD.

Each key click or keydown sends `{ type: 'key', code: number }` to the extension host.

**Speaker.** An indicator element shows "SPEAKER ON" when `speaker` is true. The `speakerHz` label shows the last measured frequency. The mute button toggles the Web Audio API tone without telling the adapter — muting is a local webview preference.

**Speed.** A SLOW/FAST toggle button. Clicking sends `{ type: 'speed', mode: 'slow' | 'fast' }`.

**LCD.** A 224×40 pixel `<canvas>` rendered by `createLcdRenderer()`. Characters are drawn using a monospace font at 14×20 pixels each. Background colour: dark green (#0b1a10). Character colour: bright green (#b4f5b4). The `lcdByteToChar()` function maps byte values to display characters, substituting a few special HD44780 characters (¥, ▶, ◀).

**LED matrix.** An 8×8 grid of `<div>` elements. Each row byte has 8 bits; bit 0 is column 0. A set bit adds the `on` CSS class to the corresponding dot element.

**Serial.** A `<pre>` element for output and a text input for sending. The input field appends a CR on Enter. Buttons: FILE (send file), SAVE (save buffer), CLEAR.

### Memory tab

Four independent memory view sections (a, b, c, d). Each has:

- A `<select>` for the view mode (PC, SP, HL, BC, DE, IX, IY, or Absolute)
- An address label and optional symbol label
- An optional text input for absolute address
- A hex/ASCII dump area

The memory panel is managed by `MemoryPanel` in `webview/common/memory-panel.ts`. It handles snapshot messages, renders hex bytes with ASCII equivalents, highlights the current address, and supports in-place editing.

When the user edits a byte in the memory dump, the panel sends `{ type: 'memoryEdit', address, value }`. When the user edits a register in the register strip, it sends `{ type: 'registerEdit', register, value }`.

### Web Audio speaker

`createAudioController()` in `webview/tec1/audio.ts` uses the Web Audio API to generate a square wave tone at the `speakerHz` frequency. When the speaker is active:

1. An `OscillatorNode` is created at the given frequency.
2. A `GainNode` applies a gentle ramp-up to avoid clicks.
3. The oscillator connects through the gain to the audio context destination.

When `speakerHz` drops to 0 or the mute button is pressed, the gain ramps down and the oscillator is disconnected. The mute state is local to the webview — it is not communicated to the adapter.

---

## The TEC-1G panel

The TEC-1G panel is significantly larger (721 lines in `index.ts`) due to the additional hardware. The structure follows the same pattern as TEC-1 but with additional rendering components.

### Visibility controller

`createVisibilityController()` in `webview/tec1g/visibility-controller.ts` manages which UI sections are visible. Sections are identified by name (e.g., `'display'`, `'lcd'`, `'glcd'`, `'matrix'`, `'keypad'`). Each section has a corresponding container element in the HTML.

When a `uiVisibility` message arrives, the controller shows or hides each named section. If `persist` is true, the visibility state is saved to `vscode.setState()` and restored on the next panel load.

This allows the TEC-1G panel to be configured for different hardware variants — a TEC-1G without an LCD can hide the LCD section.

### RGB LED matrix (`matrix-ui.ts`)

`createMatrixUi()` in `webview/tec1g/matrix-ui.ts` manages both the LED display and the matrix keyboard input.

**LED rendering.** The matrix is rendered as 64 `<div>` elements in an 8×8 grid. Each element receives inline `background-color` styling based on the R, G, B brightness values from the update payload:

```typescript
function applyMatrixBrightness(
  dots: HTMLElement[],
  r: number[], g: number[], b: number[]
): void {
  dots.forEach((dot, idx) => {
    const rv = r[idx] ?? 0;
    const gv = g[idx] ?? 0;
    const bv = b[idx] ?? 0;
    dot.style.backgroundColor =
      `rgb(${rv}, ${gv}, ${bv})`;
  });
}
```

The 64-entry brightness arrays (one per channel) come from the `matrixBrightnessR/G/B` fields of the TEC-1G update message. Each value is 0–255.

**Matrix keyboard input.** When matrix mode is enabled, the LED matrix area also acts as a clickable keyboard. Each dot element gets a click listener that sends:

```typescript
{ type: 'matrixKey', key: string, pressed: boolean, shift: boolean, ctrl: boolean, alt: boolean }
```

The `key` field encodes the row and column. Physical keyboard events are captured globally when matrix mode is active and translated to the same message format.

`createMatrixUi()` also handles the matrix mode toggle button, which sends `{ type: 'matrixMode', enabled: boolean }`.

### GLCD renderer (`glcd-renderer.ts`)

`createGlcdRenderer()` renders the ST7920 128×64 monochrome display onto a `<canvas>` element.

The GDRAM is a 1024-byte array: 64 rows, 16 bytes per row (128 pixels at 1 bit per pixel). The renderer reads each bit and sets the corresponding canvas pixel:

```typescript
function renderGdram(ctx, gdram, displayOn, graphicsOn, width, height): void {
  if (!displayOn || !graphicsOn) {
    ctx.fillStyle = '#a8b865';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const imageData = ctx.createImageData(width, height);
  for (let row = 0; row < 64; row++) {
    for (let byteIdx = 0; byteIdx < 16; byteIdx++) {
      const byte = gdram[row * 16 + byteIdx] ?? 0;
      for (let bit = 7; bit >= 0; bit--) {
        const col = byteIdx * 8 + (7 - bit);
        const on = Boolean(byte & (1 << bit));
        const pixelIdx = (row * width + col) * 4;
        // RGBA: dark pixels on bright background
        imageData.data[pixelIdx]     = on ? 0x1a : 0xa8;
        imageData.data[pixelIdx + 1] = on ? 0x28 : 0xb8;
        imageData.data[pixelIdx + 2] = on ? 0x05 : 0x65;
        imageData.data[pixelIdx + 3] = 255;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
}
```

The colour scheme is a green-tinted LCD look: dark pixels on a light green background.

The renderer also handles text mode (DDRAM rendering with the ST7920 font) and cursor blink, though these are secondary to the graphics mode.

### Text LCD renderer (`tec1g/lcd-renderer.ts`)

The TEC-1G's text LCD is larger and more capable than the TEC-1's — four rows of twenty characters, with CGRAM support for custom characters.

The renderer in `webview/tec1g/lcd-renderer.ts` uses the HD44780 A00 character ROM defined in `hd44780-a00.ts`. This module exports a complete mapping from character codes 0x00–0xFF to rendered bitmaps. Custom characters (codes 0x00–0x07) are drawn from the CGRAM array when it is present.

Each character is rendered into a small off-screen canvas (5×8 pixels scaled up) and composited into the main canvas. The CGRAM support means custom characters defined by the running program are correctly displayed — if the program loads a custom character set, it appears in the webview.

---

## The message handler

Both `index.ts` files install a single `window.addEventListener('message', handler)`. The handler dispatches on `event.data.type`:

```typescript
window.addEventListener('message', event => {
  const msg = event.data;
  switch (msg.type) {
    case 'projectStatus':   applyProjectStatus(msg); break;
    case 'sessionStatus':   sessionStatusController.setStatus(msg.status); break;
    case 'selectTab':       panelLayout.setTab(msg.tab, false); break;
    case 'update':
      if (msg.uiRevision < currentRevision) return;  // stale
      currentRevision = msg.uiRevision;
      applyUpdate(msg);
      if (activeTab === 'memory') memoryPanel.requestSnapshot();
      break;
    case 'serial':          appendSerialText(serialOutEl, msg.text, MAX_SERIAL); break;
    case 'serialInit':      serialOutEl.textContent = msg.text; break;
    case 'snapshot':        memoryPanel.handleSnapshot(msg); break;
    case 'snapshotError':   memoryPanel.handleSnapshotError(msg.message); break;
    case 'uiVisibility':    visibilityController.apply(msg.visibility, msg.persist); break;
  }
});
```

The `uiRevision` guard is applied to `update` messages. Other message types do not need it — project status, session status, and serial messages are always current when they arrive.

---

## The memory inspector

`MemoryPanel` in `webview/common/memory-panel.ts` (435 lines) manages the CPU/memory tab. It handles up to four independent memory view sections.

### Snapshot request

When the memory tab is active, the panel calls `requestSnapshot()` periodically (or when a new `update` arrives from the adapter). This sends:

```typescript
{ type: 'refresh', views: [{ mode, address }, ...] }
```

The extension host forwards this to `debug80/tec1MemorySnapshot` (or `debug80/tec1gMemorySnapshot`). The adapter reads the requested memory regions and returns a snapshot that includes registers, stack, and the requested byte arrays.

### Snapshot rendering

When a `snapshot` message arrives, the panel:

1. Renders the register strip — all Z80 registers formatted as hex values. The PC register is highlighted to show the current instruction address.
2. For each of the four memory views, renders a hex dump of the returned bytes. Bytes are displayed 8 or 16 per row (depending on panel width). Each row shows the hex values and their ASCII equivalents.
3. The symbol name for the current PC is shown above its view section.

### Inline editing

Clicking a hex byte in the memory dump opens an in-place edit field. Entering a new value sends `{ type: 'memoryEdit', address, value }`. Clicking a register in the register strip opens a similar edit field and sends `{ type: 'registerEdit', register, value }`.

The edit field accepts hex input without a `0x` prefix. Input is validated before sending — non-hex characters and out-of-range values are rejected.

---

## Summary

- The webview is sandboxed JavaScript with access only to the VS Code postMessage channel. All communication with the adapter is mediated by the extension host.

- Common infrastructure (`vscode.ts`, `session-status.ts`, `digits.ts`, `serial.ts`) is shared between TEC-1 and TEC-1G panels.

- The project header is always visible and lets the user switch workspace roots and targets without leaving the panel.

- Tabs switch between the hardware UI panel and the CPU/memory panel. Tab state is reported to the extension host so the provider can control memory refresh polling.

- The TEC-1 panel renders six SVG seven-segment digits, an 8×8 LED matrix, a 16×2 HD44780 canvas LCD, a hex keypad, a speaker indicator with Web Audio output, and a serial terminal.

- The TEC-1G panel adds an RGB LED matrix with per-pixel brightness, a 128×64 ST7920 GLCD, a 20×4 HD44780 LCD with CGRAM, and a matrix keyboard mode. A visibility controller allows individual sections to be shown or hidden.

- The `uiRevision` guard in the message handler rejects stale update messages from previous sessions.

- The memory inspector polls the adapter at 150 ms intervals when visible, renders register and memory snapshots, and supports inline hex editing of registers and memory bytes.

---

[← The Extension Host UI](12-the-extension-host-ui.md) | [Part V](README.md)
