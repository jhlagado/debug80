# CP/M 2.2 platform

Select `cpm22` to boot Debug80's ideal CP/M 2.2 computer. The bundled disk
contains the real CP/M 2.2 CCP and BDOS, a Debug80 BIOS, `README.TXT`, and the
`SMOKE.COM` acceptance program.

The platform opens an 80-by-24 terminal. Commands are entered at the `A>`
prompt. A normal first check is:

```text
DIR
TYPE README.TXT
SMOKE
TYPE RESULT.TXT
```

The default disk is writable for the life of the debug session. Set
`cpm22.writable` to `false` for a write-protected session, or set
`cpm22.diskImage` to a workspace-relative IBM 3740 image containing exactly
256,256 bytes.

The guest BIOS source and debug map are bundled. Breakpoints such as
`ConsoleOutput` therefore stop in the Z80 BIOS, while the TypeScript runtime
remains below the guest at the terminal and sector-device boundary.
