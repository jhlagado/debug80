import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SourcePreparationError } from "@jhlagado/z80-tool-services/source-preparation";

import {
  resolveNucleusProject,
  sourcePartsFromResolvedProject,
} from "../src/source-preparation.js";
import { buildSourceParts } from "../src/source-manifest.js";

const encoder = new TextEncoder();

async function withSourceTree<T>(
  files: Readonly<Record<string, string>>,
  run: (root: string) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), "nucleus-source-preparation-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      const filePath = path.join(root, name);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, text);
    }
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Nucleus source preparation", () => {
  it("orders leading imports before their importer and passes compiler bytes through unchanged", async () => {
    await withSourceTree({
      "main.nu": [
        "//% import \"display.nu\"",
        "//% import \"input.nu\"",
        "",
        "sub main()",
        "end",
        "",
      ].join("\n"),
      "display.nu": "//% import \"hardware.nu\"\nconst DISPLAY = 1\n",
      "input.nu": "//% import \"hardware.nu\"\nconst INPUT = 1\n",
      "hardware.nu": "const HARDWARE = 1\n",
    }, async (root) => {
      const project = await resolveNucleusProject({ root, entry: "main.nu" });

      expect(project.parts.map((part) => part.logicalIdentity)).toEqual([
        "hardware.nu",
        "display.nu",
        "input.nu",
        "main.nu",
      ]);
      for (const part of project.parts) {
        expect(part.compilerBytes).toEqual(part.originalBytes);
        expect(part.maskedRanges).toEqual([]);
      }
      expect(project.bankArray).toEqual([0, 0, 0, 0]);
    });
  });

  it("ignores import-shaped comments after the leading header block", async () => {
    await withSourceTree({
      "main.nu": [
        "sub main()",
        "  //% import \"late.nu\"",
        "end",
        "",
      ].join("\n"),
      "late.nu": "const LATE = 1\n",
    }, async (root) => {
      const project = await resolveNucleusProject({ root, entry: "main.nu" });

      expect(project.parts.map((part) => part.logicalIdentity)).toEqual(["main.nu"]);
    });
  });

  it("rejects malformed source-preparation directives in the leading header", async () => {
    await withSourceTree({
      "main.nu": "//% include \"lib.nu\"\nconst MAIN = 1\n",
    }, async (root) => {
      await expect(resolveNucleusProject({ root, entry: "main.nu" })).rejects.toMatchObject({
        name: "SourcePreparationError",
        category: "profile",
        code: "invalid-import-directive",
        location: { line: 1, column: 1 },
      } satisfies Partial<SourcePreparationError>);
    });
  });

  it("adapts resolved parts to the existing Nucleus source-part record", async () => {
    await withSourceTree({
      "main.nu": "//% import \"lib.nu\"\nsub main()\nend\n",
      "lib.nu": "const LIB = 1\n",
    }, async (root) => {
      const project = await resolveNucleusProject({ root, entry: "main.nu" });
      const sourceParts = sourcePartsFromResolvedProject(project);
      const manifestParts = buildSourceParts("lib.nu\nmain.nu\n", (name) =>
        Uint8Array.from(readFileSync(path.join(root, name))),
      );

      expect(sourceParts).toEqual(manifestParts);
      expect(sourceParts).toEqual([
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
          bytes: encoder.encode("//% import \"lib.nu\"\nsub main()\nend\n"),
        },
      ]);
    });
  });

  it("carries path-keyed placement while the legacy source-part adapter stays source-only", async () => {
    await withSourceTree({
      "src/main.nu": "//% import \"lib/display.nu\"\nsub main()\nend\n",
      "src/lib/display.nu": "const DISPLAY = 1\n",
    }, async (root) => {
      const project = await resolveNucleusProject({
        root,
        entry: "src/main.nu",
        placement: {
          defaultBank: 0,
          banks: {
            "src/lib/display.nu": 2,
          },
        },
      });
      const sourceParts = sourcePartsFromResolvedProject(project);

      expect(project.parts.map((part) => [part.logicalIdentity, part.bank])).toEqual([
        ["src/lib/display.nu", 2],
        ["src/main.nu", 0],
      ]);
      expect(project.bankArray).toEqual([2, 0]);
      expect(sourceParts).toEqual([
        {
          ordinal: 1,
          stableIdentity: "1:src/lib/display.nu",
          diagnosticName: "src/lib/display.nu",
          bytes: encoder.encode("const DISPLAY = 1\n"),
        },
        {
          ordinal: 2,
          stableIdentity: "2:src/main.nu",
          diagnosticName: "src/main.nu",
          bytes: encoder.encode("//% import \"lib/display.nu\"\nsub main()\nend\n"),
        },
      ]);
    });
  });
});
