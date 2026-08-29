import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { compile } from "@jhlagado/azm/compile";
import {
  assembleAtomProject,
  materializeAtomGeneration,
} from "../../atom/src/host/index.mjs";

import { scanAssembly } from "../scripts/atom-migration-dry-run.mjs";
import { translateNucleusAzmLine } from "../scripts/atom-migration-dry-run.mjs";
import { flattenTranslatedEntry } from "../scripts/atom-migration-dry-run.mjs";
import { flattenedEntryParts } from "../scripts/atom-migration-dry-run.mjs";
import { symbolMapFromLedger } from "../scripts/atom-migration-dry-run.mjs";
import { writeTranslatedTree } from "../scripts/atom-migration-dry-run.mjs";
import { lowerResolvedPreviewExpressions } from "../scripts/atom-migration-proof-compare.mjs";
import { augmentSymbolValuesFromPreview } from "../scripts/atom-migration-proof-compare.mjs";
import { comparisonCacheKey } from "../scripts/atom-migration-proof-compare.mjs";
import { createLegacyUnorderedMemoryAtomSink } from "../scripts/atom-migration-proof-compare.mjs";
import { entryBudget } from "../scripts/atom-migration-proof-compare.mjs";
import { readBudgetFile } from "../scripts/atom-migration-proof-compare.mjs";
import { runProofManifest } from "../src/proof.js";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, "..");
const asmRoot = path.join(packageRoot, "asm");
const proofRoot = path.join(packageRoot, "proofs");
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

function contentBase(generation) {
  const addresses = generation.images.map(({ address }) => address);
  for (const event of generation.layout ?? []) {
    if (event.kind === "reserve" && event.count !== 0) addresses.push(event.address);
  }
  return addresses.length === 0 ? generation.finalCursor : Math.min(...addresses);
}

async function withPermanentAtomTranslation(context, run) {
  const report = scanAssembly({ asmRoot, proofRoot });
  const translatedRoot = await mkdtemp(path.join(tmpdir(), "nucleus-atom-permanent-"));
  context.onTestFinished(async () => {
    await rm(translatedRoot, { recursive: true, force: true });
  });

  writeTranslatedTree(report, translatedRoot, { symbols: "permanent" });
  return await run({ report, translatedRoot });
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

  it("maps routine contracts to the following routine label", async () => {
    await withTree({
      "asm/main.asm": [
        ".routine in A out carry clobbers zero",
        "LongRoutineName:",
        "            RET",
        "",
      ].join("\n"),
      "proofs/main.json": JSON.stringify({ source: "../asm/main.asm" }),
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.contractMap).toEqual([
        {
          file: "main.asm",
          line: 1,
          contract: "in A out carry clobbers zero",
          target: {
            original: "LongRoutineName",
            atom: "N0000000",
            permanentAtom: "LNGRTNNM",
            line: 2,
          },
        },
      ]);
    });
  });

  it("maps conditional routine contract variants to the same following label", async () => {
    await withTree({
      "asm/main.asm": [
        ".if TargetStreamingOutput",
        ".routine in DE out A,carry",
        ".else",
        ".routine in HL out A,carry",
        ".endif",
        "Stage7EmitStringCheck:",
        "            RET",
        "",
      ].join("\n"),
      "proofs/main.json": JSON.stringify({ source: "../asm/main.asm" }),
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });

      expect(report.contractMap.map(({ line, contract, target }) => ({
        line,
        contract,
        target: target?.original,
      }))).toEqual([
        { line: 2, contract: "in DE out A,carry", target: "Stage7EmitStringCheck" },
        { line: 4, contract: "in HL out A,carry", target: "Stage7EmitStringCheck" },
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
      "proofs/main.json": JSON.stringify({ source: "../asm/main.asm" }),
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
      expect(report.proofMatrix).toEqual([
        expect.objectContaining({
          proof: "main.json",
          status: "blocked-by-other",
          blockers: [
            expect.objectContaining({
              code: "atom-expression-range",
            }),
          ],
        }),
      ]);
    });
  });

  it("fails on includes after the source header has closed", async () => {
    await withTree({
      "asm/main.asm": "ORG $1000\n.include \"late.asmi\"\n",
      "asm/late.asmi": "            RET\n",
      "proofs/main.json": JSON.stringify({ source: "../asm/main.asm" }),
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
            kind: "code",
            dataDirectives: 0,
            instructions: 1,
          }),
        }),
      ]);
      expect(report.proofMatrix).toEqual([
        expect.objectContaining({
          proof: "main.json",
          status: "blocked-by-late-emitted-include",
          blockers: [
            expect.objectContaining({
              code: "include-after-header",
            }),
          ],
        }),
      ]);
    });
  });

  it("classifies proof manifests for permanent Atom execution readiness", async () => {
    await withTree({
      "asm/ready.asm": "ReadyStart:\n            HALT\n",
      "asm/contract.asm": ".routine out A\nContractStart:\n            RET\n",
      "asm/late.asm": "LateStart:\n            .include \"frag.asmi\"\n",
      "asm/frag.asmi": "            RET\n",
      "asm/bad.asm": "BadStart EQU $10000\n",
      "asm/preview.asm": "PreviewStart:\n            DW PreviewEnd-PreviewStart\nPreviewEnd:\n",
      "asm/measurement.asm": "MeasureStart:\n            HALT\n",
      "proofs/ready.json": JSON.stringify({ source: "../asm/ready.asm" }),
      "proofs/contract.json": JSON.stringify({ source: "../asm/contract.asm" }),
      "proofs/late.json": JSON.stringify({ source: "../asm/late.asm" }),
      "proofs/bad.json": JSON.stringify({ source: "../asm/bad.asm" }),
      "proofs/preview.json": JSON.stringify({ source: "../asm/preview.asm" }),
      "proofs/dispatcher-measurement.json": JSON.stringify({ source: "../asm/measurement.asm" }),
    }, async (root) => {
      const report = scanAssembly({
        asmRoot: path.join(root, "asm"),
        proofRoot: path.join(root, "proofs"),
      });
      const statuses = Object.fromEntries(report.proofMatrix.map((entry) => [entry.proof, entry.status]));

      expect(statuses).toEqual({
        "bad.json": "blocked-by-other",
        "contract.json": "blocked-by-contract-support",
        "dispatcher-measurement.json": "measurement-artifact",
        "late.json": "blocked-by-late-emitted-include",
        "preview.json": "atom-preview-only",
        "ready.json": "atom-permanent-ready",
      });
      expect(report.measured.proofMatrix).toEqual({
        "atom-permanent-ready": 1,
        "atom-preview-only": 1,
        "blocked-by-contract-support": 1,
        "blocked-by-late-emitted-include": 1,
        "blocked-by-other": 1,
        "measurement-artifact": 1,
      });
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
      "asm/late.asmi": "            RET\n",
      "proofs/main.json": JSON.stringify({
        source: "../asm/main.asm",
        execution: { entry: "LongPublicLabel" },
      }),
    }, async (root) => {
      const ledgerPath = path.join(root, "out", "ledger.json");
      const issuesPath = path.join(root, "out", "issues.json");
      const includeReportPath = path.join(root, "out", "includes.json");
      const proofSymbolMapPath = path.join(root, "out", "proof-symbols.json");
      const proofLimitMapPath = path.join(root, "out", "proof-limits.json");
      const proofMatrixPath = path.join(root, "out", "proof-matrix.json");
      const contractMapPath = path.join(root, "out", "contracts.json");
      const migrationBundlePath = path.join(root, "out", "migration-bundle.json");
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
        "--proof-matrix-out",
        proofMatrixPath,
        "--contract-map-out",
        contractMapPath,
        "--migration-bundle-out",
        migrationBundlePath,
      ], { encoding: "utf8" });

      expect(result.status).toBe(1);
      const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
      const issues = JSON.parse(await readFile(issuesPath, "utf8"));
      const includeReport = JSON.parse(await readFile(includeReportPath, "utf8"));
      const proofSymbolMap = JSON.parse(await readFile(proofSymbolMapPath, "utf8"));
      const proofLimitMap = JSON.parse(await readFile(proofLimitMapPath, "utf8"));
      const proofMatrix = JSON.parse(await readFile(proofMatrixPath, "utf8"));
      const contractMap = JSON.parse(await readFile(contractMapPath, "utf8"));
      const migrationBundle = JSON.parse(await readFile(migrationBundlePath, "utf8"));
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
      expect(proofMatrix).toEqual([
        expect.objectContaining({
          proof: "main.json",
          status: "blocked-by-late-emitted-include",
        }),
      ]);
      expect(contractMap).toEqual([]);
      expect(migrationBundle).toMatchObject({
        schema: "nucleus-atom-migration/v1",
        status: "blocked",
        readiness: {
          permanentSource: "blocked",
          compatibilityLowering: "ready",
          compatibilityBlockingIssues: 0,
        },
      });
      expect(migrationBundle.ledger).toEqual(ledger);
      expect(migrationBundle.issues).toEqual(issues);
      expect(migrationBundle.includeAfterHeaderReport).toEqual(includeReport);
      expect(migrationBundle.proofSymbolMap).toEqual(proofSymbolMap);
      expect(migrationBundle.proofLimitMap).toEqual(proofLimitMap);
      expect(migrationBundle.proofMatrix).toEqual(proofMatrix);
      expect(migrationBundle.contractMap).toEqual(contractMap);
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

  it("selects preview or permanent Atom symbol names explicitly", () => {
    const ledger = [{
      original: "LongPublicLabel",
      atom: "N0000000",
      permanentAtom: "LNGPBLCL",
    }];

    expect(symbolMapFromLedger(ledger).get("LongPublicLabel")).toBe("N0000000");
    expect(symbolMapFromLedger(ledger, { symbols: "preview" }).get("LongPublicLabel")).toBe("N0000000");
    expect(symbolMapFromLedger(ledger, { symbols: "permanent" }).get("LongPublicLabel")).toBe("LNGPBLCL");
    expect(() => symbolMapFromLedger(ledger, { symbols: "unknown" })).toThrow(/preview or permanent/);
  });

  it("writes translated permanent Atom source files from the CLI", async () => {
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
      const translatedRoot = path.join(root, "atom-permanent");
      const result = spawnSync(process.execPath, [
        dryRunScript,
        "--asm-root",
        path.join(root, "asm"),
        "--proof-root",
        path.join(root, "proofs"),
        "--report-only",
        "--translated-root",
        translatedRoot,
        "--translated-symbols",
        "permanent",
      ], { encoding: "utf8" });

      expect(result.status).toBe(0);
      await expect(readFile(path.join(translatedRoot, "main.asm"), "utf8")).resolves.toBe([
        ";@ROUTINE OUT A,CARRY CLOBBERS ZERO",
        "LNGPBLCL: ;@NUC-GLOBAL LongPublicLabel PERMANENT LNGPBLCL",
        "            DB \"LongPublicLabel\"",
        "            JP LNGPBLCL ; LongPublicLabel",
        "",
      ].join("\n"));
    });
  });

  it("assembles the memory-map proof from permanent Atom source byte-identically", async (context) => {
    await withPermanentAtomTranslation(context, async ({ translatedRoot }) => {
      const current = await compile(path.join(asmRoot, "vertical-slice", "memory-map-proof.asm"), {
        outputType: "bin",
      });
      const diagnostics = current.diagnostics.filter(({ severity }) => severity === "error");
      expect(diagnostics).toEqual([]);
      const currentBin = current.artifacts.find(({ kind }) => kind === "bin")?.bytes;
      expect(currentBin).toBeDefined();

      const atom = await assembleAtomProject({
        root: translatedRoot,
        entry: "vertical-slice/memory-map-proof.asm",
        target: { start: 0, capacity: 0xffff },
        maxInstructions: 10_000_000,
        maxCycles: 100_000_000,
      });
      const atomBin = materializeAtomGeneration(atom.generation, {
        base: contentBase(atom.generation),
      }).bytes;

      expect(Buffer.compare(Buffer.from(atomBin), Buffer.from(currentBin))).toBe(0);
    });
  });

  it("runs every permanent-ready proof through the proof harness using permanent Atom source", async (context) => {
    await withPermanentAtomTranslation(context, async ({ report, translatedRoot }) => {
      const readyProofs = report.proofMatrix
        .filter(({ status }) => status === "atom-permanent-ready")
        .map(({ proof }) => proof);
      expect(readyProofs).toEqual([
        "memory-map-proof.json",
        "nobj-runner-proof.json",
        "source-provenance-proof.json",
      ]);

      const runAtomProof = (name, entry) =>
        runProofManifest(path.join(proofRoot, name), {
          assembler: {
            kind: "atom-permanent",
            root: translatedRoot,
            entry,
          },
          atomMigration: {
            proofSymbolMap: report.proofSymbolMap,
            proofLimitMap: report.proofLimitMap,
          },
        });

      const memoryMap = await runAtomProof(
        "memory-map-proof.json",
        "vertical-slice/memory-map-proof.asm",
      );
      expect(memoryMap.instructions).toBe(4);
      expect(memoryMap.cycles).toBe(34);
      expect(memoryMap.memory[memoryMap.symbols.ProofStatus ?? -1]).toBe(0xa5);
      expect(memoryMap.symbols.AddressSpaceLimit).toBe(0x10000);
      expect(memoryMap.regions.reduce((total, region) => total + region.bytes, 0)).toBe(65_536);

      const nobjRunner = await runAtomProof(
        "nobj-runner-proof.json",
        "vertical-slice/nobj-runner-proof.asm",
      );
      expect(nobjRunner.nobj).toBeDefined();
      expect(nobjRunner.nobj?.parsed.commit.recordCount).toBe(5);
      expect(nobjRunner.nobj?.serialized).toHaveLength(92);
      expect(nobjRunner.nobj?.instructions).toBe(3);
      expect(nobjRunner.nobj?.memory[0x8081]).toBe(0x5a);
      expect(nobjRunner.memory[0x8081]).toBe(0);

      const sourceProvenance = await runAtomProof(
        "source-provenance-proof.json",
        "vertical-slice/source-provenance-proof.asm",
      );
      expect(sourceProvenance.sourceProvenance).toEqual([
        {
          partOrdinal: 1,
          line: 10,
          column: 3,
          bank: 0,
          start: 0x8000,
          end: 0x8003,
          kind: "code",
          confidence: "high",
        },
      ]);
    });
  });

  it("runs the compiler-slice proof from permanent Atom layout source", async (context) => {
    await withPermanentAtomTranslation(context, async ({ report, translatedRoot }) => {
      const compilerSlice = report.proofMatrix.find(
        ({ proof }) => proof === "compiler-slice-proof.json",
      );
      expect(compilerSlice?.status).toBe("blocked-by-contract-support");
      const helper = await readFile(
        path.join(translatedRoot, "vertical-slice", "compiler-slice-code-begin.asmi"),
        "utf8",
      );
      expect(helper.match(/\bORG\b/g)).toHaveLength(1);
      expect(helper).toContain("ORG CMPLRCRB");
      expect(helper).toContain("CMPLRCDS:");

      const outcome = await runProofManifest(
        path.join(proofRoot, "compiler-slice-proof.json"),
        {
          assembler: {
            kind: "atom-permanent",
            root: translatedRoot,
            entry: "vertical-slice/compiler-slice-proof.asm",
          },
          atomMigration: {
            proofSymbolMap: report.proofSymbolMap,
            proofLimitMap: report.proofLimitMap,
          },
        },
      );

      expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
      expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
      expect(outcome.extents).toEqual([
        { name: "compiler-code", bytes: 940 },
        { name: "compiler-immutable", bytes: 38 },
        { name: "compiler-core", bytes: 978 },
        { name: "compiler-workspace", bytes: 55 },
        { name: "proof-code-and-data", bytes: 191 },
      ]);
    });
  });

  it("runs the z80-slice proof from permanent Atom layout source", async (context) => {
    await withPermanentAtomTranslation(context, async ({ report, translatedRoot }) => {
      const z80Slice = report.proofMatrix.find(
        ({ proof }) => proof === "z80-slice-proof.json",
      );
      expect(z80Slice?.status).toBe("blocked-by-contract-support");
      expect(z80Slice?.blockers).toEqual([]);
      const root = await readFile(
        path.join(translatedRoot, "vertical-slice", "z80-slice-proof.asm"),
        "utf8",
      );
      expect(root).toContain('%INCLUDE "z80-slice-code-begin.asmi"');
      expect(root).toContain('%INCLUDE "z80-slice-proof-body.asmi"');

      const outcome = await runProofManifest(
        path.join(proofRoot, "z80-slice-proof.json"),
        {
          assembler: {
            kind: "atom-permanent",
            root: translatedRoot,
            entry: "vertical-slice/z80-slice-proof.asm",
          },
          atomMigration: {
            proofSymbolMap: report.proofSymbolMap,
            proofLimitMap: report.proofLimitMap,
          },
        },
      );

      expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
      expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
      expect(outcome.extents).toEqual([
        { name: "common-front-end", bytes: 940 },
        { name: "z80-output-sink", bytes: 25 },
        { name: "compiler-code", bytes: 965 },
        { name: "compiler-immutable", bytes: 75 },
        { name: "compiler-core", bytes: 1040 },
        { name: "compiler-workspace", bytes: 55 },
        { name: "generated-z80", bytes: 37 },
        { name: "z80-runtime", bytes: 51 },
        { name: "z80-state", bytes: 6 },
        { name: "service-state", bytes: 3 },
        { name: "proof-code-and-data", bytes: 207 },
      ]);
    });
  });

  it("runs the array z80-slice proof from permanent Atom layout source", async (context) => {
    await withPermanentAtomTranslation(context, async ({ report, translatedRoot }) => {
      const arraySlice = report.proofMatrix.find(
        ({ proof }) => proof === "array-z80-slice-proof.json",
      );
      expect(arraySlice?.status).toBe("blocked-by-contract-support");
      expect(arraySlice?.blockers).toEqual([]);
      const root = await readFile(
        path.join(translatedRoot, "vertical-slice", "array-z80-slice-proof.asm"),
        "utf8",
      );
      expect(root).toContain('%INCLUDE "array-z80-slice-code-begin.asmi"');
      expect(root).toContain('%INCLUDE "array-z80-slice-proof-body.asmi"');

      const proofBody = await readFile(
        path.join(translatedRoot, "vertical-slice", "array-z80-slice-proof-body.asmi"),
        "utf8",
      );
      expect(proofBody).toContain("ARBDOFS EQU 29");
      expect(proofBody).toContain("ARBDCOL EQU 30");
      expect(proofBody).not.toContain("BadArrayValue-BadArraySource");

      const outcome = await runProofManifest(
        path.join(proofRoot, "array-z80-slice-proof.json"),
        {
          assembler: {
            kind: "atom-permanent",
            root: translatedRoot,
            entry: "vertical-slice/array-z80-slice-proof.asm",
            maxInstructions: 700_000_000,
            maxCycles: 7_000_000_000,
          },
          atomMigration: {
            proofSymbolMap: report.proofSymbolMap,
            proofLimitMap: report.proofLimitMap,
          },
        },
      );

      expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
      expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    });
  }, 60_000);

  it("runs the typed-expression z80-slice proof from permanent Atom layout source", async (context) => {
    await withPermanentAtomTranslation(context, async ({ report, translatedRoot }) => {
      const typedExpression = report.proofMatrix.find(
        ({ proof }) => proof === "typed-expression-z80-slice-proof.json",
      );
      expect(typedExpression?.status).toBe("blocked-by-contract-support");
      expect(typedExpression?.blockers).toEqual([]);
      const root = await readFile(
        path.join(translatedRoot, "vertical-slice", "typed-expression-z80-slice-proof.asm"),
        "utf8",
      );
      expect(root).toContain('%INCLUDE "typed-expression-z80-slice-code-begin.asmi"');
      expect(root).toContain('%INCLUDE "typed-expression-z80-slice-proof-body.asmi"');

      const proofBody = await readFile(
        path.join(translatedRoot, "vertical-slice", "typed-expression-z80-slice-proof-body.asmi"),
        "utf8",
      );
      expect(proofBody).toContain("TEPNWOF EQU");
      expect(proofBody).toContain("TEPDVOF EQU");
      expect(proofBody).not.toContain("TypedNarrowTrapPoint-TypedNarrowTrapSource");
      expect(proofBody).not.toContain("ScalarMetaConstant+ScalarTypeU8");

      const loopParser = await readFile(
        path.join(translatedRoot, "vertical-slice", "loop-parser.asm"),
        "utf8",
      );
      expect(loopParser).toContain('%INCLUDE "loop-parser-core.asmi"');
      expect(loopParser).toContain('%INCLUDE "typed-expression-parser.asm"');
      expect(loopParser).toContain('%INCLUDE "aggregate-parser.asm"');

      const outcome = await runProofManifest(
        path.join(proofRoot, "typed-expression-z80-slice-proof.json"),
        {
          assembler: {
            kind: "atom-permanent",
            root: translatedRoot,
            entry: "vertical-slice/typed-expression-z80-slice-proof.asm",
            maxInstructions: 700_000_000,
            maxCycles: 7_000_000_000,
          },
          atomMigration: {
            proofSymbolMap: report.proofSymbolMap,
            proofLimitMap: report.proofLimitMap,
          },
        },
      );

      expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
      expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    });
  }, 60_000);

  it("runs the Stage 7 LL(1) engine proof from permanent Atom layout source", async (context) => {
    await withPermanentAtomTranslation(context, async ({ report, translatedRoot }) => {
      const stage7 = report.proofMatrix.find(
        ({ proof }) => proof === "stage7-ll1-engine-proof.json",
      );
      expect(stage7?.status).toBe("blocked-by-contract-support");
      expect(stage7?.blockers).toEqual([]);
      const root = await readFile(
        path.join(translatedRoot, "vertical-slice", "stage7-ll1-engine-proof.asm"),
        "utf8",
      );
      expect(root).toContain('%INCLUDE "stage7-ll1-parser.asm"');
      expect(root).toContain('%INCLUDE "../grammar/stage7-proof-actions.asmi"');
      const parser = await readFile(
        path.join(translatedRoot, "vertical-slice", "stage7-ll1-parser.asm"),
        "utf8",
      );
      expect(parser).toContain('%INCLUDE "../grammar/stage7-tables.asmi"');

      const outcome = await runProofManifest(
        path.join(proofRoot, "stage7-ll1-engine-proof.json"),
        {
          assembler: {
            kind: "atom-permanent",
            root: translatedRoot,
            entry: "vertical-slice/stage7-ll1-engine-proof.asm",
          },
          atomMigration: {
            proofSymbolMap: report.proofSymbolMap,
            proofLimitMap: report.proofLimitMap,
          },
        },
      );

      expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
      expect(outcome.extents).toEqual([
        { name: "ll1-engine-and-tables", bytes: 985 },
        { name: "ll1-engine", bytes: 230 },
        { name: "ll1-tables", bytes: 755 },
        { name: "ll1-workspace", bytes: 65 },
      ]);
    });
  }, 15_000);

  it("writes aggregate-call parser permanent source with Stage 7 header includes", async (context) => {
    await withPermanentAtomTranslation(context, async ({ report, translatedRoot }) => {
      const dependent = report.proofMatrix.find(
        ({ proof }) => proof === "stage7-ll1-aggregate-call-z80-slice-proof.json",
      );
      const aggregateCallBlockers = dependent?.blockers.filter(({ file }) =>
        file.includes("aggregate-call-parser.asm") ||
        file.includes("stage7-ll1-actions.asm") ||
        file.includes("aggregate-parser.asm") ||
        file.includes("aggregate-call-z80.asm") ||
        file.includes("loop-z80-sink.asm"),
      );
      expect(aggregateCallBlockers).toEqual([]);

      const root = await readFile(
        path.join(translatedRoot, "vertical-slice", "aggregate-call-parser.asm"),
        "utf8",
      );
      expect(root).toContain('%INCLUDE "aggregate-call-parser-core.asmi"');
      expect(root).toContain("%IF Stage7LL1");
      expect(root).toContain('%INCLUDE "stage7-ll1-parser.asm"');
      expect(root).toContain('%INCLUDE "stage7-ll1-actions.asm"');

      const core = await readFile(
        path.join(translatedRoot, "vertical-slice", "aggregate-call-parser-core.asmi"),
        "utf8",
      );
      expect(core).toContain("ACPTDBC EQU IX+");
      expect(core).toContain("ACPRLEN EQU");
      expect(core).not.toContain('%INCLUDE "stage7-ll1-parser.asm"');
      expect(core).not.toContain("IX+TRGTDSBC");

      const actions = await readFile(
        path.join(translatedRoot, "vertical-slice", "stage7-ll1-actions.asm"),
        "utf8",
      );
      expect(actions).toContain("H1RCFLG EQU");
      expect(actions).toContain("H1CFCOF EQU");
      expect(actions).not.toContain("SymbolRecordTypeFlag+SymbolAggregateFlag");

      const aggregateParser = await readFile(
        path.join(translatedRoot, "vertical-slice", "aggregate-parser.asm"),
        "utf8",
      );
      expect(aggregateParser).toContain("AGPRFLG EQU");
      expect(aggregateParser).not.toContain("SymbolRecordTypeFlag+SymbolAggregateFlag");

      const aggregateCallZ80 = await readFile(
        path.join(translatedRoot, "vertical-slice", "aggregate-call-z80.asm"),
        "utf8",
      );
      expect(aggregateCallZ80).toContain("ACZTOFF EQU");
      expect(aggregateCallZ80).not.toContain("TrapOffset-StateBase");

      const loopZ80Sink = await readFile(
        path.join(translatedRoot, "vertical-slice", "loop-z80-sink.asm"),
        "utf8",
      );
      expect(loopZ80Sink).toContain("LZBKRO EQU");
      expect(loopZ80Sink).toContain("LZIXB1 EQU IX+");
      expect(loopZ80Sink).toContain("LZTNUM EQU");
      expect(loopZ80Sink).not.toContain("GeneratedRoDataBase-GeneratedBase");
      expect(loopZ80Sink).not.toContain("IX+SegmentEntryBase");
      expect(loopZ80Sink).not.toContain("TrapNumber-StateBase");

      const expressionBlockers = dependent?.blockers.filter(({ code, file }) =>
        (code === "atom-symbol-expression" || code === "include-after-header") &&
        (
          file.includes("typed-expression-parser.asm") ||
          file.includes("typed-expression-z80.asm") ||
          file.includes("loop-keywords.asmi")
        ),
      );
      expect(expressionBlockers).toEqual([]);

      const typedExpressionParser = await readFile(
        path.join(translatedRoot, "vertical-slice", "typed-expression-parser.asm"),
        "utf8",
      );
      expect(typedExpressionParser).toContain('%INCLUDE "typed-expression-parser-core.asmi"');
      expect(typedExpressionParser).toContain('%INCLUDE "structured-control-parser.asm"');
      const typedExpressionParserCore = await readFile(
        path.join(translatedRoot, "vertical-slice", "typed-expression-parser-core.asmi"),
        "utf8",
      );
      expect(typedExpressionParserCore).toContain("TEPRFLG EQU");
      expect(typedExpressionParserCore).toContain("TEPOR16 EQU");
      expect(typedExpressionParserCore).not.toContain('%INCLUDE "structured-control-parser.asm"');
      expect(typedExpressionParserCore).not.toContain("SymbolRecordTypeFlag+SymbolAggregateFlag");
      expect(typedExpressionParserCore).not.toContain("SemanticOr8*$100+SemanticOr16");
      expect(typedExpressionParserCore).not.toContain("ScalarMetaConstant+ScalarTypeU8");

      const typedExpressionZ80 = await readFile(
        path.join(translatedRoot, "vertical-slice", "typed-expression-z80.asm"),
        "utf8",
      );
      expect(typedExpressionZ80).toContain('%INCLUDE "typed-expression-z80-core.asmi"');
      expect(typedExpressionZ80).toContain('%INCLUDE "structured-control-z80.asm"');
      expect(typedExpressionZ80).toContain('%INCLUDE "aggregate-call-z80.asm"');
      expect(typedExpressionZ80).toContain('%INCLUDE "typed-expression-z80-tail.asmi"');
      const typedExpressionZ80Core = await readFile(
        path.join(translatedRoot, "vertical-slice", "typed-expression-z80-core.asmi"),
        "utf8",
      );
      expect(typedExpressionZ80Core).toContain("TEZACTD EQU");
      expect(typedExpressionZ80Core).not.toContain('%INCLUDE "structured-control-z80.asm"');
      expect(typedExpressionZ80Core).not.toContain("ActivationDepth-StateBase");
      expect(typedExpressionZ80Core).not.toContain("RootSP-StateBase");
      const typedExpressionZ80Tail = await readFile(
        path.join(translatedRoot, "vertical-slice", "typed-expression-z80-tail.asmi"),
        "utf8",
      );
      expect(typedExpressionZ80Tail).toContain(";@NUC-GLOBAL TypedAtoHL");

      const loopKeywords = await readFile(
        path.join(translatedRoot, "vertical-slice", "loop-keywords.asmi"),
        "utf8",
      );
      expect(loopKeywords).toContain("LKSRU8 EQU");
      expect(loopKeywords).not.toContain("Stage8CallableServiceFlag+Stage8ServiceResultU8");
    });
  });

  it("runs a late-include proof through the proof harness using Atom-preview lowering", async () => {
    const report = scanAssembly({ asmRoot, proofRoot });
    const outcome = await runProofManifest(
      path.join(proofRoot, "compiler-slice-proof.json"),
      {
        assembler: {
          kind: "atom-preview",
          asmRoot,
          proofRoot,
          entry: "vertical-slice/compiler-slice-proof.asm",
        },
        atomMigration: {
          proofSymbolMap: report.proofSymbolMap,
          proofLimitMap: report.proofLimitMap,
        },
      },
    );

    expect(outcome.memory[outcome.symbols.ProofStatus ?? -1]).toBe(0xa5);
    expect(outcome.memory[outcome.symbols.ProofCase ?? -1]).toBe(0);
    expect(outcome.extents).toEqual([
      { name: "compiler-code", bytes: 940 },
      { name: "compiler-immutable", bytes: 38 },
      { name: "compiler-core", bytes: 978 },
      { name: "compiler-workspace", bytes: 55 },
      { name: "proof-code-and-data", bytes: 191 },
    ]);
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
