---
layout: default
title: 'Chapter 13 — The Webview Panels'
parent: 'Part V — The Extension UI'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 2
---

[← The Extension Host UI](12-the-extension-host-ui.md) | [Part V](index.md)

# Chapter 13 — The Webview Panels

The webview runs in a sandboxed iframe. It has no access to the Node.js runtime, no file system, and no direct connection to the debug adapter — only a `postMessage` channel to the extension host. Within those constraints, it renders the hardware panels, handles user input, and manages the memory inspector.

This chapter covers the webview's internal architecture: the common infrastructure shared by all panels, and the platform-specific rendering and input code for TEC-1 and TEC-1G.

---

## Common infrastructure

Most cross-platform UI lives under `webview/common/`. TEC-1 and TEC-1G share **serial** wiring (`common/serial-ui.ts`), **Web Audio** speaker plumbing (`common/audio-core.ts` + thin `tec1/audio.ts` / `tec1g/tec1g-audio.ts` wrappers), the **8×8 monochrome matrix** paint path (`common/matrix-renderer.ts`; TEC-1G keeps separate `matrix-ui.ts` and `tms9918-renderer.ts` modules for RGB, matrix-keyboard capture, and TMS9918 video), **seven-segment digits** (`common/seven-seg-display.ts`), **accordion layout** (`common/accordion-layout.ts`), **AZM option controls** (`common/azm-options-control.ts`), and **hex keycap keypads** (`common/tec-keypad.ts` + `common/tec-keypad-layout.ts`, wrapped by `tec1g/tec1g-keypad.ts` for SysCtrl LEDs). Shared **project-panel DOM lookup** now lives in `common/project-panel-elements.ts`, shared **memory-view DOM lookup** lives in `common/memory-view-elements.ts`, shared **typed element lookup** lives in `common/dom-elements.ts`, and shared **keypad focus, shortcut routing and shift-latch** behaviour is centralised in `common/keypad-core.ts` and `common/keypad-focus-routing.ts`. Layout tokens for matrix dot size, gaps, and padding are defined once in `common/styles.css` (TEC-1G adds RGB- and platform-specific overrides).

### VS Code API bridge (`common/vscode.ts`)

```typescript
export function acquireVscodeApi(): VscodeApi {
  return acquireVsCodeApi(); // VS Code global injected into webview context
}
```

`acquireVsCodeApi()` is a global function injected by VS Code into every webview. It returns an object with three methods:

- `postMessage(msg)` — send a message to the extension host
- `getState()` — retrieve persisted state from the webview context (survives reloads)
- `setState(state)` — save state that will be restored if the webview is reloaded

The result is acquired once at module load time and passed to every component that needs to communicate outward.

Not every webview preference should be stored here. In particular, speaker mute state is intentionally **not** persisted: each new webview starts muted, and the user must unmute through a real interaction before audio playback is reliable.

### Session status controller (`common/session-status.ts`)

The Restart button sits in the tab row of every platform panel (`id="restartDebug"`). `createSessionStatusController()` manages it:

```typescript
const controller = createSessionStatusController(vscode, buttonElement);
controller.setStatus('running');
controller.setStatus('not running');
```

The button always renders with the label **Restart**. Its visual state is carried in `data-status` and CSS classes (`status-running`, `status-paused`, etc.). A click sends `{ type: 'restartDebug' }` to the extension host unless the session is still in the `'starting'` state. The button is disabled only while starting.

The status values are:

| Status          | Label     | Behaviour |
| --------------- | --------- | --------- |
| `'not running'` | "Restart" | Clickable |
| `'starting'`    | "Restart" | Disabled  |
| `'running'`     | "Restart" | Clickable |
| `'paused'`      | "Restart" | Clickable |

### Accordion layout (`common/accordion-layout.ts`)

`createAccordionLayoutController()` gives the platform HTML a compact VS Code-like accordion shell. It sets ARIA state on each header button, toggles the associated panel body, persists open state and panel order through `vscode.setState()`, and lets panels start open or collapsed from their HTML attributes. TEC-1G uses this to keep **Project**, **Machine**, **Displays**, **TMS9918 Video**, **Joystick**, **Matrix Keyboard**, **Registers**, **Memory**, and **Serial** in one ordered stack without the old show/hide checkbox row.

The same controller now owns `resetPanelLayout()`. When the extension host posts `{ type: 'resetPanelLayout' }`, the webview restores the default panel order and default open-state map, rewrites the persisted accordion state, re-runs tab synchronization, and replays any `onPanelOpenChange` callbacks that need to detach matrix mode, clear joystick state, or reattach the TMS9918 card.

### Seven-segment display (`common/seven-seg-display.ts`)

`createSevenSegDisplay(container, count)` creates the digit column by calling the internal `createDigit()` helper for each segment polygon. The bitmask table matches the TEC-1 hardware (bit 0 = top, bit 7 = bottom). Platform `index.ts` files hold a `display` object and call `display.applyDigits(values)` on each update — they no longer hand-roll per-digit DOM loops.

The display also supports `applySegmentIntensities(values)`, where each digit receives eight normalized segment intensities. This is used by the scan-duty rendering path: the platform runtime reports how long each segment was driven during the latest scan window, and the webview maps that duty cycle to segment opacity. The goal is to model multiplexed LED brightness instead of freezing the last latched digit value.

### Serial I/O helpers (`common/serial.ts`)

`appendSerialText(element, text, maxLength)` appends text to a `<pre>` element and auto-scrolls to the bottom. If the total length would exceed `maxLength`, the oldest text is trimmed from the front. This prevents the serial display from growing without bound.

### Project status UI (`common/project-status-ui.ts`)

`createProjectStatusUi(vscode, elements, platform)` wires up the project header for a platform panel: it handles `projectStatus` messages, populates the Target dropdown, sets the Platform selector value, shows or hides controls via `applyInitializedProjectControls()`, and wires the Initialize button, target change handler, and stop-on-entry checkbox. This function consolidates the setup-card/target-dropdown/project-root wiring that was previously duplicated across `simple/index.ts`, `tec1/index.ts`, and `tec1g/tec1g-project-status-ui.ts`. All three platform panels now call `createProjectStatusUi()` from this shared module.

The same helper also renders source-map and hardware-send status lines when the provider includes `sourceMapStatusText` or `hardwareStatusText` in `projectStatus`. The hardware send button posts `sendHexViaCoolTerm`; it is enabled only when CoolTerm is reachable and the selected target has an inferred HEX artifact.

`webview/tec1g/tec1g-project-status-ui.ts` re-exports from `webview/common/project-status-ui.ts` for backward compatibility rather than containing the implementation itself.

### Project panel element helpers (`common/project-panel-elements.ts`)

`getProjectPanelElements()` centralizes the DOM queries for the shared project header, setup card, restart button, tabs, accordion shell, and project-status controls. `wireProjectPanelPlatformControls()` owns the shared Add-folder and Platform selector wiring, and `applyProjectPanelStatusControls()` feeds the resolved project state into `applyInitializedProjectControls()`. This extraction keeps `simple/index.ts`, `tec1/index.ts`, and `tec1g/index.ts` focused on composition rather than on repeated `getElementById()` scaffolding.

### Memory view element helpers (`common/memory-view-elements.ts`)

`createMemoryViewEntries()` builds the four `{ id, view, address, addr, symbol, dump }` records that `MemoryPanel` consumes. TEC-1G still wraps this through `createTec1gMemoryViews()`, but the DOM lookup lives in one shared module now.

### Typed DOM element helpers (`common/dom-elements.ts`)

`getRequiredElementById()`, `getOptionalElementById()`, `getRequiredElementBySelector()`, and `getOptionalElementBySelector()` centralize DOM lookup and runtime type checks for webview entry points. The helpers fail with selector-specific errors when a required node is missing or has the wrong element type, which keeps `simple/index.ts` and `tec1/index.ts` concise while still treating the HTML contract as strict.

### AZM options control (`common/azm-options-control.ts`)

`wireAzmOptionsControl()` wires the small AZM controls in the Project accordion. The visible UI intentionally exposes only coarse session preferences:

- **Register Contracts**: `Enforce`, `Audit`, or `Off`
- **Contract Updates**: `Ask`, `Auto`, or `Never`

Changing either select posts `{ type: 'setAzmOptions', registerContractsMode, contractUpdateMode }` to the extension host. The values are session-scoped provider state, not persistent project config. On restart, `debug-session-actions.ts` maps `Enforce` to AZM `registerContracts: 'error'` with `emitRegisterReport: true`, maps `Audit` to `registerContracts: 'audit'`, and maps `Off` to `registerContracts: 'off'`. Debug80 also passes `registerContractsProfile: 'mon3'` for the enforcing and audit modes.

### Create project helper (`common/create-project.ts`)

`sendCreateProject(vscode, platform)` posts the `{ type: 'createProject', platform }` message to the extension host. It is used by all three platform webviews when the user clicks the Initialize button, replacing the copy-pasted `vscode.postMessage` calls that previously appeared in each platform's own entry point.

---

## Webview file structure

Each platform has its own directory under `webview/`. The tree below lists the main modules (not every asset):

```
webview/
  common/           Shared utilities and styles
    audio-core.ts       Shared Web Audio oscillator/gain (used by tec1 + tec1g audio wrappers)
    create-project.ts   sendCreateProject()
    digits.ts           Internal helpers for seven-seg-display
    dom-elements.ts     Typed required/optional DOM lookup helpers
    matrix-renderer.ts  Monochrome 8×8 matrix paint (TEC-1; TEC-1G RGB is separate)
    memory-panel.ts
    memory-view-elements.ts
    project-controls.ts
    project-panel-elements.ts
    project-root-button.ts
    project-state.ts
    project-status-ui.ts
    serial-ui.ts        wireSerialUi() — simple, TEC-1 and TEC-1G serial terminal wiring
    serial.ts
    session-status.ts
    setup-card-state.ts
    seven-seg-display.ts
    stop-on-entry-control.ts
    tec-keyboard-shortcuts.ts
    tec-keypad.ts       Keycap button builder + tec-keypad-layout.ts
    tec-keypad-layout.ts
    keypad-core.ts      tabIndex, container/key focus, shift latch for hex keypads
    vscode.ts
    styles.css          Shared TEC + matrix grid tokens; TEC-1G breakpoint tweaks in tec1g/styles.css
  simple/
    index.html, index.ts, styles.css
  tec1/
    index.html, index.ts, lcd-renderer.ts, audio.ts, message-handler.ts
    platform-update.ts, styles.css
  tec1g/
    index.html, index.ts, entry-types.ts, tec1g-platform-update.ts
    tec1g-audio.ts, tec1g-keypad.ts, tec1g-memory-views.ts, matrix-ui.ts
    joystick-ui.ts, tms9918-renderer.ts, glcd-renderer.ts, lcd-renderer.ts, hd44780-a00.ts
    st7920-font.bin, styles.css
```

The **TEC-1** `index.ts` is still the composition root but now delegates message dispatch to `message-handler.ts`, hardware update application to `platform-update.ts`, DOM lookup to `common/dom-elements.ts`, and project header and memory-view setup to the shared modules above. The **TEC-1G** `index.ts` remains a thin composition root.

The TEC-1 `index.ts` is a self-contained entry point that acquires the VS Code API, queries the DOM, wires up event listeners, creates rendering components, and installs the `window.message` handler. The TEC-1G `index.ts` is a thin composition root — it imports all the feature modules, queries the DOM once, and wires them together. All TEC-1G platform logic lives in the feature modules, not in `index.ts`.

`entry-types.ts` exists to break circular imports. The feature modules (`tec1g-audio.ts`, `tec1g-keypad.ts`, `matrix-ui.ts`, etc.) all need to refer to the same `IncomingMessage`, `Tec1gUpdatePayload`, `Tec1gPanelTab`, and `Tec1gSpeedMode` types. If each module defined its own copy, or if modules imported types from each other, the import graph would become tangled. Instead, all shared types are defined once in `entry-types.ts` and every module that needs them imports from there. `index.ts` imports from both `entry-types.ts` and the feature modules; the feature modules import only from `entry-types.ts` (not from `index.ts`), keeping the dependency graph acyclic.

---

## HTML template structure

All three `index.html` files follow the same structure:

```html
<div class="project-header">
  <div class="project-control">                          <!-- always visible -->
    <span class="project-label">Project</span>
    <button id="selectProject">No workspace roots available</button>
    <button id="addWorkspaceFolder" title="Add folder to workspace">+</button>
  </div>
  <div class="project-control">                          <!-- visible only when initialized -->
    <span class="project-label">Target</span>
    <select id="homeTargetSelect"></select>
  </div>
  <div class="project-control" hidden>                   <!-- visible only when uninitialized -->
    <span class="project-label">Platform</span>
    <select id="platformSelect">
      <option value="simple">Simple</option>
      <option value="tec1">TEC-1</option>
      <option value="tec1g">TEC-1G</option>
    </select>
  </div>
    <button id="platformInitButton">Initialize</button>
  </div>
  <div class="project-control" id="platformInfoControl" hidden>  <!-- currently kept hidden -->
    <span class="project-label">Platform</span>
    <span id="platformValue"></span>
  </div>
  <label class="stop-on-entry-label" hidden>             <!-- visible only when initialized -->
    <input type="checkbox" id="stopOnEntry" />
    Stop on entry
  </label>
</div>
<div class="setup-card" id="setupCard">
  <div id="setupCardText">...</div>
  <button id="setupPrimaryAction">...</button>
</div>
<div class="tabs">
  <div class="tabs-buttons">
    <button class="tab" data-tab="ui">UI</button>
    <button class="tab" data-tab="memory">CPU</button>
  </div>
  <div class="tabs-status-slot">
    <button class="session-status" id="restartDebug">Restart</button>
  </div>
</div>
<div class="panel panel-ui" id="panel-ui"> ... platform UI content ... </div>
<div class="panel panel-memory" id="panel-memory"> ... registers + memory ... </div>
```

The `project-header` occupies the top of the panel whenever there is a workspace context to act on. In the special `noWorkspace` state it is hidden entirely, leaving only the empty-state card visible. The `setup-card` is shown when the workspace is not fully configured and hidden once a project exists. The `tabs` row sits below the setup card and is hidden until the project is initialized.

Only one `panel` div is active at a time; CSS classes control visibility.

---

## The project header

The project header renders the current workspace context and lets the user change it without leaving the panel. It is always visible at the top of the panel, regardless of project state or which tab is active. Individual controls within it are shown or hidden by `applyInitializedProjectControls()` depending on `projectState`.

**Project button** — always visible whenever the header is visible. Shows the selected workspace folder name (or a placeholder when no folder is selected). Clicking it sends `{ type: 'selectProject', rootPath }`, triggering workspace selection.

**Add folder button** (`+`) — always visible, next to the root button. Clicking it sends `{ type: 'openWorkspaceFolder', platform }`, where `platform` is the current platform selector value. The extension host forwards that to `debug80.addWorkspaceFolder`, so a new workspace folder can be added with the same platform context the panel is already showing. This button is always present so the user can add workspace folders from any state without needing to navigate away from the panel.

**Target selector** — visible only when `projectState === 'initialized'`. A `<select>` populated from the `targets[]` array in the `projectStatus` message. When the user picks a target, the webview sends `{ type: 'selectTarget', rootPath, targetName }`.

**Platform selector** — visible only when `projectState === 'uninitialized'`. A `<select>` with three fixed options: Simple, TEC-1, TEC-1G. Its value is set from `projectStatus.platform` on each `projectStatus` message. In the current panel redesign it shares the row with an inline **Initialize** button (`platformInitButton`), so project creation can happen directly from the platform row instead of from a duplicate card button.

**Platform info row** — the old read-only `platformInfoControl` slot still exists in the DOM, but the current UI contract keeps it hidden. That avoids rendering a second platform control in initialized state.

**Stop on entry** — visible only when `projectState === 'initialized'`. A checkbox in the project header row that toggles the global stop-on-entry flag for the current VS Code window session. When toggled, the webview sends `{ type: 'setStopOnEntry', stopOnEntry: boolean }`. The value is not persisted into `debug80.json`.

When a `projectStatus` message arrives:

1. The project button text is updated to show the current root name.
2. The target `<select>` is repopulated with options from `targets[]` and the current target is pre-selected.
3. The platform `<select>` value is set from `platform`.
4. `applyInitializedProjectControls()` shows or hides each control row.
5. The stop-on-entry checkbox value is set from `message.stopOnEntry`.

### `projectIsInitialized` guard

Each panel's `index.ts` tracks a module-level `let projectIsInitialized = false` boolean. It is set to `true` after the first `projectStatus` message that resolves to `'initialized'`. The platform `<select>` change handler is wrapped in `if (projectIsInitialized)` — this prevents a spurious `saveProjectConfig` message from firing when the platform value is programmatically set during panel initialization or rehydration, before a real project exists. Without this guard, the change event would trigger on the initial value assignment and cause the extension host to re-render the view unexpectedly.

## The setup card

Below the project header, a setup card handles the not-yet-configured states:

- **No workspace roots** → displays an empty-state message and an **Open Folder** action. The header itself is hidden in this state.
- **Workspace available but no selected root** → displays a **Select Project** action.
- **Selected root but no initialized Debug80 project** → displays **Uninitialized Debug80 project**. In the current panel redesign the setup card hides its own button for the create-project case, because the active create action lives in the inline `platformInitButton` on the platform row.
- **Project exists** → the card is **hidden entirely**.

The setup card state is recalculated on every `projectStatus` message by `resolveSetupCardState()` in `webview/common/setup-card-state.ts`, which returns `null` when a project exists (causing the card to be hidden).

---

## Tab switching

Tab and accordion state are now handled by common panel helpers. The platform entry points apply the selected provider tab, update active CSS state, and notify the extension host when the provider tab changes. TEC-1G uses its panel layout controller to coordinate provider tabs, accordion bodies, register refresh, memory-panel sizing, matrix-keyboard attachment state, TMS9918 attachment state, and joystick cleanup on panel close.

`setTab(tab, notify)`:

- Applies the `active` CSS class to the selected tab button.
- Applies the `active` CSS class to the matching panel div.
- If `notify` is true, posts `{ type: 'tab', tab }` to the extension host so the provider can update the active tab and adjust memory polling.
- If switching to the memory tab, immediately requests a memory snapshot.

`updateMemoryLayout(forceRefresh)`:

- Called on window resize.
- Chooses 8 or 16 bytes per row based on panel width (breakpoint at ~500px).
- If the row size changed, requests a new snapshot.

### TEC-1G matrix capture flow

The TEC-1G panel distinguishes matrix attachment from physical keyboard capture.

- Opening the **Matrix Keyboard** accordion posts `{ type: 'matrixMode', enabled: true }`, which attaches the emulated matrix keyboard for MON-3 and disables scanned hex keypad input.
- Host-keyboard capture stays released until the user clicks within the emulator surfaces. A capture-state cue in `matrix-routing-cue.ts` switches between **Keyboard released** and **Keyboard captured** and applies matching `data-matrix-keyboard-captured` state to the page root.
- Pointer events outside the emulator surfaces and `window.blur` release host-keyboard capture without closing the accordion or disabling matrix mode.
- The reset button clears transient matrix UI state before posting `{ type: 'reset', matrixModeAfterReset }`. The extension-host adapter handles `debug80/tec1gReset` first, then reissues `debug80/tec1gMatrixMode` when `matrixModeAfterReset` is true so the persisted accordion-open state stays aligned with the MON-3 CONFIG bit after reset.
- The same reset path clears the joystick UI state so held direction or fire bits cannot survive a board reset in the webview.

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

`AD`/`GO` and the two directional keys map to 0x13, 0x12, 0x10, 0x11. The same `tec-keypad-layout` tokens are used for both platforms: on the **TEC-1G** panel the keycaps are **◀** (left) and **▶** (right); on **TEC-1** hardware the physical switches are often labeled **UP**/**DOWN** but the webview uses the same chevron keycaps. Hex digits 0–F map to 0x00–0x0F. **Shift** (physical or on-screen) acts as a momentary **FN** modifier; additional shortcuts include **Tab→AD/ADDRESS**, **Space→0**, **Enter→GO**, and **Escape→Reset** (aligning with the TEC-1G map). The keypad `div` is focusable (`tabIndex=0`); key routing runs only while the keypad has focus, and a `mousedown` handler on the UI panel (excluding native form controls) re-focuses the keypad so clicking the emulated front panel does not leave keyboard input targeting the parent document. See the **debug80** repository `src/platforms/tec1/README.md` and `src/platforms/tec1g/README.md` for the panel keyboard shortcut tables.

Each key click or keydown sends `{ type: 'key', code: number }` to the extension host.

**Speaker.** An indicator element shows "SPEAKER ON" when `speaker` is true. The `speakerHz` label shows the last measured frequency. The mute button toggles the Web Audio API tone without telling the adapter — muting is local to the current webview session and is not persisted.

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

### Message and update helpers

The TEC-1 panel now keeps two focused helpers next to `index.ts`:

- `message-handler.ts` exposes `createTec1MessageHandler()`, which branches `projectStatus`, `sessionStatus`, `selectTab`, `update`, `snapshot`, and `snapshotError` messages and keeps the `uiRevision` stale-update guard local to the TEC-1 message path.
- `platform-update.ts` exposes `applyTec1PlatformUpdate()`, which applies a single hardware update payload to the display, audio, speed indicator, LCD renderer, and matrix renderer.

This matches the TEC-1G composition style more closely without changing the TEC-1 runtime protocol.

### Web Audio speaker

`createAudioController()` in `webview/tec1/audio.ts` uses the Web Audio API to generate a square wave tone at the `speakerHz` frequency. When the speaker is active:

1. An `OscillatorNode` is created at the given frequency.
2. A `GainNode` applies a gentle ramp-up to avoid clicks.
3. The oscillator connects through the gain to the audio context destination.

When `speakerHz` drops to 0 or the mute button is pressed, the gain ramps down and the oscillator is disconnected. The mute state is local to the webview — it is not communicated to the adapter and is not written to `vscode.setState()`. A recreated webview starts muted again. This matches Web Audio's user-gesture requirement: VS Code webviews cannot reliably begin audible playback just because a previous session was left unmuted.

---

## The TEC-1G panel

The TEC-1G panel uses a modular structure. `index.ts` is a thin composition root that imports all feature modules, queries DOM elements, and wires them together. It installs a single `window.addEventListener('message', ...)` dispatcher that delegates to the appropriate module.

### TEC-1G webview module layout

| File                             | Responsibility                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `index.ts`                       | Composition root — DOM queries, module wiring, accordion setup, message dispatcher and project/status wiring |
| `entry-types.ts`                 | Shared types: `IncomingMessage`, `Tec1gUpdatePayload`, `Tec1gPanelTab`, `Tec1gSpeedMode`                     |
| `tec1g-platform-update.ts`       | `applyTec1gPlatformUpdate()` — applies a hardware update payload to all display components                   |
| `tec1g-project-status-ui.ts`     | Re-exports `createProjectStatusUi` from `webview/common/project-status-ui.ts`                                |
| `tec1g-audio.ts`                 | `createTec1gAudio()` — wraps `common/audio-core.ts`, mute and UI                                             |
| `tec1g-keypad.ts`                | `createTec1gKeypad()` — `common/tec-keypad` + `keypad-core` + status LEDs / SysCtrl                          |
| `tec1g-memory-views.ts`          | `createTec1gMemoryViews()` — memory view section factory                                                     |
| `matrix-ui.ts`                   | `createMatrixUiController()` — RGB LED matrix display and matrix keyboard input                              |
| `glcd-renderer.ts`               | `createGlcdRenderer()` — ST7920 128×64 GLCD canvas renderer                                                  |
| `lcd-renderer.ts`                | `createLcdRenderer()` — HD44780 20×4 text LCD canvas renderer with CGRAM                                     |
| `hd44780-a00.ts`                 | HD44780 A00 ROM character table                                                                              |
| `../common/tec-keypad-layout.ts` | `TEC1G_DIGITS`, `TEC1G_KEY_MAP` (imported by TEC-1G keypad)                                                  |
| `../common/serial-ui.ts`         | `wireSerialUi()` — used via `index.ts` (no separate `tec1g/serial-ui.ts` file)                               |
| `st7920-font.bin`                | ST7920 GLCD font (static asset)                                                                              |

**Layout (UI tab).** The TEC-1G panel is now organized as compact VS Code-style accordion sections. The **Project** section holds project and target selection. **Machine** holds the front-panel status strip, text LCD, six seven-segment digits and keypad. **Displays** holds the ST7920 GLCD and RGB 8×8 matrix. **TMS9918 Video** holds a separate 512×384 canvas plus the PAL/NTSC selector for the optional VDP card. **Joystick** holds the emulated joystick port controls. Matrix keyboard and serial tools live in their own accordion sections below the machine controls.

### Visibility controller

Earlier TEC-1G builds exposed checkboxes for showing and hiding individual peripheral sections. The current panel keeps the core hardware visible permanently and uses accordions to manage vertical space instead. The `tec1g.uiVisibility` config shape remains readable as legacy project data, but it is no longer the main user-facing layout model.

### RGB LED matrix (`matrix-ui.ts`)

`createMatrixUiController()` in `webview/tec1g/matrix-ui.ts` manages both the LED display and the matrix keyboard input.

**LED rendering.** The matrix is rendered as 64 `<div>` elements in an 8×8 grid. Each element receives inline `background-color` styling based on the R, G, B brightness values from the update payload:

```typescript
function applyMatrixBrightness(dots: HTMLElement[], r: number[], g: number[], b: number[]): void {
  dots.forEach((dot, idx) => {
    const rv = r[idx] ?? 0;
    const gv = g[idx] ?? 0;
    const bv = b[idx] ?? 0;
    dot.style.backgroundColor = `rgb(${rv}, ${gv}, ${bv})`;
  });
}
```

The 64-entry brightness arrays (one per channel) come from the `matrixBrightnessR/G/B` fields of the TEC-1G update message. Each value is 0–255. `matrix-ui.ts` maps those duty-cycle values to stronger visible LED colours, currently with an extra 30% intensity boost over the previous display curve. This does not change the platform runtime's timing model; it only changes how the webview paints the already-calculated brightness so games such as Pacmo are easier to read while uneven scan timing remains visible.

**Matrix keyboard input.** Opening the Matrix Keyboard accordion is treated as attaching the hardware keyboard. The webview sends `{ type: 'matrixMode', enabled: true }` and disables the scanned hex keypad keys, matching MON-3's matrix-input takeover model. Host-keyboard capture stays released until the user clicks within the emulator surfaces, at which point the routing cue switches to **Keyboard captured**. Clicking outside those surfaces, blurring the window, or pressing Ctrl-Escape releases host-keyboard capture without disabling matrix mode. The RESET control remains active because it resets the board rather than participating in keypad scanning. Closing the accordion sends `{ type: 'matrixMode', enabled: false }`, releases held matrix keys and returns physical keyboard routing to the hex keypad flow.

Matrix keyboard arrows and editing keys are not routed through the hex keypad shortcut table. They are emitted as matrix key positions whose MON-3 `matrixScanASCII` translation produces low control codes: Up `0x03`, Down `0x04`, Left `0x05`, Right `0x06`, Backspace `0x08`, Tab `0x09`, Enter `0x0D`, and Escape `0x1B`. Programs that need physical key identity should read the raw `matrixScan` result; text-like input can use `matrixScanASCII` or `parseMatrixScan`.

When RESET is clicked while the Matrix Keyboard accordion is open, the webview includes that attachment state with the reset request. The extension host resets the board and then reasserts matrix mode, so MON-3 continues scanning the matrix keyboard instead of silently reverting to hex-keypad mode until the accordion is toggled.

The panel also reasserts matrix attachment when a debug session becomes active and the Matrix Keyboard accordion was already open from persisted UI state. This covers the startup case where the webview may have sent its initial matrix-mode request before a Z80 debug session existed.

**TMS9918 video panel.** Opening the **TMS9918 Video** accordion posts `{ type: 'tms9918Active', enabled: true }`; closing it posts the same message with `enabled: false`. The panel does not synthesize its own framebuffer. `tms9918-renderer.ts` renders the framebuffer supplied in each TEC-1G `update` payload, while the `<select id="tms9918Standard">` control posts `{ type: 'tms9918VideoStandard', standard: 'pal' | 'ntsc' }` back to the extension host. Incoming updates also drive the select value, so rehydration reflects the runtime's current cadence.

**Joystick panel.** `joystick-ui.ts` owns the dedicated TEC-1G joystick accordion. Pointer and keyboard input both collapse into one active-high mask that the webview posts as `{ type: 'joystick', mask }`. The mapping is:

- Directions: `ArrowUp`/`W` = `0x01`, `ArrowDown`/`S` = `0x02`, `ArrowLeft`/`A` = `0x04`, `ArrowRight`/`D` = `0x08`
- Actions: `K` = `0x10` (Fire 2), `I` or `U` = `0x20` (Comm2 / pin 9), `J` or `Space` = `0x40` (Fire 1), `L` = `0x80` (Fire 3)

The **Latch** checkbox switches pointer clicks from momentary press/release into xor-style latched bits. Closing the Joystick accordion, clicking RESET, or blurring the window clears held and latched joystick state before the next message is posted.

Physical PC keyboard events use direct keydown/keyup timing, preserve the modifier set captured at keydown for the matching keyup and translate Ctrl-letter chords into MON-3 control-letter input. Raw host `Shift`, `Control`, `Fn`, and `Alt` events are posted as their own matrix-key requests, which keeps the modifier row active across the full host key hold instead of only during derived ASCII chords. The adapter resolves Ctrl-letter chords through the letter's unmodified matrix cell plus the Ctrl modifier row, and suppresses a duplicate synthesized modifier cell when a raw host modifier is already held. Meta/Command chords are left to VS Code and the host OS instead of being routed into the emulated matrix keyboard. Plain Escape is forwarded into the emulated matrix keyboard.

On-screen modifier clicks are one-shot arming actions. Clicking Shift, Ctrl, Fn, or Alt highlights that modifier, applies it to the next non-modifier click, then clears the armed state immediately after the press message is posted. Non-modifier clicks are still held briefly before release so MON-3's polling loop can sample the emulated row/column state reliably; without this, a fast browser click can press and release between monitor scans.

`matrix-ui.ts` no longer emits per-key trace logging to the browser console. It posts matrix payloads directly to the extension host. If the current debug session rejects a `debug80/tec1gMatrixKey` request, `handleTec1gMessage()` logs a structured warning through the extension-host logger with the payload and error text so failed routing still appears in Debug80 diagnostics.

Each matrix key sends:

```typescript
{ type: 'matrixKey', key: string, pressed: boolean, shift: boolean, ctrl: boolean, fn: boolean, alt: boolean }
```

The `key` field encodes the row and column. Physical keyboard events are captured only while host-keyboard capture is active and are translated to the same message format.

### Platform update application (`tec1g-platform-update.ts`)

`applyTec1gPlatformUpdate()` receives a `Tec1gUpdatePayload` and dispatches it to the individual rendering components: digit elements, audio controller, speed indicator, LCD renderer, matrix UI, GLCD renderer, and keypad state indicators. This function is the single point of contact between an arriving `update` message and all the display components.

### GLCD renderer (`glcd-renderer.ts`)

`createGlcdRenderer()` renders the ST7920 128×64 monochrome display onto a `<canvas>` element. The visible TEC-1G GLCD canvas is 384×192, an exact 3× scale, so each emulated GLCD pixel maps to a uniform 3×3 canvas block. Avoid non-integer display sizes here: a 2.5× scale such as 320×160 makes the browser distribute source pixels unevenly and can make identical font strokes appear to have different thicknesses.

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
        imageData.data[pixelIdx] = on ? 0x1a : 0xa8;
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

The TEC-1 `index.ts` installs a single `window.addEventListener('message', handler)`. The TEC-1G `index.ts` does the same, dispatching on `event.data.type`:

```typescript
window.addEventListener('message', (event: MessageEvent<IncomingMessage | undefined>): void => {
  const message = event.data;
  if (!message) return;
  if (message.type === 'projectStatus') { projectStatusUi.applyProjectStatus(message); azmOptionsControl.applyProjectStatus(...); return; }
  if (message.type === 'sessionStatus') { sessionStatusController.setStatus(message.status); return; }
  if (message.type === 'selectTab')     { panelLayout.setProviderTab(message.tab, false); return; }
  if (message.type === 'update') {
    if (typeof message.uiRevision === 'number') {
      if (message.uiRevision < uiRevision) return;  // stale
      uiRevision = message.uiRevision;
    }
    applyUpdateFromPayload(message);
    return;
  }
  if (message.type === 'snapshot')      { memoryPanelController?.handleSnapshot(message); return; }
  if (message.type === 'snapshotError') { memoryPanelController?.handleSnapshotError(message.message); }
});
```

The `uiRevision` guard is applied to `update` messages. Other message types do not need it — project status, session status, and serial messages are always current when they arrive.

---

## The Simple platform panel

The simple platform panel (`webview/simple/`) is a self-contained entry point in `index.ts`. It shares the same project header, setup card, session status button, and CPU/memory tab as the hardware platforms, but its UI tab contains a terminal display instead of hardware emulation.

### UI tab

The UI tab contains a single **TERMINAL** section:

- A `<pre id="terminalOut">` element accumulates text output received from the running program via the Z80 terminal I/O bridge (`debug80/terminalOutput` events, routed to the sidebar for simple sessions).
- A **CLEAR** button clears the display locally and sends `{ type: 'serialClear' }` to the extension host, which clears the server-side buffer.

The `serial`, `serialInit`, and `serialClear` message types used by the hardware platform serial terminals are reused for the simple platform's terminal output. On rehydration, the accumulated terminal text is replayed via `serialInit`.

### CPU tab

Identical to the TEC-1 and TEC-1G CPU tabs — four independent memory view sections, register strip, inline editing. Uses the same `MemoryPanel` from `webview/common/memory-panel.ts`.

### Tab switching

Tab state is tracked locally and reported to the extension host via `{ type: 'tab', tab }` so the provider can control memory refresh polling. The default tab on session start is `'ui'`.

---

## The memory inspector

`MemoryPanel` in `webview/common/memory-panel.ts` (435 lines) manages the CPU/memory tab. It handles up to four independent memory view sections.

### Snapshot request

When the memory tab is active, the panel calls `requestSnapshot()` periodically (or when a new `update` arrives from the adapter). This sends:

```typescript
{ type: 'refresh', views: [{ mode, address }, ...] }
```

The extension host forwards this to the shared `debug80/memorySnapshot` custom request. The adapter reads the requested memory regions and returns a snapshot that includes registers, stack, symbols and the requested byte arrays.

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

- Common infrastructure (`vscode.ts`, `session-status.ts`, `digits.ts`, `serial.ts`, `memory-panel.ts`) is shared by all three platform panels.

- The hardware webviews use a shared project/status shell, with project controls now grouped into a **Project** accordion section instead of being spread across the top of the panel.

- The **project header** is always visible. The `+` (Add folder) button is always present. The Target dropdown and Stop-on-entry checkbox are shown only when `projectState === 'initialized'`. The Platform dropdown is shown only when `projectState === 'uninitialized'` so the user can choose a platform before initializing — once a project exists it is hidden.

- Each panel's `index.ts` maintains `let projectIsInitialized = false`. The platform `<select>` change handler only fires `saveProjectConfig` when `projectIsInitialized === true`, preventing spurious config writes during panel initialization.

- The **setup card** is shown when the workspace is not yet configured and hidden entirely once a project exists. There is no intermediate "configured" state.

- The **Simple platform** UI tab displays a TERMINAL output area driven by `debug80/terminalOutput` events. It has no hardware display. Its CPU tab is identical to TEC-1/TEC-1G.

- The **TEC-1** panel renders six SVG seven-segment digits, an 8×8 LED matrix, a 16×2 HD44780 canvas LCD, a hex keypad (shared `tec-keypad` + `keypad-core`), a speaker indicator with Web Audio output, and a serial terminal (`common/serial-ui`). `tec1/index.ts` is the composition root while `tec1/message-handler.ts` and `tec1/platform-update.ts` own message branching and hardware update application.

- The **TEC-1G** `index.ts` is a thin composition root. Feature logic is split across dedicated modules. The RGB LED matrix with scanned-display brightness, TMS9918 video, joystick port, 128×64 ST7920 GLCD, 20×4 HD44780 LCD with CGRAM, six seven-segment digits, keypad, serial UI and matrix keyboard mode are each handled by focused modules. The user-facing layout is accordion-based: Project, Machine, Displays, TMS9918 Video, Joystick, Matrix Keyboard, CPU panes, and Serial.

- The `uiRevision` guard in the message handler rejects stale `update` messages from previous sessions.

- The memory inspector polls the adapter at 150 ms intervals when visible, renders register and memory snapshots, and supports inline hex editing of registers and memory bytes.

---

[← The Extension Host UI](12-the-extension-host-ui.md) | [Part V](index.md)
