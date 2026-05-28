# Design: Hardware Serial Link

**Status:** Draft
**Type:** Additive hardware workflow
**Scope:** Send built artifacts from VS Code to real TEC-1/TEC-1G hardware over a host serial port

---

## Summary

Debug80 should support a real hardware serial link that runs in the VS Code extension host and
talks to physical serial ports on the computer. This is separate from the current emulated serial
terminal, which injects bytes into the running Z80 emulator.

The first useful workflow is sending the active target's Intel HEX file to a real board, using
project-configured serial settings such as `4800, 8, none, 2`.

---

## Goals

- Let a user send the active target's built HEX file to real hardware from the Debug80 UI.
- Support serial settings needed by TEC monitor workflows:
  - baud rate, default `4800`
  - data bits, default `8`
  - parity, default `none`
  - stop bits, default `2`
  - optional inter-character and inter-line pacing
- Infer the file to send from the active project/target whenever possible.
- Keep serial configuration in `debug80.json`, with target overrides and sensible defaults.
- Keep the real-hardware path visibly distinct from emulator serial.
- Provide progress, cancellation, clear error messages, and enough logging to diagnose dropped
  transfers.

---

## Non-Goals

- Do not make the debug adapter own the host serial port.
- Do not replace the emulated serial terminal.
- Do not require a debug session just to send a HEX file to hardware.
- Do not implement binary upload/download or memory dump workflows in the first milestone.
- Do not assume every `.hex` transfer protocol is identical. Start with plain Intel HEX text
  pacing, then add monitor-specific handshakes if needed.

---

## Existing Debug80 Context

Debug80 already has:

- emulator serial UI in the TEC-1 and TEC-1G platform panels
- `Debug80: Open ROM Listing/Source`
- target-aware project selection and active target persistence
- target config fields for `sourceFile`, `outputDir`, `artifactBase`, `hex`, and assembler backend
- existing send-file logic for emulator serial in `src/extension/platform-view-serial-actions.ts`

The new hardware link should reuse project/target resolution, progress UI, and file inference ideas,
but it should not reuse DAP custom requests. Real serial I/O belongs in the extension host.

---

## PlatformIO Findings

PlatformIO is a useful reference because it solves a similar class of problem: a VS Code extension
coordinates project state, UI commands, build/upload tasks, and serial access across Windows, macOS,
and Linux.

The main lessons for Debug80 are architectural:

- **Separate VS Code UI from hardware/tooling complexity.** PlatformIO IDE for VS Code is a front
  end over PlatformIO Core rather than one monolithic extension implementation. Its documentation
  describes PlatformIO Core as the built-in CLI/tooling layer used by the extension.
- **Make serial configuration project-owned.** PlatformIO's `platformio.ini` supports monitor
  settings such as `monitor_port`, `monitor_speed`, `monitor_parity`, `monitor_eol`,
  `monitor_rts`, and `monitor_dtr`. Debug80 should mirror that idea in `debug80.json` instead of
  hiding important serial behavior in extension-global state.
- **Use explicit commands for common embedded workflows.** PlatformIO exposes build, upload, upload
  and monitor, and serial monitor actions from toolbar/command surfaces. Debug80's equivalent should
  be target-aware actions such as **Send HEX to Hardware** and **Open Hardware Serial Monitor**.
- **Serial ports are exclusive resources.** PlatformIO includes settings such as automatically
  closing the serial monitor before upload. Debug80 should avoid opening the same port from multiple
  places and should close or reuse the port deliberately before transfers.
- **A CLI/provider boundary can reduce VSIX native-module risk.** Rather than putting all serial
  implementation details directly in the main Debug80 extension, a small Debug80-controlled provider
  or helper can own native serial access. That follows the same broad pattern as PlatformIO without
  depending on PlatformIO itself.

References:

- PlatformIO IDE for VS Code: <https://docs.platformio.org/en/latest/integration/ide/vscode.html>
- PlatformIO serial monitor options:
  <https://docs.platformio.org/en/latest/projectconf/sections/env/options/monitor/index.html>
- `pio device monitor` CLI:
  <https://docs.platformio.org/en/latest/core/userguide/device/cmd_monitor.html>
- `pio device list` CLI:
  <https://docs.platformio.org/en/latest/core/userguide/device/cmd_list.html>

Debug80 should study PlatformIO's source for command/task organization and packaging decisions, but
should not depend on PlatformIO as the serial backend. PlatformIO is a broad embedded ecosystem built
around `platformio.ini`, boards, environments, upload protocols, and PlatformIO Core. Debug80 needs a
small Z80-focused transfer path for known build artifacts and monitor workflows.

---

## Transport Dependency

Node does not provide serial ports in its standard library. The first implementation should avoid
native serial dependencies by using CoolTerm's documented Remote Control Socket:

- The user installs and runs CoolTerm locally.
- Debug80 connects to `127.0.0.1:51413`.
- CoolTerm owns the serial port and sends the selected HEX file.
- Debug80 treats a successful CoolTerm file-send operation as transport completion.
- For TEC-1G MON3, the monitor reports load status on the seven-segment display (`PASS` or
  `ERROR`), not by sending a serial `PASSED`/`FAILED` reply.

This keeps the first hardware workflow dependency-light for Debug80 and avoids VSIX native module
packaging risk. See `docs/coolterm-serial-setup.md`.

A later direct serial provider may still use the `serialport` npm package:

- `SerialPort.list()` discovers ports.
- `new SerialPort({ path, baudRate, dataBits, parity, stopBits })` opens a port.
- It supports Node/Electron environments through native bindings.

Risks to verify before shipping:

- VSIX includes the native serialport runtime files.
- macOS, Windows, and Linux install paths work from a clean extension install.
- Remote VS Code workspaces behave correctly or fail clearly.
- Packaging does not require build tools for normal users.

---

## Provider Strategy

The preferred design is a provider boundary:

```ts
export interface HardwareSerialProvider {
  listPorts(): Promise<HardwareSerialPortInfo[]>;
  sendHex(request: HardwareSerialSendHexRequest): Promise<HardwareSerialTransferResult>;
  openMonitor?(config: HardwareSerialConfig): Promise<void>;
}
```

Debug80 core should own:

- active project and target resolution
- build artifact inference
- UI commands and panel messages
- config editing and validation
- user-facing progress/error handling

The provider should own:

- serial port discovery
- open/write/read/close lifecycle
- native dependencies or helper process details
- OS-specific serial errors and permission diagnostics

Provider implementation options:

1. **Internal provider using `serialport`.** Simple to call, but puts native dependency and
   packaging risk inside the main Debug80 VSIX.
2. **Debug80 hardware-serial companion extension.** Keeps the main extension free of native serial
   dependencies and allows hardware users to opt in. The companion can prefer the local UI extension
   host if remote workspace behavior becomes important.
3. **Debug80 CLI/helper process.** Similar to PlatformIO Core at a much smaller scale. This can be
   implemented with Node + `serialport`, Python + `pyserial`, or another proven serial stack, while
   Debug80 talks to it through process execution or a small JSON protocol.

The current recommendation is to design Debug80 core around the provider interface first. The first
implementation can be an internal provider or a companion extension, but the call site should not
care which one is active.

---

## Extension Host And Remote Workspaces

This feature talks to the serial ports visible to the VS Code extension host process.

For normal local VS Code windows, that is the user's machine, which is what we want. For Remote SSH,
WSL, dev containers, or Codespaces, the extension host may run on another machine or inside a
container. In that case `/dev/ttyUSB0` or `COM3` may refer to the remote/container environment, not
the user's desktop USB adapter.

The first implementation should:

- detect and report available ports from the actual extension host
- document that hardware serial requires the extension host to have access to the device
- avoid silently implying that local desktop hardware is available in remote workspaces

Future work could explore a UI-extension companion if local desktop serial support is needed while
the workspace extension host runs remotely.

---

## Project Configuration

Add an optional `hardwareSerial` block. It should be allowed at the root, inside a profile, and
inside a target. Precedence should follow Debug80's project model:

```text
defaults < root hardwareSerial < profiles.<profile>.hardwareSerial < targets.<target>.hardwareSerial
```

The active target's `profile` field chooses the profile layer. Machine-specific fields such as
`port` may be better stored in VS Code workspace state later, but if they are present in
`debug80.json` they should use the same precedence.

```json
{
  "hardwareSerial": {
    "baudRate": 4800,
    "dataBits": 8,
    "parity": "none",
    "stopBits": 2,
    "lineEnding": "cr",
    "charDelayMs": 2,
    "lineDelayMs": 20
  },
  "targets": {
    "app": {
      "sourceFile": "src/main.asm",
      "outputDir": "build",
      "artifactBase": "main",
      "hardwareSerial": {
        "port": "/dev/tty.usbserial-0001"
      }
    }
  }
}
```

Windows example:

```json
{
  "targets": {
    "app": {
      "hardwareSerial": {
        "port": "COM3"
      }
    }
  }
}
```

Recommended config fields:

| Field           | Type                               | Default | Notes                               |
| --------------- | ---------------------------------- | ------- | ----------------------------------- |
| `port`          | string                             | none    | Required to send without prompting. |
| `baudRate`      | number                             | `4800`  | TEC-1G monitor contract.            |
| `dataBits`      | `5`/`6`/`7`/`8`                    | `8`     | SerialPort-compatible.              |
| `parity`        | `none`/`even`/`odd`/`mark`/`space` | `none`  | Display as `N` in compact labels.   |
| `stopBits`      | `1`/`1.5`/`2`                      | `2`     | TEC-1G monitor contract.            |
| `flowControl`   | `none`/`rtscts`                    | `none`  | Start without flow control.         |
| `lineEnding`    | `none`/`cr`/`lf`/`crlf`            | `cr`    | Intel HEX monitors usually want CR. |
| `charDelayMs`   | number                             | `2`     | Conservative initial pacing.        |
| `lineDelayMs`   | number                             | `20`    | Conservative initial pacing.        |
| `openTimeoutMs` | number                             | `3000`  | User-facing timeout.                |

Compact UI label example:

```text
COM3 - 4800 8N2
```

---

## File Selection And Build Artifact Inference

For a selected project and target, the default file should be obvious:

1. If `target.hex` is configured, send that path.
2. Otherwise if root `hex` is configured, send that path.
3. Otherwise resolve `outputDir` and `artifactBase` for the active target and use:

```text
<outputDir>/<artifactBase>.hex
```

4. If the HEX file does not exist, offer to build first where the target is buildable.
5. If the file still cannot be inferred, open a file picker filtered to `.hex`.

This matches the user's mental model: "send the current target's build output to the board."

---

## UI Integration

The Debug80 sidebar should expose this as a real-hardware workflow, not as emulator serial.

Suggested controls:

- **Port** selector: current port label, click to choose from detected ports.
- **Serial settings** button: edit baud/data/parity/stop/pacing.
- **Send HEX to Hardware** button: sends the inferred active target HEX.
- Optional output/status area: transfer log and received serial text.

Avoid naming collisions:

- Existing `SEND FILE` in the serial terminal means "send to emulator".
- New hardware action should say `SEND HEX TO HARDWARE` or `SEND TO BOARD`.

The hardware controls should be shown only when a Debug80 project/target is selected. They do not
need an active debug session.

---

## Command Surface

Add extension commands:

- `debug80.selectHardwareSerialPort`
- `debug80.configureHardwareSerial`
- `debug80.sendHexToHardware`
- `debug80.openHardwareSerialMonitor` later, if receive/display becomes first-class

The webview should send messages such as:

```ts
{ type: 'hardwareSerialSelectPort' }
{ type: 'hardwareSerialConfigure' }
{ type: 'hardwareSerialSendHex', rootPath?: string, targetName?: string }
```

The extension host should own all serial-port state and file access.

---

## Transfer Flow

Initial send flow:

1. Resolve active project and target.
2. Resolve hardware serial config with this precedence:
   `defaults < root < active profile < active target`.
3. If port is missing, prompt with `SerialPort.list()`.
4. Resolve the HEX path.
5. If the HEX does not exist, offer build or file picker.
6. Open the serial port.
7. Send Intel HEX text line by line:
   - normalize source line endings
   - append configured line ending
   - apply `charDelayMs` and `lineDelayMs`
   - report progress by line count and byte count
8. Close the port unless a monitor session is explicitly open.
9. Report success when the file has been handed to the serial transport; for MON3, instruct the
   user to check the board display for `PASS` or `ERROR`.

Potential later refinement:

- monitor prompt detection
- ACK/NAK handling if a ROM monitor exposes it
- automatic reset/control-line sequencing through DTR/RTS if the board supports it

---

## Module Sketch

```text
src/extension/hardware-serial/
  config.ts              # config shape, defaults, merge, validation
  artifact.ts            # active target HEX inference
  port-service.ts        # serialport wrapper and lazy import
  send-hex.ts            # transfer workflow, pacing, progress
  commands.ts            # command registration
```

Tests:

```text
tests/extension/hardware-serial-config.test.ts
tests/extension/hardware-serial-artifact.test.ts
tests/extension/hardware-serial-send.test.ts
```

The serial transport should be injected behind a small interface in tests so unit tests do not
require real serial hardware.

---

## Suggested Milestones

### Milestone 1: Design And Config

- Add `hardwareSerial` config schema.
- Add config merge/default helpers.
- Add artifact inference helper for `<outputDir>/<artifactBase>.hex`.
- Add the provider interface, with a stub provider that reports "not installed" or "not available."
- Add docs and tests for config/artifact resolution.

### Milestone 2: Provider Spike

- Decide whether the first provider lives inside Debug80, in a companion extension, or behind a
  helper CLI.
- If using `serialport`, add it only to the provider package/surface chosen above.
- Implement port listing and open/write/close behind the provider boundary.
- Verify packaging on macOS, Windows, and Linux.
- Ensure errors are clear when no serial binding is available.

### Milestone 3: Send HEX From Commands

- Add `Debug80: Select Hardware Serial Port`.
- Add `Debug80: Configure Hardware Serial`.
- Add `Debug80: Send HEX to Hardware`.
- Send with progress, cancellation, pacing, and clear error handling.

### Milestone 4: Debug80 UI Integration

- Add panel messages and controls.
- Show active port/settings and inferred HEX path.
- Trigger send from the current project/target.

### Milestone 5: Receive/Monitor And Protocol Polish

- Add optional receive monitor.
- Add transcript save.
- Add monitor-specific handshakes if required.
- Add DTR/RTS reset sequencing if useful for supported boards.

---

## Open Questions

- Should hardware serial config live only in `debug80.json`, or should the selected port be stored
  in VS Code workspace state to avoid committing machine-specific `COM3`/`/dev/tty.*` values?
- Should the send workflow build automatically, prompt to build, or only send existing artifacts?
- Does the TEC-1G monitor need a specific start command before HEX transfer, or is raw Intel HEX
  input enough once the monitor is in receive mode?
- What pacing is reliable on the slowest supported monitor? The current emulator send-file path uses
  short character and line delays, but real hardware should be validated separately.
- How should remote workspaces be handled in user-facing UI?
