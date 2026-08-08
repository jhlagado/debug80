import {
  canonicalImplementationMnemonic,
  Service,
  ServiceError,
  Trap,
  VM_ARGUMENT_COUNT,
  VM_SLOT_COUNT,
} from "./vm-definition.js";
import {
  SERVICE_SIGNATURES,
  validateImage,
  type DecodedInstruction,
  type ValidatedImage,
} from "./vm-image.js";

export interface ServiceSuccess {
  readonly ok: true;
  readonly value?: number;
}
export interface ServiceFailure {
  readonly ok: false;
  readonly code: number;
}
export type ServiceOutcome = ServiceSuccess | ServiceFailure;
export interface SystemServices {
  invoke(service: number, arguments_: readonly number[]): ServiceOutcome;
}

export interface TrapRecord {
  readonly trap: number;
  readonly routine: number;
  readonly offset: number;
  readonly errorCode?: number;
}

export type ExecutionResult =
  | {
      readonly kind: "success";
      readonly steps: number;
      readonly data: Uint8Array;
    }
  | {
      readonly kind: "trap";
      readonly steps: number;
      readonly data: Uint8Array;
      readonly record: TrapRecord;
    }
  | {
      readonly kind: "step-limit";
      readonly steps: number;
      readonly data: Uint8Array;
    };

type Completion =
  | { readonly kind: "none" }
  | { readonly kind: "success" }
  | { readonly kind: "result"; readonly value: number }
  | { readonly kind: "failure"; readonly code: number };

interface ActivationRecord {
  readonly returnOffset: number;
  readonly callerRoutine: number;
  readonly saved: Uint16Array;
  readonly bytes: number;
}

class VmTrap extends Error {
  constructor(readonly record: TrapRecord) {
    super(`VM trap ${record.trap}`);
  }
}

export class ReferenceVm {
  readonly image: ValidatedImage;
  readonly data: Uint8Array;
  readonly services: SystemServices;
  readonly maximumActivationBytes: number;
  readonly maximumActivationDepth: number;
  readonly slots = new Uint16Array(VM_SLOT_COUNT);

  private readonly arguments_ = new Uint16Array(VM_ARGUMENT_COUNT);
  private argumentMask = 0;
  private activationBytes = 0;
  private readonly activations: ActivationRecord[] = [];
  private completion: Completion = { kind: "none" };
  private currentRoutine: number;
  private pc: number;
  private currentInstruction?: DecodedInstruction;

  constructor(
    image: Uint8Array | ValidatedImage,
    options: {
      readonly services?: SystemServices;
      readonly maximumActivationBytes?: number;
      readonly maximumActivationDepth?: number;
    } = {},
  ) {
    this.image = image instanceof Uint8Array ? validateImage(image) : image;
    this.data = Uint8Array.from(this.image.initialData);
    this.services = options.services ?? new BufferSystemServices();
    this.maximumActivationBytes =
      options.maximumActivationBytes ??
      Math.max(4096, this.image.requiredActivationBytes);
    this.maximumActivationDepth =
      options.maximumActivationDepth ??
      Math.max(64, this.image.requiredActivationDepth);
    if (this.maximumActivationBytes < this.image.requiredActivationBytes)
      throw new Error(
        "host activation-byte capacity is below the image minimum",
      );
    if (this.maximumActivationDepth < this.image.requiredActivationDepth)
      throw new Error(
        "host activation-depth capacity is below the image minimum",
      );
    this.currentRoutine = this.image.entryRoutine;
    this.pc = this.image.routines[this.currentRoutine].entry;
  }

  run(maximumSteps = 1_000_000): ExecutionResult {
    let steps = 0;
    try {
      while (steps < maximumSteps) {
        const outcome = this.step();
        steps += 1;
        if (outcome === "success")
          return { kind: "success", steps, data: Uint8Array.from(this.data) };
      }
      return { kind: "step-limit", steps, data: Uint8Array.from(this.data) };
    } catch (error) {
      if (!(error instanceof VmTrap)) throw error;
      return {
        kind: "trap",
        steps: steps + 1,
        data: Uint8Array.from(this.data),
        record: error.record,
      };
    }
  }

  step(): "continue" | "success" {
    const routine = this.image.routines[this.currentRoutine];
    const instruction = this.image.instructionAt.get(this.pc);
    if (!instruction || !routine.instructionOffsets.has(this.pc))
      throw new Error(`invalid execution at ${this.pc}`);
    this.currentInstruction = instruction;
    this.pc += instruction.width;
    return this.execute(instruction);
  }

  private execute(instruction: DecodedInstruction): "continue" | "success" {
    const o = instruction.operands;
    switch (instruction.opcode.mnemonic) {
      case "nop":
        break;
      case "ldi8":
        this.slots[o[1]] = o[0];
        break;
      case "ldi16":
        this.slots[o[1]] = o[0];
        break;
      case "mov":
        this.slots[o[1]] = this.slots[o[0]];
        break;
      case "arg":
        this.requireNoCompletion("arg");
        this.arguments_[o[1]] = this.slots[o[0]];
        this.argumentMask |= 1 << o[1];
        break;
      case "getr":
        if (this.completion.kind !== "result")
          throw new Error("getr without result completion");
        this.slots[o[0]] = this.completion.value;
        this.completion = { kind: "none" };
        break;
      case "gete":
        if (this.completion.kind !== "failure")
          throw new Error("gete without failure completion");
        this.slots[o[0]] = this.completion.code;
        this.completion = { kind: "none" };
        break;
      case "jmp":
        this.pc = o[0];
        break;
      case "jz":
        this.requireBoolean(this.slots[o[0]]);
        if (this.slots[o[0]] === 0) this.pc = o[1];
        break;
      case "jnz":
        this.requireBoolean(this.slots[o[0]]);
        if (this.slots[o[0]] === 1) this.pc = o[1];
        break;
      case "jfail":
        if (this.completion.kind === "failure") this.pc = o[0];
        else if (this.completion.kind === "success")
          this.completion = { kind: "none" };
        else if (this.completion.kind !== "result")
          throw new Error("jfail without failable completion");
        break;
      case "trap":
        this.raise(o[0]);
        break;
      case "neg8":
        this.requireByte(this.slots[o[0]]);
        this.slots[o[1]] = -this.slots[o[0]] & 0xff;
        break;
      case "neg16":
        this.slots[o[1]] = -this.slots[o[0]] & 0xffff;
        break;
      case "not8":
        this.requireByte(this.slots[o[0]]);
        this.slots[o[1]] = ~this.slots[o[0]] & 0xff;
        break;
      case "not16":
        this.slots[o[1]] = ~this.slots[o[0]] & 0xffff;
        break;
      case "lnot":
        this.requireBoolean(this.slots[o[0]]);
        this.slots[o[1]] = 1 - this.slots[o[0]];
        break;
      case "narrow8":
        if (this.slots[o[0]] > 0xff) this.raise(Trap.narrowing);
        this.slots[o[1]] = this.slots[o[0]];
        break;
      case "addri":
        this.slots[o[1]] = o[0];
        break;
      case "addo": {
        const address = this.slots[o[0]] + o[1];
        this.checkRegion(address, o[2]);
        this.slots[o[3]] = address;
        break;
      }
      case "index": {
        const index = this.slots[o[1]];
        if (index >= o[2]) this.raise(Trap.bounds);
        const address = this.slots[o[0]] + index * o[3];
        this.checkRegion(address, o[3]);
        this.slots[o[4]] = address;
        break;
      }
      case "strlen": {
        const base = this.slots[o[0]];
        this.checkRegion(base, o[1] + 1);
        const length = this.data[base];
        if (length > o[1]) this.raise(Trap.bounds);
        this.slots[o[2]] = length;
        break;
      }
      case "stridx": {
        const base = this.slots[o[0]];
        const index = this.slots[o[1]];
        this.checkRegion(base, o[2] + 1);
        const length = this.data[base];
        if (length > o[2] || index >= length) this.raise(Trap.bounds);
        this.slots[o[3]] = base + 1 + index;
        break;
      }
      case "load8":
        this.checkRegion(this.slots[o[0]], 1);
        this.slots[o[1]] = this.data[this.slots[o[0]]];
        break;
      case "load16": {
        const address = this.slots[o[0]];
        this.checkRegion(address, 2);
        this.slots[o[1]] = this.data[address] | (this.data[address + 1] << 8);
        break;
      }
      case "store8":
        this.requireByte(this.slots[o[0]]);
        this.checkRegion(this.slots[o[1]], 1);
        this.data[this.slots[o[1]]] = this.slots[o[0]];
        break;
      case "store16": {
        const address = this.slots[o[1]];
        this.checkRegion(address, 2);
        this.data[address] = this.slots[o[0]] & 0xff;
        this.data[address + 1] = this.slots[o[0]] >>> 8;
        break;
      }
      case "call":
        this.call(o[0]);
        break;
      case "svc":
        this.callService(o[0]);
        break;
      case "ret":
        return this.returnSuccess(undefined);
      case "retv":
        return this.returnSuccess(this.slots[o[0]]);
      case "fail":
        this.requireByte(this.slots[o[0]]);
        return this.returnFailure(this.slots[o[0]]);
      default:
        if (this.executeBinary(instruction)) break;
        if (this.executeComparison(instruction)) break;
        throw new Error(`reference VM lacks ${instruction.opcode.mnemonic}`);
    }
    return "continue";
  }

  private executeBinary(instruction: DecodedInstruction): boolean {
    const sourceMnemonic = instruction.opcode.mnemonic;
    const match = /^(add|sub|mul|div|and|or)(8|16)$/.exec(
      canonicalImplementationMnemonic(sourceMnemonic),
    );
    if (!match) return false;
    const byteSource = sourceMnemonic.endsWith("8");
    const mask = match[2] === "8" ? 0xff : 0xffff;
    let left = this.slots[instruction.operands[0]];
    let right = this.slots[instruction.operands[1]];
    if (byteSource) {
      this.requireByte(left);
      this.requireByte(right);
    }
    left &= mask;
    right &= mask;
    let value: number;
    switch (match[1]) {
      case "add":
        value = left + right;
        break;
      case "sub":
        value = left - right;
        break;
      case "mul":
        value = left * right;
        break;
      case "div":
        if (right === 0) this.raise(Trap.divisionByZero);
        value = Math.floor(left / right);
        break;
      case "and":
        value = left & right;
        break;
      case "or":
        value = left | right;
        break;
      default:
        return false;
    }
    this.slots[instruction.operands[2]] = value & mask;
    return true;
  }

  private executeComparison(instruction: DecodedInstruction): boolean {
    const sourceMnemonic = instruction.opcode.mnemonic;
    const match = /^(eq|ne|lt|le|gt|ge)(8|16)$/.exec(
      canonicalImplementationMnemonic(sourceMnemonic),
    );
    if (!match) return false;
    const byteSource = sourceMnemonic.endsWith("8");
    let left = this.slots[instruction.operands[0]];
    let right = this.slots[instruction.operands[1]];
    if (byteSource) {
      this.requireByte(left);
      this.requireByte(right);
      left &= 0xff;
      right &= 0xff;
    }
    let value: boolean;
    switch (match[1]) {
      case "eq":
        value = left === right;
        break;
      case "ne":
        value = left !== right;
        break;
      case "lt":
        value = left < right;
        break;
      case "le":
        value = left <= right;
        break;
      case "gt":
        value = left > right;
        break;
      case "ge":
        value = left >= right;
        break;
      default:
        return false;
    }
    this.slots[instruction.operands[2]] = value ? 1 : 0;
    return true;
  }

  private call(calleeId: number): void {
    this.requireNoCompletion("call");
    const caller = this.image.routines[this.currentRoutine];
    const callee = this.image.routines[calleeId];
    this.requireArgumentMask(callee.parameterCount);
    const saveCount = Math.min(caller.clobberCount, callee.clobberCount);
    const bytes = 4 + 2 * saveCount;
    if (
      this.activations.length + 1 > this.maximumActivationDepth ||
      this.activationBytes + bytes > this.maximumActivationBytes
    ) {
      this.raise(Trap.activationCapacity);
    }
    const staged = this.arguments_.slice(0, callee.parameterCount);
    const record: ActivationRecord = {
      returnOffset: this.pc,
      callerRoutine: this.currentRoutine,
      saved: this.slots.slice(0, saveCount),
      bytes,
    };
    this.activations.push(record);
    this.activationBytes += bytes;
    this.slots.fill(0, 0, callee.clobberCount);
    this.slots.set(staged, 0);
    this.argumentMask = 0;
    this.currentRoutine = calleeId;
    this.pc = callee.entry;
  }

  private callService(service: number): void {
    this.requireNoCompletion("svc");
    const signature = SERVICE_SIGNATURES[service];
    this.requireArgumentMask(signature.parameters);
    const args = Array.from(this.arguments_.slice(0, signature.parameters));
    if (
      service === Service.writeOutputByte ||
      service === Service.writeStorageByte
    ) {
      this.requireByte(args[0]);
    }
    const outcome = this.services.invoke(service, args);
    this.argumentMask = 0;
    if (outcome.ok) {
      if (signature.result) this.requireByte(outcome.value ?? 0);
      this.completion = signature.result
        ? { kind: "result", value: outcome.value ?? 0 }
        : { kind: "success" };
    } else {
      this.requireByte(outcome.code);
      this.completion = { kind: "failure", code: outcome.code };
    }
  }

  private returnSuccess(value: number | undefined): "continue" | "success" {
    const callee = this.image.routines[this.currentRoutine];
    if (this.activations.length === 0) return "success";
    const record = this.activations.pop()!;
    this.activationBytes -= record.bytes;
    this.slots.set(record.saved, 0);
    this.currentRoutine = record.callerRoutine;
    this.pc = record.returnOffset;
    if (value !== undefined) this.completion = { kind: "result", value };
    else if (callee.failable) this.completion = { kind: "success" };
    else this.completion = { kind: "none" };
    return "continue";
  }

  private returnFailure(code: number): "continue" {
    if (this.activations.length === 0) this.raise(Trap.unhandledError, code);
    const record = this.activations.pop()!;
    this.activationBytes -= record.bytes;
    this.slots.set(record.saved, 0);
    this.currentRoutine = record.callerRoutine;
    this.pc = record.returnOffset;
    this.completion = { kind: "failure", code };
    return "continue";
  }

  private requireArgumentMask(parameters: number): void {
    const expected = parameters === 16 ? 0xffff : (1 << parameters) - 1;
    if (this.argumentMask !== expected)
      throw new Error("invalid runtime argument mask");
  }

  private requireNoCompletion(operation: string): void {
    if (this.completion.kind !== "none")
      throw new Error(`${operation} with unconsumed completion`);
  }

  private requireByte(value: number): void {
    if (value > 0xff) throw new Error("noncanonical byte carrier");
  }

  private requireBoolean(value: number): void {
    if (value !== 0 && value !== 1)
      throw new Error("noncanonical Boolean carrier");
  }

  private checkRegion(address: number, extent: number): void {
    if (
      !Number.isInteger(address) ||
      address < 0 ||
      extent < 1 ||
      address + extent > this.data.length
    ) {
      this.raise(Trap.bounds);
    }
  }

  private raise(trap: number, errorCode?: number): never {
    throw new VmTrap({
      trap,
      routine: this.currentRoutine,
      offset: this.currentInstruction?.offset ?? this.pc,
      ...(errorCode === undefined ? {} : { errorCode }),
    });
  }
}

export class BufferSystemServices implements SystemServices {
  readonly standardOutput: number[] = [];
  readonly storageOutput: number[];
  private inputCursor = 0;
  private storageInputCursor = 0;
  private storageOutputCursor: number;

  constructor(
    readonly standardInput: readonly number[] = [],
    readonly storageInput: readonly number[] = [],
    initialStorageOutput: readonly number[] = [],
  ) {
    this.storageOutput = Array.from(initialStorageOutput, low8);
    this.storageOutputCursor = this.storageOutput.length;
  }

  invoke(service: number, arguments_: readonly number[]): ServiceOutcome {
    switch (service) {
      case Service.readInputByte:
        if (this.inputCursor >= this.standardInput.length)
          return failure(ServiceError.endOfInput);
        return success(low8(this.standardInput[this.inputCursor++]));
      case Service.writeOutputByte:
        this.standardOutput.push(low8(arguments_[0]));
        return success();
      case Service.readStorageByte:
        if (this.storageInputCursor >= this.storageInput.length)
          return failure(ServiceError.endOfInput);
        return success(low8(this.storageInput[this.storageInputCursor++]));
      case Service.rewindStorageInput:
        this.storageInputCursor = 0;
        return success();
      case Service.writeStorageByte: {
        const value = low8(arguments_[0]);
        if (this.storageOutputCursor === this.storageOutput.length)
          this.storageOutput.push(value);
        else this.storageOutput[this.storageOutputCursor] = value;
        this.storageOutputCursor += 1;
        return success();
      }
      case Service.seekStorageOutput:
        if (arguments_[0] > this.storageOutput.length)
          return failure(ServiceError.storageFailure);
        this.storageOutputCursor = arguments_[0];
        return success();
      default:
        return failure(ServiceError.storageFailure);
    }
  }
}

function low8(value: number): number {
  return value & 0xff;
}
function success(value?: number): ServiceSuccess {
  return value === undefined ? { ok: true } : { ok: true, value };
}
function failure(code: number): ServiceFailure {
  return { ok: false, code };
}
