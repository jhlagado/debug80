import { describe, expect, it } from "vitest";

import {
  assertCanonicalDefinition,
  canonicalImplementationMnemonic,
  CANONICAL_WIDTH_EQUIVALENTS,
  OPCODES,
  Service,
  ServiceError,
  Trap,
} from "../src/vm-definition.js";
import {
  buildImage,
  encodeInstruction as op,
  InvalidImageError,
  validateImage,
} from "../src/vm-image.js";
import { BufferSystemServices, ReferenceVm } from "../src/vm-reference.js";

const flatten = (...parts: readonly (readonly number[])[]): number[] =>
  parts.flat();

describe("NVM 0.1 definition and image", () => {
  it("has unique one-byte opcodes in the dispatch-page range", () => {
    expect(() => assertCanonicalDefinition()).not.toThrow();
    expect(OPCODES.length).toBe(56);
    expect(Math.max(...OPCODES.map((opcode) => opcode.code))).toBeLessThan(
      0x80,
    );
  });

  it("emits the normative 43-byte minimal image", () => {
    const bytes = buildImage({
      routines: [{ code: op("ret"), clobberCount: 0 }],
    });
    expect(Array.from(bytes)).toEqual([
      0x4e, 0x56, 0x4d, 0x31, 0x00, 0x01, 0x00, 0x01, 0x20, 0x00, 0x2b, 0x00,
      0x01, 0x00, 0x10, 0x80, 0x20, 0x00, 0x28, 0x00, 0x02, 0x00, 0x2a, 0x00,
      0x01, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x52,
    ]);
    expect(new ReferenceVm(bytes).run().kind).toBe("success");
  });

  it("applies sparse initializer records to zeroed data", () => {
    const image = validateImage(
      buildImage({
        routines: [{ code: op("ret"), clobberCount: 0 }],
        dataSize: 8,
        initializers: [
          { address: 1, bytes: [2, 3] },
          { address: 6, bytes: [9] },
        ],
      }),
    );
    expect(Array.from(image.initialData)).toEqual([0, 2, 3, 0, 0, 0, 9, 0]);
  });

  it("rejects an unknown opcode before execution", () => {
    const bytes = buildImage({ routines: [{ code: [0x7f], clobberCount: 0 }] });
    expect(() => validateImage(bytes)).toThrow(InvalidImageError);
  });

  it("rejects a routine that can fall through its exclusive end", () => {
    const bytes = buildImage({
      routines: [{ code: op("nop"), clobberCount: 0 }],
    });
    expect(() => validateImage(bytes)).toThrow(/fall through/);
  });
});

describe("scalar, layout, and trap execution", () => {
  it("shares only width-independent canonical byte operations", () => {
    expect(CANONICAL_WIDTH_EQUIVALENTS).toEqual({
      div8: "div16",
      and8: "and16",
      or8: "or16",
      eq8: "eq16",
      ne8: "ne16",
      lt8: "lt16",
      le8: "le16",
      gt8: "gt16",
      ge8: "ge16",
    });
    for (const mnemonic of ["add8", "sub8", "mul8", "neg8", "not8"]) {
      expect(canonicalImplementationMnemonic(mnemonic)).toBe(mnemonic);
    }
  });

  it("retains the byte carrier check before entering a shared word core", () => {
    const code = flatten(
      op("ldi16", 256, 0),
      op("ldi16", 1, 1),
      op("div8", 0, 1, 2),
      op("ret"),
    );
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 3 }] }),
    );
    expect(() => vm.run()).toThrow(/noncanonical byte carrier/);
  });

  it.each([
    ["add8", 9, 4, 13],
    ["sub8", 9, 4, 5],
    ["mul8", 9, 4, 36],
    ["div8", 9, 4, 2],
    ["and8", 9, 4, 0],
    ["or8", 9, 4, 13],
    ["add16", 0x1234, 0x0103, 0x1337],
    ["sub16", 0x1234, 0x0103, 0x1131],
    ["mul16", 0x1234, 0x0103, 0x6a9c],
    ["div16", 0x1234, 0x0103, 17],
    ["and16", 0x1234, 0x0103, 0x0000],
    ["or16", 0x1234, 0x0103, 0x1337],
  ])("executes %s", (mnemonic, left, right, expected) => {
    const code = flatten(
      op("ldi16", left, 0),
      op("ldi16", right, 1),
      op(mnemonic, 0, 1, 2),
      op("ret"),
    );
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 3 }] }),
    );
    expect(vm.run().kind).toBe("success");
    expect(vm.slots[2]).toBe(expected);
  });

  it.each([
    ["neg8", 9, 247],
    ["neg16", 0x1234, 0xedcc],
    ["not8", 0x0f, 0xf0],
    ["not16", 0x0f0f, 0xf0f0],
    ["lnot", 1, 0],
    ["narrow8", 255, 255],
  ])("executes %s", (mnemonic, source, expected) => {
    const code = flatten(op("ldi16", source, 0), op(mnemonic, 0, 1), op("ret"));
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 2 }] }),
    );
    expect(vm.run().kind).toBe("success");
    expect(vm.slots[1]).toBe(expected);
  });

  it.each([
    ["eq8", 4, 9, 0],
    ["ne8", 4, 9, 1],
    ["lt8", 4, 9, 1],
    ["le8", 4, 9, 1],
    ["gt8", 4, 9, 0],
    ["ge8", 4, 9, 0],
    ["eq16", 9, 9, 1],
    ["ne16", 9, 9, 0],
    ["lt16", 4, 9, 1],
    ["le16", 9, 9, 1],
    ["gt16", 9, 4, 1],
    ["ge16", 9, 9, 1],
  ])("executes %s", (mnemonic, left, right, expected) => {
    const code = flatten(
      op("ldi16", left, 0),
      op("ldi16", right, 1),
      op(mnemonic, 0, 1, 2),
      op("ret"),
    );
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 3 }] }),
    );
    expect(vm.run().kind).toBe("success");
    expect(vm.slots[2]).toBe(expected);
  });

  it("executes primitive movement and branch instructions", () => {
    const code = flatten(
      op("ldi8", 1, 0),
      op("jz", 0, 13),
      op("jnz", 0, 13),
      op("trap", Trap.loopRange),
      op("nop"),
      op("mov", 0, 1),
      op("jmp", 20),
      op("ret"),
    );
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 2 }] }),
    );
    expect(vm.run().kind).toBe("success");
    expect(vm.slots[1]).toBe(1);
  });

  it("executes word arithmetic and a little-endian store", () => {
    const code = flatten(
      op("ldi16", 0x1234, 0),
      op("ldi16", 0x0102, 1),
      op("add16", 0, 1, 2),
      op("addri", 0, 3),
      op("store16", 2, 3),
      op("ret"),
    );
    const result = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 4 }], dataSize: 2 }),
    ).run();
    expect(result.kind).toBe("success");
    expect(Array.from(result.data)).toEqual([0x36, 0x13]);
  });

  it("uses counted strings and permits embedded zero payload bytes", () => {
    const code = flatten(
      op("addri", 0, 0),
      op("strlen", 0, 4, 1),
      op("ldi8", 1, 2),
      op("stridx", 0, 2, 4, 3),
      op("load8", 3, 4),
      op("addri", 5, 5),
      op("store8", 4, 5),
      op("ret"),
    );
    const result = new ReferenceVm(
      buildImage({
        routines: [{ code, clobberCount: 6 }],
        dataSize: 6,
        initializers: [{ address: 0, bytes: [3, 0x41, 0x00, 0x43] }],
      }),
    ).run();
    expect(result.kind).toBe("success");
    expect(result.data[5]).toBe(0);
  });

  it("forms checked subobject and array addresses", () => {
    const code = flatten(
      op("addri", 0, 0),
      op("addo", 0, 2, 2, 1),
      op("ldi16", 0x1234, 2),
      op("store16", 2, 1),
      op("ldi8", 1, 3),
      op("index", 0, 3, 2, 2, 4),
      op("load16", 4, 5),
      op("ret"),
    );
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 6 }], dataSize: 4 }),
    );
    expect(vm.run().kind).toBe("success");
    expect(vm.slots[4]).toBe(2);
    expect(vm.slots[5]).toBe(0x1234);
  });

  it("traps before writing a checked narrowing destination", () => {
    const code = flatten(
      op("ldi16", 256, 0),
      op("ldi8", 7, 1),
      op("narrow8", 0, 1),
      op("ret"),
    );
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code, clobberCount: 2 }] }),
    );
    const result = vm.run();
    expect(result.kind).toBe("trap");
    if (result.kind === "trap") expect(result.record.trap).toBe(Trap.narrowing);
    expect(vm.slots[1]).toBe(7);
  });

  it("executes an explicit source trap", () => {
    const result = new ReferenceVm(
      buildImage({
        routines: [{ code: op("trap", Trap.loopRange), clobberCount: 0 }],
      }),
    ).run();
    expect(result.kind).toBe("trap");
    if (result.kind === "trap") {
      expect(result.record.trap).toBe(Trap.loopRange);
      expect(result.record.offset).toBe(0);
    }
  });
});

describe("caller-save calls and recoverable failure", () => {
  it("stages arguments, restores the caller prefix, and returns a result", () => {
    const main = flatten(
      op("ldi16", 20, 0),
      op("ldi16", 22, 1),
      op("arg", 0, 0),
      op("arg", 1, 1),
      op("call", 1),
      op("getr", 2),
      op("add16", 0, 1, 3),
      op("addri", 0, 4),
      op("store16", 2, 4),
      op("addri", 2, 4),
      op("store16", 3, 4),
      op("ret"),
    );
    const add = flatten(op("add16", 0, 1, 2), op("retv", 2));
    const result = new ReferenceVm(
      buildImage({
        routines: [
          { code: main, clobberCount: 5 },
          { code: add, clobberCount: 3, parameterCount: 2, hasResult: true },
        ],
        dataSize: 4,
      }),
    ).run();
    expect(result.kind).toBe("success");
    expect(Array.from(result.data)).toEqual([42, 0, 42, 0]);
  });

  it("lets one slot receive either the success result or error code", () => {
    // Handler begins at offset 20; the common RET begins at 29.
    const main = flatten(
      op("ldi8", 99, 0),
      op("call", 1),
      op("jfail", 20),
      op("getr", 0),
      op("addri", 0, 1),
      op("store8", 0, 1),
      op("jmp", 29),
      op("gete", 0),
      op("addri", 0, 1),
      op("store8", 0, 1),
      op("ret"),
    );
    const failing = flatten(op("ldi8", 4, 0), op("fail", 0));
    const result = new ReferenceVm(
      buildImage({
        routines: [
          { code: main, clobberCount: 2 },
          { code: failing, clobberCount: 1, hasResult: true, failable: true },
        ],
        dataSize: 1,
      }),
    ).run();
    expect(result.kind).toBe("success");
    expect(result.data[0]).toBe(4);
  });

  it("traps at the call before changing caller state when activation depth is exhausted", () => {
    const recurse = flatten(op("call", 0), op("ret"));
    const vm = new ReferenceVm(
      buildImage({ routines: [{ code: recurse, clobberCount: 0 }] }),
      {
        maximumActivationDepth: 2,
        maximumActivationBytes: 8,
      },
    );
    const result = vm.run();
    expect(result.kind).toBe("trap");
    if (result.kind === "trap") {
      expect(result.record.trap).toBe(Trap.activationCapacity);
      expect(result.record.offset).toBe(0);
    }
  });

  it("turns entry failure into unhandled-error with its code", () => {
    const main = flatten(op("ldi8", 7, 0), op("fail", 0));
    const result = new ReferenceVm(
      buildImage({
        routines: [{ code: main, clobberCount: 1, failable: true }],
      }),
    ).run();
    expect(result.kind).toBe("trap");
    if (result.kind === "trap") {
      expect(result.record.trap).toBe(Trap.unhandledError);
      expect(result.record.errorCode).toBe(7);
    }
  });
});

describe("Nucleus System Services 0.1", () => {
  it("moves a standard-input byte to standard output", () => {
    // The two unique error consumers begin at offsets 16 and 19.
    const main = flatten(
      op("svc", Service.readInputByte),
      op("jfail", 16),
      op("getr", 0),
      op("arg", 0, 0),
      op("svc", Service.writeOutputByte),
      op("jfail", 19),
      op("ret"),
      op("gete", 1),
      op("ret"),
      op("gete", 1),
      op("ret"),
    );
    const services = new BufferSystemServices([0x41]);
    const result = new ReferenceVm(
      buildImage({ routines: [{ code: main, clobberCount: 2 }] }),
      { services },
    ).run();
    expect(result.kind).toBe("success");
    expect(services.standardOutput).toEqual([0x41]);
  });

  it("keeps storage bytes and cursor unchanged on failed seek", () => {
    const services = new BufferSystemServices([], [], [1, 2, 3]);
    expect(services.invoke(Service.seekStorageOutput, [4])).toEqual({
      ok: false,
      code: ServiceError.storageFailure,
    });
    expect(services.invoke(Service.writeStorageByte, [9])).toEqual({
      ok: true,
    });
    expect(services.storageOutput).toEqual([1, 2, 3, 9]);
  });

  it("implements the standard and bulk input cursor contracts", () => {
    const services = new BufferSystemServices([0x41], [0x42, 0x43]);
    expect(services.invoke(Service.readInputByte, [])).toEqual({
      ok: true,
      value: 0x41,
    });
    expect(services.invoke(Service.readInputByte, [])).toEqual({
      ok: false,
      code: ServiceError.endOfInput,
    });
    expect(services.invoke(Service.readStorageByte, [])).toEqual({
      ok: true,
      value: 0x42,
    });
    expect(services.invoke(Service.rewindStorageInput, [])).toEqual({
      ok: true,
    });
    expect(services.invoke(Service.readStorageByte, [])).toEqual({
      ok: true,
      value: 0x42,
    });
  });
});

describe("validator data flow", () => {
  it("rejects a call with only part of its required argument mask", () => {
    const main = flatten(
      op("ldi8", 1, 0),
      op("arg", 0, 0),
      op("call", 1),
      op("ret"),
    );
    const callee = op("ret");
    const bytes = buildImage({
      routines: [
        { code: main, clobberCount: 1 },
        { code: callee, clobberCount: 2, parameterCount: 2 },
      ],
    });
    expect(() => validateImage(bytes)).toThrow(/argument mask/);
  });

  it("rejects a branch into a call-owned result consumer", () => {
    const main = flatten(
      op("ldi8", 0, 0),
      op("jz", 0, 9),
      op("call", 1),
      op("getr", 0),
      op("ret"),
    );
    const callee = flatten(op("ldi8", 1, 0), op("retv", 0));
    const bytes = buildImage({
      routines: [
        { code: main, clobberCount: 1 },
        { code: callee, clobberCount: 1, hasResult: true },
      ],
    });
    expect(() => validateImage(bytes)).toThrow(/getr.*incoming branch/);
  });

  it("rejects a branch into a call-owned failure test", () => {
    const main = flatten(
      op("ldi8", 0, 0),
      op("jz", 0, 9),
      op("call", 1),
      op("jfail", 13),
      op("ret"),
      op("gete", 0),
      op("ret"),
    );
    const bytes = buildImage({
      routines: [
        { code: main, clobberCount: 1 },
        { code: op("ret"), clobberCount: 0, failable: true },
      ],
    });
    expect(() => validateImage(bytes)).toThrow(/jfail.*incoming branch/);
  });
});
