import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scanAssembly } from "../scripts/atom-migration-dry-run.mjs";
import { translateNucleusAzmLine } from "../scripts/atom-migration-dry-run.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "..");
const dryRunScript = path.join(packageRoot, "scripts", "atom-migration-dry-run.mjs");

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
  it("translates Nucleus AZM directive lines to Atom forms", () => {
    const symbolMap = new Map([["LongSourceLabel", "N0000000"]]);
    expect(translateNucleusAzmLine("            .include \"lib.asmi\"")).toBe(
      "            %INCLUDE \"lib.asmi\"",
    );
    expect(translateNucleusAzmLine("            .if FeatureA")).toBe(
      "            %IF FeatureA",
    );
    expect(translateNucleusAzmLine("            .else")).toBe("            %ELSE");
    expect(translateNucleusAzmLine("            .endif")).toBe("            %ENDIF");
    expect(translateNucleusAzmLine("            .end")).toBe("            ;@AZM-END");
    expect(translateNucleusAzmLine("Label       .equ $1000")).toBe(
      "Label       EQU $1000",
    );
    expect(translateNucleusAzmLine("Label:      .db $10")).toBe(
      "Label:      DB $10",
    );
    expect(translateNucleusAzmLine("Buffer:     .ds 16")).toBe(
      "Buffer:     DS 16",
    );
    expect(translateNucleusAzmLine(".routine in A out carry ; proof")).toBe(
      ";@ROUTINE IN A OUT CARRY ; proof",
    );
    expect(translateNucleusAzmLine("LongSourceLabel: JP LongSourceLabel ; LongSourceLabel", {
      symbolMap,
    })).toBe("N0000000: JP N0000000 ; LongSourceLabel");
    expect(translateNucleusAzmLine("            .DB \"LongSourceLabel\"", {
      symbolMap,
    })).toBe("            DB \"LongSourceLabel\"");
    expect(translateNucleusAzmLine("AddressSpaceLimit   .equ $10000", {
      symbolMap: new Map([["AddressSpaceLimit", "N0000001"]]),
    })).toBe("N0000001   EQU 0 ;@ATOM-PROOF-LIMIT AddressSpaceLimit 65536");
  });

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

  it("fails on numeric literals outside Atom's expression range", async () => {
    await withTree({
      "asm/main.asm": "Limit EQU $10000\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("blocked");
      expect(report.issues).toEqual([
        expect.objectContaining({
          code: "atom-expression-range",
          message: "numeric literal $10000 exceeds Atom's 16-bit expression range",
        }),
      ]);
    });
  });

  it("fails on AZM textual includes after source has begun", async () => {
    await withTree({
      "asm/main.asm": "ORG $1000\n.include \"late.asmi\"\n",
      "asm/late.asmi": "VALUE .equ 1\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("blocked");
      expect(report.measured.lateIncludes).toBe(1);
      expect(report.issues).toEqual([
        expect.objectContaining({
          code: "late-include",
        }),
      ]);
    });
  });

  it("permits known one-past-address-space proof limit symbols", async () => {
    await withTree({
      "asm/main.asm": "AddressSpaceLimit .equ $10000\nProofMemoryEnd .equ $10000\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("blocked");
      expect(report.measured.proofLimitSymbols).toBe(2);
      expect(report.issues.map(({ code }) => code)).toEqual([
        "unledgered-long-symbol",
        "unledgered-long-symbol",
      ]);
    });
  });

  it("fails on case-insensitive symbol collisions", async () => {
    await withTree({
      "asm/main.asm": "Name:\nname:\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("blocked");
      expect(report.issues).toEqual([
        expect.objectContaining({
          code: "atom-case-collision",
          message: "symbols collide in Atom's case-insensitive table: Name, name",
        }),
      ]);
    });
  });

  it("fails when a generated ledger name collides with an existing short symbol", async () => {
    await withTree({
      "asm/main.asm": "N0000000:\nVeryLongLabel:\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.status).toBe("blocked");
      expect(report.issues.map(({ code }) => code)).toEqual([
        "generated-symbol-collision",
        "unledgered-long-symbol",
      ]);
    });
  });

  it("writes ledger and issue files from the CLI", async () => {
    await withTree({
      "asm/main.asm": "LongPublicLabel:\n",
      "proofs/main.json": JSON.stringify({
        execution: { entry: "LongPublicLabel" },
      }),
    }, async (root) => {
      const ledgerPath = path.join(root, "out", "ledger.json");
      const issuesPath = path.join(root, "out", "issues.json");
      const result = spawnSync(process.execPath, [
        dryRunScript,
        "--asm-root",
        path.join(root, "asm"),
        "--proof-root",
        path.join(root, "proofs"),
        "--ledger-out",
        ledgerPath,
        "--issues-out",
        issuesPath,
      ], { encoding: "utf8" });

      expect(result.status).toBe(1);
      const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
      const issues = JSON.parse(await readFile(issuesPath, "utf8"));
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        original: "LongPublicLabel",
        atom: "N0000000",
        publicObligation: "proof-manifest",
      });
      expect(issues).toEqual([
        expect.objectContaining({
          code: "unledgered-long-symbol",
        }),
      ]);
    });
  });

  it("writes translated Atom-preview source files from the CLI", async () => {
    await withTree({
      "asm/main.asm": [
        ".routine out A,carry clobbers zero",
        "LongPublicLabel:",
        "            .DB \"LongPublicLabel\"",
        "            JP LongPublicLabel ; LongPublicLabel",
        "",
      ].join("\n"),
      "proofs/main.json": JSON.stringify({
        execution: { entry: "LongPublicLabel" },
      }),
    }, async (root) => {
      const translatedRoot = path.join(root, "atom-preview");
      const result = spawnSync(process.execPath, [
        dryRunScript,
        "--asm-root",
        path.join(root, "asm"),
        "--proof-root",
        path.join(root, "proofs"),
        "--report-only",
        "--translated-root",
        translatedRoot,
      ], { encoding: "utf8" });

      expect(result.status).toBe(0);
      await expect(readFile(path.join(translatedRoot, "main.asm"), "utf8")).resolves.toBe([
        ";@ROUTINE OUT A,CARRY CLOBBERS ZERO",
        "N0000000:",
        "            DB \"LongPublicLabel\"",
        "            JP N0000000 ; LongPublicLabel",
        "",
      ].join("\n"));
    });
  });
});
