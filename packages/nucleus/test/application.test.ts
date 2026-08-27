import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { SourcePreparationError } from "@jhlagado/z80-tool-services/source-preparation";

import {
  prepareNucleusCompilation,
  prepareNucleusRuntimeLink,
  publishNucleusPreparedSourceTarget,
  publishNucleusProofTarget,
  buildNucleusResidentSourceImage,
  installNucleusResidentSourceImage,
  NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE,
  resolveNucleusResidentCompilerEntry,
  validateNucleusResidentSourceForEntry,
} from "../src/index.js";
import { defaultRuntimeLinkContext } from "../src/nucleus-runtime.js";
import { Service } from "../src/runtime-contract.js";

const encoder = new TextEncoder();
const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, "..");
const tsxBin = path.resolve(packageRoot, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
const proof = (name: string): string =>
  path.resolve(packageRoot, "proofs", `${name}.json`);

async function withSourceTree<T>(
  files: Readonly<Record<string, string>>,
  run: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "nucleus-application-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      const filePath = path.join(root, name);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, text, "utf8");
    }
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Nucleus application boundary", () => {
  it("prepares a resolver-backed compilation input for resident compiler callers", async () => {
    await withSourceTree({
      "src/main.nu": "//% import \"lib/model.nu\"\nsub main()\nend\n",
      "src/lib/model.nu": "const MODEL = 1\n",
    }, async (root) => {
      const prepared = await prepareNucleusCompilation({
        root,
        entry: "src/main.nu",
        placement: {
          defaultBank: 0,
          banks: {
            "src/lib/model.nu": 3,
          },
        },
      });

      expect(prepared.project.parts.map((part) => part.logicalIdentity)).toEqual([
        "src/lib/model.nu",
        "src/main.nu",
      ]);
      expect(prepared.sourceParts).toEqual([
        {
          ordinal: 1,
          stableIdentity: "1:src/lib/model.nu",
          diagnosticName: "src/lib/model.nu",
          bytes: encoder.encode("const MODEL = 1\n"),
        },
        {
          ordinal: 2,
          stableIdentity: "2:src/main.nu",
          diagnosticName: "src/main.nu",
          bytes: encoder.encode("//% import \"lib/model.nu\"\nsub main()\nend\n"),
        },
      ]);
      expect(prepared.partBanks).toEqual([3, 0]);
      expect(prepared.runtime.serviceKind).toBe("resident");
      expect(prepared.runtime.runtimeLinkContext.services).toEqual(
        defaultRuntimeLinkContext.services,
      );
      expect(prepared.runtime.vectorBytes).toHaveLength(33);
      expect(prepared.runtime.hostStreams).toBeUndefined();
      expect(prepared.totalSourceBytes).toBe(
        encoder.encode("const MODEL = 1\n").length +
          encoder.encode("//% import \"lib/model.nu\"\nsub main()\nend\n").length,
      );
    });
  });

  it("prepares a host-stream runtime link context for callers that run through Debug80 services", () => {
    const prepared = prepareNucleusRuntimeLink({
      services: { kind: "host-streams", stubBase: 0x4100 },
    });

    expect(prepared.serviceKind).toBe("host-streams");
    expect(prepared.baseRuntimeLinkContext.services).toEqual(
      defaultRuntimeLinkContext.services,
    );
    expect(prepared.runtimeLinkContext.services.writeOutputByte).toBe(0x4120);
    expect(prepared.runtimeLinkContext.services.trap).toBe(
      defaultRuntimeLinkContext.services.trap,
    );
    expect(prepared.hostStreams?.vectorBytes).toHaveLength(33);
    expect([...prepared.vectorBytes]).toEqual([
      ...(prepared.hostStreams?.vectorBytes ?? []),
    ]);
    expect(prepared.hostStreams?.stubs).toHaveLength(6);
    expect(prepared.hostStreams?.stubs[Service.writeOutputByte]?.address).toBe(
      0x4120,
    );
  });

  it("threads host-stream runtime linking through compilation preparation", async () => {
    await withSourceTree({
      "src/main.nu": "sub main()\nend\n",
    }, async (root) => {
      const prepared = await prepareNucleusCompilation({
        root,
        entry: "src/main.nu",
        runtime: {
          services: { kind: "host-streams", stubBase: 0x5100 },
        },
      });

      expect(prepared.runtime.serviceKind).toBe("host-streams");
      expect(prepared.runtime.runtimeLinkContext.services.readInputByte).toBe(
        0x5100,
      );
      expect(
        prepared.runtime.runtimeLinkContext.services.unhandledFailure,
      ).toBe(defaultRuntimeLinkContext.services.unhandledFailure);
    });
  });

  it("builds resident source descriptors and a contiguous source image", () => {
    const image = buildNucleusResidentSourceImage({
      sourceBase: 0x5000,
      sourceParts: [
        {
          ordinal: 1,
          stableIdentity: "1:lib.nu",
          diagnosticName: "lib.nu",
          bytes: encoder.encode("const LIB = 1\n"),
        },
        {
          ordinal: 2,
          stableIdentity: "2:main.nu",
          diagnosticName: "main.nu",
          bytes: encoder.encode("sub main()\nend\n"),
        },
      ],
    });

    const firstLength = encoder.encode("const LIB = 1\n").length;
    const secondLength = encoder.encode("sub main()\nend\n").length;
    expect(image.sourceBase).toBe(0x5000);
    expect(image.sourceEnd).toBe(0x5000 + firstLength + secondLength);
    expect(image.sourceBytes).toEqual(
      encoder.encode("const LIB = 1\nsub main()\nend\n"),
    );
    expect(image.descriptorBytes).toEqual(
      Uint8Array.of(
        1,
        0x00,
        0x50,
        firstLength,
        0x50,
        2,
        firstLength,
        0x50,
        firstLength + secondLength,
        0x50,
      ),
    );
    expect(image.descriptors).toEqual([
      {
        ordinal: 1,
        start: 0x5000,
        end: 0x5000 + firstLength,
        diagnosticName: "lib.nu",
      },
      {
        ordinal: 2,
        start: 0x5000 + firstLength,
        end: 0x5000 + firstLength + secondLength,
        diagnosticName: "main.nu",
      },
    ]);
  });

  it("installs resident source image and descriptors into a selected memory layout", () => {
    const image = buildNucleusResidentSourceImage({
      sourceBase: 0x5000,
      sourceParts: [
        {
          ordinal: 1,
          stableIdentity: "1:main.nu",
          diagnosticName: "main.nu",
          bytes: encoder.encode("sub main()\nend\n"),
        },
      ],
    });
    const memory = new Uint8Array(0x10000);
    installNucleusResidentSourceImage(memory, image, 0x9000);

    expect(memory.slice(0x5000, image.sourceEnd)).toEqual(image.sourceBytes);
    expect(
      memory.slice(
        0x9000,
        0x9000 + NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE,
      ),
    ).toEqual(image.descriptorBytes);
  });

  it("resolves and validates a resident compiler entry descriptor", () => {
    const image = buildNucleusResidentSourceImage({
      sourceBase: 0x5000,
      sourceParts: [
        {
          ordinal: 1,
          stableIdentity: "1:main.nu",
          diagnosticName: "main.nu",
          bytes: encoder.encode("sub main()\nend\n"),
        },
      ],
    });
    const symbols: Readonly<Record<string, number>> = {
      ProofStart: 0x4200,
      SourceBase: 0x5000,
      FlatTargetParts: 0x9000,
      FlatTargetDescriptor: 0x9100,
      FlatTargetPartBanks: 0x9200,
      AdapterSuccessLogBase: 0x9c30,
      AdapterLogLength: 0x9c00,
      AdapterLogLimit: 0xf000,
    };
    const entry = resolveNucleusResidentCompilerEntry(
      {
        executionEntry: "ProofStart",
        sourceDescriptorBase: "FlatTargetParts",
        sourceBase: "SourceBase",
        sourceCapacity: 0x0800,
        targetDescriptor: "FlatTargetDescriptor",
        partBankTable: "FlatTargetPartBanks",
        outputLogBase: "AdapterSuccessLogBase",
        outputLogLength: "AdapterLogLength",
        outputLogLimit: "AdapterLogLimit",
      },
      (name) => symbols[name] ?? -1,
    );

    expect(entry).toEqual({
      executionEntry: 0x4200,
      sourceDescriptorBase: 0x9000,
      sourceBase: 0x5000,
      sourceCapacity: 0x0800,
      targetDescriptor: 0x9100,
      partBankTable: 0x9200,
      outputLogBase: 0x9c30,
      outputLogLength: 0x9c00,
      outputLogLimit: 0xf000,
    });
    expect(() =>
      validateNucleusResidentSourceForEntry(entry, image),
    ).not.toThrow();
    expect(() =>
      validateNucleusResidentSourceForEntry(
        {
          ...entry,
          sourceBase: 0x5100,
        },
        image,
      ),
    ).toThrow("source image base does not match compiler entry");
  });

  it("rejects resident source descriptor layouts that the current Z80 adapter cannot address", () => {
    const part = (ordinal: number) => ({
      ordinal,
      stableIdentity: `${ordinal}:part${ordinal}.nu`,
      diagnosticName: `part${ordinal}.nu`,
      bytes: encoder.encode("sub main()\nend\n"),
    });

    expect(() =>
      buildNucleusResidentSourceImage({
        sourceBase: 0x5000,
        sourceParts: Array.from({ length: 9 }, (_, index) => part(index + 1)),
      }),
    ).toThrow("source part count exceeds resident capacity");
    expect(() =>
      buildNucleusResidentSourceImage({
        sourceBase: 0xfffe,
        sourceParts: [part(1)],
      }),
    ).toThrow("source image crosses the Z80 address space");
    expect(() =>
      buildNucleusResidentSourceImage({
        sourceBase: 0x5000,
        sourceCapacity: 1,
        sourceParts: [part(1)],
      }),
    ).toThrow("source image exceeds configured capacity");
  });

  it("can include resident source descriptor bytes in compilation preparation", async () => {
    await withSourceTree({
      "src/main.nu": "//% import \"lib/model.nu\"\nsub main()\nend\n",
      "src/lib/model.nu": "const MODEL = 1\n",
    }, async (root) => {
      const prepared = await prepareNucleusCompilation({
        root,
        entry: "src/main.nu",
        residentSource: {
          sourceBase: 0x5000,
          sourceCapacity: 0x0800,
        },
      });

      expect(prepared.residentSource?.descriptors.map((part) => part.ordinal)).toEqual([
        1,
        2,
      ]);
      expect(prepared.residentSource?.descriptorBytes).toHaveLength(
        2 * NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE,
      );
      expect(prepared.residentSource?.sourceBytes.byteLength).toBe(
        prepared.totalSourceBytes,
      );
    });
  });

  it("fails before preparing compiler input when source resolution is invalid", async () => {
    await withSourceTree({
      "src/main.nu": "//% include \"lib/model.nu\"\nsub main()\nend\n",
      "src/lib/model.nu": "const MODEL = 1\n",
    }, async (root) => {
      await expect(prepareNucleusCompilation({
        root,
        entry: "src/main.nu",
      })).rejects.toMatchObject({
        name: "SourcePreparationError",
        category: "profile",
        code: "invalid-import-directive",
      } satisfies Partial<SourcePreparationError>);
    });
  });

  it("exposes the prepared-compilation boundary through the development CLI", async () => {
    await withSourceTree({
      "src/main.nu": "//% import \"lib/model.nu\"\nsub main()\nend\n",
      "src/lib/model.nu": "const MODEL = 1\n",
    }, async (root) => {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [
          tsxBin,
          "src/cli/prepare.ts",
          "--root",
          root,
          "--json",
          "src/main.nu",
        ],
        { cwd: packageRoot },
      );

      expect(stderr).toBe("");
      expect(JSON.parse(stdout)).toEqual({
        parts: [
          {
            ordinal: 1,
            bank: 0,
            logicalIdentity: "src/lib/model.nu",
            bytes: encoder.encode("const MODEL = 1\n").length,
          },
          {
            ordinal: 2,
            bank: 0,
            logicalIdentity: "src/main.nu",
            bytes: encoder.encode("//% import \"lib/model.nu\"\nsub main()\nend\n").length,
          },
        ],
        partBanks: [0, 0],
        totalSourceBytes:
          encoder.encode("const MODEL = 1\n").length +
          encoder.encode("//% import \"lib/model.nu\"\nsub main()\nend\n").length,
        retainedPathBytes:
          encoder.encode("src/lib/model.nu").length +
          encoder.encode("src/main.nu").length,
        runtime: {
          serviceKind: "resident",
          vectorBytes: 33,
        },
      });
    });
  });

  it("exposes host-stream runtime linking through the development CLI", async () => {
    await withSourceTree({
      "src/main.nu": "sub main()\nend\n",
    }, async (root) => {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [
          tsxBin,
          "src/cli/prepare.ts",
          "--root",
          root,
          "--json",
          "--runtime-services",
          "host-streams",
          "--stub-base",
          "0x4100",
          "src/main.nu",
        ],
        { cwd: packageRoot },
      );

      expect(stderr).toBe("");
      expect(JSON.parse(stdout).runtime).toEqual({
        serviceKind: "host-streams",
        vectorBytes: 33,
        hostStreams: {
          stubBase: 0x4100,
          stubSpacing: 0x20,
          stubs: [
            { service: 0, address: 0x4100, bytes: 15 },
            { service: 1, address: 0x4120, bytes: 14 },
            { service: 2, address: 0x4140, bytes: 15 },
            { service: 3, address: 0x4160, bytes: 10 },
            { service: 4, address: 0x4180, bytes: 14 },
            { service: 5, address: 0x41a0, bytes: 16 },
          ],
        },
      });
    });
  });

  it("returns a source-preparation failure from the development CLI before compiler input exists", async () => {
    await withSourceTree({
      "src/main.nu": "//% include \"lib/model.nu\"\nsub main()\nend\n",
      "src/lib/model.nu": "const MODEL = 1\n",
    }, async (root) => {
      await expect(execFileAsync(
        process.execPath,
        [
          tsxBin,
          "src/cli/prepare.ts",
          "--root",
          root,
          "src/main.nu",
        ],
        { cwd: packageRoot },
      )).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining("Nucleus source preparation only accepts leading //% import"),
      });
    });
  });

  it("publishes committed NOBJ bytes from an executable proof manifest", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "nucleus-publish-"));
    try {
      const output = path.join(outputDirectory, "program.nobj");
      const publication = await publishNucleusProofTarget({
        manifest: proof("flat-target-z80-slice-proof"),
        output,
      });

      expect(publication.nobj.parsed.commit.recordCount).toBe(130);
      expect(publication.nobj.parsed.map.entryAddress).toBe(0x8000);
      expect(await readFile(output)).toEqual(
        Buffer.from(publication.nobj.serialized),
      );
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("publishes prepared entry source through the resident compiler proof image", async () => {
    await withSourceTree(
      {
        "src/main.nu": [
          "var value as u16 = 3",
          "var cleared as u8",
          "sub main()",
          "value = value * 2",
          "end",
          "",
        ].join("\n"),
      },
      async (root) => {
        const outputDirectory = await mkdtemp(
          path.join(tmpdir(), "nucleus-source-publish-"),
        );
        try {
          const output = path.join(outputDirectory, "program.nobj");
          const baseline = await publishNucleusProofTarget({
            manifest: proof("flat-target-z80-slice-proof"),
          });
          const publication = await publishNucleusPreparedSourceTarget({
            root,
            entry: "src/main.nu",
            output,
          });

          expect(publication.root).toBe(root);
          expect(publication.entry).toBe("src/main.nu");
          expect(publication.sourceParts).toBe(1);
          expect(publication.nobj.serialized).toEqual(
            baseline.nobj.serialized,
          );
          expect(await readFile(output)).toEqual(
            Buffer.from(publication.nobj.serialized),
          );
        } finally {
          await rm(outputDirectory, { recursive: true, force: true });
        }
      },
    );
  }, 30_000);

  it("exposes proof-target NOBJ publication through the development CLI", async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "nucleus-cli-publish-"));
    try {
      const output = path.join(outputDirectory, "program.nobj");
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [
          tsxBin,
          "src/cli/proof-publish.ts",
          "--json",
          "--output",
          output,
          proof("flat-target-z80-slice-proof"),
        ],
        { cwd: packageRoot },
      );

      const summary = JSON.parse(stdout);
      expect(stderr).toBe("");
      expect(summary).toMatchObject({
        output,
        bytes: 1396,
        records: 130,
        entryBank: 0,
        entryAddress: 0x8000,
      });
      expect((await readFile(output)).byteLength).toBe(summary.bytes);
    } finally {
      await rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("exposes prepared entry-source NOBJ publication through the development CLI", async () => {
    await withSourceTree(
      {
        "src/main.nu": [
          "var value as u16 = 3",
          "var cleared as u8",
          "sub main()",
          "value = value * 2",
          "end",
          "",
        ].join("\n"),
      },
      async (root) => {
        const outputDirectory = await mkdtemp(
          path.join(tmpdir(), "nucleus-cli-source-publish-"),
        );
        try {
          const output = path.join(outputDirectory, "program.nobj");
          const { stdout, stderr } = await execFileAsync(
            process.execPath,
            [
              tsxBin,
              "src/cli/proof-publish.ts",
              "--json",
              "--root",
              root,
              "--output",
              output,
              "src/main.nu",
            ],
            { cwd: packageRoot },
          );

          const summary = JSON.parse(stdout);
          expect(stderr).toBe("");
          expect(summary).toMatchObject({
            root,
            entry: "src/main.nu",
            sourceParts: 1,
            output,
            bytes: 1396,
            records: 130,
            entryBank: 0,
            entryAddress: 0x8000,
          });
          expect((await readFile(output)).byteLength).toBe(summary.bytes);
        } finally {
          await rm(outputDirectory, { recursive: true, force: true });
        }
      },
    );
  }, 30_000);
});
