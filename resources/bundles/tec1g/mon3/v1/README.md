# Bundled MON3 (TEC-1G)

This directory is packaged inside the Debug80 VSIX. `bundle.json` describes the
payload:

- **`mon3.bin`** — 16 KiB MON3 ROM (upstream release **BC25 / v1.6**, file `MON3-1G_BC25-16.bin`).
- **`mon3.lst`** — ASM80 listing built from **`MON3-1G_BC25-16_src.zip`** with the same
  release tag. It drives `tec1g.extraListings` after scaffold / materialize so the
  debugger can map addresses into monitor source.

**Third-party:** See `THIRD_PARTY_NOTICES.md` at the extension repository root.

## Maintainer sync

From a local [MON3](https://github.com/tec1group/MON3) checkout that contains both
`MON3-1G_BC25-16.bin` and `MON3-1G_BC25-16_src.zip`:

```bash
npm run bundle:sync-mon3
```

Requires **`unzip`** and **`asm80`** on your PATH (see [asm80-node](https://github.com/asm80/asm80-node)).
After running, if checksums changed, update the `sha256` fields in `bundle.json`:

```bash
shasum -a 256 resources/bundles/tec1g/mon3/v1/mon3.bin resources/bundles/tec1g/mon3/v1/mon3.lst
```

### Listing vs release ROM

The shipped **`mon3.bin`** is the **exact** upstream binary. The listing is produced by
assembling the published source archive; that rebuild can differ from the release
`.bin` by a very small number of bytes (typically near the end of the 16 KiB image).
Source-level mapping is still accurate for almost all addresses; treat any mismatch at
the last words of the image as cosmetic for debugging purposes.
