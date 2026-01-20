; JMON ROM (asm80 wrapper)
; Includes the binary image so the ROM can be rebuilt via asm80.
        ORG     0x0000
        INCBIN  "jmon.bin"
