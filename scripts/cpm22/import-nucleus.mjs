import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileAzmStrictSidecar,
  symbolsFromDebugMap,
} from "./azm-strict-sidecar.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const nucleusRoot = resolve(
  process.env.NUCLEUS_ROOT ?? join(repositoryRoot, "..", "nucleus"),
);
const source = join(
  nucleusRoot,
  "asm",
  "vertical-slice",
  "cpm22-native-compiler.asm",
);
const destinationDirectory = join(repositoryRoot, "third_party", "nucleus");
const expectedCommit = "79016539569aaffe66334cf350f9b9100a5a8bb4";
const expectedSha256 =
  "7b3da3c0b595a88b4906537fe0f76c44f7abd412e248d35d927d1aefd8971ef1";

const commit = execFileSync("git", ["-C", nucleusRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(
  commit,
  expectedCommit,
  "Nucleus checkout is not the reviewed native CP/M revision",
);

const assembled = await compileAzmStrictSidecar({
  label: "native Nucleus CP/M compiler",
  source,
  registerContractsInterfaces: [
    join(nucleusRoot, "asm", "vertical-slice", "expression-generated-z80.asmi"),
    join(nucleusRoot, "asm", "vertical-slice", "cpm22-bdos-call.asmi"),
  ],
});

const symbols = new Map(
  Object.entries(symbolsFromDebugMap(assembled.debugMap)),
);
assert.equal(symbols.get("CpmCompilerTransientStart"), 0x0100);
assert.equal(symbols.get("CpmCompilerResidentEnd"), 0x5421);
assert.equal(
  assembled.bytes[0],
  0xc3,
  "NUC.COM must begin with the CP/M entry jump",
);

const sha256 = createHash("sha256").update(assembled.bytes).digest("hex");
assert.equal(
  sha256,
  expectedSha256,
  `native Nucleus artifact changed: sha256=${sha256} bytes=${assembled.bytes.length}`,
);

const provenance = {
  name: "Nucleus native CP/M 2.2 compiler transient",
  repository: "https://github.com/jhlagado/nucleus",
  commit,
  sourcePath: "asm/vertical-slice/cpm22-native-compiler.asm",
  license: "GPL-3.0-only",
  artifactSha256: sha256,
  artifactBytes: assembled.bytes.length,
};

await mkdir(destinationDirectory, { recursive: true });
await Promise.all([
  writeFile(join(destinationDirectory, "NUC.COM"), assembled.bytes),
  writeFile(
    join(destinationDirectory, "PROVENANCE.json"),
    `${JSON.stringify(provenance, undefined, 2)}\n`,
  ),
]);

console.log(JSON.stringify(provenance, undefined, 2));
