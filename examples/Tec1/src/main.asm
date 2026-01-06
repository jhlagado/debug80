        ORG     0x0800

PORTSCAN:   EQU     0x01
SERIALMASK: EQU     0x40     ; bit 6 on PORTSCAN
BAUD:       EQU     0x000B   ; 9600 baud at 4 MHz (from MINT bitbang constants)

START:  LD      A,SERIALMASK ; idle high
        OUT     (PORTSCAN),A

        LD      HL,MSG
SEND:   LD      A,(HL)
        OR      A
        JR      Z,DONE
        CALL    SEND_BYTE
        INC     HL
        JR      SEND

DONE:   JP      DONE

; Bit-banged 8N2 TX at 9600 baud when TEC-1 fast mode is 4 MHz.
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
