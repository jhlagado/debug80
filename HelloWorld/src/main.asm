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
        CP      0x0A           ; term_gets leaves last char read in A (newline if empty)
        JR      Z,DONE         ; empty line -> exit

        LD      HL,BUF
        CALL    term_puts
        LD      A,0x0A
        CALL    term_putc

        JR      READLOOP

DONE:   HALT

MSG:    DEFB    "HELLO, DEBUG80!",0x0A,0
BUF:    DS      32,0
