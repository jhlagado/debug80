; System layer: RST 10H services and terminal helpers.
; ROM region 0x0000–0x07FF, jumps to APPSTART after init.

        .include "constants.asm"

        .org ROMSTART
        JP      RESET

        ; Unused RST $08 slot
        .org ROMSTART+$08
        RET

        ; RST $10 dispatches to a trampoline to leave vectors free
        .org ROMSTART+$10
        JP      SERVICE

; RST 38H handler (IM 1) for Ctrl-C
        .org $0038
RST38H:
        DI
        PUSH    AF
        PUSH    BC
        PUSH    DE
        PUSH    HL
        PUSH    IX
        PUSH    IY

        LD      HL,msg_ctrlc
        CALL    term_puts

        POP     IY
        POP     IX
        POP     HL
        POP     DE
        POP     BC
        POP     AF
        EI
        RETI

; -------------------------------------------------------------------
; Reset/init: set stack, jump to app at APPSTART.
; -------------------------------------------------------------------

        .org $0100
RESET:
        LD      SP,STACK_TOP
        IM      1
        EI
        JP      APPSTART

SERVICE:
        EX      AF,AF'          ; save callers AF
        LD      A,C             ; selector in A for compare
        CP      SVC_PUTCHAR
        JR      Z,svc_putc
        CP      SVC_GETCHAR
        JR      Z,svc_getc
        CP      SVC_PUTSTR
        JR      Z,svc_puts
        EX      AF,AF'          ; restore on unknown
        RET                     ; unknown service: no-op

svc_putc:
        EX      AF,AF'          ; restore original A
; A -> transmit
term_putc:
        OUT     (TERM_TX_PORT),A
        RET

svc_getc:
        EX      AF,AF'          ; restore original A
; Blocking getc: waits until RX available, returns char in A
term_getc:
        IN      A,(TERM_STATUS)
        AND     1
        JR      Z,term_getc
        IN      A,(TERM_RX_PORT)
        RET

svc_puts:
        EX      AF,AF'          ; restore original A
; HL -> zero-terminated string, prints until 0
term_puts:
        LD      A,(HL)
        OR      A
        RET     Z
        CALL    term_putc
        INC     HL
        JR      term_puts

svc_clr:
        EX      AF,AF'          ; restore original A
        PUSH    HL
        LD      HL,clear_seq
        CALL    term_puts
        POP     HL
        RET

; ANSI clear + home
clear_seq:
        .db     ESC,"[2J",ESC,"[H",0

msg_ctrlc:
        .db     "Ctrl-C pressed",0x0A,0
