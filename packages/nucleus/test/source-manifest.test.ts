import { describe, expect, it } from "vitest";

import {
  buildSourceParts,
  parseSourceManifest,
} from "../src/source-manifest.js";

describe("the flat ordered source manifest", () => {
  it("preserves written order and gives duplicate names distinct identities", () => {
    const parts = buildSourceParts("model.nu\n\nmain.nu\nmodel.nu\n", (name) =>
      new TextEncoder().encode(name),
    );

    expect(parts.map(({ diagnosticName }) => diagnosticName)).toEqual([
      "model.nu",
      "main.nu",
      "model.nu",
    ]);
    expect(parts.map(({ stableIdentity }) => stableIdentity)).toEqual([
      "1:model.nu",
      "2:main.nu",
      "3:model.nu",
    ]);
  });

  it("accepts CRLF manifest lines and rejects a lone carriage return", () => {
    expect(parseSourceManifest("model.nu\r\n\r\nmain.nu\r\n")).toEqual([
      "model.nu",
      "main.nu",
    ]);
    expect(() => parseSourceManifest("model.nu\rmain.nu\n")).toThrow(
      "lone carriage return",
    );
  });
});
