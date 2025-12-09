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
        CP      0x0D            ; ignore CR
        JR      Z,tg_loop
        CP      0x0A
        JR      Z,tg_done
        LD      (HL),A
        INC     HL
        DJNZ    tg_loop
tg_done:
        LD      (HL),0
        RET

; ANSI clear + home
clear_seq:
        .db     ESC,"[2J",ESC,"[H",0
