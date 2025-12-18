        .include "constants.asm"
        .include "macros.asm"
        .include "system.asm"

        ; Main program start
        ORG     APPSTART
        .include "game.asm"

DONE_MSG: DEFB  "Done.",0x0A,0
        .include "strings.asm"
        .include "tables.asm"
        .include "variables.asm"
