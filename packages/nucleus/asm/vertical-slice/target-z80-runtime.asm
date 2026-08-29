; Target-linked runtime wrapper. Service implementations and proof reset state
; live outside the selected target helper image and are reached through the
; writable vector table.

            .include "target-z80-runtime-config.asmi"
            .include "loop-z80-runtime.asm"
