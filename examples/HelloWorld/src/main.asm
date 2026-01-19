        ; HelloWorld example program (terminal UI).
        ; - Target platform: Simple (debug80 "simple")
        ; - Demonstrates source-level stepping, basic I/O, and readLn usage.
        ; - Uses the Simple platform terminal services via SYS_PUTS/readLn.
        .include "constants.asm"
        .include "macros.asm"
        .include "system.asm"
        .include "lib/readline.asm"
        .include "lib/ui.asm"
        .include "data/messages.asm"

        ; Main program start
        ORG     APPSTART

START:  CALL    printBanner

READLOOP:
        CALL    printPrompt
        LD      HL,BUF
        LD      B,32           ; buffer length including terminator
        CALL    readLn
        LD      A,(BUF)        ; treat control/empty as termination
        CP      0x20
        JR      C,DONE         ; empty or control -> exit

        JR      READLOOP

DONE:   LD      HL,DONE_MSG
        SYS_PUTS
        HALT

BUF:    DS      32,0
