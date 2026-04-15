# Third-party notices

## MON3 (TEC-1G monitor ROM)

The Debug80 extension may ship **MON3** artifacts for TEC-1G under
`resources/bundles/tec1g/mon3/v1/` (`mon3.bin` release ROM, `mon3.lst` listing built from the
published BC25 source archive for debugging).

- **Upstream:** [MON3](https://github.com/tec1group/MON3) (license: see that repository’s `LICENSE`).
- **Use:** The bundled file is a convenience default; projects may replace `roms/tec1g/mon3/mon3.bin` and override `tec1g.romHex` in `debug80.json`.

When the bundled ROM is updated, update `bundle.json` (version fields and optional SHA-256) and this notice if the license terms change.
