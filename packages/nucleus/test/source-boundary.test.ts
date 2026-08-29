import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "..");
const scannedRoots = ["src", "test"] as const;
const allowedSourceManifestImporters = new Set([
  "src/index.ts",
  "src/source-manifest.ts",
  "test/source-manifest.test.ts",
]);

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesUnder(child));
    } else if (entry.isFile() && /\.[cm]?[tj]s$/.test(entry.name)) {
      files.push(child);
    }
  }
  return files.sort();
}

describe("Nucleus source boundary architecture", () => {
  it("keeps the flat source-manifest helper confined to compatibility code", async () => {
    const offenders: string[] = [];
    for (const root of scannedRoots) {
      for (const file of await filesUnder(path.join(packageRoot, root))) {
        const relative = path.relative(packageRoot, file);
        const text = await readFile(file, "utf8");
        const importsSourceManifest =
          /from\s+["'][^"']*source-manifest\.js["']/.test(text) ||
          /import\(["'][^"']*source-manifest\.js["']\)/.test(text);
        if (
          importsSourceManifest &&
          !allowedSourceManifestImporters.has(relative)
        ) {
          offenders.push(relative);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
