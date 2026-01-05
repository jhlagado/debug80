        ORG     0x0800

PORTDIGIT: EQU     0x01
PORTSEGS:  EQU     0x02

LOOP:   LD      A,0x01       ; rightmost digit
        OUT     (PORTDIGIT),A
        LD      A,0xEB       ; "0" from HEXSEGTBL
        OUT     (PORTSEGS),A
        JP      LOOP
