; HorizProbeX —
; Test PendingX at current PlayerY via collision.
; PendingY contains the current PlayerY.
; On no collision, commits PendingX to PlayerX.
;!      out       zero
;!      clobbers  A,DE
TP_HRZPR:
        LD      A,(PlayerY)
        LD      (PendingY),A
        CALL    TG_LDDPN
        CALL    TX_CHCKC
        JR      NC,TP_HRZCM
        RET
TP_HRZCM:
        LD      A,(PendingX)
        LD      (PlayerX),A
        RET

; MoveRight —
; Attempt to shift the piece one column right.
; Increments PlayerX if the candidate is legal.
;!      out       zero
;!      clobbers  A,DE
TP_MVRGH:
        LD      A,(PlayerX)
        INC     A
        LD      (PendingX),A
        JP      TP_HRZPR

; MoveLeft —
; Attempt to shift the piece one column left.
; Decrements PlayerX if the candidate is legal.
; PlayerX=0 leaves the position unchanged.
;!      out       zero
;!      clobbers  A,DE
MoveLeft:
        LD      A,(PlayerX)
        OR      A
        RET     Z
        DEC     A
        LD      (PendingX),A
        JP      TP_HRZPR

; StepActDown —
; Load the candidate position one row below.
; Carry from CheckCollAtDe is returned unchanged:
; set means blocked, clear means legal.
; Does not commit PlayerY on its own.
;!      out       carry,zero
;!      clobbers  A,DE
TP_STPCT:
        LD      A,(PlayerX)
        LD      (PendingX),A
        LD      A,(PlayerY)
        INC     A
        LD      (PendingY),A
        CALL    TG_LDDPN
        CALL    TX_CHCKC
        RET

; ApplyGravity —
; Periodic drop when GravityCooldown expires.
; Decrements the countdown; reloads from
; CurGravPeriod on expiry and calls StepActDown.
; Collision jumps to LockActPiece.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
TP_APPLY:
        LD      A,(TW_GRVTY)
        DEC     A
        LD      (TW_GRVTY),A
        RET     NZ

        LD      A,(TW_CRGRV)
        LD      (TW_GRVTY),A

        CALL    TP_STPCT
        JR      NC,TP_GRVTY
        JP      TB_LCKC0
TP_GRVTY:
        LD      A,(PendingY)
        LD      (PlayerY),A
        RET

; SoftDrop —
; Immediately step the piece down one row.
; Collision sets DropLockout and jumps to
; LockActPiece.
; On success: commits PendingY and resets
; GravityCooldown to CurGravPeriod.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
SoftDrop:
        CALL    TP_STPCT
        JR      NC,TP_SFTDR
        LD      A,1
        LD      (TW_DRPLC),A
        JP      TB_LCKC0
TP_SFTDR:
        LD      A,(PendingY)
        LD      (PlayerY),A
        LD      A,(TW_CRGRV)
        LD      (TW_GRVTY),A
        RET

; SanitizeActPos —
; Clamp player position to legal field bounds.
; PlayerX is clamped so the piece stays within
; columns 0..7, accounting for CurPieceRight.
; PlayerY is only clamped if it is non-negative;
; negative Y (above-field spawn rows) is kept.
;!      out       zero
;!      clobbers  A,HL
TP_SNTZC:
        LD      A,(PlayerX)
        LD      HL,TW_CRPCR
        ADD     A,(HL)
        CP      RowCount
        JR      C,TP_SNTZX
        LD      A,RowCount - 1
        SUB     (HL)
        LD      (PlayerX),A
TP_SNTZX:
        LD      A,(PlayerY)
        BIT     7,A
        JR      NZ,TP_SNTZY
        CP      YMax + 1
        JR      C,TP_SNTZY
        LD      A,YMax
        LD      (PlayerY),A
TP_SNTZY:
        RET

; SelectNextPiece —
; Promote NextPiece to current and advance RNG.
; Resets rotation to 0 and calls LoadCurRot to
; update CurPiecePtr, CurPieceRight,
; and CurPieceColor.
; Draws a new NextPieceIndex from the RNG.
;!      out       zero
;!      clobbers  A,BC,DE,HL
TP_SLCTN:
        LD      A,(TW_NXTPC)
        LD      (TW_CRPCN),A
        XOR     A
        LD      (TW_CRRNT),A
        CALL    TP_LDCRR

        CALL    TP_RNGN1
        LD      (TW_NXTPC),A
        RET

; RngNextPiece —
; Draw the next piece index (0..PieceCount-1).
; Folds high bits into low bits then masks to 3;
; retries when the result >= PieceCount so the
; output is uniformly in range.
;!      out       A,zero
;!      clobbers  B
TP_RNGN1:
        CALL    RngNext8
        LD      B,A
        SRL     A
        SRL     A
        SRL     A
        XOR     B ; fold high bits into sticky low bits
        AND     $07
        CP      TC_PCCNT
        JR      NC,TP_RNGN1
        RET

; RngNext8 —
; Step the 8-bit Galois LFSR. The new byte is
; returned in A.
; Polynomial: XOR 0xB8 when the shifted-out bit
; is 1. Seed 0 is replaced with RngSeedInit to
; prevent the zero lock-up state.
;!      out       A
RngNext8:
        LD      A,(RngSeed)
        OR      A
        JR      NZ,TP_RNGN0
        LD      A,TC_RNGSD
TP_RNGN0:
        SRL     A
        JR      NC,TP_RNGNX
        XOR     $B8
TP_RNGNX:
        LD      (RngSeed),A
        RET

; LoadCurRot —
; Reload piece-state caches from ROM tables.
; Updates CurPieceColor (from PieceColorTbl),
; CurPieceRight (from PieceRightTbl), and
; CurPiecePtr (from PiecePtrTable).
; Table index: piece_index * 4 + rotation.
;!      clobbers  A,C,DE,HL
TP_LDCRR:
        ; COLOR lookup first; piece-indexed so DE
        ; stays free.
        LD      A,(TW_CRPCN)
        LD      E,A
        LD      D,0
        LD      HL,TD_PCCLR
        ADD     HL,DE
        LD      A,(HL)
        LD      (TW_CRPCC),A

        ; Now DE = piece_index*4 + rotation for
        ; the remaining tables.
        LD      A,(TW_CRPCN)
        ADD     A,A
        ADD     A,A
        LD      C,A
        LD      A,(TW_CRRNT)
        ADD     A,C
        LD      E,A
        LD      D,0

        LD      HL,TD_PCRGH
        ADD     HL,DE
        LD      A,(HL)
        LD      (TW_CRPCR),A

        LD      HL,TD_PCPTR
        ADD     HL,DE
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      HL,TW_CRPCP
        LD      (HL),E
        INC     HL
        LD      (HL),D
        RET

; RotateTestDone —
; Finalize or revert a tentative rotation.
; Tests the candidate CurrentRotation at the
; current PlayerX/Y via CheckCollAtDe.
; On collision: restores PendingRotation and
; reloads the original piece state via LoadCurRot.
; On legal: plays rotate sound and resets
; GravityCooldown to CurGravPeriod.
;!      out       carry,zero
;!      clobbers  A,C,DE,HL
TP_RTTTS:
        LD      A,(PlayerX)
        LD      D,A
        LD      A,(PlayerY)
        LD      E,A
        CALL    TX_CHCKC
        JR      NC,TP_RTTCC
        LD      A,(TW_PNDNG)
        LD      (TW_CRRNT),A
        JP      TP_LDCRR
TP_RTTCC:
        CALL    TS_SNDT3
        LD      A,(TW_CRGRV)
        LD      (TW_GRVTY),A
        RET

; RotateCw —
; Attempt clockwise rotation (increment mod 4).
; Saves current rotation as PendingRotation,
; applies the candidate, calls RotateTestDone.
;!      out       carry,zero
;!      clobbers  A,C,DE,HL
RotateCw:
        LD      A,(TW_CRRNT)
        LD      (TW_PNDNG),A
        INC     A
        AND     3
        LD      (TW_CRRNT),A
        CALL    TP_LDCRR
        JP      TP_RTTTS

; RotateLeft —
; Attempt counter-clockwise rotation (dec mod 4).
; Saves current rotation as PendingRotation,
; applies the candidate, calls RotateTestDone.
;!      out       carry,zero
;!      clobbers  A,C,DE,HL
TP_RTTLF:
        LD      A,(TW_CRRNT)
        LD      (TW_PNDNG),A
        DEC     A ; 0->0xFF; 1->0; 2->1; 3->2
        AND     3 ; 0xFF -> 3 (wrap)
        LD      (TW_CRRNT),A
        CALL    TP_LDCRR
        JP      TP_RTTTS

; SpawnActPiece —
; Select next piece and place at spawn position.
; Spawn is at column 3, row SpawnY (above the
; visible field). Immediately checks collision;
; blocked spawn jumps to EnterGameOver with reason
; code 0 in A.
; On success: enables the piece and updates the
; LCD next-piece preview via LcdRefNextPrev.
;!      out       carry
;!      clobbers  A,BC,DE,HL
TP_SPWNC:
        CALL    TP_SLCTN
        LD      A,3
        LD      (PlayerX),A
        LD      (PendingX),A ; PlayerX == PendingX at spawn
        LD      A,SpawnY
        LD      (PlayerY),A
        LD      (PendingY),A ; PlayerY == PendingY at spawn
        LD      A,TC_MVPRD
        LD      (CM_MVCLD),A
        LD      A,(TW_CRGRV)
        LD      (TW_GRVTY),A
        LD      A,NoKey
        LD      (LastKey),A
        CALL    TG_LDDPN
        CALL    TX_CHCKC
        JR      C,TP_SPWNF
        LD      A,1
        LD      (TW_ACTPC),A
        CALL    TU_LCDRF
        RET
TP_SPWNF:
        XOR     A ; reason code 0 = immediate spawn collision
        JP      TB_ENTRG ; EnterGameOver jumps to game-over LCD
