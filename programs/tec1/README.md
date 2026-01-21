# TEC-1 Programs

Bundled and user programs for the TEC-1 program loader.

## Folder layout

```
programs/tec1/
  bundled/
    <program>/
      main.asm
      program.json
      README.md (optional)
  user/
    <program>/
      main.asm
      program.json (optional)
      README.md (optional)
```

## program.json (optional)

```json
{
  "name": "Serial Demo (MON-1)",
  "rom": "mon-1b",
  "org": 2048,
  "entry": 0,
  "description": "Bit-bang serial TX demo"
}
```

Fields:
- `name`: display name (defaults to folder name).
- `rom`: bundled ROM id (`mon-1b`, `mon-2`, `jmon`).
- `romHex`: explicit ROM path (absolute or relative to the program folder).
- `org`: load address (decimal or 0x-prefixed string).
- `entry`: override entry (defaults to 0).
- `description`: optional detail shown in the loader.

If `org` is omitted, Debug80 uses 0x0800 for MON-1B and 0x0900 for MON-2/JMON.

## ROM filtering

The program loader filters the list when the active TEC-1 debug session declares a ROM id.
Add `romId` under `tec1` in your `debug80.json` target to enable filtering (for example,
`"romId": "mon-1b"` or `"romId": "mon-2"`). Programs without a `rom` entry are always shown.
