; CheckCollAtDe —
; Test candidate piece placement at (D, E).
; Checks X bounds against XMin and CurPieceRight.
; Checks each occupied piece row against BoardRows
; using the MSB-left column convention.
; Carry set means collision or out-of-bounds; carry
; clear means the placement is legal.
; BC, DE, and HL are preserved.
;!      in        DE
;!      out       carry,zero
;!      clobbers  A
TX_CHCKC:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      A,D
        CP      XMin
        JR      C,TX_CLLXB
        LD      C,A
        LD      A,(TW_CRPCR)
        ADD     A,C
        CP      RowCount
        JR      NC,TX_CLLXB
        LD      A,D
        LD      (TW_SHFTC),A
        LD      A,E
        LD      L,A
        LD      H,0
        LD      B,4
        LD      DE,(TW_CRPCP)
        ; Empty-board fast path removed:
        ; CheckCollRow handles it correctly
        ; (BoardRows=0 -> AND yields 0 -> no
        ; overlap), at the cost of ~12 cycles
        ; per collision on an empty board (only at
        ; first spawn after reset).
TX_CHCK0:
        LD      A,(DE)
        CALL    TG_SHFT1
        LD      C,A
        OR      A
        JR      Z,TX_CLLNX
        BIT     7,L
        JR      NZ,TX_CLLNX
        LD      A,L
        CP      RowCount
        JR      NC,TX_CLLRW
        PUSH    HL
        PUSH    DE
        LD      H,0
        LD      DE,TW_BRDRW
        ADD     HL,DE
        LD      A,(HL)
        AND     C
        POP     DE
        POP     HL
        JR      NZ,TX_CLLR0
TX_CLLNX:
        INC     DE
        INC     HL
        DJNZ    TX_CHCK0
        OR      A
        JR      TX_CLLXT

TX_CLLXB:
        SCF
        JR      TX_CLLXT

TX_CLLRW:
        SCF
        JR      TX_CLLXT

TX_CLLR0:
        SCF
TX_CLLXT:
        POP     HL
        POP     DE
        POP     BC
        RET

; CheckTopOut —
; Detect an above-field lock that causes game-over.
; Scans the active piece's 4 rows; if any occupied
; row has bit 7 set in L (Y is negative, meaning
; the row is above the visible playfield), carry
; is set. Carry clear means the piece is in-bounds.
;!      out       carry,zero
;!      clobbers  A
TX_CHCKT:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      A,(PlayerY)
        LD      L,A
        LD      H,0
        LD      DE,(TW_CRPCP)
        LD      B,4
TX_TPTRW:
        LD      A,(DE)
        OR      A
        JR      Z,TX_TPTNX
        BIT     7,L
        JR      NZ,TX_TPTTR
TX_TPTNX:
        INC     DE
        INC     HL
        DJNZ    TX_TPTRW
        OR      A
        JR      TX_TPTXT
TX_TPTTR:
        SCF
TX_TPTXT:
        POP     HL
        POP     DE
        POP     BC
        RET
