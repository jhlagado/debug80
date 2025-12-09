; Simple terminal IO helpers for debug80 terminal (tx/rx/status ports).
; Adjust ports here if needed.

TERM_TX_PORT    EQU 0
TERM_RX_PORT    EQU 1
TERM_STATUS     EQU 2    ; bit0 = RX available, bit1 = TX ready

; A -> transmit
term_putc:
        OUT     (TERM_TX_PORT),A
        RET

; HL -> zero-terminated string, prints until 0
term_puts:
        LD      A,(HL)
        OR      A
        RET     Z
        CALL    term_putc
        INC     HL
        JR      term_puts

; Blocking getc: waits until RX available, returns char in A
term_getc:
        IN      A,(TERM_STATUS)
        AND     1
        JR      Z,term_getc
        IN      A,(TERM_RX_PORT)
        RET

; gets: HL buffer, B = buffer length (including terminator)
; Reads until newline (0x0A) or buffer full-1, echoes as it reads,
; zero-terminates. Returns with A holding last read (newline).
term_gets:
        DEC     B               ; reserve space for terminator
        LD      A,B
        OR      A
        RET     Z               ; no room
tg_loop:
        CALL    term_getc
        CP      0x0A
        JR      Z,tg_done
        LD      (HL),A
        CALL    term_putc       ; echo
        INC     HL
        DJNZ    tg_loop
tg_done:
        LD      (HL),0
        RET
