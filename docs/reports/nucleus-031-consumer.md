# Nucleus 0.3.1 consumer qualification

Date: 2026-09-05

Debug80's Node compiler dependency and bundled CP/M `NUC.COM` now use
[Nucleus 0.3.1](https://github.com/jhlagado/nucleus/releases/tag/nucleus-v0.3.1),
source revision `b5276a85fd36600a10dbd65039f0af3afc033f0d`.
This report covers the Nucleus and Tool Services updates from Debug80 baseline
`7481f14403265a58ece0648412212a3e0ca58283`.

## Release inputs and disk contents

The existing validated importer copied the published artifact and raw manifest.
Both provenance formats used by Debug80 were updated. The importer still checks
all input bytes and provenance before writing destination files.

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `NUC.COM` | 21,271 | `1c047ac1ed5ff1c4e914321b66476b842a1b28cc0dfef4cfdb86f691ca037334` |
| `NUC.manifest.json` | 466 | `ea2555944622b59b45bc89c9aec63e0575eb9ae6d4a1e9c9430942d905132388` |
| Bundled CP/M disk | 256,256 | `bbe9b6fd233fcb2c4557653c4e369c01ff5d2ba69e41195b3b48d554cbd2eb30` |

The compiler loads and starts at `0x0100`; its exclusive end is `0x5417`.
Two independent read-only reviewers compared the vendored bytes with the
downloaded public release. They also checked that the new disk contains those
exact compiler bytes followed by 105 bytes of CP/M `0x1a` record padding.
All eleven other disk files and the system tracks are unchanged. One reviewer
reconstructed the new disk from the baseline by replacing only `NUC.COM` and
obtained an exact byte match.

Only the tracked bundled disk was rebuilt. Existing user disks and Triptych's
hosted release were not changed.

## Executed checks

- `npm run check`: passed, including 44 consumer/importer checks, 1,001 extension
  tests and 293 webview tests. Two pre-existing tests remained skipped.
- The focused installed Nucleus backend suite: 9 tests passed.
- ATOM CP/M candidate generation: only the Nucleus and disk digests changed.
- CP/M acceptance: passed ATOM assembly, NUC compilation and execution,
  rejection with existing output and temporary files preserved, editor
  save/discard/create, and warm boot.
- `npm run package -w debug80` and `npm run package:verify -w debug80`: passed;
  77 packaged entries were checked.
- `npm run test:installed-vsix -w debug80`: passed in VS Code 1.134.0 on macOS
  using private extension, profile and workspace directories.
- Both independent reviews returned no findings; neither reviewer repeated the
  full guest acceptance run. The implementation agent ran that check, and the
  lead ran the full project and installed-extension checks.

The measured CP/M compiler run changed from 302,168 instructions / 4,824,736
T-states to 302,181 / 4,824,865. These are emulator counters, not ESP32 timing
measurements. Generated-program and rejection-path counters did not change.

No AZM assembler was executed. The default checks include a read-only inventory
of historical compatibility paths; those paths remain outside the shipping
assembly toolchain. ATOM remains pinned to
`802b5c2d320bec777f427755ff2d7338e3b80a05`.

## Final combined dependency checks

The root and extension now pin
[Tool Services 0.2.0](https://github.com/jhlagado/z80-tool-services/releases/tag/z80-tool-services-v0.2.0)
at `853820c3008d6ab26f709c6bb05a6a7193072c60`. Its host interfaces are unchanged;
its active native NOBJ proofs now use canonical ATOM source. The unchanged ATOM
package still requires a nested Tool Services 0.1.0 at its existing immutable
pin. That transitive dependency was retained deliberately.

After a fresh `npm ci`, the lead reran `npm run check`, `npm run test:cpm22`,
`npm run package:debug80`, `npm run test:installed-vsix -w debug80`, and
`npm run test:vscode -w debug80` against the final pins. All passed. The source
size gate also passed, with existing warnings for unrelated files.
Two further independent reviewers checked the combined lock and shipping
boundaries and returned no findings. Glimmer and the AZM compiler remain
outside the shipping subset.

The development-extension test initially failed before loading the suite:
its checkout-relative profile exceeded macOS's 103-character socket-path
limit. The runner now creates a short private profile, private extension
directory, and copied fixture. It requires a completion marker written only
after both project and CP/M pipeline assertions finish. Failed runs retain
their logs; successful runs remove their own temporary directory. Both the
implementation agent and lead verified the repaired development test.

Installation reported 22 dependency audit advisories. This integration did not
apply automatic dependency upgrades; security-advisory triage remains separate
from the functional and assembly-toolchain qualification recorded here.
