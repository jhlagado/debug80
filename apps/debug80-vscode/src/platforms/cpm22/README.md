# CP/M 2.2 platform

Select `cpm22` to boot Debug80's ideal CP/M 2.2 computer. The bundled disk
contains the real CP/M 2.2 CCP and BDOS, a Debug80 BIOS, `README.TXT`, the
`SMOKE.COM` acceptance program, and native Atom with small `INPUT.ASM` and
`HELLO.ASM` examples.
Building a CP/M target also writes the exact host `.com` artifact. Launching
installs it in the session's drive A without changing the bundled or configured
image file.

The platform opens an 80-by-24 terminal. Commands are entered at the `A>`
prompt. A normal first check is:

```text
DIR
MAIN
TYPE README.TXT
SMOKE
TYPE RESULT.TXT
ATOM
OUTPUT
ATOM HELLO.ASM MADE.COM
MADE
```

`ATOM` assembles the bundled `INPUT.ASM` through ordinary guest BDOS calls and
publishes `OUTPUT.COM`. `ATOM HELLO.ASM MADE.COM` demonstrates selected
current-drive CP/M 8.3 filenames. The native profile accepts either no
arguments or exactly two, requires a `.COM` output, and retains one source part
of at most 4,096 bytes and an 18,304-byte output image. The complete native
Atom source and measurements are linked from
`third_party/atom/README.md` in the Debug80 repository.

The default disk is writable for the life of the debug session. Set
`cpm22.writable` to `false` for a write-protected session, or set
`cpm22.diskImage` to a workspace-relative IBM 3740 image containing exactly
256,256 bytes. Host installation still occurs in a private image when the guest
disk is write-protected. `cpm22.programName` selects the user-0 8.3 `.COM`
filename; new projects use `MAIN.COM`.

Transient programs must start at `$0100` and fit completely below `$E400`.
Debug80 reports malformed media, directory exhaustion, allocation exhaustion,
an invalid program name, or a program outside that 58,112-byte area before the
debug runtime starts.

The guest BIOS source and debug map are bundled. Breakpoints such as
`ConsoleOutput` therefore stop in the Z80 BIOS, while the TypeScript runtime
remains below the guest at the terminal and sector-device boundary.
