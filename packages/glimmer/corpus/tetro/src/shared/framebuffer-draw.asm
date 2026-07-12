; MxMask —
; Produce a column bitmask for matrix column A and
; return the mask in A.
; Column 0 is bit 7 (MSB); column 7 is bit 0.
;!      in        A
;!      out       A
;!      clobbers  BC
@MxMask:
        LD      C,A
        OR      A
        LD      A,0x80
        JR      Z,MxMaskDone
        LD      B,C
MxMaskLp:
        SRL     A
        DJNZ    MxMaskLp
MxMaskDone:
        RET

; FbSetCell —
; Set or clear one column bit across the R/G/B
; plane bytes for a single row.
; HL points to the row's red plane byte. C is the
; column mask. Low bits of A select colour planes:
; selected planes OR in C; absent planes clear C with
; AND CPL(C).
;!      in        C,A,HL
;!      clobbers  A,B,D,HL
@FbSetCell:
        LD      B,A
        LD      A,C
        CPL
        LD      D,A
        LD      A,B
        AND     ColorRed
        JR      Z,FbRedOff
        LD      A,(HL)
        OR      C
        JR      FbRedSet
FbRedOff:
        LD      A,(HL)
        AND     D
FbRedSet:
        LD      (HL),A
        INC     HL
        LD      A,B
        AND     ColorGreen
        JR      Z,FbGrnOff
        LD      A,(HL)
        OR      C
        JR      FbGrnSet
FbGrnOff:
        LD      A,(HL)
        AND     D
FbGrnSet:
        LD      (HL),A
        INC     HL
        LD      A,B
        AND     ColorBlue
        JR      Z,FbBluOff
        LD      A,(HL)
        OR      C
        JR      FbBluSet
FbBluOff:
        LD      A,(HL)
        AND     D
FbBluSet:
        LD      (HL),A
        RET

; FbOrRow —
; OR column mask C into selected R/G/B planes.
; Low 3 bits of A select planes: bit 0 = red,
; bit 1 = green, bit 2 = blue (RRCA each iter).
; HL points to the row's red plane byte. The final
; plane pointer is returned in HL.
;!      in        A,HL,C
;!      out       HL,A
@FbOrRow:
        PUSH    BC
        LD      B,3                     ; 3 planes: R, G, B
FbOrLoop:
        RRCA                            ; low bit (red/green/blue per iter) -> carry
        JR      NC,FbOrSkip
        PUSH    AF
        LD      A,(HL)
        OR      C
        LD      (HL),A
        POP     AF
FbOrSkip:
        DEC     B
        JR      Z,FbOrExit
        INC     HL                      ; advance to next plane byte (between iters only)
        JR      FbOrLoop
FbOrExit:
        POP     BC
        RET
