        ORG     0x0800

PORTSCAN:   EQU     0x01
SERIALMASK: EQU     0x40     ; bit 6 on PORTSCAN

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

; Bit-banged 8N2 TX at ~300 baud when TEC-1 slow mode is 400 kHz.
; BIT_DELAY is tuned for ~1336 cycles including CALL/RET overhead.
SEND_BYTE:
        PUSH    AF
        XOR     A
        OUT     (PORTSCAN),A ; start bit (low)
        CALL    BIT_DELAY
        POP     AF
        LD      B,8
BIT_LOOP:
        RRCA
        LD      C,0x00
        JR      NC,BIT_ZERO
        LD      C,SERIALMASK
BIT_ZERO:
        OUT     (PORTSCAN),C
        CALL    BIT_DELAY
        DJNZ    BIT_LOOP

        LD      A,SERIALMASK ; stop bit 1
        OUT     (PORTSCAN),A
        CALL    BIT_DELAY
        OUT     (PORTSCAN),A ; stop bit 2
        CALL    BIT_DELAY
        RET

BIT_DELAY:
        LD      B,99
DELAY:  DJNZ    DELAY
        NOP
        NOP
        NOP
        NOP
        NOP
        RET

MSG:    DB      "TEC1 SERIAL OK",0x0D,0x0A,0
