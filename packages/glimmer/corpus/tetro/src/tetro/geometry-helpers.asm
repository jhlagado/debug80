; LoadDePending —
; Load PendingX/Y into DE for collision probes.
;!      out       DE
;!      clobbers  A
TG_LDDPN:
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
TG_SHFT1:
        LD      C,A
        LD      A,(TW_SHFTC)
        OR      A
        JR      Z,TG_SHFTR
TG_SHFT0:
        SRL     C
        DEC     A
        JR      NZ,TG_SHFT0
TG_SHFTR:
        LD      A,C
        RET
