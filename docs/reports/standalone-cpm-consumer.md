# Standalone CP/M component integration

2026-09-05. Debug80's CP/M builder uses ATOM and independently released guest
components. The Debug80 bootstrap, BIOS, smoke program and BIOS debug map retain
their previous bytes. No Triptych checkout is required by the builder or the
default Nucleus importer.

The selected inputs are ATOM `802b5c2d320bec777f427755ff2d7338e3b80a05`,
Nucleus `52cca195d1b557ebfbbc3a6d924ca3d6ea657829`,
Edit `2427501773e8d158d556631b8a4ba1cb972fcb4a`, and Portable CP/M
`579657f9177b31e1fccf0c05f72ba2ee76f3d052`. The Nucleus host package and
CP/M compiler have separate consumer checks; unchanged NUC.COM bytes do not
substitute for host API tests.

The generated 256,256-byte disk has SHA-256
`3621271b10f525e0eead562ca85d5099a7b76e68d509330dbb78f3e471d4615f`.
`build-image.mjs --candidate` measures without publishing. A normal build
validates every frozen output digest before writing any output. Filesystem
failure during the subsequent writes is not a multi-file atomic transaction.
Historical AZM comparisons remain explicit optional tools.

The full Debug80 check passed with 43 consumer/release checks, 1,001 extension
tests and 293 webview tests. Each of the latter suites has one existing skip.
The production-only npm audit reported no advisories; the full development
dependency graph reported 22 and requires separate assessment.

The CP/M acceptance replay passed its output, generated-code, file-preservation,
temporary/backup-file and bundled-disk checks. Ten whole-command instruction
and T-state measurements changed with the OS and application releases; the
old/new values remain visible in the acceptance-test diff. Some T-state counts
increased, so this change is not a general speed-improvement claim.

The old final stack assertion sampled BIOS output before return from BDOS.
The released BDOS initializes SP to `$F98C`; two nested CALL return addresses
give `$F988` at the final prompt output. The test now asserts that exact depth
and equality with the cold prompt sample. It does not label this point a
returned CCP frame.

Clean CI and installed-package acceptance remain required. These results are
host tests and do not qualify physical hardware.
