; LoadDePending —
; Load PendingX/Y into DE for collision probes.
;!      out       DE
;!      clobbers  A
@LoadDePending:
        LD      A,(PendingX)
        LD      D,A
        LD      A,(PendingY)
        LD      E,A
        RET

; ShiftRowMask —
; Shift a piece-row bitmask A right by ShiftCount
; positions, placing the piece at column PlayerX.
; The MSB-left convention means SRL moves bits
; toward lower-numbered matrix columns.
;!      in        A
;!      out       A
;!      clobbers  C
@ShiftRowMask:
        LD      C,A
        LD      A,(ShiftCount)
        OR      A
        JR      Z,ShiftRowDone
ShiftRowLoop:
        SRL     C
        DEC     A
        JR      NZ,ShiftRowLoop
ShiftRowDone:
        LD      A,C
        RET
