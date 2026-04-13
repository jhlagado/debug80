[← Adding a New Platform](16-adding-a-new-platform.md) | [Part VII](README.md)

# Chapter 17 — Custom Commands, UI Panels, and Source Mapping

Chapter 16 built a minimal platform skeleton. This chapter covers the three remaining extension areas: adding custom DAP commands to drive hardware from the webview, building a sidebar UI panel, and extending or replacing the source mapper.

---

## Custom DAP commands

Custom DAP commands are the channel through which the webview drives platform hardware. The webview calls `session.customRequest('debug80/myplatformReset')` and the adapter dispatches it to the platform's registered handler.

### Registration

`registerCommands` on the provider receives a `PlatformRegistry` and a `PlatformCommandContext`. The registry holds a map of command names to handlers. The context provides access to session state and response helpers.

```typescript
registerCommands(registry, context) {
  registry.register({
    id: 'myplatform',
    commands: {
      'debug80/myplatformReset': (response, args) => {
        resetMyplatformState(context.sessionState.myplatformRuntime);
        context.sendResponse(response);
        return true;
      },

      'debug80/myplatformKey': (response, args) => {
        const { code } = args as { code: number };
        if (typeof code !== 'number') {
          context.sendErrorResponse(response, 1, 'key code required');
          return true;
        }
        applyKey(context.sessionState.myplatformRuntime, code);
        context.sendResponse(response);
        return true;
      },

      'debug80/myplatformSpeed': (response, args) => {
        const { mode } = args as { mode: 'fast' | 'slow' };
        setSpeed(context.sessionState.myplatformRuntime, mode);
        context.sendResponse(response);
        return true;
      },
    },
  });
},
```

The handler receives the raw DAP response object and the `args` from the request. It must call either `sendResponse` or `sendErrorResponse` exactly once and return `true` to signal that it handled the command.

### Naming

Command names follow the pattern `debug80/{platformId}{Verb}`. Use PascalCase for the verb: `debug80/myplatformKey`, `debug80/myplatformReset`, `debug80/myplatformSpeed`, `debug80/myplatformMemorySnapshot`.

### Accessing the runtime

The handlers close over `context.sessionState`. The session state shape (`src/debug/session-state.ts`) has typed fields for each platform's runtime (`tec1Runtime`, `tec1gRuntime`). Add your runtime field there:

```typescript
// In SessionStateShape:
myplatformRuntime?: MyplatformRuntime;
```

Set it during `buildIoHandlers` by attaching the runtime to the state object after construction, or expose a setter on the runtime that the provider calls after `createZ80Runtime` returns.

### Memory snapshot command

If your platform has a memory inspector, register a snapshot command. The webview sends it at 150 ms intervals when the memory tab is active:

```typescript
'debug80/myplatformMemorySnapshot': (response, args) => {
  const snapshot = captureSnapshot(
    context.sessionState.myplatformRuntime,
    context.sessionState.runtime,
    args as SnapshotRequest
  );
  response.body = snapshot;
  context.sendResponse(response);
  return true;
},
```

The snapshot payload structure mirrors the TEC-1 and TEC-1G snapshot formats: a register block plus an array of memory region dumps. The webview's `MemoryPanel` renders any snapshot in that shape.

---

## Building a sidebar UI panel

A sidebar panel is optional. Platforms without one (like `simple`) show only the project header and session status. If your hardware has visible state — a display, LEDs, a keyboard — you will want a panel.

### Overview

The panel is a VS Code WebviewView (an iframe). It communicates with the extension host through message passing only. The extension host holds all hardware state; the webview renders it. On every hardware update, the extension host posts an `update` message containing a snapshot of all hardware state.

### File structure

```
src/platforms/myplatform/
├── ui-panel-html.ts      # Returns the webview HTML string
├── ui-panel-state.ts     # In-memory UI state on the extension host side
└── ui-panel-messages.ts  # Handles webview → extension host messages

webview/myplatform/
├── index.html            # Template with {{token}} placeholders
├── index.ts              # Entry point; message handler; render loop
└── styles.css            # Platform-specific styles
```

### Registering the UI

Open `src/extension/extension.ts` and add your platform to the UI registry:

```typescript
function registerBuiltInPlatformUis(): void {
  registerPlatformUi(createTec1PlatformUiEntry());
  registerPlatformUi(createTec1gPlatformUiEntry());
  registerPlatformUi(createMyplatformPlatformUiEntry());
}

function createMyplatformPlatformUiEntry(): PlatformUiEntry {
  return {
    id: 'myplatform',
    loadUiModules: async (): Promise<PlatformUiModules> => {
      const [html, state, messages] = await Promise.all([
        import('../platforms/myplatform/ui-panel-html.js'),
        import('../platforms/myplatform/ui-panel-state.js'),
        import('../platforms/myplatform/ui-panel-messages.js'),
      ]);
      return buildMyplatformUiModules(html, state, messages);
    },
  };
}
```

`buildMyplatformUiModules` wires the six required module methods (`getHtml`, `createUiState`, `resetUiState`, `applyUpdate`, `buildUpdateMessage`, `buildClearMessage`) plus `snapshotCommand` and `createMemoryViewState`.

### Extension host UI state

`ui-panel-state.ts` holds the extension host's mirror of the hardware display state. This is the buffer that survives webview reloads (sidebar hide/show cycles):

```typescript
export interface MyplatformUiState {
  displayValue: number;
  ledRow: number[];
}

export function createMyplatformUiState(): MyplatformUiState {
  return { displayValue: 0, ledRow: Array(8).fill(0) };
}

export function resetMyplatformUiState(state: MyplatformUiState): void {
  state.displayValue = 0;
  state.ledRow.fill(0);
}

export function applyMyplatformUpdate(
  state: MyplatformUiState,
  payload: MyplatformUpdatePayload
): void {
  if (payload.displayValue !== undefined) state.displayValue = payload.displayValue;
  if (payload.ledRow !== undefined) state.ledRow = payload.ledRow;
}
```

### The update message

`buildUpdateMessage` serialises the UI state into the message the extension host posts to the webview:

```typescript
{
  type: 'update',
  uiRevision: number,
  displayValue: state.displayValue,
  ledRow: state.ledRow,
}
```

The webview handler checks `uiRevision` before applying (the revision guard is handled by `PlatformViewProvider`; you just include the revision number in the message).

### Handling webview → extension host messages

`ui-panel-messages.ts` receives messages from the webview and translates them into adapter custom requests:

```typescript
export async function handleMyplatformMessage(
  message: PlatformViewMessage,
  context: PlatformUiMessageContext
): Promise<void> {
  const session = context.getSession();
  if (!session) return;

  switch (message.type) {
    case 'key':
      await session.customRequest('debug80/myplatformKey', { code: message.code });
      break;
    case 'reset':
      await session.customRequest('debug80/myplatformReset');
      break;
  }
}
```

### The webview side

`webview/myplatform/index.ts` runs inside the iframe. Its structure mirrors the TEC-1 webview:

```typescript
const vscode = acquireVsCodeApi();

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!checkRevision(msg)) return;  // Drop stale updates

  switch (msg.type) {
    case 'update':
      renderDisplay(msg.displayValue);
      renderLeds(msg.ledRow);
      break;
    case 'projectStatus':
      renderProjectHeader(msg);
      break;
    case 'sessionStatus':
      renderSessionStatus(msg.status);
      break;
  }
});
```

Post messages back to the extension host by calling:

```typescript
vscode.postMessage({ type: 'key', code: keyCode });
vscode.postMessage({ type: 'reset' });
```

The `acquireVsCodeApi()` bridge, session status controller, and project header rendering are in `webview/common/` and can be used directly. See Chapter 13 for their APIs.

### HTML template

`webview/myplatform/index.html` follows the same token pattern as the TEC-1 template. The required tokens are `{{cspSource}}`, `{{nonce}}`, `{{styleUri}}`, `{{commonStyleUri}}`, and `{{scriptUri}}`. The `buildPanelHtml()` function in `src/platforms/panel-html.ts` replaces them automatically.

---

## Extending the source mapper

Most platforms can use the existing mapper without modification — if you assemble with ZAX and pass `--d8`, you get HIGH-confidence mappings for free. But if you are adding a platform that uses a different assembler or a non-standard listing format, you may need to extend the parser.

### Adding a listing format variant

`parseMapping()` in `src/mapping/parser.ts` recognises the asm80/ZAX listing format. If your assembler produces a different format, add a parallel parser function:

```typescript
export function parseMyassemblerListing(
  listingContent: string,
  listingPath: string
): MappingParseResult {
  // Parse your listing format
  // Return the same MappingParseResult shape
  const segments: SourceMapSegment[] = [];
  const anchors: SourceMapAnchor[] = [];

  for (const [lineIndex, line] of listingContent.split('\n').entries()) {
    const match = MY_LISTING_REGEX.exec(line);
    if (!match) continue;

    const address = parseInt(match[1], 16);
    const byteCount = parseBytes(match[2]).length;
    segments.push({
      startAddress: address,
      endAddress: address + byteCount - 1,
      lstLine: lineIndex + 1,
      lstEndLine: lineIndex + 1,
      file: listingPath,   // Overridden by attachAnchors if anchors present
      line: lineIndex + 1,
      endLine: lineIndex + 1,
      confidence: 'MEDIUM',
      kind: 'code',
    });
  }

  attachAnchors(segments, anchors);

  return {
    segments,
    anchors,
    lstInfo: { listingPath, hasAnchors: anchors.length > 0, lineCount: lineIndex + 1 },
  };
}
```

Call `buildSourceMapIndex()` on the result as normal. Layer 2 and the index structure are format-agnostic.

### Plugging in a custom parser

`SourceManager.buildState()` in `src/debug/source-manager.ts` is where the listing parser is invoked. The cleanest extension point is to pass a `parser` option:

```typescript
buildState({
  listingContent,
  listingPath,
  parser: parseMyassemblerListing,   // Override the default
  // ...
})
```

If `SourceManager` does not yet support a parser option, add one. The change is localised: the method already accepts an options object, and the parser function signature (`string, string) => MappingParseResult`) is stable.

### Providing a custom D8 map

If your assembler can emit symbol and mapping data in a structured format, the cleanest path is to write a converter that produces a `D8DebugMap` JSON file. The mapper's D8 path is already optimised for HIGH-confidence data and validates input thoroughly. Writing a `myassembler-to-d8.ts` converter is far less work than extending the mapper itself.

The `D8DebugMap` format is documented in Chapter 14. The minimum viable D8 file is:

```json
{
  "version": 1,
  "generator": { "name": "myassembler", "version": "1.0" },
  "files": {
    "/path/to/source.asm": {
      "segments": [
        { "address": 2048, "endAddress": 2049, "lstLine": 5,
          "line": 5, "endLine": 5, "confidence": "HIGH", "kind": "code" }
      ],
      "symbols": []
    }
  },
  "lstText": []
}
```

Place it at `<listing-path>.d8.json` and `SourceManager` will pick it up automatically over the listing-only path.

---

## Summary

- Custom DAP commands are registered in `registerCommands` via `registry.register({ id, commands })`. Name them `debug80/{platformId}{Verb}`. Handlers receive the raw response object and must call `sendResponse` or `sendErrorResponse` exactly once.
- A sidebar UI panel requires six files: three on the extension host side (html, state, messages) and three on the webview side (index.html, index.ts, styles.css). Register the panel in `extension.ts` by adding a `PlatformUiEntry` to the UI registry.
- The extension host side holds all hardware display state as a plain object. On every hardware update, `buildUpdateMessage` serialises it into a `postMessage` payload. On sidebar hide/show, `renderCurrentView` rehydrates the webview from the buffered state.
- To extend the source mapper for a non-standard listing format, write a parallel `parseListing` function returning `MappingParseResult` and pass it as an option to `SourceManager.buildState()`. Alternatively, write a converter to D8 JSON — the D8 path is already high-confidence and fully integrated.

---

[← Adding a New Platform](16-adding-a-new-platform.md) | [Part VII](README.md)
