; MON-2 ROM (asm80 wrapper)
; Includes the binary image so the ROM can be rebuilt via asm80.
; The original disassembly is preserved in mon-2.disasm.asm.
        ORG     0x0000
        INCBIN  "mon-2.bin"
