        .include "constants.asm"
        .include "macros.asm"
        .include "system.asm"

        ; Main program start
        ORG     APPSTART

START:  LD      HL,MSG
        SYS_PUTS

READLOOP:
        LD      HL,BUF
        LD      B,32           ; buffer length including terminator
        CALL    term_gets
        LD      A,(BUF)        ; treat control/empty as termination
        CP      0x20
        JR      C,DONE         ; empty or control -> exit

        LD      HL,BUF
        CALL    term_puts
        LD      A,0x0A
        CALL    term_putc

        JR      READLOOP

DONE:   LD      HL,DONE_MSG
        CALL    term_puts
        HALT

MSG:    DEFB    "HELLO, DEBUG80!",0x0A,0
DONE_MSG: DEFB  "Done.",0x0A,0
BUF:    DS      32,0
