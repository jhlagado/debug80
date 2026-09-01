# Third-party notices

## MON3 (TEC-1G monitor ROM)

The Debug80 extension may ship **MON3** artifacts for TEC-1G under
`resources/bundles/tec1g/mon3/v1/` (`mon3.bin` release ROM, `mon3.d8.json` native source map,
and source files built from the published BC25 source archive for debugging).

- **Upstream:** [MON3](https://github.com/tec1group/TEC-1G/tree/main/ROMs/MON3) (license: see that repository’s `LICENSE`).
- **Use:** The bundled file is a convenience default; projects may replace `roms/tec1g/mon3/mon3.bin` and override `tec1g.romHex` in `debug80.json`.

When the bundled ROM is updated, update `bundle.json` (version fields and optional SHA-256) and this notice if the license terms change.

## CP/M 2.2 CCP and BDOS

The ideal CP/M platform's boot disk contains CCP and BDOS code derived from
[`brouhaha/cpm22`](https://github.com/brouhaha/cpm22) commit
`01018abbccce0bdf4874b0b2ed1a048c5fcc2987`. Debug80 mechanically translates
the upstream Intel 8080 mnemonics to Zilog syntax during its reproducible image
build.

The upstream terms and the component notice ship beside the disk as
`roms/cpm22/LICENSE.cpm22.txt` and `roms/cpm22/NOTICE.md`. These guest
components remain separately licensed and are not relabelled as Debug80 GPL
code.

## Native Nucleus compiler

The ideal CP/M platform disk contains `NUC.COM`, built from
[`jhlagado/nucleus`](https://github.com/jhlagado/nucleus) commit
`79016539569aaffe66334cf350f9b9100a5a8bb4` under GPL-3.0-only. The exact
source identity, artifact digest, and reproducible import instructions are in
`third_party/nucleus/`.
