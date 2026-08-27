; TEC-1G matrix ports
SC_PRTDG      EQU     $01
PortSegs        EQU     $02
SC_PRTL0     EQU     $04
PortRow         EQU     $05
PortRed         EQU     $06
SC_PRTLC     EQU     $84
SC_PRTGR       EQU     $F8
PortBlue        EQU     $F9

LcdRow1         EQU     $80
LcdRow2         EQU     $C0
LcdRow3         EQU     $94
LcdRow4         EQU     $D4

; MON-3 API / keypad constants
SC_APSCN     EQU     16
KeyLeft         EQU     $11
KeyRight        EQU     $10
SC_KYRTT       EQU     $12
SC_KYRT0    EQU     $13
SC_KYRT1     EQU     $0C
KeyDrop         EQU     $00
KeyPause        EQU     $00
NoKey           EQU     $FF

; Matrix / display constants. RowCount is the 8x8
; matrix dimension; the name
; is historical from Tetro's original single-game
; source layout.
RowCount        EQU     8
SC_BYTSP     EQU     4
SC_FRMBF  EQU  32
SC_SCNMS   EQU    $01
SC_CLRBL      EQU     $00
ColorRed        EQU     $01
SC_CLRGR      EQU     $02
SC_CLRB0       EQU     $04
SC_CLRYL     EQU     ColorRed + SC_CLRGR
SC_CLRCY       EQU     SC_CLRGR + SC_CLRB0
SC_CLRMG    EQU     ColorRed + SC_CLRB0
SC_CLRWH      EQU     ColorRed + SC_CLRGR + SC_CLRB0
SC_SPKRB      EQU     $80
