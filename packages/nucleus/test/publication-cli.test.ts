import { mkdtemp, readFile, rm } from "node:fs/promises";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseNucleusPublicationOptions,
  validateNucleusPublicationOutputs,
  writeNucleusPublicationOutputs,
} from "../src/cli/publication-cli.js";
import { runNucleusProofPublishCli } from "../src/cli/proof-publish.js";
import { runNucleusPublishCli } from "../src/cli/publish.js";

const captureStdout = async (
  action: () => Promise<number>,
): Promise<{ readonly status: number; readonly stdout: string }> => {
  const originalWrite = process.stdout.write;
  let stdout = "";
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    stdout += chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : chunk;
    const callback = rest.find((item): item is () => void => typeof item === "function");
    callback?.();
    return true;
  }) as typeof process.stdout.write;
  try {
    const status = await action();
    return { status, stdout };
  } finally {
    process.stdout.write = originalWrite;
  }
};

describe("Nucleus publication CLI contract", () => {
  it("advertises positional positive outputs and hides legacy output flags", async () => {
    for (const run of [runNucleusPublishCli, runNucleusProofPublishCli]) {
      const result = await captureStdout(() => run(["--help"]));
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("[output...]");
      expect(result.stdout).toContain("Name output paths after the input");
      expect(result.stdout).toContain("default atom");
      expect(result.stdout).toContain("Legacy -o/--output forms are still accepted");
      expect(result.stdout).not.toContain("-o, --output FILE");
    }
  });

  it("accepts positive output paths after the input", () => {
    const options = parseNucleusPublicationOptions(
      [
        "--root",
        "project",
        "src/main.nu",
        "build/program.nobj",
        "build/program.bin",
        "build/program.com",
        "build/program.hex",
        "build/program.d8.json",
      ],
      { positionalName: "entry source" },
    );

    expect(options.input).toBe("src/main.nu");
    expect(options.root).toBe("project");
    expect(options.outputPaths).toEqual([
      "build/program.nobj",
      "build/program.bin",
      "build/program.com",
      "build/program.hex",
      "build/program.d8.json",
    ]);
  });

  it("keeps -o/--output as compatibility forms for adding outputs", () => {
    const options = parseNucleusPublicationOptions(
      [
        "--output",
        "build/program.nobj",
        "-o",
        "build/program.hex",
        "src/main.nu",
        "build/program.d8.json",
      ],
      { positionalName: "entry source" },
    );

    expect(options.input).toBe("src/main.nu");
    expect(options.outputPaths).toEqual([
      "build/program.nobj",
      "build/program.hex",
      "build/program.d8.json",
    ]);
  });

  it("normalizes proof-image assembler aliases through the shared Z80 selector", () => {
    expect(parseNucleusPublicationOptions(
      ["src/main.nu"],
      { positionalName: "entry source" },
    ).assembler).toBeUndefined();
    expect(parseNucleusPublicationOptions(
      ["--assembler", "ATOM-Z80", "src/main.nu"],
      { positionalName: "entry source" },
    ).assembler).toBe("atom");
    expect(parseNucleusPublicationOptions(
      ["--assembler", "ASM80", "src/main.nu"],
      { positionalName: "entry source" },
    ).assembler).toBe("azm");
    expect(() => parseNucleusPublicationOptions(
      ["--assembler", "auto", "src/main.nu"],
      { positionalName: "entry source" },
    )).toThrow("--assembler must select Atom or AZM");
  });

  it("selects output formats by suffix and rejects duplicate formats", () => {
    expect(validateNucleusPublicationOutputs([
      "build/program.nobj",
      "build/program.bin",
      "build/program.com",
      "build/program.hex",
      "build/program.d8.json",
    ])).toEqual([
      { format: "nobj", path: path.resolve("build/program.nobj") },
      { format: "bin", path: path.resolve("build/program.bin") },
      { format: "com", path: path.resolve("build/program.com") },
      { format: "hex", path: path.resolve("build/program.hex") },
      { format: "d8", path: path.resolve("build/program.d8.json") },
    ]);

    expect(() =>
      validateNucleusPublicationOutputs([
        "build/one.bin",
        "build/two.bin",
      ]),
    ).toThrow("output format is repeated: bin");
  });

  it("rejects unimplemented convenience artifacts explicitly", () => {
    expect(() => validateNucleusPublicationOutputs(["build/program.lst"]))
      .toThrow("Nucleus listing output is not implemented");
  });

  it("publishes selected outputs through the shared transaction boundary", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "nucleus-output-"));
    try {
      const first = path.join(directory, "first.nobj");
      const second = path.join(directory, "second.nobj");
      const publication = {
        nobj: { serialized: Uint8Array.of(1, 2, 3) },
      } as Parameters<typeof writeNucleusPublicationOutputs>[0];

      await expect(writeNucleusPublicationOutputs(publication, [
        { format: "nobj", path: first },
        { format: "nobj", path: second },
      ], {
        filesystem: {
          ...fs,
          async rename(source: string, target: string) {
            if (source.endsWith(".tmp") && target === second) {
              throw Object.assign(new Error("injected"), { code: "EIO" });
            }
            return fs.rename(source, target);
          },
        },
      })).rejects.toMatchObject({ code: "output-transaction" });

      await expect(readFile(first)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(second)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
