import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { importNucleusRelease } from "./import-nucleus.mjs";
import { readVerifiedNucleusRelease } from "./nucleus-release.mjs";

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
  assert.equal(provenance.artifactBytes, 21281);
  assert.equal(provenance.commit, "52cca195d1b557ebfbbc3a6d924ca3d6ea657829");
  assert.deepEqual(bytes, await readFile(join(source, "NUC.COM")));
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
