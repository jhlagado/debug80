import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";

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
const expectedCommit = "da987afdd51ea723800a81702849518d96373f06";
const expectedSha256 =
  "bf4f7f4273b08afe54af08eb27f24ed819186e019c1e4b3cc268f1f24f1dad7f";

const commit = execFileSync("git", ["-C", nucleusRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(
  commit,
  expectedCommit,
  "Nucleus checkout is not the reviewed native CP/M revision",
);

const assembled = await compile(
  source,
  {
    emitBin: true,
    emitD8m: true,
    emitHex: false,
    emitLst: false,
    emitAsm80: false,
    registerContracts: "strict",
    registerContractsInterfaces: [
      join(
        nucleusRoot,
        "asm",
        "vertical-slice",
        "expression-generated-z80.asmi",
      ),
      join(nucleusRoot, "asm", "vertical-slice", "cpm22-bdos-call.asmi"),
    ],
  },
  { formats: defaultFormatWriters },
);
const errors = assembled.diagnostics.filter(
  (diagnostic) => diagnostic.severity === "error",
);
assert.deepEqual(
  errors,
  [],
  errors
    .map(
      (diagnostic) =>
        `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
    )
    .join("\n"),
);
const binary = assembled.artifacts.find((artifact) => artifact.kind === "bin");
const debugMap = assembled.artifacts.find(
  (artifact) => artifact.kind === "d8m",
);
assert.equal(binary?.kind, "bin", "AZM omitted the native Nucleus binary");
assert.equal(debugMap?.kind, "d8m", "AZM omitted the native Nucleus debug map");

const symbols = new Map(
  debugMap.json.symbols.flatMap((symbol) => {
    const value = symbol.address ?? symbol.value;
    return value === undefined ? [] : [[symbol.name, value]];
  }),
);
assert.equal(symbols.get("CpmCompilerTransientStart"), 0x0100);
assert.equal(symbols.get("CpmCompilerResidentEnd"), 0x530c);
assert.equal(
  binary.bytes[0],
  0xc3,
  "NUCLEUS.COM must begin with the CP/M entry jump",
);

const sha256 = createHash("sha256").update(binary.bytes).digest("hex");
assert.equal(
  sha256,
  expectedSha256,
  `native Nucleus artifact changed: sha256=${sha256} bytes=${binary.bytes.length}`,
);

const provenance = {
  name: "Nucleus native CP/M 2.2 compiler transient",
  repository: "https://github.com/jhlagado/nucleus",
  commit,
  sourcePath: "asm/vertical-slice/cpm22-native-compiler.asm",
  license: "GPL-3.0-only",
  artifactSha256: sha256,
  artifactBytes: binary.bytes.length,
};

await mkdir(destinationDirectory, { recursive: true });
await Promise.all([
  writeFile(join(destinationDirectory, "NUCLEUS.COM"), binary.bytes),
  writeFile(
    join(destinationDirectory, "PROVENANCE.json"),
    `${JSON.stringify(provenance, undefined, 2)}\n`,
  ),
]);

console.log(JSON.stringify(provenance, undefined, 2));
