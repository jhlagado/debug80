[← Project Configuration](../part1/02-project-configuration.md) | [Part II](README.md) | [The Launch Pipeline →](04-the-launch-pipeline.md)

# Chapter 3 — DAP and the Debug Session

VS Code does not debug programs itself. It delegates to a **debug adapter** — a separate component that speaks the Debug Adapter Protocol (DAP). The adapter receives requests ("launch this program," "set a breakpoint at line 12," "what are the current register values?") and sends back responses and events. In debug80, the adapter contains the Z80 emulator, the platform runtimes, the source maps, and all the execution logic. VS Code provides the UI; the adapter provides the machine.

This chapter explains how the adapter is structured: the session class that connects to DAP, the request controller that handles the work, and the session state object that holds everything about a running debug session.

---

## What DAP looks like

The Debug Adapter Protocol is a JSON-based request/response protocol. VS Code sends a request; the adapter sends a response. The adapter also sends unsolicited events — "the program stopped at a breakpoint," "a new output line appeared," "the session terminated."

A typical exchange:

```
VS Code  →  launchRequest({ sourceFile: "src/app.zax", platform: "tec1g" })
Adapter  ←  launchResponse()
Adapter  ←  StoppedEvent('entry', threadId=1)

VS Code  →  stackTraceRequest({ threadId: 1 })
Adapter  ←  stackTraceResponse({ stackFrames: [...] })

VS Code  →  variablesRequest({ variablesReference: 1 })
Adapter  ←  variablesResponse({ variables: [...] })

VS Code  →  continueRequest({ threadId: 1 })
Adapter  ←  continueResponse()
         ... Z80 runs ...
Adapter  ←  StoppedEvent('breakpoint', threadId=1)
```

DAP defines a standard set of requests: `initialize`, `launch`, `setBreakpoints`, `configurationDone`, `threads`, `continue`, `next` (step over), `stepIn`, `stepOut`, `pause`, `stackTrace`, `scopes`, `variables`, `setVariable`, `disconnect`. Debug80 implements all of these. It also defines custom requests outside the standard protocol, all prefixed with `debug80/` — these handle hardware-specific operations like memory snapshots and register writes.

One important DAP concept: **threads**. DAP models concurrent execution as multiple threads, each with an ID. The Z80 is single-threaded, so debug80 always reports exactly one thread with ID 1. Every `StoppedEvent`, every `stackTraceRequest`, every stepping command uses this constant thread ID.

---

## The adapter class

The adapter is implemented by `Z80DebugSession` in `src/debug/adapter.ts`. It extends `DebugSession` from the `@vscode/debugadapter` library, which provides the DAP transport layer — JSON serialisation, message framing, and the method-dispatch mechanism that calls `launchRequest()` when a launch request arrives.

`Z80DebugSession` is deliberately thin. It owns the objects that make up a debug session — the breakpoint manager, the session state, the variable service, the command router — but it delegates almost all request handling to `AdapterRequestController`. The session class is a wiring layer: it creates dependencies, connects them, and forwards requests.

Here is what the session owns:

```typescript
class Z80DebugSession extends DebugSession {
  private breakpointManager = new BreakpointManager();
  private sourceState = new SourceStateManager();
  private sessionState: SessionStateShape = createSessionState();
  private variableHandles = new Handles<'registers'>();
  private variableService = new VariableService(this.variableHandles);
  private matrixHeldKeys = new Map<string, MatrixKeyCombo[]>();
  private commandRouter = new CommandRouter();
  private platformRegistry = new PlatformRegistry();
  private platformState = { active: 'simple' };
  private logger: Logger;
  private readonly requestController: AdapterRequestController;
}
```

Each of these has a specific job:

| Field | Purpose |
|-------|---------|
| `breakpointManager` | Stores breakpoints by source file and by address. Handles verification against source maps. |
| `sourceState` | Tracks the main source file path and manages ROM source discovery. |
| `sessionState` | All per-session mutable state: the Z80 runtime, source maps, platform runtimes, run state flags. The central data structure of every debug session. |
| `variableHandles` | VS Code's handle registry for variable references. Maps integer handles to scope identifiers. |
| `variableService` | Resolves variable requests into register and flag values. |
| `matrixHeldKeys` | Tracks which matrix keyboard keys are currently held down (TEC-1G). |
| `commandRouter` | Routes custom DAP requests (like `debug80/memoryWrite`) to their handlers. |
| `platformRegistry` | Routes platform-specific custom requests registered by the active platform provider. |
| `platformState` | Tracks which platform is currently active: `'simple'`, `'tec1'`, or `'tec1g'`. |
| `requestController` | Handles all DAP request logic. The session class forwards every request method to it. |

### The constructor

The constructor creates the `AdapterRequestController`, passing in all the dependencies it needs as a single `AdapterRequestControllerDeps` object. It also registers the custom command handlers and sets line/column numbering to 1-based (matching source files).

### Request forwarding

Every standard DAP method on the session class is a one-liner that calls the corresponding method on the request controller:

```typescript
protected continueRequest(response, args) {
  this.requestController.continueRequest(response, args);
}

protected nextRequest(response, args) {
  this.requestController.nextRequest(response, args);
}

protected stackTraceRequest(response, args) {
  this.requestController.stackTraceRequest(response, args);
}
```

This pattern repeats for `setBreakPointsRequest`, `configurationDoneRequest`, `threadsRequest`, `stepInRequest`, `stepOutRequest`, `pauseRequest`, `scopesRequest`, `variablesRequest`, `setVariableRequest`, and `disconnectRequest`. The only method with real logic in the session class is `handleLaunchRequest`, which orchestrates the full launch pipeline (covered in Chapter 4).

### The adapter factory

VS Code needs a factory to create adapter instances. `Z80DebugAdapterFactory` implements `DebugAdapterDescriptorFactory` and returns an **inline** debug adapter — one that runs in the same process as the extension host, not as a separate executable:

```typescript
class Z80DebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(session) {
    return new vscode.DebugAdapterInlineImplementation(new Z80DebugSession(this.logger));
  }
}
```

Running inline means the adapter shares the Node.js event loop with the extension host. This is efficient — no IPC overhead — but it means long-running adapter operations must yield to the event loop or the extension UI freezes. The execution loop in `runUntilStopAsync()` handles this by processing instructions in chunks and yielding between them (covered in Chapter 5).

---

## The request controller

`AdapterRequestController` in `src/debug/adapter-request-controller.ts` is where the work happens. It receives all the session's dependencies through an `AdapterRequestControllerDeps` interface and implements the logic for every DAP request.

The controller exists to keep the session class small and to make the request-handling logic testable without needing a real `DebugSession` instance. Tests can create a controller with mock dependencies and call its methods directly.

### Dependency injection

The controller receives everything it needs through a single deps object:

```typescript
interface AdapterRequestControllerDeps {
  threadId: number;
  breakpointManager: BreakpointManager;
  sourceState: SourceStateManager;
  sessionState: SessionStateShape;
  platformState: { active: string };
  variableService: VariableService;
  commandRouter: CommandRouter;
  platformRegistry: PlatformRegistry;
  sendResponse: (response) => void;
  sendErrorResponse: (response, id, message) => void;
  sendEvent: (event) => void;
  getRuntimeControlContext: () => RuntimeControlContext;
}
```

The three callback functions — `sendResponse`, `sendErrorResponse`, `sendEvent` — are the controller's only way to talk back to VS Code. It never imports the `DebugSession` class directly.

### How requests are handled

Each request method follows the same pattern:

1. Check that the runtime exists (if needed). If not, send an error response.
2. Do the work — read state, execute instructions, resolve source maps.
3. Populate `response.body` with the result.
4. Call `sendResponse(response)`.

For inspection requests (`stackTrace`, `variables`, `scopes`, `threads`), the work is synchronous — read the current CPU state, format it, return. For execution requests (`continue`, `next`, `stepIn`, `stepOut`), the method sends the response immediately and then starts an async execution loop that runs until a stop condition is met.

This split is important. DAP requires the response to be sent before the program stops — the response says "I have started executing," and a `StoppedEvent` later says "I have stopped." If the adapter waited for the Z80 to hit a breakpoint before sending the response, VS Code's UI would freeze.

### Custom request routing

Custom requests arrive through `customRequest()`. The controller checks two routing layers:

```typescript
customRequest(command, response, args, fallback) {
  if (this.deps.commandRouter.handle(command, response, args)) {
    return;
  }
  const platformHandler = this.deps.platformRegistry.getHandler(command);
  if (platformHandler && platformHandler(response, args)) {
    return;
  }
  fallback(command, response, args);
}
```

1. **CommandRouter** — a simple `Map<string, CommandHandler>`. Handlers are registered in the session constructor for fixed commands like `debug80/terminalInput`, `debug80/memoryWrite`, and `debug80/registerWrite`.

2. **PlatformRegistry** — holds commands registered by the active platform provider during the launch sequence. Platforms can add their own custom requests without modifying the adapter core.

3. **Fallback** — calls `super.customRequest()` on the base `DebugSession` class, which handles any protocol-defined custom requests.

Both `CommandRouter` and `PlatformRegistry` are simple classes — under 30 lines each. A `CommandHandler` is a function that takes a response and args, does its work, and returns `true` if it handled the request.

---

## Session state

Every debug session has a single `SessionStateShape` object, defined in `src/debug/session-state.ts`. This is the most important data structure in the adapter — it holds everything about the current debug session in one place.

```typescript
interface SessionStateShape {
  // The Z80 emulator
  runtime: Z80Runtime | undefined;

  // Source mapping
  listing: ListingInfo | undefined;
  listingPath: string | undefined;
  mapping: MappingParseResult | undefined;
  mappingIndex: SourceMapIndex | undefined;
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
  sourceRoots: string[];
  baseDir: string;

  // Platform runtimes
  terminalState: TerminalState | undefined;
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
  platformRuntime: ActivePlatformRuntime | undefined;
  tec1gConfig: Tec1gPlatformConfigNormalized | undefined;

  // Loaded program
  loadedProgram: HexProgram | undefined;
  loadedEntry: number | undefined;
  restartCaptureAddress: number | undefined;
  entryCpuState: CpuStateSnapshot | undefined;

  // Configuration
  launchArgs: LaunchRequestArguments | undefined;
  extraListingPaths: string[];

  // Execution control
  runState: RunState;
}
```

The fields group into five categories:

**The Z80 emulator.** The `runtime` field is the Z80Runtime instance — the CPU, memory, and I/O handlers. When `runtime` is `undefined`, no program is loaded and execution requests return errors.

**Source mapping.** The `listing`, `mappingIndex`, and related fields map between source file lines and memory addresses. The breakpoint manager and stack trace builder both read these to resolve locations. Chapter 12 covers source mapping in detail.

**Platform runtimes.** The `tec1Runtime` and `tec1gRuntime` fields hold the platform-specific hardware emulation state. The `platformRuntime` field is a protocol-level alias — it points to whichever platform runtime is active and provides `recordCycles()` and `silenceSpeaker()` methods that the execution loop calls.

**Loaded program.** The `loadedProgram` holds the parsed Intel HEX image. The `loadedEntry` is the resolved entry point address. The `entryCpuState` captures the CPU state at the application start address, used for warm restarts.

**Execution control.** The `runState` object tracks all the mutable flags that control stepping and breakpoint behaviour. It deserves its own section.

### The RunState

```typescript
interface RunState {
  // Launch/configuration handshake
  stopOnEntry: boolean;
  launchComplete: boolean;
  configurationDone: boolean;

  // Execution flags
  isRunning: boolean;
  haltNotified: boolean;
  pauseRequested: boolean;

  // Stop tracking
  lastStopReason: StopReason | undefined;
  lastBreakpointAddress: number | null;
  skipBreakpointOnce: number | null;

  // Call depth
  callDepth: number;
  stepOverMaxInstructions: number;
  stepOutMaxInstructions: number;
}
```

**Launch handshake.** DAP requires a two-phase startup. The adapter sends an `InitializedEvent` after `initializeRequest`, then VS Code sends breakpoints and a `configurationDoneRequest`. The adapter must not start executing until both `launchComplete` and `configurationDone` are true. `startConfiguredExecutionIfReady()` checks both flags.

**Execution flags.** `isRunning` is true while the execution loop is active. `haltNotified` prevents duplicate halt events — the Z80 `halt` instruction keeps the CPU at the same PC, so the execution loop would hit it on every iteration without this guard. `pauseRequested` is a cooperative flag: `pauseRequest()` sets it to true, and the execution loop checks it on each iteration.

**Stop tracking.** `lastStopReason` and `lastBreakpointAddress` record why and where execution last stopped. These drive the breakpoint-skip logic: when the user presses Continue while stopped at a breakpoint, `skipBreakpointOnce` is set to the current PC. The execution loop skips the breakpoint check once at that address, steps past it, and clears the skip. Without this, pressing Continue at a breakpoint would immediately re-hit the same breakpoint.

**Call depth.** The `callDepth` counter tracks the Z80 call stack depth. It increments on `call` and `rst` instructions, decrements on `ret`. Step Over uses it to run until the return address of a call; Step Out uses it to run until the call depth drops below the baseline. `stepOverMaxInstructions` and `stepOutMaxInstructions` are safety limits — if the program never returns, the step operation gives up after this many instructions and stops with a warning.

### Creating and resetting state

`createSessionState()` returns a fresh state object with all fields at their default values. `resetSessionState()` applies those defaults to an existing object via `Object.assign()`. The existing object is reused rather than replaced so that all references to it (held by the request controller, the runtime control context, etc.) remain valid.

The state is reset at the beginning of every `handleLaunchRequest()` call — before the launch pipeline runs, the previous session's state is wiped clean.

---

## Custom DAP requests

Debug80 extends DAP with custom requests for operations that the standard protocol does not cover. All custom request names use the `debug80/` prefix.

### Requests registered in the CommandRouter

These are registered in the session constructor and are available regardless of the active platform:

| Request | Purpose |
|---------|---------|
| `debug80/terminalInput` | Sends character input to the TEC-1G terminal emulation. |
| `debug80/terminalBreak` | Sends a break signal to the terminal. |
| `debug80/tec1MemorySnapshot` | Returns a snapshot of the Z80 memory for the webview's memory inspector. |
| `debug80/tec1gMemorySnapshot` | Same, for TEC-1G sessions. |
| `debug80/registerWrite` | Modifies a CPU register value during a paused session. |
| `debug80/memoryWrite` | Modifies a memory location during a paused session. |
| `debug80/romSources` | Returns a list of ROM source files for the source manager. |
| `debug80/rebuildWarm` | Reassembles the source file and reloads the binary without restarting the debug session. |

### Custom DAP events

The adapter also sends custom events to the extension host:

| Event | Payload | Purpose |
|-------|---------|---------|
| `debug80/platform` | Platform provider description | Tells the extension host which platform to render in the webview. Sent once during launch. |
| `debug80/mainSource` | `{ path: string }` | Identifies the main source file so the extension can open it in the editor. |
| `debug80/assemblyFailed` | `{ diagnostic?, error? }` | Reports assembly errors to the extension host for display. |
| `debug80/tec1Update` | TEC-1 hardware state | Periodic update of TEC-1 display digits, speaker state, etc. |
| `debug80/tec1gUpdate` | TEC-1G hardware state | Periodic update of TEC-1G display, matrix, LCD, GLCD, etc. |
| `debug80/tec1Serial` | Serial data | Serial port output from TEC-1. |
| `debug80/tec1gSerial` | Serial data | Serial port output from TEC-1G. |
| `debug80/terminalOutput` | Terminal text | Terminal output from the simple platform or TEC-1G terminal mode. |

The platform update events (`tec1Update`, `tec1gUpdate`) fire periodically while the Z80 is running — typically every 16ms — driven by the platform runtime's timing loop. The extension host receives these events and forwards the state to the webview via `postMessage`.

---

## The initialize handshake

When VS Code starts a debug session, the first request is always `initializeRequest`. The adapter responds with its capabilities — what features it supports:

```typescript
initializeRequest(response, args) {
  response.body = response.body ?? {};
  response.body.supportsConfigurationDoneRequest = true;
  response.body.supportsSingleThreadExecutionRequests = true;
  response.body.supportsSetVariable = true;

  this.sendResponse(response);
  this.sendEvent(new InitializedEvent());
}
```

Three capabilities are declared:

- **`supportsConfigurationDoneRequest`** — the adapter wants to receive `configurationDoneRequest` after breakpoints are set. This is the signal that the client is ready for execution to begin.
- **`supportsSingleThreadExecutionRequests`** — stepping commands apply to a single thread (the only one).
- **`supportsSetVariable`** — the adapter supports editing variable values (register writes) from VS Code's Variables panel.

After sending the response, the adapter sends an `InitializedEvent`. VS Code responds by sending all pending breakpoints and then `configurationDoneRequest`. This completes the handshake and execution can begin.

---

## Disconnect and cleanup

When a debug session ends — the user presses Stop, or the program terminates — VS Code sends `disconnectRequest`. The controller cleans up:

```typescript
disconnectRequest(response, args) {
  this.deps.sessionState.platformRuntime?.silenceSpeaker();
  this.deps.sessionState.runtime = undefined;
  this.deps.sessionState.runState.isRunning = false;
  this.deps.sessionState.runState.haltNotified = false;
  this.deps.sessionState.terminalState = undefined;
  this.deps.sessionState.tec1Runtime = undefined;
  this.deps.sessionState.tec1gRuntime = undefined;
  this.deps.sessionState.platformRuntime = undefined;
  this.deps.sessionState.loadedProgram = undefined;
  this.deps.sessionState.loadedEntry = undefined;
  this.deps.sessionState.restartCaptureAddress = undefined;
  this.deps.sessionState.entryCpuState = undefined;
  this.deps.sessionState.launchArgs = undefined;
  this.deps.platformRegistry.clear();
  this.deps.sendResponse(response);
}
```

The key action is setting `runtime` to `undefined`. The execution loop checks for this on every iteration — once runtime is gone, any running loop exits immediately. The speaker is silenced first to avoid leftover audio. Platform runtimes and loaded program data are released. The platform registry is cleared so stale handlers from the previous platform do not leak into the next session.

Note that the `breakpointManager` is not cleared here — breakpoints persist across sessions. When the user starts a new debug session, the saved breakpoints are re-verified against the new source maps.

---

## The halt protocol

The Z80 `halt` instruction stops the CPU — PC stays at the same address and the CPU waits for an interrupt. In debug80, a halt is handled in two phases by `handleHaltStop()`:

**First halt.** The adapter sends a `StoppedEvent('halt')`. VS Code shows the program as paused. The user can inspect registers, memory, and the call stack. They can also press Continue, which resumes execution — but because the CPU is halted, the execution loop will hit halt again immediately.

**Second halt.** If `haltNotified` is already true (the halt was already reported), the adapter sends a `TerminatedEvent()` instead. This tells VS Code the session is over. The rationale: if the user continues past a halt and the program halts again, it is not going to make progress. Terminating the session is the right response.

```typescript
handleHaltStop() {
  this.deps.sessionState.runState.isRunning = false;
  if (!this.deps.sessionState.runState.haltNotified) {
    this.deps.sessionState.runState.haltNotified = true;
    this.deps.sessionState.runState.lastStopReason = 'halt';
    this.deps.sendEvent(new StoppedEvent('halt', this.deps.threadId));
    return;
  }
  this.deps.sessionState.platformRuntime?.silenceSpeaker();
  this.deps.sendEvent(new TerminatedEvent());
}
```

The `haltNotified` flag is reset to `false` whenever execution stops for any other reason (breakpoint, step, pause). This means a halt after a breakpoint is treated as a fresh halt, not a repeat.

---

## Summary

- Debug80's adapter implements DAP through `Z80DebugSession`, which extends the `@vscode/debugadapter` base class. It runs inline — same process as the extension host.

- The session class is a thin wiring layer. It owns the dependencies (breakpoint manager, session state, variable service, command router, platform registry) and forwards all request handling to `AdapterRequestController`.

- The request controller handles every DAP request. Inspection requests (stack trace, variables) are synchronous. Execution requests (continue, step) send the response immediately and start an async execution loop.

- `SessionStateShape` holds all per-session state in a single mutable object. It is reset at the start of each launch. The `RunState` nested within it tracks execution flags, stop reasons, and call depth.

- Custom requests use the `debug80/` prefix and are routed through two layers: `CommandRouter` for fixed adapter commands, `PlatformRegistry` for platform-specific commands registered during launch.

- Custom events (`debug80/tec1gUpdate`, `debug80/platform`, etc.) flow from the adapter to the extension host, which forwards them to the webview for rendering.

- The DAP startup handshake requires both `launchComplete` and `configurationDone` before execution begins. The halt protocol sends `StoppedEvent('halt')` on first halt and `TerminatedEvent()` on repeated halt.

- On disconnect, the runtime is set to `undefined` (which stops any running execution loop), platform state is released, and the platform registry is cleared. Breakpoints are preserved across sessions.

---

[← Project Configuration](../part1/02-project-configuration.md) | [Part II](README.md) | [The Launch Pipeline →](04-the-launch-pipeline.md)
