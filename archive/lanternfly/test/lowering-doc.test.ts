import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { documentFrom } from "../src/bootstrap/index.js";

/**
 * The lowering document against the manifest.
 *
 * Review finding 28: the document was a third independent copy of the
 * sequences. Its tables are now generated between markers. Run
 * `npm run generate:lowering` after changing the manifest.
 */

const DOCUMENT = "docs/level0-lowering.md";

describe("the lowering document", () => {
  it("has tables generated from the manifest", () => {
    const rendered = documentFrom(DOCUMENT);

    if (process.env.UPDATE_LOWERING === "1") {
      writeFileSync(DOCUMENT, rendered, "utf8");
      console.log(`wrote ${DOCUMENT}`);
      return;
    }
    expect(readFileSync(DOCUMENT, "utf8")).toBe(rendered);
  });
});
