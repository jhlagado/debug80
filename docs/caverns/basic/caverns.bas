Directory structure:
└── jhlagado-caverns-z80/
    ├── api.asm
    ├── constants.asm
    ├── MAIN.asm
    ├── mycomputer.emu
    ├── ROM.z80
    ├── system.asm
    ├── test.fast.mac.asm
    └── test.FAST.z80


Files Content:

================================================
FILE: api.asm
================================================
; Board-agnostic TEC-1G service macros (short, readable prefix).
; Expects SVC_* constants to be defined in constants.asm.

.macro SYS_PUT        ; put char in A
        LD      C,SVC_PUTCHAR
        RST     $10
.endm

.macro SYS_GET        ; get char -> A
        LD      C,SVC_GETCHAR
        RST     $10
.endm

.macro SYS_PUTS       ; put zero-terminated string at HL
        LD      C,SVC_PUTSTR
        RST     $10
.endm

.macro SYS_CLR        ; clear display
        LD      C,SVC_CLEAR
        RST     $10
.endm



================================================
FILE: constants.asm
================================================
; TEC-1G layout and service codes
ROMSTART    EQU $0000          ; system layer 0x0000–0x07FF
APPSTART    EQU $0900          ; user program entry

STACK_TOP   EQU $FF00          ; set a comfortable stack high in RAM
INPUT_LEN   EQU 64             ; default line buffer length

; Service selector values (C) for RST 10H
SVC_PUTCHAR EQU $16            ; A = char
SVC_GETCHAR EQU $17            ; returns A = char
SVC_PUTSTR  EQU $2D            ; HL = 0-terminated string
SVC_CLEAR   EQU $0B            ; clear display

; ASCII helpers
CR          EQU $0D
LF          EQU $0A
ESC         EQU $1B

; 6850 ACIA (as in mycomputer.emu)
CONTROL     EQU $80            ; write
STATUS      EQU $80            ; read
TDR         EQU $81            ; write
RDR         EQU $81            ; read

DIV_64      EQU $02
F8N1        EQU $14            ; 8 data, no parity, 1 stop
MRESET      EQU $03



================================================
FILE: MAIN.asm
================================================
; APPLICATION BLOCK FOR TEC-1G (ECHO DEMO).
; LOADS AT APPSTART (0X0900) AND USES RST 10H SERVICES.

        .ORG APPSTART

; USES THE SERVICE MACROS FROM API.ASM

START:
        LD      SP,STACK_TOP
        SYS_CLR

        LD      HL,MSG_READY
        SYS_PUTS

MAIN_LOOP:
        LD      HL,PROMPT
        SYS_PUTS

        LD      HL,INPUT_BUF
        LD      B,INPUT_LEN-1
        CALL    READ_LINE

        LD      HL,MSG_ECHO
        SYS_PUTS
        LD      HL,INPUT_BUF
        SYS_PUTS
        CALL    CRLF
        JR      MAIN_LOOP

; READ_LINE: HL=BUFFER, B=MAXLEN (EXCLUDING TERMINATOR)
; BLOCKS ON INPUT, STOPS ON CR/LF, ZERO-TERMINATES.
READ_LINE:
        LD      E,0              ; COUNT
RL_NEXT:
        SYS_GET
        CP      CR
        JR      Z,RL_DONE
        CP      LF
        JR      Z,RL_NEXT
        LD      (HL),A
        INC     HL
        INC     E
        LD      A,E
        CP      B
        JR      NZ,RL_NEXT
RL_DONE:
        LD      (HL),0
        RET

CRLF:
        LD      A,CR
        SYS_PUT
        LD      A,LF
        SYS_PUT
        RET

; -------------------------------------------------------------------
; DATA
; -------------------------------------------------------------------

MSG_READY:  .DB "TEC-1G ECHO READY",CR,LF,0
PROMPT:     .DB "> ",0
MSG_ECHO:   .DB "YOU TYPED: ",0

INPUT_BUF:  DS INPUT_LEN



================================================
FILE: mycomputer.emu
================================================
cpu Z80

memory.rom.from 0x0000
memory.rom.to 0x7ff
memory.ram.from 0x800
memory.ram.to 0xffff

serial 6850
serial.data 0x81
serial.control 0x80

serial.interrupt 1

terminal.caps 0



================================================
FILE: ROM.z80
================================================
; Top-level include keeping the familiar structure.
.engine mycomputer

.include "constants.asm"
.include "system.asm"
.include "api.asm"

.include "MAIN.asm"



================================================
FILE: system.asm
================================================
; System layer for TEC-1G: RST 10H services backed by a 6850 ACIA.
; Address space 0x0000–0x07FF.

        .org ROMSTART

        JP  RESET

        ; Unused RST $08 placeholder (could be used later)
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
        CALL    acia_tx         ; A already holds the char
        RET

svc_getc:
        CALL    acia_rx         ; returns char in A
        RET

svc_puts:
        PUSH    BC              ; preserve caller's BC
        CALL    putstr_raw      ; HL points to 0-terminated string
        POP     BC
        RET

svc_clr:
        PUSH    BC
        LD      HL,clear_seq
        CALL    putstr_raw
        POP     BC
        RET

; -------------------------------------------------------------------
; Reset/init: set stack, init ACIA, jump to app at APPSTART.
; -------------------------------------------------------------------

RESET:
        LD      SP,STACK_TOP
        CALL    acia_init
        JP      APPSTART

; -------------------------------------------------------------------
; ACIA helpers
; -------------------------------------------------------------------

acia_init:
        LD      A,MRESET
        OUT     (CONTROL),A
        LD      A,F8N1+DIV_64
        OUT     (CONTROL),A
        RET

acia_tx:
        PUSH    AF
tx_wait:
        IN      A,(STATUS)
        BIT     1,A             ; TDRE
        JR      Z,tx_wait
        POP     AF
        OUT     (TDR),A
        RET

acia_rx:
rx_wait:
        IN      A,(STATUS)
        BIT     0,A             ; RDRF
        JR      Z,rx_wait
        IN      A,(RDR)
        RET

putstr_raw:
ps_loop:LD      A,(HL)
        OR      A
        RET     Z
        CALL    acia_tx
        INC     HL
        JR      ps_loop

; ANSI clear + home
clear_seq:
        .db     ESC,"[2J",ESC,"[H",0



================================================
FILE: test.fast.mac.asm
================================================
; Tiny test macros for the echo scaffold.

.macro expect_str,msg,buf,expected
        LD      HL,buf
        LD      DE,expected
1:      LD      A,(HL)
        LD      B,(DE)
        CP      B
        JR      NZ,2f
        OR      A
        JR      Z,3f
        INC     HL
        INC     DE
        JR      1b
2:      CALL    print_str
        .cstr   "\r\nFAIL: ",msg,0
        HALT
3:
.endm

.macro print,msg
        CALL    print_str
        .cstr   msg,0
        CALL    print_crlf
.endm



================================================
FILE: test.FAST.z80
================================================
; Minimal test entry: exercises the RST 10H services and halts.
.engine mycomputer

.include "constants.asm"
.include "system.asm"

        .org $2000

test_start:
        LD      SP,STACK_TOP

        ; Clear, then print a short message
        LD      C,SVC_CLEAR
        RST     $10

        LD      HL,msg
        LD      C,SVC_PUTSTR
        RST     $10

        HALT

msg:    .db "RST 10H services OK",CR,LF,0


