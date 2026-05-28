; MON-2 ROM wrapper.
; Includes the binary image for ROM rebuild tooling.
; The original disassembly is preserved in mon-2.disasm.asm.
        ORG     0x0000
        INCBIN  "mon-2.bin"
