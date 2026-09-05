import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const manifests = {
  root: JSON.parse(await read("package.json")),
  debug80: JSON.parse(await read("apps/debug80-vscode/package.json")),
};

function commandsFor(script, workspace = "root", seen = new Set()) {
  const key = `${workspace}:${script}`;
  if (seen.has(key)) return [];
  seen.add(key);
  assert.ok(
    manifests[workspace],
    `default path reaches historical workspace ${workspace}`,
  );
  const command = manifests[workspace].scripts[script];
  assert.equal(typeof command, "string", `missing ${key}`);
  const commands = [{ key, command }];
  for (const lifecycle of [`pre${script}`, `post${script}`]) {
    if (manifests[workspace].scripts[lifecycle]) {
      commands.push(...commandsFor(lifecycle, workspace, seen));
    }
  }
  for (const invocation of command.matchAll(
    /npm (?:run ([\w:.-]+)|(test))\b(?: -w ([@\w/.-]+))?/g,
  )) {
    commands.push(
      ...commandsFor(
        invocation[1] ?? invocation[2],
        invocation[3] ?? workspace,
        seen,
      ),
    );
  }
  return commands;
}

test("default consumer commands do not invoke historical workspaces or assembly comparisons", () => {
  for (const script of [
    "build",
    "typecheck",
    "lint",
    "format:check",
    "test",
    "check",
    "package:debug80",
    "build:cpm22",
    "import:cpm22-nucleus",
  ]) {
    for (const { key, command } of commandsFor(script)) {
      assert.doesNotMatch(
        command,
        /--workspaces|@jhlagado\/azm|cpm22\/check-atom-assembly-candidates\.mjs|historical/,
        key,
      );
    }
  }
});

test("the shipping extension has no mandatory AZM dependency", () => {
  assert.equal(manifests.debug80.dependencies["@jhlagado/azm"], undefined);
  assert.ok(manifests.debug80.dependencies["atom-z80"]);
  assert.ok(manifests.debug80.dependencies["@jhlagado/nucleus"]);
});

test("real historical compiler tests remain available only in the explicit suite", async () => {
  const ordinary = await read("apps/debug80-vscode/vitest.config.ts");
  const historical = await read(
    "apps/debug80-vscode/vitest.historical.config.ts",
  );
  assert.match(ordinary, /exclude:[\s\S]*tests\/debug\/azm-contract\.test\.ts/);
  assert.match(
    historical,
    /include: \['tests\/debug\/azm-contract\.test\.ts'\]/,
  );
  assert.match(
    manifests.debug80.scripts["test:historical"],
    /vitest\.historical\.config\.ts/,
  );
  assert.match(
    manifests.root.scripts["check:historical"],
    /check:cpm22-atom-candidates/,
  );
});

test("extension CI uses consumer checks and leaves historical jobs opt-in", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  const extension = workflow
    .split("\n  extension:\n")[1]
    ?.split("\n  # Single required status")[0];
  assert.ok(extension);
  assert.doesNotMatch(
    extension,
    /npm run build -w @jhlagado\/azm|check:cpm22-atom-candidates/,
  );
  assert.match(extension, /npm run check:consumer-paths/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /inputs\.historical/);
});
