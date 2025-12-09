; System layer: RST 10H services and terminal helpers.
; ROM region 0x0000–0x07FF, jumps to APPSTART after init.

        .include "constants.asm"

        .org ROMSTART
        JP      RESET

        ; Unused RST $08 slot
        .org ROMSTART+$08
        RET

        ; RST $10 dispatcher: C selects the service.
        .org ROMSTART+$10
RST10H:
        LD      A,C
        CP      SVC_PUTCHAR
        JR      Z,svc_putc
        CP      SVC_GETCHAR
        JR      Z,svc_getc
        CP      SVC_PUTSTR
        JR      Z,svc_puts
        CP      SVC_CLEAR
        JR      Z,svc_clr
        RET                     ; unknown service: no-op

svc_putc:
        JP      term_putc       ; A already holds the char

svc_getc:
        JP      term_getc       ; returns char in A

svc_puts:
        JP      term_puts       ; HL points to 0-terminated string

svc_clr:
        PUSH    HL
        LD      HL,clear_seq
        CALL    term_puts
        POP     HL
        RET

; -------------------------------------------------------------------
; Reset/init: set stack, jump to app at APPSTART.
; -------------------------------------------------------------------

RESET:
        LD      SP,STACK_TOP
        JP      APPSTART

; -------------------------------------------------------------------
; Terminal helpers on ports 0/1/2
; -------------------------------------------------------------------

        .org $0100
.include "termio.asm"

; ANSI clear + home
clear_seq:
        .db     ESC,"[2J",ESC,"[H",0
