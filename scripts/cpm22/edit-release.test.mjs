import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { readVerifiedEditRelease } from "./edit-release.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const names = ["EDIT.COM", "manifest.json", "PROVENANCE.json"];

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "debug80-edit-release-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const release = join(directory, "third_party", "edit");
  await mkdir(release, { recursive: true });
  for (const name of names) {
    await writeFile(
      join(release, name),
      await readFile(join(root, "third_party", "edit", name)),
    );
  }
  return { directory, release };
}

test("returns the exact published v0.1.1 bytes without changing release inputs", async (t) => {
  const { directory, release } = await fixture(t);
  const before = await Promise.all(
    names.map((name) => readFile(join(release, name))),
  );
  const bytes = await readVerifiedEditRelease(directory);
  assert.equal(bytes.length, 3107);
  assert.deepEqual(bytes, before[0]);
  assert.deepEqual(
    await Promise.all(names.map((name) => readFile(join(release, name)))),
    before,
  );
});

for (const name of names) {
  test(`rejects missing ${name}`, async (t) => {
    const { directory, release } = await fixture(t);
    await rm(join(release, name));
    await assert.rejects(readVerifiedEditRelease(directory));
  });
}

test("rejects a same-length artifact mutation", async (t) => {
  const { directory, release } = await fixture(t);
  const bytes = await readFile(join(release, "EDIT.COM"));
  bytes[100] ^= 1;
  await writeFile(join(release, "EDIT.COM"), bytes);
  await assert.rejects(readVerifiedEditRelease(directory), /pinned provenance/);
});

for (const field of [
  "format",
  "version",
  "loadAddress",
  "entryAddress",
  "assembler",
]) {
  test(`rejects modified manifest ${field}`, async (t) => {
    const { directory, release } = await fixture(t);
    const file = join(release, "manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    delete manifest[field];
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(readVerifiedEditRelease(directory), /pinned release/);
  });
}

for (const field of [
  "repository",
  "revision",
  "release",
  "artifact",
  "bytes",
  "sha256",
  "license",
]) {
  test(`rejects missing or mismatched provenance ${field}`, async (t) => {
    const { directory, release } = await fixture(t);
    const file = join(release, "PROVENANCE.json");
    const provenance = JSON.parse(await readFile(file, "utf8"));
    for (const replacement of [undefined, "wrong"]) {
      provenance[field] = replacement;
      await writeFile(file, JSON.stringify(provenance));
      await assert.rejects(
        readVerifiedEditRelease(directory),
        /pinned provenance/,
      );
    }
  });
}
