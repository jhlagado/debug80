; Debug80 TMS9918 video test (TEC-1G)
; Origin    : 4000h
; VDP ports : data=$BE, control=$BF
;
; A broader Graphics I test. It loads a small tile set, writes several
; text rows, and draws two rows of patterned tiles with different colour groups.

VDP_DATA        .equ 0BEh
VDP_CONTROL     .equ 0BFh

VRAM_PATTERN    .equ 0000h
VRAM_NAME       .equ 0800h
VRAM_COLOR      .equ 2000h
VRAM_SPRITE_ATTR .equ 1B00h
VRAM_SPRITE_PAT .equ 3800h

        .org    04000h

Start:
        ld      sp,07fffh
        call    InitVdp
        call    LoadPatterns
        call    LoadColours
        call    ClearNameTable
        call    DrawTextRows
        call    DrawPatternRows

Forever:
        jr      Forever

InitVdp:
        ld      hl,VdpRegisters
        ld      b,8
        ld      c,0

InitVdpLoop:
        ld      a,(hl)
        out     (VDP_CONTROL),a
        ld      a,c
        or      080h
        out     (VDP_CONTROL),a
        inc     hl
        inc     c
        djnz    InitVdpLoop
        ret

LoadPatterns:
        ld      hl,VRAM_PATTERN
        call    SetWriteAddress
        ld      hl,TilePatterns
        ld      b,TilePatternsEnd - TilePatterns
        call    WriteDataBlock
        ret

LoadColours:
        ld      hl,VRAM_COLOR
        call    SetWriteAddress
        ld      hl,ColourTable
        ld      b,ColourTableEnd - ColourTable
        call    WriteDataBlock
        ret

ClearNameTable:
        ld      hl,VRAM_NAME
        ld      bc,0300h
        xor     a
        call    FillVram
        ret

DrawTextRows:
        ld      hl,VRAM_NAME + 0020h
        call    SetWriteAddress
        ld      hl,TitleRow
        ld      b,TitleRowEnd - TitleRow
        call    WriteDataBlock

        ld      hl,VRAM_NAME + 0060h
        call    SetWriteAddress
        ld      hl,TmsRow
        ld      b,TmsRowEnd - TmsRow
        call    WriteDataBlock

        ld      hl,VRAM_NAME + 00A0h
        call    SetWriteAddress
        ld      hl,VideoRow
        ld      b,VideoRowEnd - VideoRow
        call    WriteDataBlock
        ret

DrawPatternRows:
        ld      hl,VRAM_NAME + 0100h
        call    SetWriteAddress
        ld      hl,PatternRow
        ld      b,PatternRowEnd - PatternRow
        call    WriteDataBlock

        ld      hl,VRAM_NAME + 0120h
        call    SetWriteAddress
        ld      hl,PatternRow2
        ld      b,PatternRow2End - PatternRow2
        call    WriteDataBlock
        ret

WriteDataBlock:
        ld      a,(hl)
        out     (VDP_DATA),a
        inc     hl
        djnz    WriteDataBlock
        ret

FillVram:
        ld      e,a
        call    SetWriteAddress

FillVramLoop:
        ld      a,e
        out     (VDP_DATA),a
        dec     bc
        ld      a,b
        or      c
        jr      nz,FillVramLoop
        ret

SetWriteAddress:
        ld      a,l
        out     (VDP_CONTROL),a
        ld      a,h
        or      040h
        out     (VDP_CONTROL),a
        ret

; R0 = 00h  Graphics I
; R1 = C0h  display on, 16 KiB VRAM, 8x8 sprites
; R2 = 02h  name table @ 0800h
; R3 = 80h  color table @ 2000h
; R4 = 00h  pattern table @ 0000h
; R5 = 36h  sprite attribute table @ 1B00h
; R6 = 07h  sprite pattern table @ 3800h
; R7 = 04h  backdrop = dark blue
VdpRegisters:
        .db     000h,0C0h,002h,080h,000h,036h,007h,004h

; Tile ids used by the name table rows.
T_D             .equ 1
T_E             .equ 2
T_B             .equ 3
T_U             .equ 4
T_G             .equ 5
T_8             .equ 6
T_0             .equ 7
T_T             .equ 8
T_M             .equ 9
T_S             .equ 10
T_9             .equ 11
T_1             .equ 12
T_V             .equ 13
T_I             .equ 14
T_O             .equ 15

T_SOLID         .equ 16
T_CHECKER       .equ 17
T_VSTRIPE       .equ 18
T_DIAG          .equ 19
T_HSTRIPE       .equ 20
T_BOX           .equ 21
T_CROSS         .equ 22
T_DOT           .equ 23

TitleRow:
        .db     T_D,T_E,T_B,T_U,T_G,T_8,T_0
TitleRowEnd:

TmsRow:
        .db     T_T,T_M,T_S,T_9,T_9,T_1,T_8
TmsRowEnd:

VideoRow:
        .db     T_V,T_I,T_D,T_E,T_O,0,T_T,T_E,T_S,T_T
VideoRowEnd:

PatternRow:
        .db     T_SOLID,T_CHECKER,T_VSTRIPE,T_DIAG,T_HSTRIPE,T_BOX,T_CROSS,T_DOT
        .db     T_SOLID,T_CHECKER,T_VSTRIPE,T_DIAG,T_HSTRIPE,T_BOX,T_CROSS,T_DOT
        .db     T_SOLID,T_CHECKER,T_VSTRIPE,T_DIAG,T_HSTRIPE,T_BOX,T_CROSS,T_DOT
        .db     T_SOLID,T_CHECKER,T_VSTRIPE,T_DIAG,T_HSTRIPE,T_BOX,T_CROSS,T_DOT
PatternRowEnd:

PatternRow2:
        .db     T_DOT,T_CROSS,T_BOX,T_HSTRIPE,T_DIAG,T_VSTRIPE,T_CHECKER,T_SOLID
        .db     T_DOT,T_CROSS,T_BOX,T_HSTRIPE,T_DIAG,T_VSTRIPE,T_CHECKER,T_SOLID
        .db     T_DOT,T_CROSS,T_BOX,T_HSTRIPE,T_DIAG,T_VSTRIPE,T_CHECKER,T_SOLID
        .db     T_DOT,T_CROSS,T_BOX,T_HSTRIPE,T_DIAG,T_VSTRIPE,T_CHECKER,T_SOLID
PatternRow2End:

ColourTable:
        .db     0F4h,0C4h,081h,0A1h,0F1h,061h,0E1h,0D1h
        .db     0F4h,0C4h,081h,0A1h,0F1h,061h,0E1h,0D1h
        .db     0F4h,0C4h,081h,0A1h,0F1h,061h,0E1h,0D1h
        .db     0F4h,0C4h,081h,0A1h,0F1h,061h,0E1h,0D1h
ColourTableEnd:

; Tile 0 is blank. Tiles 1-15 are a compact debugging alphabet.
; Tiles 16-23 exercise colour table groups and repeated pattern rendering.
TilePatterns:
        .db     000h,000h,000h,000h,000h,000h,000h,000h ; 0 blank
        .db     07Ch,042h,042h,042h,042h,042h,07Ch,000h ; D
        .db     07Eh,040h,040h,07Ch,040h,040h,07Eh,000h ; E
        .db     07Ch,042h,042h,07Ch,042h,042h,07Ch,000h ; B
        .db     042h,042h,042h,042h,042h,042h,03Ch,000h ; U
        .db     03Ch,042h,040h,04Eh,042h,042h,03Ch,000h ; G
        .db     03Ch,042h,042h,03Ch,042h,042h,03Ch,000h ; 8
        .db     03Ch,046h,04Ah,052h,062h,042h,03Ch,000h ; 0
        .db     07Eh,018h,018h,018h,018h,018h,018h,000h ; T
        .db     042h,066h,05Ah,05Ah,042h,042h,042h,000h ; M
        .db     03Ch,040h,040h,03Ch,002h,002h,07Ch,000h ; S
        .db     03Ch,042h,042h,03Eh,002h,042h,03Ch,000h ; 9
        .db     018h,038h,018h,018h,018h,018h,03Ch,000h ; 1
        .db     042h,042h,042h,024h,024h,018h,018h,000h ; V
        .db     03Ch,018h,018h,018h,018h,018h,03Ch,000h ; I
        .db     03Ch,042h,042h,042h,042h,042h,03Ch,000h ; O
        .db     0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh,0FFh ; solid
        .db     0AAh,055h,0AAh,055h,0AAh,055h,0AAh,055h ; checker
        .db     0CCh,0CCh,0CCh,0CCh,0CCh,0CCh,0CCh,0CCh ; vertical
        .db     080h,040h,020h,010h,008h,004h,002h,001h ; diagonal
        .db     0FFh,000h,0FFh,000h,0FFh,000h,0FFh,000h ; horizontal
        .db     0FFh,081h,081h,081h,081h,081h,081h,0FFh ; box
        .db     081h,042h,024h,018h,018h,024h,042h,081h ; cross
        .db     000h,000h,018h,03Ch,03Ch,018h,000h,000h ; dot
TilePatternsEnd:
