import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { scanAssembly } from "../scripts/atom-migration-dry-run.mjs";
import { translateNucleusAzmLine } from "../scripts/atom-migration-dry-run.mjs";
import { flattenTranslatedEntry } from "../scripts/atom-migration-dry-run.mjs";
import { flattenedEntryParts } from "../scripts/atom-migration-dry-run.mjs";
import { lowerResolvedPreviewExpressions } from "../scripts/atom-migration-proof-compare.mjs";
import { augmentSymbolValuesFromPreview } from "../scripts/atom-migration-proof-compare.mjs";
import { comparisonCacheKey } from "../scripts/atom-migration-proof-compare.mjs";
import { createLegacyUnorderedMemoryAtomSink } from "../scripts/atom-migration-proof-compare.mjs";
import { entryBudget } from "../scripts/atom-migration-proof-compare.mjs";
import { readBudgetFile } from "../scripts/atom-migration-proof-compare.mjs";

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
    expect(translateNucleusAzmLine("Label:.db $10")).toBe(
      "Label:DB $10",
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
    expect(translateNucleusAzmLine("            CP \"A\"")).toBe("            CP 'A'");
    expect(translateNucleusAzmLine("            CP \"z\"+1")).toBe("            CP 'z'+1");
    expect(translateNucleusAzmLine("            CP \"\\\\\"")).toBe("            CP '\\\\'");
    expect(translateNucleusAzmLine("            LD   BC,(TokenRightParen<<8)|TokenRightBracket")).toBe(
      "            LD   BC,TokenRightParen<<8|TokenRightBracket",
    );
    expect(translateNucleusAzmLine("AddressSpaceLimit   .equ $10000", {
      symbolMap: new Map([["AddressSpaceLimit", "N0000001"]]),
    })).toBe("N0000001   EQU 0 ;@ATOM-PROOF-LIMIT AddressSpaceLimit 65536");
    expect(translateNucleusAzmLine("FeatureFlag .equ 1", {
      preprocessorSymbols: new Set(["FeatureFlag"]),
    })).toBe("%DEFINE FeatureFlag 1");
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
      expect(report.readiness).toEqual({
        permanentSource: "ready",
        compatibilityLowering: "ready",
        compatibilityBlockingIssues: 0,
      });
      expect(report.issues).toEqual([]);
      expect(report.measured).toMatchObject({
        files: 1,
        definedSymbols: 2,
        longSymbols: 0,
        contractLines: 0,
        preprocessorSymbols: 1,
      });
    });
  });

  it("assigns deterministic Atom-safe names to long symbols", async () => {
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

      expect(report.status).toBe("ready");
      expect(report.measured.longSymbols).toBe(2);
      expect(report.measured.contractLines).toBe(1);
      expect(report.ledger.map(({ original, atom, permanentAtom, publicObligation }) => ({
        original,
        atom,
        permanentAtom,
        publicObligation,
      }))).toEqual([
        {
          original: "AnotherLongLabel",
          atom: "N0000000",
          permanentAtom: ".L00000",
          publicObligation: null,
        },
        {
          original: "VeryLongPublicLabel",
          atom: "N0000001",
          permanentAtom: "VRYLNGPB",
          publicObligation: "proof-manifest",
        },
      ]);
      expect(report.issues.map(({ code }) => code)).toEqual([]);
      expect(report.ledger.find(({ original }) => original === "AnotherLongLabel")).toMatchObject({
        migrationKind: "local-label",
        permanentAtom: ".L00000",
        localScope: expect.objectContaining({ anchor: "VeryLongPublicLabel" }),
      });
      expect(report.proofSymbolMap).toEqual([
        expect.objectContaining({
          original: "VeryLongPublicLabel",
          atom: "N0000001",
          permanentAtom: "VRYLNGPB",
        }),
      ]);
    });
  });

  it("does not make a local label cross a repeated global definition boundary", async () => {
    await withTree({
      "asm/main.asm": [
        "GlobalAnchor:",
        "            JR   SharedLocalReady",
        "RepeatedLongBoundary:",
        "            NOP",
        "RepeatedLongBoundary:",
        "SharedLocalReady:",
        "            RET",
        "",
      ].join("\n"),
      "proofs/main.json": JSON.stringify({
        execution: { entry: "RepeatedLongBoundary" },
      }),
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.ledger.find(({ original }) => original === "SharedLocalReady")).toMatchObject({
        migrationKind: "generated-global",
        permanentAtom: "SHRDLCLR",
      });
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
      expect(report.readiness).toEqual({
        permanentSource: "blocked",
        compatibilityLowering: "blocked",
        compatibilityBlockingIssues: 1,
      });
      expect(report.issues).toEqual([
        expect.objectContaining({
          code: "atom-expression-range",
          message: "numeric literal $10000 exceeds Atom's 16-bit expression range",
        }),
      ]);
    });
  });

  it("fails on includes after the source header has closed", async () => {
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
      expect(report.readiness).toEqual({
        permanentSource: "blocked",
        compatibilityLowering: "ready",
        compatibilityBlockingIssues: 0,
      });
      expect(report.measured.includeAfterHeader).toBe(1);
      expect(report.measured.compatibilityLoweringRequired).toBe(1);
      expect(report.issues).toEqual([
        expect.objectContaining({
          code: "include-after-header",
        }),
      ]);
      expect(report.includeAfterHeaderReport.bySource).toEqual([
        {
          file: "main.asm",
          count: 1,
          firstLine: 2,
          targets: { "\"late.asmi\"": 1 },
        },
      ]);
      expect(report.includeAfterHeaderReport.byTarget).toEqual([
        expect.objectContaining({
          include: "\"late.asmi\"",
          resolved: "late.asmi",
          count: 1,
          target: expect.objectContaining({
            kind: "layout-only",
            dataDirectives: 0,
            instructions: 0,
          }),
        }),
      ]);
    });
  });

  it("classifies include-after-header targets by emitted content", async () => {
    await withTree({
      "asm/main.asm": [
        "START:",
        ".include \"code.asm\"",
        ".include \"data.asm\"",
        ".include \"mixed.asm\"",
        "",
      ].join("\n"),
      "asm/code.asm": "CODETARGET:\nRET\n",
      "asm/data.asm": "DATATARGET:\n.db 1\n",
      "asm/mixed.asm": "MIXEDTARGET:\nRET\n.db 2\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.includeAfterHeaderReport.byTarget.map(({ resolved, target }) => ({
        resolved,
        kind: target.kind,
      })).sort((left, right) => left.resolved.localeCompare(right.resolved))).toEqual([
        { resolved: "code.asm", kind: "code" },
        { resolved: "data.asm", kind: "data" },
        { resolved: "mixed.asm", kind: "mixed-code-data" },
      ]);
    });
  });

  it("classifies include-after-header targets by nested emitted content", async () => {
    await withTree({
      "asm/main.asm": [
        "START:",
        ".include \"wrapper.asmi\"",
        "",
      ].join("\n"),
      "asm/wrapper.asmi": ".include \"runtime.asm\"\n",
      "asm/runtime.asm": "RUNTIME:\nRET\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.includeAfterHeaderReport.byTarget).toEqual([
        expect.objectContaining({
          include: "\"wrapper.asmi\"",
          resolved: "wrapper.asmi",
          target: expect.objectContaining({
            kind: "code",
            instructions: 1,
            nestedIncludes: 1,
            recursiveIncludes: 1,
          }),
        }),
      ]);
    });
  });

  it("treats feature definitions and conditionals before includes as source", async () => {
    await withTree({
      "asm/main.asm": [
        "FeatureA .equ 1",
        ".if FeatureA",
        ".include \"early.asmi\"",
        ".endif",
        "START:",
        "RET",
        "",
      ].join("\n"),
      "asm/early.asmi": "VALUE .equ 1\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.measured.includeAfterHeader).toBe(1);
      expect(report.issues).toEqual([
        expect.objectContaining({
          code: "include-after-header",
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

      expect(report.status).toBe("ready");
      expect(report.measured.proofLimitSymbols).toBe(2);
      expect(report.issues.map(({ code }) => code)).toEqual([]);
      expect(report.proofLimitMap).toEqual([
        expect.objectContaining({
          original: "AddressSpaceLimit",
          atom: "N0000000",
          permanentAtom: "ADDRSSSP",
          value: 65536,
          loweredAtomValue: 0,
        }),
        expect.objectContaining({
          original: "ProofMemoryEnd",
          atom: "N0000001",
          permanentAtom: "PRFMMRYE",
          value: 65536,
          loweredAtomValue: 0,
        }),
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

  it("fails when a generated preview ledger name collides with an existing short symbol", async () => {
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
      ]);
    });
  });

  it("writes ledger, issue, and include report files from the CLI", async () => {
    await withTree({
      "asm/main.asm": "LongPublicLabel:\n.include \"late.asmi\"\n",
      "asm/late.asmi": "LV .equ 1\n",
      "proofs/main.json": JSON.stringify({
        execution: { entry: "LongPublicLabel" },
      }),
    }, async (root) => {
      const ledgerPath = path.join(root, "out", "ledger.json");
      const issuesPath = path.join(root, "out", "issues.json");
      const includeReportPath = path.join(root, "out", "includes.json");
      const proofSymbolMapPath = path.join(root, "out", "proof-symbols.json");
      const proofLimitMapPath = path.join(root, "out", "proof-limits.json");
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
        "--include-report-out",
        includeReportPath,
        "--proof-symbol-map-out",
        proofSymbolMapPath,
        "--proof-limit-map-out",
        proofLimitMapPath,
      ], { encoding: "utf8" });

      expect(result.status).toBe(1);
      const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
      const issues = JSON.parse(await readFile(issuesPath, "utf8"));
      const includeReport = JSON.parse(await readFile(includeReportPath, "utf8"));
      const proofSymbolMap = JSON.parse(await readFile(proofSymbolMapPath, "utf8"));
      const proofLimitMap = JSON.parse(await readFile(proofLimitMapPath, "utf8"));
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({
        original: "LongPublicLabel",
        atom: "N0000000",
        permanentAtom: "LNGPBLCL",
        publicObligation: "proof-manifest",
      });
      expect(issues).toEqual([
        expect.objectContaining({
          code: "include-after-header",
        }),
      ]);
      expect(includeReport.bySource).toEqual([
        expect.objectContaining({
          file: "main.asm",
          count: 1,
        }),
      ]);
      expect(proofSymbolMap).toEqual([
        expect.objectContaining({
          original: "LongPublicLabel",
          atom: "N0000000",
          permanentAtom: "LNGPBLCL",
        }),
      ]);
      expect(proofLimitMap).toEqual([]);
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
        "N0000000: ;@NUC-GLOBAL LongPublicLabel PERMANENT LNGPBLCL",
        "            DB \"LongPublicLabel\"",
        "            JP N0000000 ; LongPublicLabel",
        "",
      ].join("\n"));
    });
  });

  it("flattens AZM textual includes for one Atom-preview entry", async () => {
    await withTree({
      "asm/main.asm": [
        "FeatureFlag .equ 1",
        "MainLongLabel:",
        "            .if FeatureFlag",
        "            .include \"lib.asmi\"",
        "            .endif",
        "            JP LibLongLabel",
        "",
      ].join("\n"),
      "asm/lib.asmi": [
        "LibLongLabel:",
        "            .db 1",
        "",
      ].join("\n"),
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(flattenTranslatedEntry(report, "main.asm")).toBe([
        ";@SOURCE-BEGIN main.asm",
        ";@DEFINE FeatureFlag 1",
        "N0000001: ;@NUC-GLOBAL MainLongLabel PERMANENT MNLNGLBL",
        ";@IF FeatureFlag 1",
        ";@INCLUDE-BEGIN lib.asmi",
        ";@SOURCE-BEGIN lib.asmi",
        "N0000000: ;@NUC-GLOBAL LibLongLabel PERMANENT LBLNGLBL",
        "            DB 1",
        "",
        ";@SOURCE-END lib.asmi",
        ";@INCLUDE-END lib.asmi",
        ";@ENDIF",
        "            JP N0000000",
        "",
        ";@SOURCE-END main.asm",
      ].join("\n"));
    });
  });

  it("rejects include cycles while flattening one preview entry", async () => {
    await withTree({
      "asm/a.asm": ".include \"b.asmi\"\n",
      "asm/b.asmi": ".include \"a.asm\"\n",
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(() => flattenTranslatedEntry(report, "a.asm")).toThrow(
        "include cycle while flattening Nucleus Atom preview: a.asm -> b.asmi -> a.asm",
      );
    });
  });

  it("counts symbols from transitive includes outside the asm directory", async () => {
    await withTree({
      "asm/main.asm": [
        ".include \"../grammar/generated.asmi\"",
        "JP GeneratedLongLabel",
        "",
      ].join("\n"),
      "grammar/generated.asmi": [
        "GeneratedLongLabel:",
        "RET",
        "",
      ].join("\n"),
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.ledger).toContainEqual(expect.objectContaining({
        original: "GeneratedLongLabel",
        owningFile: "../grammar/generated.asmi",
      }));
    });
  });

  it("evaluates simple conditionals while flattening one preview entry", async () => {
    await withTree({
      "asm/main.asm": [
        "FeatureFlag .equ 0",
        ".if FeatureFlag",
        "DisabledLabel:",
        ".else",
        "EnabledLabel:",
        ".endif",
        "",
      ].join("\n"),
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(flattenTranslatedEntry(report, "main.asm")).toBe([
        ";@SOURCE-BEGIN main.asm",
        ";@DEFINE FeatureFlag 0",
        ";@IF FeatureFlag 0",
        ";@ELSE",
        "N0000001:",
        ";@ENDIF",
        "",
        ";@SOURCE-END main.asm",
      ].join("\n"));
    });
  });

  it("splits flattened Atom-preview entries into ordered native source parts", async () => {
    await withTree({
      "asm/main.asm": [
        "START:",
        "            NOP",
        "            NOP",
        "",
      ].join("\n"),
      "proofs/main.json": "{}",
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });
      const parts = flattenedEntryParts(report, "main.asm", { maxBytes: 40 });

      expect(parts.length).toBeGreaterThan(1);
      expect(parts.map(({ ordinal }) => ordinal)).toEqual(
        parts.map((_, index) => index),
      );
      expect(parts.every(({ compilerBytes }) => compilerBytes.length <= 40)).toBe(true);
      expect(new TextDecoder().decode(Uint8Array.from(
        parts.flatMap(({ compilerBytes }) => [...compilerBytes]),
      ))).toBe(flattenTranslatedEntry(report, "main.asm"));
    });
  });

  it("lowers resolved proof-preview aliases and symbol differences", () => {
    const symbolValues = new Map([
      ["COUNT", 0x1004],
      ["BASE", 0x1000],
      ["SIZE", 0x58],
      ["END", 0x1010],
      ["START", 0x1002],
    ]);

    expect(lowerResolvedPreviewExpressions([
      "COUNT EQU BASE+4",
      "DW END-START",
      "LD HL,BASE+SIZE",
      "DB 'A-B' ; END-START remains in comment",
      "",
    ].join("\n"), symbolValues)).toBe([
      "COUNT EQU $1004",
      "DW $000E",
      "LD HL,$1058",
      "DB 'A-B' ; END-START remains in comment",
      "",
    ].join("\n"));
  });

  it("derives generated preview constants from earlier EQU aliases", () => {
    const values = augmentSymbolValuesFromPreview([
      "BASE EQU $5000",
      "SIZE EQU 54",
      "END  EQU BASE+SIZE",
      "",
    ].join("\n"), new Map());

    expect(values.get("BASE")).toBe(0x5000);
    expect(values.get("SIZE")).toBe(54);
    expect(values.get("END")).toBe(0x5036);
    expect(lowerResolvedPreviewExpressions("END EQU BASE+SIZE", values)).toBe(
      "END EQU $5036",
    );
  });

  it("masks unresolved preview EQU definitions without inventing aliases", () => {
    expect(lowerResolvedPreviewExpressions([
      "END EQU MISSING+SIZE",
      "LD HL,END",
      "",
    ].join("\n"), new Map([["SIZE", 54]]))).toBe([
      ";@UNRESOLVED-EQU END EQU MISSING+SIZE",
      "LD HL,END",
      "",
    ].join("\n"));
  });

  it("lowers known parenthesized preview expressions outside quoted text", () => {
    const values = new Map([
      ["BASE", 0x44bb],
      ["FIELD", 4],
      ["WIDTH", 6],
    ]);
    expect(lowerResolvedPreviewExpressions([
      "LD A,(BASE+FIELD)",
      "LD A,(BASE+WIDTH*2+FIELD)",
      "DB \"(BASE+FIELD)\"",
      "LD A,(BASE+MISSING)",
      "",
    ].join("\n"), values)).toBe([
      "LD A,($44BF)",
      "LD A,($44CB)",
      "DB \"(BASE+FIELD)\"",
      "LD A,(BASE+MISSING)",
      "",
    ].join("\n"));
  });

  it("loads per-manifest Atom-preview execution budgets", async () => {
    await withTree({
      "budgets.json": JSON.stringify({
        entries: {
          "large-proof.json": {
            maxInstructions: 123,
            maxCycles: 456,
          },
          "skipped-proof.json": {
            skip: "known budget blocker",
          },
        },
      }),
    }, async (root) => {
      const budgets = readBudgetFile(path.join(root, "budgets.json"));
      expect(entryBudget(
        { name: "large-proof.json" },
        { maxInstructions: 10, maxCycles: 20 },
        budgets,
      )).toEqual({
        maxInstructions: 123,
        maxCycles: 456,
      });
      expect(entryBudget(
        { name: "small-proof.json" },
        { maxInstructions: 10, maxCycles: 20 },
        budgets,
      )).toEqual({
        maxInstructions: 10,
        maxCycles: 20,
      });
      expect(entryBudget(
        { name: "skipped-proof.json" },
        { maxInstructions: 10, maxCycles: 20 },
        budgets,
      )).toEqual({
        skip: "known budget blocker",
      });
      expect(entryBudget(
        { name: "skipped-proof.json" },
        { maxInstructions: 10, maxCycles: 20 },
        budgets,
        { force: true },
      )).toEqual({
        maxInstructions: 10,
        maxCycles: 20,
      });
    });
  });

  it("accepts legacy unordered output while still rejecting image overlap", () => {
    const sink = createLegacyUnorderedMemoryAtomSink();
    expect(sink.begin({ target: { start: 0x1000, capacity: 0x1000 }, descriptor: 0x4000 })).toBe(0);
    expect(sink.image({ bank: 0, address: 0x1800, bytes: Uint8Array.of(1) })).toBe(0);
    expect(sink.image({ bank: 0, address: 0x1000, bytes: Uint8Array.of(2) })).toBe(0);
    expect(sink.image({ bank: 0, address: 0x1000, bytes: Uint8Array.of(3) })).toBe(0xe2);
    expect(sink.snapshot().failure).toMatchObject({
      code: "image-overlap",
    });
  });

  it("keys Atom-preview comparison cache by entry and execution policy", () => {
    const asmRoot = "/project/asm";
    const proof = {
      file: "/project/proofs/a.json",
      manifest: { source: "../asm/main.asm" },
    };
    const otherProof = {
      file: "/project/proofs/b.json",
      manifest: { source: "../asm/main.asm" },
    };
    const base = comparisonCacheKey({
      proof,
      asmRoot,
      maxPartBytes: 65535,
      budget: { maxInstructions: 10, maxCycles: 20 },
      legacyOutputOrder: true,
    });
    expect(comparisonCacheKey({
      proof: otherProof,
      asmRoot,
      maxPartBytes: 65535,
      budget: { maxInstructions: 10, maxCycles: 20 },
      legacyOutputOrder: true,
    })).toBe(base);
    expect(comparisonCacheKey({
      proof,
      asmRoot,
      maxPartBytes: 65535,
      budget: { maxInstructions: 11, maxCycles: 20 },
      legacyOutputOrder: true,
    })).not.toBe(base);
    expect(comparisonCacheKey({
      proof,
      asmRoot,
      maxPartBytes: 65535,
      budget: { maxInstructions: 10, maxCycles: 20 },
      legacyOutputOrder: false,
    })).not.toBe(base);
  });
});
