; Sprite Chase support module — hand-written AZM, imported by
; sprite-chase.glim. Pattern data plus the one-time VRAM upload; the
; profile library (VdpSetAddrWrite, VdpWriteBlock) does the streaming.

; Sprite patterns: 0 = player (diamond), 1 = target (ring).
;! out HL,A; clobbers BC,F
PlayerPat:
        .db     %00011000
        .db     %00111100
        .db     %01111110
        .db     %11111111
        .db     %11111111
        .db     %01111110
        .db     %00111100
        .db     %00011000
TargetPat:
        .db     %00111100
        .db     %01000010
        .db     %10000001
        .db     %10000001
        .db     %10000001
        .db     %10000001
        .db     %01000010
        .db     %00111100

; Tile 1: the score pip.
PipPat:
        .db     %00000000
        .db     %00111100
        .db     %01111110
        .db     %01111110
        .db     %01111110
        .db     %01111110
        .db     %00111100
        .db     %00000000

; Upload sprite patterns 0..1 and tile 1. Call once, from an enter
; block, before the first frame that uses them.
;! clobbers A,BC,DE,HL,F
@LoadChaseVram:
        ld      hl,VRAM_SPRITE_PAT
        call    VdpSetAddrWrite
        ld      hl,PlayerPat
        ld      bc,16                ; player + target, contiguous
        call    VdpWriteBlock
        ld      hl,VRAM_PATTERN + 8  ; tile 1
        call    VdpSetAddrWrite
        ld      hl,PipPat
        ld      bc,8
        call    VdpWriteBlock
        ret
