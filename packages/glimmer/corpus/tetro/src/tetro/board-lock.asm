; LockActPiece —
; Commit the active piece to the landed board.
; Top-out check runs first: if any occupied row
; is above the visible field, merges the piece
; then branches to EnterGameOver.
; On a completed row: triggers clear sound,
; disables the active piece, and sets ClearPending
; and ClearTimer for the hold delay.
; On no clear: triggers lock sound, spawns next.
;!      out       carry,zero
;!      clobbers  A,BC,E,HL
TB_LCKC0:
        CALL    TX_CHCKT
        JR      C,TB_LCKGM
        CALL    TB_MRGCT
        CALL    TB_CHCKF
        JR      NC,TB_LCKCT
        CALL    TS_SNDTR
        XOR     A
        LD      (TW_ACTPC),A
        LD      A,1
        LD      (TW_CLRPN),A
        LD      A,TC_LNCLR
        LD      (TW_CLRTM),A
        RET
TB_LCKCT:
        CALL    TS_SNDT1
        CALL    TP_SPWNC
        RET

TB_LCKGM:
        CALL    TB_MRGCT
        LD      A,4
        CALL    TB_ENTRG
        RET

; EnterGameOver —
; Latch game-over state and show the game-over
; screen.
; Disables active piece, sets GameOver, arms
; GOverKeyGateLo for the restart-input delay.
; Plays the game-over sound, rebuilds the Framebuffer,
; then jumps to LcdShowGOver.
;!      out       carry
;!      clobbers  A,BC,DE,HL
TB_ENTRG:
        PUSH    AF
        XOR     A
        LD      (TW_ACTPC),A
        LD      A,1
        LD      (GameOver),A
        LD      HL,TC_GVRGT
        LD      (TW_GVRK1),HL
        POP     AF
        CALL    TS_SNDT0
        CALL    CM_RBLDF
        JP      TU_LCDSH

; SplashState —
; Wait for a fresh key press on the splash screen.
; Seeds RngSeed from FramePhase (0 replaced with
; RngSeedInit), draws the first NextPiece, locks
; input, and starts the game via SpawnActPiece
; then jumps to RebuildFb.
;!      clobbers  A,BC,DE,HL,IX,IY
TB_SPLS0:
        LD      C,SC_APSCN
        RST     $10
        RET     NC
        XOR     A
        LD      (TW_SPLSH),A
        LD      A,(CM_FRMPH)
        OR      A
        JR      NZ,TB_SPLSH
        LD      A,TC_RNGSD
TB_SPLSH:
        LD      (RngSeed),A
        CALL    TP_RNGN1
        LD      (TW_NXTPC),A
        LD      A,1
        LD      (TW_INPTL),A
        CALL    TP_SPWNC
        CALL    CM_UPDSC
        CALL    TU_LCDS2
        JP      CM_RBLDF

; LineClearState —
; Manage the post-clear hold delay.
; Advances once per frame. On ClearTimer expiry:
; collapses filled rows, awards score, clears
; ClearPending, then jumps to SpawnActPiece.
;!      out       carry
;!      clobbers  A,BC,DE,HL
TB_LNCLR:
        LD      A,(TW_CLRTM)
        DEC     A
        LD      (TW_CLRTM),A
        RET     NZ
        CALL    TB_CLLP0
        CALL    TB_APPL0
        XOR     A
        LD      (TW_CLRPN),A
        CALL    TB_BRDM0
        JP      TP_SPWNC

; CheckFullRows —
; Scan BoardRows for 0xFF (completely full) rows.
; Builds ClearMask: bit N set when row N is full.
; Carry set means at least one row is full; carry
; clear means no rows are full.
;!      out       carry,zero
;!      clobbers  A,BC,E,HL
TB_CHCKF:
        LD      HL,TW_BRDRW
        LD      B,RowCount
        LD      C,1
        XOR     A
        LD      E,A
TB_CHCKR:
        LD      A,(HL)
        CP      $FF
        JR      NZ,TB_CHCK0
        LD      A,E
        OR      C
        LD      E,A
TB_CHCK0:
        INC     HL
        SLA     C
        DJNZ    TB_CHCKR
        LD      A,E
        LD      (TW_CLRMS),A
        OR      A
        JR      Z,TB_CHCK1
        SCF
        RET
TB_CHCK1:
        OR      A
        RET

; CountClearRows —
; Count the set bits in ClearMask.
; The count is returned in A (0..8).
;!      out       A,C
;!      clobbers  B
TB_CNTC1:
        LD      A,(TW_CLRMS)
        LD      C,A
        LD      B,0
TB_CNTC0:
        LD      A,C
        OR      A
        JR      Z,TB_CNTCL
        SRL     C
        JR      NC,TB_CNTC0
        INC     B
        JR      TB_CNTC0
TB_CNTCL:
        LD      A,B
        RET

; ApplyClearScore —
; Award score for a completed-row event.
; Increments LinesClearTotal by the cleared count.
; Score delta is looked up in ClearScoreTbl:
; 100, 300, 500, or 800 for 1, 2, 3, or 4+ rows.
; Updates gravity after changing Score, then refreshes
; the score HUD.
;!      out       BC,HL
;!      clobbers  A,DE
TB_APPL0:
        CALL    TB_CNTC1
        OR      A
        RET     Z
        LD      E,A
        LD      A,(TW_LNSCL)
        ADD     A,E
        LD      (TW_LNSCL),A

        LD      A,E ; A = clear count (1..RowCount)
        CP      4
        JR      C,TB_APPLY ; 4+ -> clamp to 4 (table entry for 'tetris')
        LD      A,4
TB_APPLY:
        ADD     A,A ; *2 for DW stride
        LD      L,A
        LD      H,0
        LD      DE,TD_CLRSC
        ADD     HL,DE
        LD      E,(HL) ; DE = table entry (Score delta)
        INC     HL
        LD      D,(HL)
        LD      HL,(ScoreLo)
        ADD     HL,DE
        LD      (ScoreLo),HL
        CALL    TB_UPDGR
        JP      CM_UPDSC

; UpdGravByScore —
; Increase gravity when Score crosses a threshold.
; Updates CurGravPeriod: GravityPeriod below the
; threshold, GravPeriodStep1 at or above it.
;!      out       zero
;!      clobbers  A,HL
TB_UPDGR:
        LD      HL,(ScoreLo)
        LD      A,H
        CP      TC_GRVSC
        JR      C,TB_UPDTG
        JR      NZ,TB_UPDT0
        LD      A,L
        CP      TC_GRVS0
        JR      C,TB_UPDTG
TB_UPDT0:
        LD      A,TC_GRVPR
        JR      TB_UPDT1
TB_UPDTG:
        LD      A,TC_GRVTY
TB_UPDT1:
        LD      (TW_CRGRV),A
        RET

; CollapseRows —
; Remove cleared rows and compact the board.
; Scans bottom-to-top; rows not in ClearMask are
; copied downward into the vacated slots.
; Top rows left vacant are zeroed in BoardRows
; and all three landed colour planes.
;!      clobbers  A,B,DE,HL
TB_CLLP0:
        LD      B,RowCount
        LD      D,RowCount - 1
        LD      E,RowCount - 1
TB_CLLP1:
        LD      A,D
        LD      L,A
        LD      H,0
        PUSH    BC
        LD      BC,TD_RWBTT
        ADD     HL,BC
        LD      A,(TW_CLRMS)
        AND     (HL)
        POP     BC
        JR      NZ,TB_CLLP2
        LD      A,D
        CP      E
        JR      Z,TB_CLLPS
        PUSH    BC
        PUSH    DE
        CALL    TB_CPYBR
        POP     DE
        POP     BC
TB_CLLPS:
        DEC     E
TB_CLLP2:
        DEC     D
        DJNZ    TB_CLLP1

        LD      A,E
        INC     A
        RET     Z
        LD      B,A
        XOR     A
        LD      D,A
TB_CLLP3:
        PUSH    BC
        CALL    TB_CLRBR
        POP     BC
        INC     D
        DJNZ    TB_CLLP3
        RET

; CopyBoardRow —
; Copy one row across all four board arrays.
; D contains the source row; E contains the
; destination row. Copies occupancy (BoardRows) then
; the three colour planes (BoardRed, BoardGreen,
; BoardBlue). Each array is RowCount
; bytes wide; the stride between arrays is
; RowCount bytes.
;!      in        DE
;!      clobbers  A
TB_CPYBR:
        PUSH    HL
        PUSH    BC
        LD      HL,TW_BRDRW
        LD      C,4
TB_CPYB2:
        PUSH    HL
        LD      A,L
        ADD     A,D
        LD      L,A
        JR      NC,TB_CPYB3
        INC     H
TB_CPYB3:
        LD      A,(HL)
        LD      B,A
        POP     HL
        PUSH    HL
        LD      A,L
        ADD     A,E
        LD      L,A
        JR      NC,TB_CPYB1
        INC     H
TB_CPYB1:
        LD      (HL),B
        POP     HL
        LD      A,L
        ADD     A,RowCount
        LD      L,A
        JR      NC,TB_CPYB0
        INC     H
TB_CPYB0:
        DEC     C
        JR      NZ,TB_CPYB2
        POP     BC
        POP     HL
        RET

; ClearBoardRow —
; Zero one row in BoardRows and all three colour
; planes. D contains the row index. Uses the same
; RowCount stride as CopyBoardRow.
;!      in        D
;!      out       HL,C
;!      clobbers  A,B
TB_CLRBR:
        XOR     A
        LD      B,A
        LD      HL,TW_BRDRW
        LD      C,4
TB_CLRB2:
        PUSH    HL
        LD      A,L
        ADD     A,D
        LD      L,A
        JR      NC,TB_CLRB1
        INC     H
TB_CLRB1:
        LD      (HL),B
        POP     HL
        LD      A,L
        ADD     A,RowCount
        LD      L,A
        JR      NC,TB_CLRB0
        INC     H
TB_CLRB0:
        DEC     C
        JR      NZ,TB_CLRB2
        RET

; BoardEmptyScan —
; Set BoardEmpty=1 when all BoardRows bytes are
; zero; set BoardEmpty=0 otherwise.
;!      out       carry,zero
;!      clobbers  A,B,HL
TB_BRDM0:
        LD      HL,TW_BRDRW
        LD      B,RowCount
TB_BRDMP:
        LD      A,(HL)
        OR      A
        JR      NZ,TB_BRDNT
        INC     HL
        DJNZ    TB_BRDMP
        LD      A,1
        LD      (TW_BRDMP),A
        RET
TB_BRDNT:
        XOR     A
        LD      (TW_BRDMP),A
        RET

; MergeRgbRow —
; OR column mask C into the landed colour planes
; for row index L.
; Only the planes enabled by CurPieceColor bits
; are touched; plane stride is RowCount bytes.
; Call after ORing C into BoardRows for this row.
;!      in        L,C
;!      out       A
TB_MRGRG:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      D,0
        LD      E,L ; DE = row index (0..7)
        LD      HL,BoardRed
        ADD     HL,DE ; HL = BoardRed + row
        LD      DE,RowCount ; DE = plane stride (8 bytes per plane)
        LD      A,(TW_CRPCC)
        LD      B,3 ; 3 planes: R, G, B
TB_MRGRL:
        RRCA ; low bit (red/green/blue per iter) -> carry
        JR      NC,TB_MRGRS
        PUSH    AF
        LD      A,(HL)
        OR      C
        LD      (HL),A
        POP     AF
TB_MRGRS:
        DEC     B
        JR      Z,TB_MRGRX
        ADD     HL,DE ; step HL +8 to next plane byte
        JR      TB_MRGRL
TB_MRGRX:
        POP     HL
        POP     DE
        POP     BC
        RET

; MergeActBoard —
; Stamp the active piece into the landed board.
; ORs each occupied row of the 4-row piece bitmap
; (shifted by PlayerX) into BoardRows, then calls
; MergeRgbRow to update the three colour planes.
; Clears BoardEmpty as a side effect.
;!      clobbers  A
TB_MRGCT:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        XOR     A
        LD      (TW_BRDMP),A
        LD      A,(PlayerX)
        LD      (TW_SHFTC),A
        LD      A,(PlayerY)
        LD      L,A
        LD      H,0
        LD      DE,(TW_CRPCP)
        LD      B,4

TB_MRGB0:
        LD      A,(DE)
        CALL    TG_SHFT1 ; returns A = shifted mask
        LD      C,A
        OR      A ; test A; C retains mask for later writes
        JR      Z,TB_MRGBR
        BIT     7,L
        JR      NZ,TB_MRGBR
        LD      A,L
        CP      RowCount
        JR      NC,TB_MRGBR
        PUSH    HL
        PUSH    DE
        LD      H,0
        LD      DE,TW_BRDRW
        ADD     HL,DE
        LD      A,(HL)
        OR      C
        LD      (HL),A
        POP     DE
        POP     HL
        CALL    TB_MRGRG
TB_MRGBR:
        INC     DE
        INC     HL
        DJNZ    TB_MRGB0
TB_MRGC0:
        POP     HL
        POP     DE
        POP     BC
        RET
