import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { scanAssembly } from "../scripts/atom-migration-dry-run.mjs";

async function withTree(files, run) {
  const root = await mkdtemp(path.join(tmpdir(), "nucleus-atom-migration-"));
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

describe("Nucleus Atom migration dry-run", () => {
  it("reports a clean fixture as ready", async () => {
    await withTree({
      "asm/main.asm": [
        "START:      LD A,1",
        "            .IF FeatureA",
        "VALUE       .equ $1000",
        "            .DB 'A'",
        "            .ENDIF",
        "            .END",
        "",
      ].join("\n"),
      "proofs/main.json": JSON.stringify({
        execution: { entry: "START" },
        observations: [{ at: "VALUE", width: "u16", equals: 0x1000 }],
      }),
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("ready");
      expect(report.issues).toEqual([]);
      expect(report.measured).toMatchObject({
        files: 1,
        definedSymbols: 2,
        longSymbols: 0,
        contractLines: 0,
      });
    });
  });

  it("fails on long symbols and assigns deterministic Atom names", async () => {
    await withTree({
      "asm/main.asm": [
        ".routine out A,carry clobbers zero",
        "VeryLongPublicLabel:",
        "AnotherLongLabel:",
        "            JP VeryLongPublicLabel",
        "",
      ].join("\n"),
      "proofs/main.json": JSON.stringify({
        execution: { entry: "VeryLongPublicLabel" },
      }),
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("blocked");
      expect(report.measured.longSymbols).toBe(2);
      expect(report.measured.contractLines).toBe(1);
      expect(report.ledger.map(({ original, atom, publicObligation }) => ({
        original,
        atom,
        publicObligation,
      }))).toEqual([
        {
          original: "AnotherLongLabel",
          atom: "N0000000",
          publicObligation: null,
        },
        {
          original: "VeryLongPublicLabel",
          atom: "N0000001",
          publicObligation: "proof-manifest",
        },
      ]);
      expect(report.issues.map(({ code }) => code)).toEqual([
        "unledgered-long-symbol",
        "unledgered-long-symbol",
      ]);
    });
  });

  it("fails on directives and conditionals without a migration rule", async () => {
    await withTree({
      "asm/main.asm": [
        "START:",
        "            .MACRO SOMETHING",
        "            .IF FeatureA + FeatureB",
        "            .ENDIF",
        "",
      ].join("\n"),
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("blocked");
      expect(report.issues.map(({ code }) => code)).toEqual([
        "unsupported-directive",
        "unsupported-conditional-expression",
      ]);
    });
  });
});
