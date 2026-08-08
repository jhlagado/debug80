; Fixed comparison image for the first routine-call semantic stream. Direct
; Z80 remains primary; this retained template is consumed only by the host VM.

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NvmEncodeCallProgram:
            LD   HL,CallNvmImageTemplate
            LD   DE,GeneratedBase
            LD   BC,CallNvmImageSize
            LDIR
            LD   A,(SemanticBufferBase+3)
            LD   (GeneratedBase+CallNvmLiteralOffset),A
            LD   A,(SemanticBufferBase+9)
            LD   (GeneratedBase+CallNvmZeroOffset),A
            LD   A,(SemanticBufferBase+14)
            LD   (GeneratedBase+CallNvmStepOffset),A
            LD   HL,CallNvmImageSize
            LD   (GeneratedSize),HL
            OR   A
            RET

CallNvmImageTemplate:
            .db $4E,$56,$4D,$31,$00,$01,$00,$01
            .db $20,$00,$66,$00,$02,$00,$10,$80
            .db $20,$00,$30,$00,$02,$00,$32,$00
            .db $34,$00,$00,$00,$04,$00,$01,$00
            ; main: entry 0, end 23, no parameters, two slots, failable.
            .db $00,$00,$17,$00,$00,$02,$02,$00
            ; descend: entry 23, end 52, one parameter, three slots, result.
            .db $17,$00,$34,$00,$01,$03,$01,$00
            ; Empty initializer section.
            .db $00,$00
            ; main
            .db $01
CallNvmLiteralOffset    .equ $33
            .db $03,$01
            .db $04,$01,$00
            .db $50,$01
            .db $05,$00
            .db $04,$00,$00
            .db $51,$01
            .db $0B,$13,$00
            .db $52
            .db $06,$01
            .db $54,$01
            ; descend
            .db $01
CallNvmZeroOffset       .equ $4A
            .db $00,$01
            .db $28,$00,$01,$02
            .db $09,$02,$24,$00
            .db $53,$00
            .db $01
CallNvmStepOffset       .equ $57
            .db $01,$01
            .db $11,$00,$01,$02
            .db $04,$02,$00
            .db $50,$01
            .db $05,$02
            .db $53,$02
CallNvmImageTemplateEnd:
CallNvmImageSize        .equ CallNvmImageTemplateEnd-CallNvmImageTemplate
