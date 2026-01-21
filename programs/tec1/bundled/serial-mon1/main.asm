; TEC-1 example program (RAM @ 0x0800, MON-1 layout).
; - Target platform: TEC-1 (debug80 "tec1")
; - Demonstrates bit-banged 8N2 serial on PORTSCAN bit 6 at 9600 baud
;   when fast mode is 4 MHz (MINT-compatible timing).
; - Reads a CR-terminated line into a 64-byte buffer and echoes CR/LF.
; - Intended to be preloaded via platform ramInitHex.
; - For MON-2 (RAM @ 0x0900), change ORG accordingly.
        ORG     0x0800

KEYBUF:     EQU     0x00
PORTSCAN:   EQU     0x01
SERIALMASK: EQU     0x40     ; bit 6 on PORTSCAN
BAUD:       EQU     0x000B   ; 9600 baud at 4 MHz (from MINT bitbang constants)
BUF_LEN:    EQU     64

START:  LD      A,SERIALMASK ; idle high
        OUT     (PORTSCAN),A

        LD      HL,MSG
SEND:   LD      A,(HL)
        OR      A
        JR      Z,ECHO
        CALL    SEND_BYTE
        INC     HL
        JR      SEND

        LD      HL,BUF
        LD      C,0
ECHO:   CALL    RXCHAR
        CP      0x0D
        JR      Z,FLUSH
        LD      D,A
        LD      A,C
        CP      BUF_LEN
        JR      NC,ECHO
        LD      A,D
        LD      (HL),A
        INC     HL
        INC     C
        JR      ECHO

FLUSH:  LD      B,C
        LD      HL,BUF
SEND_BUF:
        LD      A,B
        OR      A
        JR      Z,SEND_CRLF
        LD      A,(HL)
        CALL    SEND_BYTE
        INC     HL
        DEC     B
        JR      SEND_BUF
SEND_CRLF:
        LD      A,0x0D
        CALL    SEND_BYTE
        LD      A,0x0A
        CALL    SEND_BYTE
        LD      HL,BUF
        LD      C,0
        JR      ECHO

; Bit-banged 8N2 TX/RX at 9600 baud when TEC-1 fast mode is 4 MHz.
; Timing matches the MINT bitbang routine.
SEND_BYTE:
        PUSH    AF
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      D,A
        LD      HL,BAUD
        XOR     A
        OUT     (PORTSCAN),A ; start bit (low)
        CALL    BITTIME
        LD      B,8
BIT_LOOP:
        RRC     D
        LD      A,0x00
        JR      NC,BIT_ZERO
        LD      A,SERIALMASK
BIT_ZERO:
        OUT     (PORTSCAN),A
        CALL    BITTIME
        DJNZ    BIT_LOOP

        LD      A,SERIALMASK ; stop bit 1
        OUT     (PORTSCAN),A
        CALL    BITTIME
        OUT     (PORTSCAN),A ; stop bit 2
        CALL    BITTIME
        POP     HL
        POP     DE
        POP     BC
        POP     AF
        RET

; Receive one byte from serial input on bit 7 of KEYBUF.
; Returns byte in A. Preserves BC/HL.
RXCHAR:
        PUSH    BC
        PUSH    HL
RXIDLE:
        IN      A,(KEYBUF)
        BIT     7,A
        JR      Z,RXIDLE

RXWAIT:
        IN      A,(KEYBUF)
        BIT     7,A
        JR      NZ,RXWAIT

        LD      HL,BAUD
        SRL     H
        RR      L
        CALL    BITTIME
        IN      A,(KEYBUF)
        BIT     7,A
        JR      NZ,RXIDLE

        LD      B,8
        LD      C,0
RXLOOP:
        LD      HL,BAUD
        CALL    BITTIME
        IN      A,(KEYBUF)
        RL      A
        RR      C
        DJNZ    RXLOOP
        LD      A,C
        OR      A
        POP     HL
        POP     BC
        RET

; Delay for one bit time, HL holds the baud constant.
; Preserves all registers (MINT-compatible).
BITTIME:
        PUSH    HL
        PUSH    DE
        LD      DE,0x0001
BITIME1:
        SBC     HL,DE
        JP      NC,BITIME1
        POP     DE
        POP     HL
        RET

MSG:    DB      "TEC1 SERIAL OK",0x0D,0x0A,0
BUF:    DS      64,0
