; TEC-1G matrix ports
PortDigits      .equ     0x01
PortSegs        .equ     0x02
PortLcdInst     .equ     0x04
PortRow         .equ     0x05
PortRed         .equ     0x06
PortLcdData     .equ     0x84
PortGreen       .equ     0xF8
PortBlue        .equ     0xF9

LcdRow1         .equ     0x80
LcdRow2         .equ     0xC0
LcdRow3         .equ     0x94
LcdRow4         .equ     0xD4

; MON-3 API / keypad constants
ApiScanKeys     .equ     16
KeyLeft         .equ     0x11
KeyRight        .equ     0x10
KeyRotate       .equ     0x12
KeyRotateCcw    .equ     0x13
KeyRotateCw     .equ     0x0C
KeyDrop         .equ     0x00
KeyPause        .equ     0x00
NoKey           .equ     0xFF

; Matrix / display constants. RowCount is the 8x8
; matrix dimension; the name
; is historical from Tetro's original single-game
; source layout.
RowCount        .equ     8
BytesPerRow     .equ     4
FramebufferBytes  .equ  32
ScanMaskStart   .equ    0x01
ColorBlack      .equ     0x00
ColorRed        .equ     0x01
ColorGreen      .equ     0x02
ColorBlue       .equ     0x04
ColorYellow     .equ     ColorRed + ColorGreen
ColorCyan       .equ     ColorGreen + ColorBlue
ColorMagenta    .equ     ColorRed + ColorBlue
ColorWhite      .equ     ColorRed + ColorGreen + ColorBlue
SpeakerBit      .equ     0x80
