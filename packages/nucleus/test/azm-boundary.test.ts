import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = (name: string): Promise<string> =>
  readFile(path.join(import.meta.dirname, "..", "src", name), "utf8");

describe("Nucleus AZM compatibility boundary", () => {
  it("keeps legacy AZM runtime assembly off the default Atom runtime import path", async () => {
    const text = await source("nucleus-runtime.ts");

    expect(text).not.toMatch(
      /import\s+[^;]*\s+from\s+["']\.\/legacy-runtime-assembler\.js["']/,
    );
    expect(text).toMatch(/import\(\s*["']\.\/legacy-runtime-assembler\.js["']/);
  });

  it("keeps legacy AZM proof assembly off permanent Atom proof module loading", async () => {
    const text = await source("proof.ts");

    expect(text).not.toMatch(
      /import\s+[^;]*\s+from\s+["']\.\/legacy-proof-assembler\.js["']/,
    );
    expect(text).toMatch(/import\(\s*["']\.\/legacy-proof-assembler\.js["']/);
  });
});
