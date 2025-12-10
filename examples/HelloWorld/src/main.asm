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
        CALL    readLn
        LD      A,(BUF)        ; treat control/empty as termination
        CP      0x20
        JR      C,DONE         ; empty or control -> exit

        LD      HL,BUF
        SYS_PUTS
        LD      A,0x0A
        SYS_PUTC
        JR      READLOOP

DONE:   LD      HL,DONE_MSG
        SYS_PUTS
        HALT

; readLn: HL buffer, B = buffer length (including terminator)
; Reads until newline (0x0A) or buffer full-1, echoes as it reads,
; zero-terminates. Returns with A holding last read (newline).
readLn:
        DEC     B               ; reserve space for terminator
        LD      A,B
        OR      A
        RET     Z               ; no room
rl_loop:
        ; CALL    term_getc
        SYS_GETC
        CP      0x0D            ; ignore CR
        JR      Z,rl_loop
        CP      0x0A
        JR      Z,rl_done
        LD      (HL),A
        INC     HL
        DJNZ    rl_loop
rl_done:
        LD      (HL),0
        RET

MSG:    DEFB    "HELLO, DEBUG80!",0x0A,0
DONE_MSG: DEFB  "Done.",0x0A,0
BUF:    DS      32,0
