import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { importNucleusRelease } from "./import-nucleus.mjs";
import {
  nucleusProvenance,
  readVerifiedNucleusRelease,
} from "./nucleus-release.mjs";

const root = resolve(import.meta.dirname, "../..");
async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), "debug80-nucleus-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "source");
  const destination = join(temporary, "third_party/nucleus");
  await mkdir(source);
  for (const name of [
    "NUC.COM",
    "NUC.manifest.json",
    "release.provenance.json",
  ]) {
    await writeFile(
      join(
        source,
        name === "release.provenance.json" ? "PROVENANCE.json" : name,
      ),
      await readFile(join(root, "third_party/nucleus", name)),
    );
  }
  return { temporary, source, destination };
}

test("imports the released bytes and preserves the legacy builder contract", async (t) => {
  const { temporary, source, destination } = await fixture(t);
  const provenance = await importNucleusRelease(source, destination);
  const bytes = await readVerifiedNucleusRelease(temporary);
  assert.equal(provenance.artifactBytes, 21271);
  assert.equal(provenance.commit, "b5276a85fd36600a10dbd65039f0af3afc033f0d");
  assert.deepEqual(bytes, await readFile(join(source, "NUC.COM")));
  assert.deepEqual(
    await readFile(join(destination, "NUC.manifest.json")),
    await readFile(join(source, "NUC.manifest.json")),
  );
});

test("Node and CP/M consumers pin the same qualified Nucleus release", async () => {
  const [extension, lock] = await Promise.all(
    ["apps/debug80-vscode/package.json", "package-lock.json"].map(async (name) =>
      JSON.parse(await readFile(join(root, name), "utf8")),
    ),
  );
  const dependency = `git+${nucleusProvenance.repository}#${nucleusProvenance.commit}`;
  assert.equal(extension.dependencies["@jhlagado/nucleus"], dependency);
  assert.equal(
    lock.packages["apps/debug80-vscode"].dependencies["@jhlagado/nucleus"],
    dependency,
  );
  const installed = lock.packages["node_modules/@jhlagado/nucleus"];
  assert.equal(installed.version, "0.3.1");
  assert.equal(
    installed.resolved,
    `git+ssh://git@github.com/jhlagado/nucleus.git#${nucleusProvenance.commit}`,
  );
});

for (const field of [
  "schema",
  "repository",
  "revision",
  "bytes",
  "sha256",
  "manifestSha256",
  "origin",
]) {
  for (const value of [undefined, "wrong"]) {
    test(`rejects provenance ${field}=${value} before touching destinations`, async (t) => {
      const { source, destination } = await fixture(t);
      await mkdir(destination, { recursive: true });
      const sentinel = join(destination, "NUC.COM");
      await writeFile(sentinel, "old file");
      const file = join(source, "PROVENANCE.json");
      const provenance = JSON.parse(await readFile(file, "utf8"));
      provenance[field] = value;
      await writeFile(file, JSON.stringify(provenance));
      await assert.rejects(
        importNucleusRelease(source, destination),
        /provenance/,
      );
      assert.equal(await readFile(sentinel, "utf8"), "old file");
    });
  }
}

for (const name of ["NUC.COM", "NUC.manifest.json", "PROVENANCE.json"]) {
  test(`rejects missing ${name}`, async (t) => {
    const { source, destination } = await fixture(t);
    await rm(join(source, name));
    await assert.rejects(importNucleusRelease(source, destination));
    await assert.rejects(readFile(join(destination, "NUC.COM")), {
      code: "ENOENT",
    });
  });
  test(`rejects tampered ${name}`, async (t) => {
    const { source, destination } = await fixture(t);
    const file = join(source, name);
    const bytes = await readFile(file);
    bytes[0] ^= 1;
    await writeFile(file, bytes);
    await assert.rejects(importNucleusRelease(source, destination));
  });
}

test("rejects altered legacy consumer provenance", async (t) => {
  const { temporary, source, destination } = await fixture(t);
  await importNucleusRelease(source, destination);
  await writeFile(join(destination, "PROVENANCE.json"), "{}");
  await assert.rejects(
    readVerifiedNucleusRelease(temporary),
    /consumer provenance/,
  );
});
