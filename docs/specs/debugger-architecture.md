# VSCode Debugger Architecture and Implementation Plan

---

## Table of Contents

- [1. Introduction](#1-introduction)
  - [1.1 Purpose of the Debugger](#11-purpose-of-the-debugger)
  - [1.2 Scope of the Initial Prototype](#12-scope-of-the-initial-prototype)
  - [1.3 Design Goals](#13-design-goals)
  - [1.4 Why Start with a TinyCPU Model](#14-why-start-with-a-tinycpu-model)
  - [1.5 Long-Term Vision](#15-long-term-vision)
- [2. System Architecture Overview](#2-system-architecture-overview)
  - [2.1 VS Code Extension Model](#21-vs-code-extension-model)
  - [2.2 Debug Adapter Protocol (DAP)](#22-debug-adapter-protocol-dap)
  - [2.3 Separation of Responsibilities](#23-separation-of-responsibilities)
  - [2.4 Data and Control Flows Between Layers](#24-data-and-control-flows-between-layers)
  - [2.5 Execution Modes (Step, Continue, Breakpoint, Halt)](#25-execution-modes-step-continue-breakpoint-halt)
- [3. The TinyCPU Prototype](#3-the-tinycpu-prototype)
  - [3.1 Purpose of the Toy Runtime](#31-purpose-of-the-toy-runtime)
  - [3.2 Design Philosophy](#32-design-philosophy)
  - [3.3 Core State Variables](#33-core-state-variables)
  - [3.4 Minimal Instruction Set](#34-minimal-instruction-set)
  - [3.5 Execution Semantics](#35-execution-semantics)
  - [3.6 Breakpoint Model](#36-breakpoint-model)
  - [3.7 How TinyCPU Enables Debugging Feature Testing](#37-how-tinycpu-enables-debugging-feature-testing)
- [4. Debug Adapter Responsibilities](#4-debug-adapter-responsibilities)
  - [4.1 What the Debug Adapter Must Do](#41-what-the-debug-adapter-must-do)
  - [4.2 Lifecycle of a Debugging Session](#42-lifecycle-of-a-debugging-session)
  - [4.3 State the Adapter Must Track](#43-state-the-adapter-must-track)
  - [4.4 Required DAP Messages and Their Roles](#44-required-dap-messages-and-their-roles)
  - [4.5 Optional / Future DAP Messages](#45-optional--future-dap-messages)
- [5. Extension File Structure](#5-extension-file-structure)
  - [5.1 High-Level Project Layout](#51-high-level-project-layout)
  - [5.2 package.json Configuration](#52-packagejson-configuration)
  - [5.3 Role of extension.ts](#53-role-of-extensionts)
  - [5.4 Role of adapter.ts](#54-role-of-adapterts)
  - [5.5 Role of tinycpu.ts](#55-role-of-tinycputs)
  - [5.6 Build Process (tsc)](#56-build-process-tsc)
  - [5.7 Running via "Extension Development Host"](#57-running-via-extension-development-host)
- [6. Breakpoint Handling](#6-breakpoint-handling)
  - [6.1 Breakpoint Storage Model](#61-breakpoint-storage-model)
  - [6.2 Mapping VS Code Breakpoints to TinyCPU Lines](#62-mapping-vs-code-breakpoints-to-tinycpu-lines)
  - [6.3 Breakpoint Verification](#63-breakpoint-verification)
  - [6.4 Breakpoints During Execution](#64-breakpoints-during-execution)
  - [6.5 Differences Between TinyCPU Breakpoints and Z80 Breakpoints](#65-differences-between-tinycpu-breakpoints-and-z80-breakpoints)
  - [6.6 Line-Based vs Address-Based Breakpoint Models (Future)](#66-line-based-vs-address-based-breakpoint-models-future)
- [7. Step Operations](#7-step-operations)
  - [7.1 What "Step" Means for TinyCPU](#71-what-step-means-for-tinycpu)
  - [7.2 Semantics of next/stepIn/stepOut (Minimal)](#72-semantics-of-nextstepinstepout-minimal)
  - [7.3 Sending "Stopped" Events Consistently](#73-sending-stopped-events-consistently)
  - [7.4 Interaction with HALT](#74-interaction-with-halt)
  - [7.5 Future: Cycle-Level Stepping for Z80](#75-future-cycle-level-stepping-for-z80)
- [8. Variables and Scopes](#8-variables-and-scopes)
  - [8.1 Variable Model for TinyCPU](#81-variable-model-for-tinycpu)
  - [8.2 Register Scope](#82-register-scope)
  - [8.3 Memory Scope (Optional for TinyCPU)](#83-memory-scope-optional-for-tinycpu)
  - [8.4 Mapping Program State to DAP Variable Structures](#84-mapping-program-state-to-dap-variable-structures)
  - [8.5 Expanding This for Z80: Full Register File and Memory Windows](#85-expanding-this-for-z80-full-register-file-and-memory-windows)
  - [8.6 Future: Symbolic Variables from .lst or Symbol Table](#86-future-symbolic-variables-from-lst-or-symbol-table)
- [9. Source File Mapping](#9-source-file-mapping)
  - [9.1 How the TinyCPU Uses Literal Source Lines](#91-how-the-tinycpu-uses-literal-source-lines)
  - [9.2 How "pc → Source Line" Mapping Works](#92-how-pc--source-line-mapping-works)
  - [9.3 Future: Real Z80 Source-Level Debugging](#93-future-real-z80-source-level-debugging)
  - [9.4 Use of .lst Files](#94-use-of-lst-files)
  - [9.5 Handling Multiple Files](#95-handling-multiple-files)
  - [9.6 Handling Macros and Expanded Instructions](#96-handling-macros-and-expanded-instructions)
- [10. Error Handling and State Management](#10-error-handling-and-state-management)
  - [10.1 Error Cases in the Adapter](#101-error-cases-in-the-adapter)
  - [10.2 What Happens if CPU Runs Out of Bounds](#102-what-happens-if-cpu-runs-out-of-bounds)
  - [10.3 Resetting the System](#103-resetting-the-system)
  - [10.4 Handling Invalid Breakpoints](#104-handling-invalid-breakpoints)
  - [10.5 Keeping the Adapter Robust for Automated Testing](#105-keeping-the-adapter-robust-for-automated-testing)
- [11. Unit Testing Strategy](#11-unit-testing-strategy)
  - [11.1 Why Test the Adapter Separately from the Runtime](#111-why-test-the-adapter-separately-from-the-runtime)
  - [11.2 Mocking CPU Behaviour](#112-mocking-cpu-behaviour)
  - [11.3 Testing DAP Request/Response Pairs](#113-testing-dap-requestresponse-pairs)
  - [11.4 Integration Tests Using the Real TinyCPU](#114-integration-tests-using-the-real-tinycpu)
  - [11.5 Future: Z80 Tests with Expected Memory/Register States](#115-future-z80-tests-with-expected-memoryregister-states)
  - [11.6 Continuous Testing with CLI/HTTP Backend](#116-continuous-testing-with-clihttp-backend)
- [12. Transition from TinyCPU to Full Z80](#12-transition-from-tinycpu-to-full-z80)
  - [12.1 Swap-In Strategy for the Z80 Engine](#121-swap-in-strategy-for-the-z80-engine)
  - [12.2 Preserving the DAP Layer Unchanged](#122-preserving-the-dap-layer-unchanged)
  - [12.3 Expanding CPU Interface (Registers, Flags, Memory, Ports)](#123-expanding-cpu-interface-registers-flags-memory-ports)
  - [12.4 Implementing Address-Based Breakpoints](#124-implementing-address-based-breakpoints)
  - [12.5 Multi-Instruction Disassembly](#125-multi-instruction-disassembly)
  - [12.6 Handling HALT, Interrupts, and Timing](#126-handling-halt-interrupts-and-timing)
  - [12.7 Supporting .lst Source Mapping](#127-supporting-lst-source-mapping)
  - [12.8 Optional: Cycle-Accurate Debugging](#128-optional-cycle-accurate-debugging)
- [13. Future Integration: CLI, HTTP Server, and AI Automation](#13-future-integration-cli-http-server-and-ai-automation)
  - [13.1 Purpose of a Server-Driven Emulator](#131-purpose-of-a-server-driven-emulator)
  - [13.2 Running Z80 Debugger Sessions via HTTP Requests](#132-running-z80-debugger-sessions-via-http-requests)
  - [13.3 Uploading Binaries, Setting Breakpoints Remotely](#133-uploading-binaries-setting-breakpoints-remotely)
  - [13.4 Integrating with curl, Shell Scripts, and AI-Generated Tests](#134-integrating-with-curl-shell-scripts-and-ai-generated-tests)
  - [13.5 Multi-Client Debugging (Optional)](#135-multi-client-debugging-optional)
  - [13.6 Separation Between VS Code Debugger and Headless Emulator](#136-separation-between-vs-code-debugger-and-headless-emulator)
- [14. Packaging and Deployment](#14-packaging-and-deployment)
  - [14.1 Dev Workflow (Extension Host)](#141-dev-workflow-extension-host)
  - [14.2 Packaging with vsce](#142-packaging-with-vsce)
  - [14.3 Installing .vsix Files](#143-installing-vsix-files)
  - [14.4 Versioning the Extension](#144-versioning-the-extension)
  - [14.5 Publishing (Optional)](#145-publishing-optional)
- [15. Conclusion & Next Steps](#15-conclusion--next-steps)
  - [15.1 What the TinyCPU Prototype Demonstrates](#151-what-the-tinycpu-prototype-demonstrates)
  - [15.2 What the Z80 Debugger Will Add](#152-what-the-z80-debugger-will-add)
  - [15.3 Roadmap to a Fully Automated AI-Driven Z80 Development Environment](#153-roadmap-to-a-fully-automated-ai-driven-z80-development-environment)

---

## 1. Introduction

### 1.1 Purpose of the Debugger

This project aims to develop a lightweight, extensible debugging environment for a custom Z80 emulator, using Visual Studio Code as the primary graphical front-end. The debugger will allow controlled execution of Z80 programs with support for stepping, breakpoints, register inspection, memory views, and later, source-level debugging through assembler listing files.

Although the long-term target is a fully featured Z80 development stack, the immediate objective is to create a **minimal, functional debugger skeleton** capable of serving as the foundation for further expansion. This initial version will use a simplified "TinyCPU" runtime to validate the Debug Adapter Protocol (DAP) plumbing before the full Z80 backend is introduced.

---

### 1.2 Scope of the Initial Prototype

The initial prototype focuses on the smallest possible implementation that can:

- Load a trivial program (line-based, not assembled).
- Execute one instruction at a time.
- Support breakpoints on specific lines.
- Allow stepping through execution.
- Maintain and expose simple state variables (program counter, accumulator).
- Communicate state changes to VS Code through DAP.
- Present state to the user through the integrated Debug panel.

This ensures the full *debugging pipeline* is proven early, without complexity from Z80 instruction decoding, timing, flags, registers, I/O ports, or memory addressing.

---

### 1.3 Design Goals

The long-term debugger architecture is guided by several non-negotiable goals:

- **Simplicity of integration** — The debugger must be able to wrap any execution engine — starting with the TinyCPU and later the Z80 emulator — without rewriting the DAP layer.

- **Command-line and AI-friendly workflow** — The system must be controllable from the terminal so AI agents and automated test scripts can drive compilation, execution, and verification without requiring a GUI.

- **Isolation from retro machine architectures** — No assumptions will be made about ZX Spectrum, Amstrad, MSX, or any machine-specific quirks. The debugger will target a *pure Z80 environment*.

- **Clean separation of concerns** — VS Code handles UI, the Debug Adapter handles protocol, and the CPU runtime handles execution. No layer should leak responsibilities into another.

- **Extendibility** — The architecture must support later additions such as:
  - full register file for the Z80
  - memory view + partial disassembly
  - `.lst` listing file parsing
  - symbolic mapping and labels
  - breakpoints on addresses instead of lines
  - cycle-accurate stepping
  - remote debugging over HTTP

---

### 1.4 Why Start with a TinyCPU Model

Implementing a full debugger on top of a complex emulator is error-prone. By contrast, a trivial CPU model provides:

- deterministic execution
- easily inspectable state
- no decoding logic
- no memory management
- no side effects
- predictable stepping behaviour
- guaranteed breakpoint determinism

This allows the Debug Adapter to be built and validated **in isolation**, without any dependency on the Z80 engine. Once DAP communication is stable and the debugger lifecycle is well-understood, the TinyCPU layer can be replaced with a real emulator without altering the debugger's external behaviour.

---

### 1.5 Long-Term Vision

The eventual goal is a **full Z80 debugging ecosystem** that supports:

- annotated source view using `.lst` files
- breakpoints on both source and addresses
- watchpoints and conditional execution
- debugger-driven unit testing
- integration with a headless HTTP-driven emulator
- AI-generated tests and automated debugging workflows
- scriptable attachment via `curl` and shell scripts
- optional Web UI or headless CI environments

This document describes the architecture that enables this path, beginning with a minimalistic prototype that establishes the foundation for a much richer debugging environment.

---

## 2. System Architecture Overview

### 2.1 VS Code Extension Model

The debugger is implemented as a Visual Studio Code extension that conforms to the standard extension activation and contribution model. The extension declares a custom debugger type, provides a Debug Adapter responsible for processing Debug Adapter Protocol (DAP) requests, and integrates with user-defined launch configurations. The extension itself does not execute program logic; it acts as a loader and host for the Debug Adapter process. All heavy execution and state manipulation occur outside the UI layer.

### 2.2 Debug Adapter Protocol (DAP)

The Debug Adapter Protocol defines the message-based contract between the VS Code debugger interface and the Debug Adapter. All debugger interactions—initialization, configuration, breakpoints, stepping, variable inspection, and program termination—are expressed as DAP requests and responses. The protocol is transport-agnostic and uses JSON messages over standard I/O. Implementing the DAP layer ensures compatibility with the built-in VS Code debugging UI without requiring any custom front-end logic.

### 2.3 Separation of Responsibilities

**VS Code UI** — Responsible for presenting breakpoints, stack frames, variables, source code, and execution controls. It issues DAP requests based on user actions and displays DAP events sent by the adapter.

**Debug Adapter** — Acts as the intermediary between the UI and the underlying execution engine. It receives DAP commands, translates them into operations on the CPU runtime, manages breakpoints, tracks execution state, and emits standardized DAP events. It contains no execution semantics itself.

**Execution Engine (TinyCPU → Z80)** — Executes instructions, maintains processor state, and exposes a small control surface to the Debug Adapter: step, continue, read registers, read memory, reset state, and report halt conditions. The TinyCPU implementation provides a simplified model for validating the debugger pipeline. The Z80 engine later replaces it without altering the DAP interface.

**CLI / HTTP Server Backend (Future)** — An optional headless execution layer enabling scripted or remote debugging scenarios. The Debug Adapter may operate against this backend over a transport such as HTTP or WebSocket, allowing decoupling between UI debugging and automated testing workflows.

### 2.4 Data and Control Flows Between Layers

VS Code initiates all debugger activity by issuing DAP requests such as initialization, breakpoint configuration, stepping commands, and variable inspection. The Debug Adapter interprets these requests, invokes the corresponding execution engine operations, updates adapter-side state, and emits DAP events such as stopped notifications. Execution flows downward—from UI to adapter to CPU—while state observations flow upward—from CPU to adapter to UI. No direct communication exists between VS Code and the execution engine.

### 2.5 Execution Modes (Step, Continue, Breakpoint, Halt)

The execution engine supports four primary modes.

**Step:** Execute exactly one instruction and return control immediately. Used for fine-grained debugging.

**Continue:** Execute instructions sequentially until a breakpoint is encountered, a halt instruction is executed, or the end of the program is reached.

**Breakpoint:** A matched breakpoint condition forces execution to stop. The Debug Adapter reports this via a DAP "stopped" event with the reason set to "breakpoint."

**Halt:** Execution terminates because the CPU encounters a HALT instruction or runs out of valid instructions. The adapter reports this via a "stopped" or "terminated" event depending on the debugger's requirements.

These modes constitute the full set of control operations required for the TinyCPU model and form the basis for the more complex semantics of the full Z80 debugger.

---

## 3. The TinyCPU Prototype

### 3.1 Purpose of the Toy Runtime

The TinyCPU serves as a simplified execution engine that allows the Debug Adapter to be developed and validated independently of the full Z80 implementation. Its purpose is to provide deterministic, easily observable behaviour that exercises the complete debugging workflow—breakpoints, stepping, variable inspection, and halted execution—without introducing the complexity of real instruction decoding or memory models. By validating the DAP plumbing against this minimal runtime, the debugger architecture can be tested incrementally and refined before integrating with the Z80 backend.

### 3.2 Design Philosophy

The TinyCPU is intentionally minimal. Every design decision prioritizes clarity, predictability, and debuggability over realism. Its behaviour must be simple enough to reason about and stable enough to serve as a reliable target for testing the debugger. Each instruction executes in a single operation, the state model is flat, and no side effects exist outside of changes to the accumulator and program counter. The focus is on validating the debugger's ability to coordinate with a CPU-like system rather than simulating an actual processor architecture.

### 3.3 Core State Variables

The TinyCPU maintains exactly three pieces of state:

- **pc**: The program counter, expressed as a zero-based index into the program array.
- **acc**: A single accumulator register holding an integer value.
- **program**: An ordered list of instruction strings, each representing one executable line.

These fields define all observable behaviour exposed to the Debug Adapter. No memory addressing, register files, flags, or stack structures are present in this model.

### 3.4 Minimal Instruction Set

**LOAD** — Loads an immediate integer value into the accumulator and advances the program counter.

**ADD** — Adds an immediate integer value to the accumulator and advances the program counter.

**HALT** — Signals termination of execution. The program counter may be advanced or left unchanged depending on implementation, but no further instructions should be executed.

**Optional Instructions**

- **NOP**: No operation; advances the program counter.
- **JMP**: Transfers control to a specified line number. Useful for testing looping behaviour and demonstrating stepping and breakpoint interactions.

These optional instructions are not required for initial debugger development but provide additional scenarios for testing more complex behaviours.

### 3.5 Execution Semantics

**step()** — Executes the instruction at the current program counter. Updates the accumulator and program counter as required. Returns a status indicating whether execution should continue or stop.

**executeUntilStop()** — Repeatedly invokes `step()` until one of the following occurs:

- A breakpoint is reached.
- A HALT instruction is executed.
- The program counter advances beyond the end of the program.

This method is used to implement the debugger's "continue" behaviour.

**halt conditions** — Execution stops when:

- The current instruction is HALT.
- The program counter is out of bounds.
- A breakpoint matches the current program counter.

### 3.6 Breakpoint Model

Breakpoints are expressed directly in terms of program line numbers. Since each program line corresponds to one instruction and the program counter indexes directly into the array of instructions, no mapping or translation is necessary. The Debug Adapter maintains a set of active breakpoints, and the TinyCPU checks the current program counter against this set during execution. When a match is detected, execution stops and the adapter reports a breakpoint event to VS Code.

### 3.7 How TinyCPU Enables Debugging Feature Testing

The TinyCPU provides a stable environment for verifying the debugger's core capabilities:

- **Stepping** is deterministic because each instruction performs exactly one update.
- **Breakpoints** behave predictably due to direct line-based mapping.
- **Variable inspection** is straightforward because only two state values are exposed.
- **Stack traces** can be simulated easily by mapping the program counter to a single-frame call stack.
- **Stopped events** and execution flow are simple to reason about, allowing the DAP message exchange to be tested thoroughly.

This controlled environment ensures that all debugger mechanics can be validated without interference from emulator complexity, enabling a smooth transition to the full Z80 engine once the DAP layer is complete.

---

## 4. Debug Adapter Responsibilities

### 4.1 What the Debug Adapter Must Do

The Debug Adapter serves as the intermediary between the VS Code debugging UI and the execution engine. Its responsibilities include handling all Debug Adapter Protocol (DAP) requests, maintaining session state, controlling program execution, managing breakpoints, and providing introspection data such as variables, scopes, and stack frames. The adapter translates debugger commands into execution-engine operations and reports state changes back to VS Code through DAP events. It does not execute instructions directly; execution is delegated entirely to the CPU runtime.

### 4.2 Lifecycle of a Debugging Session

A debugging session follows a defined sequence of DAP interactions:

1. **Initialization** — VS Code requests capabilities, and the adapter identifies which features it supports.

2. **Launch** — The adapter loads the program and instantiates the execution engine. It then signals readiness through the "initialized" event.

3. **Configuration** — VS Code configures breakpoints and sends the `configurationDone` request, after which execution may begin.

4. **Execution** — User actions such as continue, step, or pause are forwarded to the execution engine. The adapter emits events to reflect changes in execution state.

5. **Inspection** — VS Code queries for stack frames, scopes, and variables, which the adapter resolves from the execution engine's state.

6. **Termination** — Execution ends due to HALT, breakpoint, or user intervention. The adapter sends the relevant stop or termination events and closes the session.

This lifecycle remains consistent regardless of whether the underlying CPU is TinyCPU or the full Z80 emulator.

### 4.3 State the Adapter Must Track

**Breakpoints** — A mapping of source file lines to breakpoint descriptors. For the TinyCPU prototype, these are line numbers corresponding directly to program indices.

**Current Program** — The loaded instruction list or parsed representation of the program file. The adapter must retain this for source mapping and stack frame reporting.

**CPU Instance** — A reference to the active TinyCPU or Z80 runtime. The adapter invokes methods on this instance to step, continue, inspect registers, and reset state.

**variablesReference Handles** — Numerical identifiers used by the DAP to request hierarchical variable data. The adapter must track these to return consistent variable scopes such as registers and memory.

### 4.4 Required DAP Messages and Their Roles

**initialize** — Declares adapter capabilities and prepares for session configuration.

**launch** — Loads the program and creates the CPU instance. Sends the "initialized" event indicating readiness for breakpoint configuration.

**setBreakpoints** — Receives breakpoint positions from VS Code, stores them internally, and returns verified breakpoint descriptors.

**configurationDone** — Signals that all configuration steps are complete and execution may begin.

**continue** — Executes the program until the next breakpoint or halt condition. Emits a "stopped" event when execution pauses.

**next** — Executes exactly one instruction and reports a "stopped" event. Supports single-step debugging.

**pause** — Interrupts execution and forces a "stopped" event, even if the CPU is in a running state.

**stackTrace** — Returns the current call stack. For TinyCPU, this is a single-frame stack based on the program counter.

**scopes** — Returns the scopes visible at the current frame, typically including registers and memory.

**variables** — Expands the scopes returned by `scopes`, providing the actual values of registers, memory cells, or other variables.

### 4.5 Optional / Future DAP Messages

A more advanced implementation may later support additional DAP messages:

- **evaluate**: Evaluate expressions or symbolic register names.
- **disassemble**: Provide mixed disassembly output for Z80 instruction memory.
- **setFunctionBreakpoints**: Breakpoints by symbolic function or label name.
- **setInstructionBreakpoints**: Breakpoints on specific Z80 addresses.
- **reverseContinue / reverseStep**: Time-travel debugging if execution snapshots are implemented.
- **loadedSources**: Enumerate multi-file programs with source-level support.
- **threads**: Required only if multithreaded execution models are introduced.

These optional features allow the debugger to grow in sophistication once the foundational architecture is stable.

---

## 5. Extension File Structure

### 5.1 High-Level Project Layout

The project follows the standard directory layout for a Visual Studio Code debugging extension. At a minimum, the structure contains the extension manifest, TypeScript configuration, the Debug Adapter implementation, and the TinyCPU runtime. A representative layout is:

```
toy-debugger/
    package.json
    tsconfig.json
    extension/
        extension.ts
        adapter.ts
        tinycpu.ts
    out/
        ...compiled JavaScript...
```

The `extension/` directory contains all TypeScript source files, while the `out/` directory holds the compiled JavaScript produced by the build process.

### 5.2 package.json Configuration

The `package.json` file declares the extension's activation events, contributions, debugger type, entry points, and build dependencies. Key fields include:

- **activationEvents** specifying debugger activation triggers, such as `onDebug`.
- **contributes.debuggers**, where the custom debugger type is defined along with its required attributes: labels, languages, variables, and configuration schema for launch configurations.
- **main**, pointing to the compiled JavaScript entry file responsible for activating the extension.
- **scripts** for building the extension using the TypeScript compiler.

This file establishes the extension's identity within VS Code and determines how it integrates into the debugging framework.

### 5.3 Role of extension.ts

`extension.ts` serves as the primary activation script. Its responsibilities include:

- Registering the Debug Adapter through `vscode.debug.registerDebugAdapterDescriptorFactory`.
- Specifying how the Debug Adapter process is launched, either as an external Node.js process or an inline implementation.
- Managing extension activation and deactivation lifecycle events.

It does not contain any debugging logic; its purpose is to connect VS Code's activation system to the Debug Adapter implementation.

### 5.4 Role of adapter.ts

`adapter.ts` contains the Debug Adapter implementation that handles all Debug Adapter Protocol messages. It is responsible for:

- Parsing requests such as `initialize`, `launch`, and `setBreakpoints`.
- Maintaining the active debugging session state.
- Invoking TinyCPU or Z80 runtime operations.
- Constructing DAP-compliant responses and events.
- Managing variables, scopes, stack frames, and program state.

This file forms the core of the debugging experience and defines how VS Code communicates with the runtime.

### 5.5 Role of tinycpu.ts

`tinycpu.ts` implements the toy execution engine used for validating debugger mechanics. It defines:

- The program counter, accumulator, and instruction list.
- Methods for stepping, running until halt, and resetting.
- The minimal instruction set required for testing.

The TinyCPU acts as the adapter's execution backend. It allows all debugger interactions to be exercised before integrating the full Z80 emulator.

### 5.6 Build Process (tsc)

The project uses the TypeScript compiler (`tsc`) to convert TypeScript sources into JavaScript. The `tsconfig.json` file directs the compiler to place output files into the `out/` directory. The typical build invocation is:

```bash
npx tsc
```

The build process must complete successfully before the extension can be launched in the Extension Development Host environment.

### 5.7 Running via "Extension Development Host"

VS Code provides a built-in mechanism for testing extensions. Pressing **F5** launches a new VS Code instance known as the **Extension Development Host**, which loads the extension directly from the project directory. This environment allows the developer to:

- Test debugging configurations.
- Use the UI to step through TinyCPU or Z80 programs.
- Inspect variables, breakpoints, and stack frames.
- Set breakpoints in the adapter code itself for introspection.

Running in the Extension Development Host enables rapid iteration during extension development and ensures the debugger behaves correctly within its intended user interface.

---

## 6. Breakpoint Handling

### 6.1 Breakpoint Storage Model

The Debug Adapter maintains an internal representation of breakpoints received from VS Code. For the TinyCPU prototype, breakpoints are stored as a set or map of zero-based line numbers corresponding directly to indices in the program array. Each breakpoint entry contains:

- The program line number.
- A verified flag, returned to VS Code during configuration.
- An optional identifier for future expansion.

The storage model must allow efficient lookup during execution, as the runtime checks for breakpoint conditions on each instruction boundary.

### 6.2 Mapping VS Code Breakpoints to TinyCPU Lines

VS Code communicates breakpoints in terms of source file locations. Since TinyCPU programs are represented as a simple list of instruction lines, each source line maps directly to its instruction index. Line numbers received from VS Code (typically one-based) are normalized to zero-based indices. No further translation is necessary because the source code is the execution code. This direct correspondence simplifies breakpoint evaluation and eliminates the need for symbol or address resolution.

### 6.3 Breakpoint Verification

After receiving a `setBreakpoints` request, the Debug Adapter must return a list of verified breakpoints. For the TinyCPU model, verification consists of:

- Ensuring the specified line number is within the bounds of the program.
- Recording the breakpoint internally.
- Returning the breakpoint objects with their verified flag set to true.

The adapter reports these verified breakpoints back to VS Code, enabling the UI to display active breakpoints. Since TinyCPU has no compilation phase or instruction expansion, verification is straightforward.

### 6.4 Breakpoints During Execution

**continue** — When a continue request is received, the adapter invokes the execution engine's `executeUntilStop` method. Execution proceeds sequentially until:

- A breakpoint matches the current program counter.
- A HALT instruction is encountered.
- The program counter exceeds the program length.

Upon detecting a breakpoint, the adapter emits a DAP "stopped" event with the reason `"breakpoint"`.

**next** — Stepping executes a single instruction. If the step completes without crossing a breakpoint, the adapter returns a "stopped" event with the reason `"step"`. If the instruction being stepped completes on a line that is also a breakpoint, the breakpoint takes precedence, and the reason `"breakpoint"` is reported.

**hitting breakpoint** — Breakpoints are evaluated at instruction boundaries. Before executing each instruction during `continue`, the engine checks whether the current program counter is in the breakpoint set. If so, execution halts immediately and the adapter reports a breakpoint stop event.

**returning stopped events** — Stopped events carry information including:

- The reason for the stop (`"breakpoint"`, `"step"`, `"pause"`, `"halt"`).
- The thread or execution ID (single-threaded in TinyCPU).
- The current stack frame, derived from the program counter.

This allows the VS Code UI to update its state in response.

### 6.5 Differences Between TinyCPU Breakpoints and Z80 Breakpoints

In TinyCPU, each line of the source program corresponds directly to a single executable instruction. Breakpoints are therefore expressed purely as line numbers.

In the Z80 environment:

- Source lines may map to multiple machine instructions.
- Some instructions occupy multiple bytes.
- Certain lines (e.g., directives) may not correspond to executable code.
- Breakpoints must be expressed in terms of machine addresses rather than source lines.
- `.lst` files may be needed to connect addresses back to source.

Thus, the breakpoint mechanism must evolve to decouple source-level breakpoints from instruction-level execution addresses.

### 6.6 Line-Based vs Address-Based Breakpoint Models (Future)

The TinyCPU uses a line-based model because it is sufficient for validating DAP interactions. When transitioning to the Z80:

- **Address-based breakpoints** become the primary mechanism, stored as a set of instruction addresses.
- **Source breakpoints** set by the user must be translated to the corresponding addresses via a listing file or assembler metadata.
- **Multi-hit scenarios** may arise when several instructions originate from the same source line.
- **Conditional breakpoints** may be introduced, allowing breakpoints to depend on register values, memory state, or execution count.
- **Instruction boundaries** become significant due to multi-byte opcodes and variable instruction timing.

The adapter must preserve backward compatibility with source-level breakpoints while expanding internal support for address-level mapping and evaluation.

---

## 7. Step Operations

### 7.1 What "Step" Means for TinyCPU

In the TinyCPU model, a step operation executes exactly one instruction at the current program counter. After the instruction completes, the program counter reflects the next instruction to be executed. Since TinyCPU has no call stack, no subroutine linkage, and no nested execution contexts, each step operation is atomic and has no side effects beyond updates to the accumulator and the program counter. Stepping therefore serves as a deterministic means of advancing the program one instruction at a time.

### 7.2 Semantics of next/stepIn/stepOut (Minimal)

TinyCPU implements only the `next` stepping behaviour because its execution model does not include functions or subroutine calls.

- **next** — Executes one instruction and stops immediately afterward. This is equivalent to stepping over, into, or out of a function, since no call hierarchy exists.

- **stepIn** — Alias of `next` in TinyCPU. There is no concept of entering a callee or descending into nested execution contexts.

- **stepOut** — Also an alias of `next`, as there is no call depth from which to return.

These behaviours allow the DAP interface to remain compliant with the protocol while deferring meaningful distinctions between stepping modes until the Z80 engine is introduced.

### 7.3 Sending "Stopped" Events Consistently

After completing a single stepping action, the Debug Adapter must send a DAP "stopped" event to notify VS Code that control has returned to the debugger. The event includes:

- A reason field (`"step"` or `"breakpoint"`).
- A thread identifier (single-threaded execution uses a fixed value).
- Optional descriptive data, such as the source location derived from the program counter.

The adapter must send the stopped event even if the instruction produces no visible change in state. This ensures consistent UI updates and proper functionality of VS Code's debug controls.

### 7.4 Interaction with HALT

If the current instruction is a HALT instruction:

- A `continue` request results in immediate termination of execution, and a `"halt"` stopped event or a termination event is sent depending on the intended semantics.
- A `next` request executes the HALT instruction, causing the adapter to emit a stopped event with a reason appropriate for halted execution.
- Further step attempts after the program has halted may either:
  - return an immediate stopped event with no state change, or
  - transition the session into a terminated state.

The chosen behaviour must be documented and consistent, ensuring that the UI accurately reflects halted execution.

### 7.5 Future: Cycle-Level Stepping for Z80

When integrating the Z80 engine, stepping becomes more complex:

- A single Z80 instruction may take multiple execution cycles.
- Some debuggers provide "step instruction" and "step cycle" modes.
- Interrupts, refresh cycles, and prefix bytes influence instruction boundaries.
- Disassembly must be used to identify instruction lengths for instruction-level stepping.
- Cycle-level stepping may require exposing internal emulator timing to the Debug Adapter.

Although optional, cycle-accurate stepping enhances debugging precision for timing-sensitive code and may be added as a later extension once the basic instruction-level stepping model is complete.

---

## 8. Variables and Scopes

### 8.1 Variable Model for TinyCPU

The TinyCPU exposes a minimal state consisting of the program counter and a single accumulator register. Both values are integer quantities and are directly inspectable. These state elements form the complete set of variables available to the debugger. The model is intentionally flat, with no stack, memory cells, or auxiliary registers. This simplicity reduces the complexity of variable handling to essential DAP interactions and demonstrates how program state maps into the debugger's variable tree.

### 8.2 Register Scope

The Debug Adapter groups TinyCPU state into a single "Registers" scope. Within this scope, variables such as `pc` and `acc` are presented as key–value pairs. Each variable receives a `variablesReference` identifier of zero (indicating no further expansion) because TinyCPU registers do not contain nested structures. The scope is retrieved via the `scopes` request, and individual variables are retrieved through the `variables` request. This structure parallels the register model used in full CPU debuggers and forms the baseline for later Z80 register presentation.

### 8.3 Memory Scope (Optional for TinyCPU)

TinyCPU does not define or manipulate memory, so a memory scope is optional and omitted in the initial prototype. If introduced, it would represent a fixed-size array or an artificial memory region selected purely for demonstration. For future expansion, a memory scope would allow the debugger to display RAM contents in a structured form. TinyCPU's architecture avoids this complexity to keep the prototype focused on core debugger mechanics.

### 8.4 Mapping Program State to DAP Variable Structures

The Debug Adapter translates TinyCPU state into DAP-compliant variable structures. Each variable returned by the adapter contains:

- A name (`"pc"`, `"acc"`).
- A stringified value.
- A `variablesReference` indicating whether nested variables exist.
- An optional type field for UI presentation.

Scopes serve as containers for variables, each with its own `variablesReference` handle. The adapter ensures stability of these references for the duration of the debugging session, allowing VS Code to cache and refresh UI elements consistently. This mapping mirrors the variable access patterns required for full CPU debugging.

### 8.5 Expanding This for Z80: Full Register File and Memory Windows

The Z80 runtime exposes a complete register set including general-purpose registers, alternate register banks, index registers, the stack pointer, program counter, interrupt registers, and flag registers. These values must be presented hierarchically:

- A "Registers" scope containing all root registers.
- Nested variable structures for composite registers or flag bitfields.
- A "Memory" scope offering paged or windowed access to RAM segments.

A memory view may require dynamic pagination or offset requests to manage large address spaces. The Debug Adapter remains responsible for mapping CPU state into stable DAP variable identifiers and managing the relationship between memory addresses and variable expansions.

### 8.6 Future: Symbolic Variables from .lst or Symbol Table

When integrating assembler listing (`.lst`) files or symbol tables generated by an assembler, the debugger can expose symbolic variables. These may include:

- Global variables defined at specific addresses.
- Labels treated as named addresses within code or data segments.
- Constants associated with source lines.
- Mappings from source-level variables to registers or memory locations.

The adapter must resolve symbolic names into concrete addresses or register references and return them as first-class variables in the DAP hierarchy. This allows users to observe program state at a semantic level rather than interacting only with raw registers and memory cells.

---

## 9. Source File Mapping

### 9.1 How the TinyCPU Uses Literal Source Lines

TinyCPU treats each line of the source file as a single executable instruction. No parsing, preprocessing, or assembly occurs beyond reading the file and storing its lines in order. The program counter corresponds directly to an index in this line array. As a result, the debugger can map execution state to source lines without translation. This direct mapping ensures predictable stepping behaviour and simplifies breakpoint handling.

### 9.2 How "pc → Source Line" Mapping Works

The Debug Adapter maintains an association between the program counter and the source file's line numbers. Since TinyCPU program lines correspond one-to-one with instructions:

- The program counter acts as the source line index.
- A stack frame is created with the file path and the line derived from the program counter.
- Breakpoints use line numbers that refer to the same index.

This model requires no metadata, symbol resolution, or disassembly. The adapter simply reports the current program counter to VS Code, and the UI displays the corresponding line of the source file.

### 9.3 Future: Real Z80 Source-Level Debugging

In a true Z80 environment, source lines do not necessarily correspond to instruction boundaries. Multiple machine instructions may originate from one source line, and some lines (such as directives or label definitions) may not generate code at all. Source-level mapping therefore requires an additional data layer that relates:

- Source lines → instruction addresses.
- Instruction addresses → source locations.

The debugger must reconstruct this mapping to support breakpoints, stepping, and stack frame reporting at the source level. Because Z80 execution is address-based, all source interactions must translate through an address map derived from assembly output.

### 9.4 Use of .lst Files

Assembler listing (`.lst`) files provide a lightweight mechanism for constructing the necessary mapping. A typical listing file includes:

- Instruction addresses.
- Opcode bytes.
- Source line numbers.
- Original source text.

By parsing the listing file, the debugger can create a table mapping each instruction address to its corresponding source line. This supports:

- Source breakpoints resolved to addresses.
- Disassembly views synchronized with source code.
- Accurate stack frame reporting.
- Resolving symbols appearing in listing output.

The `.lst` file becomes the canonical source-to-machine mapping in the absence of a richer assembler debug format.

### 9.5 Handling Multiple Files

A Z80 program may span multiple assembly files pulled together through include directives or manual composition. Source-level debugging in such cases requires:

- Tracking file paths for each source line.
- Storing separate line tables for each file.
- Associating machine address ranges with file/line pairs.
- Supporting breakpoints across multiple files.

The Debug Adapter must maintain a mapping structure that allows queries by either address or file/line pair. DAP events must specify the correct file in stack frames and breakpoint notifications.

### 9.6 Handling Macros and Expanded Instructions

Macrolike constructs introduce additional mapping challenges. A single macro invocation may expand into multiple machine instructions, or may not correspond to a fixed number of instructions. For accurate debugging:

- The listing file must provide expanded instructions with correct source references.
- The debugger must treat macro expansions as normal machine instructions while preserving the user-facing source line.
- When stepping, the execution may remain on the same source line across multiple cycles, reflecting expanded macro instructions.

Macro expansion handling becomes a core part of maintaining a consistent source-level debugging experience, ensuring developers can trace execution at the semantic level rather than working directly with raw machine addresses.

---

## 10. Error Handling and State Management

### 10.1 Error Cases in the Adapter

The Debug Adapter must detect and handle errors arising from malformed requests, invalid state transitions, or inconsistencies between the user interface and the execution engine. Typical error cases include:

- Receiving a request before initialization or launch has completed.
- Stepping or continuing when no program is loaded.
- Requests referring to unknown variable references.
- Execution engine failures during stepping or running.
- Mismatched file paths or unsupported launch configurations.

The adapter must respond with clear DAP error responses without terminating the session. Errors affecting program execution should generate a stopped event with a descriptive reason, while configuration errors must be surfaced immediately.

### 10.2 What Happens if CPU Runs Out of Bounds

When the program counter exceeds the bounds of the loaded instruction array, the execution engine is considered to have reached an implicit halt state. The adapter must:

- Stop execution immediately.
- Emit a DAP "stopped" event with a reason that reflects out-of-bounds execution or halt.
- Prevent further stepping unless the CPU is reset or the program counter is restored to a valid value.

This behaviour ensures predictable results during user interaction and prevents the debugger from entering undefined states.

### 10.3 Resetting the System

The adapter must support resetting the execution state whenever a new launch request is received or when explicitly instructed. Resetting involves:

- Creating a new CPU instance.
- Clearing breakpoints or reapplying them based on VS Code's current configuration.
- Resetting all internal adapter state, including variable handles, cached scopes, and execution flags.

A reset operation guarantees that each debugging session starts from a clean, reproducible state, which is essential for consistent debugging and automated testing.

### 10.4 Handling Invalid Breakpoints

Invalid breakpoints include references to lines outside the valid program range or breakpoints set in non-executable areas. The adapter must:

- Identify invalid breakpoints when `setBreakpoints` is called.
- Mark invalid breakpoints as unverified in the response.
- Store only verified breakpoints in the internal set.

For the TinyCPU model, the only invalid cases are line numbers outside the source file. For Z80 debugging, additional invalid cases arise, such as breakpoints set on assembler directives or data segments. The adapter must handle these cases gracefully while ensuring consistent behaviour across different execution engines.

### 10.5 Keeping the Adapter Robust for Automated Testing

Because the debugger may be driven by automated scripts, AI agents, or continuous integration systems, the adapter must remain predictable and fault tolerant. Requirements include:

- Deterministic responses to all DAP requests.
- No hidden state between sessions or inconsistent variable handles.
- Consistent event ordering, especially around continue/stop transitions.
- Meaningful error messages for malformed requests.
- Complete resilience during step sequences and extended automatic execution.

Robustness also requires defensive handling of execution anomalies, such as illegal instruction formats, unexpected HALT behaviour, or abrupt termination of the execution engine. The adapter must fail safely without losing the ability to report state back to the driver or user.

---

## 11. Unit Testing Strategy

### 11.1 Why Test the Adapter Separately from the Runtime

The Debug Adapter is responsible for message routing, state management, breakpoint coordination, and DAP-compliant event generation. These behaviours must remain correct regardless of the underlying execution engine. Testing the adapter independently ensures:

- Correct DAP request handling.
- Reliable event sequencing.
- Stable variable and scope management.
- Isolation of UI-level logic from CPU-level concerns.

By separating adapter testing from runtime testing, defects in the emulator do not obscure issues in the adapter, and vice versa. This separation is essential for long-term maintainability as the emulator transitions from TinyCPU to a full Z80 implementation.

### 11.2 Mocking CPU Behaviour

A mock CPU allows the adapter to be tested under controlled conditions without relying on real instruction execution. The mock should simulate:

- Stepping behaviour.
- Continue-until-break behaviour.
- Interruptions and halt states.
- Register values and memory reads.
- Program counter changes.

Mocks enable deterministic tests such as "next must produce a stopped event" or "continue must halt at a breakpoint," even when the real CPU implementation is incomplete or evolving.

### 11.3 Testing DAP Request/Response Pairs

Unit tests must validate each DAP message the adapter supports. For each request:

- Construct the DAP payload.
- Invoke the adapter handler.
- Verify the resulting response packet.
- If applicable, assert the correct event emissions.

Typical request pairs include:

- `initialize` → response with declared capabilities.
- `launch` → CPU instantiation and "initialized" event.
- `setBreakpoints` → verified/unverified breakpoint reporting.
- `continue` → eventual "stopped" event.
- `next` → one-step execution and state reporting.
- `stackTrace`, `scopes`, `variables` → correct reflection of program state.

These tests confirm the adapter's behaviour conforms to the DAP specification.

### 11.4 Integration Tests Using the Real TinyCPU

Once the adapter behaves correctly with mocks, integration testing validates the full pipeline:

- Load a sample program.
- Step through instructions.
- Verify changes in accumulator and program counter.
- Set breakpoints and assert correct stop conditions.
- Confirm that stack frames and variables reflect TinyCPU state.

Because TinyCPU has predictable execution semantics, integration tests remain stable and reliable. This phase ensures that the adapter and runtime communicate correctly via the defined API.

### 11.5 Future: Z80 Tests with Expected Memory/Register States

When the Z80 engine is introduced, the test suite must expand to include:

- Instruction-level stepping behaviour.
- Correct updates to all registers, including alternate banks.
- Accurate flag setting for arithmetic and logical operations.
- Memory reads and writes.
- Behaviour across branching, stack operations, and interrupts.
- Breakpoint hits at specific instruction addresses.

These tests serve both as emulator validation and debugger validation, confirming that state exposed via the adapter matches expected hardware behaviour.

### 11.6 Continuous Testing with CLI/HTTP Backend

When a headless backend is added, continuous testing becomes essential. Automated test scripts must be able to:

- Upload binary programs.
- Set breakpoints via HTTP.
- Trigger single-step or continue operations.
- Read output buffers, register files, and memory regions.
- Assert expected program states.

This enables regression testing, AI-driven exploration, and automated debugging scenarios. The debugger stack becomes a reusable component in scripting environments, ensuring reliability across both interactive VS Code debugging and headless execution workflows.

---

## 12. Transition from TinyCPU to Full Z80

### 12.1 Swap-In Strategy for the Z80 Engine

The TinyCPU implementation is designed to be fully replaceable with a Z80 runtime without modifying the Debug Adapter. The adapter interacts with the CPU only through a small, well-defined interface supporting step, continue, state inspection, breakpoints, and halt detection. Introducing the Z80 engine therefore involves:

- Implementing the same execution interface used by TinyCPU.
- Replacing the TinyCPU instance with a Z80 instance at launch.
- Ensuring returned state conforms to the adapter's expected structure.

This approach isolates DAP logic from CPU logic and allows the debugger to mature independently of emulator development.

### 12.2 Preserving the DAP Layer Unchanged

The transition must leave the DAP layer intact. All incoming requests (`continue`, `next`, `stackTrace`, `variables`) and all outgoing events remain identical. Only the internal execution behaviour changes. This guarantees:

- Stable debugging behaviour from the user's perspective.
- A consistent development and testing model.
- Extension reliability regardless of emulator complexity.

Preserving the DAP layer avoids the need to rework protocol logic when adding advanced features to the Z80 runtime.

### 12.3 Expanding CPU Interface (Registers, Flags, Memory, Ports)

A complete Z80 emulator exposes significantly more state than TinyCPU. The CPU interface must grow to support:

- The full 8-bit and 16-bit register set, including alternate registers.
- Flag register contents, potentially represented as both a byte and individual flags.
- 64 KB memory with read and write operations.
- I/O port reads and writes.
- Optional internal timing counters.

The Debug Adapter maps this state into structured variable scopes, ensuring the debugger UI can present the complete processor state clearly.

### 12.4 Implementing Address-Based Breakpoints

Z80 breakpoints must operate on instruction addresses, not source lines. Because instructions may span one to four bytes and may not align with source lines, the adapter must manage:

- A set of instruction addresses as active breakpoints.
- A translation layer converting source breakpoints into one or more addresses.
- Hit detection based on the program counter matching a stored address.

This forms the foundation for accurate execution control and stepping behaviour in a real Z80 environment.

### 12.5 Multi-Instruction Disassembly

Source-level debugging requires the ability to present disassembled instructions. The Z80 engine or a companion disassembler must provide:

- Disassembly of a single instruction at a given address.
- Byte length of each instruction.
- Optional symbolic annotation (labels, constants).

The Debug Adapter uses this information to populate stack frames, present disassembly views, and improve clarity during stepping.

### 12.6 Handling HALT, Interrupts, and Timing

Z80 execution introduces additional considerations:

- The HALT instruction suspends execution until an interrupt occurs.
- Maskable and non-maskable interrupts modify program flow.
- Some programs rely on precise cycle timing.

The CPU interface must report halt conditions accurately, and the adapter must interpret them in a user-friendly way. If cycle timing is modelled, pause/continue semantics must respect instruction boundaries and timing constraints.

### 12.7 Supporting .lst Source Mapping

Listing files produced by Z80 assemblers become essential for source-level debugging. The debugger must:

- Parse the `.lst` file to extract address–line mappings.
- Map breakpoints set in source files to the correct instruction addresses.
- Display source locations when breakpoints are hit.
- Support stepping and variable inspection in a source-aware manner.

This allows debugging sessions to remain tightly coupled to the original assembly source, even though execution ultimately proceeds instruction-by-instruction.

### 12.8 Optional: Cycle-Accurate Debugging

A more advanced implementation may provide cycle-level debugging. This requires:

- Exposing the number of cycles consumed by each instruction.
- Supporting "step cycle" operations.
- Displaying internal timing registers.
- Allowing breakpoints on cycle counts or timing conditions.

Cycle-accurate debugging is valuable for hardware emulation, timing-critical code, and verification of legacy software. While not required for initial Z80 support, the architecture must leave room for this extension.

---

## 13. Future Integration: CLI, HTTP Server, and AI Automation

### 13.1 Purpose of a Server-Driven Emulator

A server-driven emulator enables debugging and program execution without reliance on an interactive UI. Instead of operating solely inside VS Code, the emulator runs as a persistent background service accessible through a command-line interface or automated tooling. This architecture supports batch testing, continuous integration, remote debugging, and machine-driven workflows. It also allows external systems—including AI agents—to orchestrate program execution, gather outputs, and validate behaviour without human interaction.

### 13.2 Running Z80 Debugger Sessions via HTTP Requests

An HTTP interface exposes the emulator's core operations as a structured API. Typical endpoints include:

- Loading a binary program into memory.
- Querying and modifying CPU state.
- Executing single-step or continue operations.
- Reading memory or register windows.
- Retrieving output buffers.
- Resetting the emulator or clearing state.

Because HTTP is stateless by design, the server maintains execution state internally, while each request acts as a discrete debugging command. HTTP responses carry serialized snapshots of CPU registers, memory extracts, or execution results. This makes it possible to reproduce the behaviour of the Debug Adapter without depending on VS Code.

### 13.3 Uploading Binaries, Setting Breakpoints Remotely

The server must support remote configuration of debugging sessions. Required capabilities include:

- Uploading binary or hex-encoded program images.
- Loading listing files for source mapping.
- Setting breakpoints at instruction addresses.
- Mapping source breakpoints to addresses if metadata is available.
- Clearing or modifying breakpoints.
- Issuing run, step, pause, or reset commands.

All breakpoint management occurs on the server, enabling automated workflows that operate identically regardless of whether a graphical debugger is attached.

### 13.4 Integrating with curl, Shell Scripts, and AI-Generated Tests

Commands exposed over HTTP can be accessed via simple shell utilities. For example:

- `curl` for manual testing and automation.
- Shell scripts for batch processing or CI pipelines.
- AI-generated command sequences for automated debugging, exploration, or program synthesis.

The combination of HTTP endpoints and simple tooling allows AI agents to run test programs, assert expected states, inspect output buffers, and generate corrective changes without requiring direct human debugging. This infrastructure enables fully automated Z80 software development workflows.

### 13.5 Multi-Client Debugging (Optional)

A server-based architecture naturally supports multiple clients attaching to the same emulator instance. This mode allows:

- A VS Code debugger to attach interactively.
- Automated scripts to observe or control the session concurrently.
- Remote systems to log or monitor execution.

Multi-client support introduces concurrency and synchronization concerns. The server must serialize state-mutating commands and ensure consistent snapshots of CPU and memory data. This feature is optional but provides a path toward collaborative or distributed debugging.

### 13.6 Separation Between VS Code Debugger and Headless Emulator

The Debug Adapter and headless server must remain independent components. The adapter communicates either with an in-process emulator instance or a remote server using a defined transport layer. This separation ensures:

- The VS Code debugger remains a thin DAP translation layer.
- The emulator becomes a standalone development tool.
- Headless execution mirrors in-editor execution exactly.
- Automated testing does not depend on the editor.
- AI workflows can operate on the same backend used by the graphical debugger.

This architectural division allows the debugger, emulator, and automation systems to evolve at different rates while maintaining consistent program semantics across all development environments.

---

## 14. Packaging and Deployment

### 14.1 Dev Workflow (Extension Host)

During development, the extension is executed using the VS Code **Extension Development Host**. Pressing **F5** launches a secondary instance of VS Code with the extension loaded directly from the project directory. This environment supports rapid iteration, including:

- Testing debugging sessions.
- Setting breakpoints in adapter code.
- Observing DAP logs.
- Validating UI behaviour.

No packaging is required at this stage, and changes take effect as soon as the extension is rebuilt.

### 14.2 Packaging with vsce

When the extension is ready for distribution, the `vsce` tool packages it into a `.vsix` archive. The process involves:

- Ensuring all source files are compiled.
- Running `vsce package` from the project root.
- Generating a versioned `.vsix` file containing the manifest, compiled JavaScript, and all extension assets.

The package is self-contained and suitable for installation on any compatible VS Code environment.

### 14.3 Installing .vsix Files

Users can install the packaged extension manually by:

- Using the command palette: **Extensions: Install from VSIX…**, or
- Dragging the `.vsix` file into the Extensions panel.

After installation, the extension appears alongside other installed extensions and is activated when a debugging session using the defined debugger type is started.

### 14.4 Versioning the Extension

Version numbers follow semantic versioning conventions. Each change to DAP behaviour, debugging features, or public-facing functionality requires an increment to:

- The patch version for bug fixes.
- The minor version for new features.
- The major version for breaking changes.

Versioning ensures users of the debugger receive predictable updates, and the `.vsix` packaging mechanism incorporates version numbers into the file name for distribution tracking.

### 14.5 Publishing (Optional)

If public distribution is desired, the extension may be published to the Visual Studio Marketplace using:

- A publisher account created through the Azure DevOps portal.
- The `vsce publish` command.

Publishing is optional. Private workflows can rely entirely on local `.vsix` installation or internal hosting mechanisms.

---

## 15. Conclusion & Next Steps

### 15.1 What the TinyCPU Prototype Demonstrates

The TinyCPU prototype validates the core Debug Adapter architecture by exercising:

- Breakpoint handling.
- Stepping and continue semantics.
- Stack frame reporting.
- Register inspection.
- State synchronization across DAP events.

It demonstrates that the DAP layer, extension file structure, and execution interface behave correctly before introducing the complexity of a real Z80 processor. The prototype also provides a stable platform for unit testing and integration testing.

### 15.2 What the Z80 Debugger Will Add

Transitioning to the Z80 engine adds full processor semantics and requires:

- A complete register file and flag model.
- Memory read/write inspection.
- Instruction decoding and disassembly.
- Address-based breakpoints.
- Listing-file driven source mapping.
- Accurate modelling of HALT, interrupts, stack operations, and branching.
- Optional cycle-level stepping.

These enhancements elevate the debugger from a prototype into a functional environment capable of supporting real Z80 development.

### 15.3 Roadmap to a Fully Automated AI-Driven Z80 Development Environment

The long-term direction involves expanding the debugger into a programmable execution environment accessible through both VS Code and headless interfaces. Key steps include:

- Adding an HTTP-based execution layer for remote or automated debugging.
- Supporting binary uploads, breakpoint configuration, and program execution via scriptable tools.
- Integrating AI workflows capable of generating assembly code, running tests, reading outputs, and iterating automatically.
- Developing a library of reproducible test cases and validation tools for Z80 programs.
- Ensuring the VS Code debugger and headless server share identical execution semantics.

This roadmap culminates in an environment where Z80 development, debugging, testing, and exploration can be performed interactively or fully automated, enabling workflows that go beyond traditional retrocomputing tools.
