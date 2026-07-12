# Bundled MON3 (TEC-1G)

This directory is packaged inside the Debug80 VSIX. `bundle.json` describes the
payload:

- **`mon3.bin`** — 16 KiB MON3 ROM (upstream release **BC25 / v1.6**, file `MON3-1G_BC25-16.bin`).
- **`mon3.d8.json`** — native Debug80 source map produced by AZM for ROM source debugging.
- **`*.z80`** — MON3 source files used by the D8 map for source-level navigation.

**Third-party:** See `THIRD_PARTY_NOTICES.md` at the extension repository root.

## Maintainer sync

From a local [MON3](https://github.com/tec1group/MON3) checkout that contains both
`MON3-1G_BC25-16.bin` and `MON3-1G_BC25-16_src.zip`:

```bash
npm run bundle:sync-mon3
```

Requires **`unzip`**. AZM is resolved from the Debug80 npm dependencies.
After running, if checksums changed, update the `sha256` fields in `bundle.json`:

```bash
shasum -a 256 resources/bundles/tec1g/mon3/v1/mon3.bin resources/bundles/tec1g/mon3/v1/mon3.d8.json
```
