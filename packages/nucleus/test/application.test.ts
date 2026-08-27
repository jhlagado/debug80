import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SourcePreparationError } from "@jhlagado/z80-tool-services/source-preparation";

import { prepareNucleusCompilation } from "../src/index.js";

const encoder = new TextEncoder();

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
      expect(prepared.totalSourceBytes).toBe(
        encoder.encode("const MODEL = 1\n").length +
          encoder.encode("//% import \"lib/model.nu\"\nsub main()\nend\n").length,
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
});
