import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseNucleusPublicationOptions,
  validateNucleusPublicationOutputs,
} from "../src/cli/publication-cli.js";

describe("Nucleus publication CLI contract", () => {
  it("accepts positive output paths after the input", () => {
    const options = parseNucleusPublicationOptions(
      [
        "--root",
        "project",
        "src/main.nu",
        "build/program.nobj",
        "build/program.bin",
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

  it("selects output formats by suffix and rejects duplicate formats", () => {
    expect(validateNucleusPublicationOutputs([
      "build/program.nobj",
      "build/program.bin",
      "build/program.hex",
      "build/program.d8.json",
    ])).toEqual([
      { format: "nobj", path: path.resolve("build/program.nobj") },
      { format: "bin", path: path.resolve("build/program.bin") },
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
    expect(() => validateNucleusPublicationOutputs(["build/program.com"]))
      .toThrow("Nucleus COM output is not implemented");
    expect(() => validateNucleusPublicationOutputs(["build/program.lst"]))
      .toThrow("Nucleus listing output is not implemented");
  });
});
