# Intel-to-Zilog conversion record

Debug80 keeps the upstream CCP and BDOS text in Intel 8080 syntax. The build
uses `scripts/cpm22/convert-8080-to-z80.mjs` to translate that text into Zilog
syntax without selecting different instructions.

The initial conversion was checked independently with SjASMPlus 1.21. AZM and
SjASMPlus emitted identical bytes throughout AZM's initialized CCP and BDOS
ranges. SjASMPlus also emitted the upstream trailing `DS` workspace as zero
bytes, while AZM correctly left those uninitialized reservations out of its
binary artifact. Those trailing bytes are padding in the fixed CP/M system
layout and contain no code or immutable data.

The build freezes the emitted component hashes, not only the final disk hash:

| Component | Emitted bytes | SHA-256                                                            |
| --------- | ------------: | ------------------------------------------------------------------ |
| CCP       |         1,979 | `1930f9e276ea79c4e118b3a3fc2178ca0c02732f5073ff6763d8abe1d6cd391c` |
| BDOS      |         3,507 | `dc90159f3242453ef06f53c8467c0ba16dcfd0c75432cfa4697dbda5f8384f66` |

Any translator, assembler, BIOS, utility, debug-map, bootstrap, or disk-layout
change therefore fails `npm run build:cpm22` until its new bytes are reviewed
and the frozen hashes are deliberately updated.
