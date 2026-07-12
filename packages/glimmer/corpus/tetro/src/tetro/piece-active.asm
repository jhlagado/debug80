; HorizProbeX —
; Test PendingX at current PlayerY via collision.
; PendingY contains the current PlayerY.
; On no collision, commits PendingX to PlayerX.
;!      out       zero
;!      clobbers  A,DE
@HorizProbeX:
        LD      A,(PlayerY)
        LD      (PendingY),A
        CALL    LoadDePending
        CALL    CheckCollAtDe
        JR      NC,HorizCommitX
        RET
HorizCommitX:
        LD      A,(PendingX)
        LD      (PlayerX),A
        RET

; MoveRight —
; Attempt to shift the piece one column right.
; Increments PlayerX if the candidate is legal.
;!      out       zero
;!      clobbers  A,DE
@MoveRight:
        LD      A,(PlayerX)
        INC     A
        LD      (PendingX),A
        JP      HorizProbeX

; MoveLeft —
; Attempt to shift the piece one column left.
; Decrements PlayerX if the candidate is legal.
; PlayerX=0 leaves the position unchanged.
;!      out       zero
;!      clobbers  A,DE
@MoveLeft:
        LD      A,(PlayerX)
        OR      A
        RET     Z
        DEC     A
        LD      (PendingX),A
        JP      HorizProbeX

; StepActDown —
; Load the candidate position one row below.
; Carry from CheckCollAtDe is returned unchanged:
; set means blocked, clear means legal.
; Does not commit PlayerY on its own.
;!      out       carry,zero
;!      clobbers  A,DE
@StepActDown:
        LD      A,(PlayerX)
        LD      (PendingX),A
        LD      A,(PlayerY)
        INC     A
        LD      (PendingY),A
        CALL    LoadDePending
        CALL    CheckCollAtDe
        RET

; ApplyGravity —
; Periodic drop when GravityCooldown expires.
; Decrements the countdown; reloads from
; CurGravPeriod on expiry and calls StepActDown.
; Collision jumps to LockActPiece.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
@ApplyGravity:
        LD      A,(GravityCooldown)
        DEC     A
        LD      (GravityCooldown),A
        RET     NZ

        LD      A,(CurGravPeriod)
        LD      (GravityCooldown),A

        CALL    StepActDown
        JR      NC,GravityCommit
        JP      LockActPiece
GravityCommit:
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
@SoftDrop:
        CALL    StepActDown
        JR      NC,SoftDropCommit
        LD      A,1
        LD      (DropLockout),A
        JP      LockActPiece
SoftDropCommit:
        LD      A,(PendingY)
        LD      (PlayerY),A
        LD      A,(CurGravPeriod)
        LD      (GravityCooldown),A
        RET

; SanitizeActPos —
; Clamp player position to legal field bounds.
; PlayerX is clamped so the piece stays within
; columns 0..7, accounting for CurPieceRight.
; PlayerY is only clamped if it is non-negative;
; negative Y (above-field spawn rows) is kept.
;!      out       zero
;!      clobbers  A,HL
@SanitizeActPos:
        LD      A,(PlayerX)
        LD      HL,CurPieceRight
        ADD     A,(HL)
        CP      RowCount
        JR      C,SanitizeXDone
        LD      A,RowCount - 1
        SUB     (HL)
        LD      (PlayerX),A
SanitizeXDone:
        LD      A,(PlayerY)
        BIT     7,A
        JR      NZ,SanitizeYDone
        CP      YMax + 1
        JR      C,SanitizeYDone
        LD      A,YMax
        LD      (PlayerY),A
SanitizeYDone:
        RET

; SelectNextPiece —
; Promote NextPiece to current and advance RNG.
; Resets rotation to 0 and calls LoadCurRot to
; update CurPiecePtr, CurPieceRight,
; and CurPieceColor.
; Draws a new NextPieceIndex from the RNG.
;!      out       zero
;!      clobbers  A,BC,DE,HL
@SelectNextPiece:
        LD      A,(NextPieceIndex)
        LD      (CurPieceIndex),A
        XOR     A
        LD      (CurrentRotation),A
        CALL    LoadCurRot

        CALL    RngNextPiece
        LD      (NextPieceIndex),A
        RET

; RngNextPiece —
; Draw the next piece index (0..PieceCount-1).
; Folds high bits into low bits then masks to 3;
; retries when the result >= PieceCount so the
; output is uniformly in range.
;!      out       A,zero
;!      clobbers  B
@RngNextPiece:
        CALL    RngNext8
        LD      B,A
        SRL     A
        SRL     A
        SRL     A
        XOR     B                       ; fold high bits into sticky low bits
        AND     0x07
        CP      PieceCount
        JR      NC,RngNextPiece
        RET

; RngNext8 —
; Step the 8-bit Galois LFSR. The new byte is
; returned in A.
; Polynomial: XOR 0xB8 when the shifted-out bit
; is 1. Seed 0 is replaced with RngSeedInit to
; prevent the zero lock-up state.
;!      out       A
@RngNext8:
        LD      A,(RngSeed)
        OR      A
        JR      NZ,RngNext8Step
        LD      A,RngSeedInit
RngNext8Step:
        SRL     A
        JR      NC,RngNext8Save
        XOR     0xB8
RngNext8Save:
        LD      (RngSeed),A
        RET

; LoadCurRot —
; Reload piece-state caches from ROM tables.
; Updates CurPieceColor (from PieceColorTbl),
; CurPieceRight (from PieceRightTbl), and
; CurPiecePtr (from PiecePtrTable).
; Table index: piece_index * 4 + rotation.
;!      clobbers  A,C,DE,HL
@LoadCurRot:
        ; COLOR lookup first; piece-indexed so DE
        ; stays free.
        LD      A,(CurPieceIndex)
        LD      E,A
        LD      D,0
        LD      HL,PieceColorTbl
        ADD     HL,DE
        LD      A,(HL)
        LD      (CurPieceColor),A

        ; Now DE = piece_index*4 + rotation for
        ; the remaining tables.
        LD      A,(CurPieceIndex)
        ADD     A,A
        ADD     A,A
        LD      C,A
        LD      A,(CurrentRotation)
        ADD     A,C
        LD      E,A
        LD      D,0

        LD      HL,PieceRightTbl
        ADD     HL,DE
        LD      A,(HL)
        LD      (CurPieceRight),A

        LD      HL,PiecePtrTable
        ADD     HL,DE
        ADD     HL,DE
        LD      E,(HL)
        INC     HL
        LD      D,(HL)
        LD      HL,CurPiecePtr
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
@RotateTestDone:
        LD      A,(PlayerX)
        LD      D,A
        LD      A,(PlayerY)
        LD      E,A
        CALL    CheckCollAtDe
        JR      NC,RotateAccept
        LD      A,(PendingRotation)
        LD      (CurrentRotation),A
        JP      LoadCurRot
RotateAccept:
        CALL    SndTrigRotate
        LD      A,(CurGravPeriod)
        LD      (GravityCooldown),A
        RET

; RotateCw —
; Attempt clockwise rotation (increment mod 4).
; Saves current rotation as PendingRotation,
; applies the candidate, calls RotateTestDone.
;!      out       carry,zero
;!      clobbers  A,C,DE,HL
@RotateCw:
        LD      A,(CurrentRotation)
        LD      (PendingRotation),A
        INC     A
        AND     3
        LD      (CurrentRotation),A
        CALL    LoadCurRot
        JP      RotateTestDone

; RotateLeft —
; Attempt counter-clockwise rotation (dec mod 4).
; Saves current rotation as PendingRotation,
; applies the candidate, calls RotateTestDone.
;!      out       carry,zero
;!      clobbers  A,C,DE,HL
@RotateLeft:
        LD      A,(CurrentRotation)
        LD      (PendingRotation),A
        DEC     A                       ; 0->0xFF; 1->0; 2->1; 3->2
        AND     3                       ; 0xFF -> 3 (wrap)
        LD      (CurrentRotation),A
        CALL    LoadCurRot
        JP      RotateTestDone

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
@SpawnActPiece:
        CALL    SelectNextPiece
        LD      A,3
        LD      (PlayerX),A
        LD      (PendingX),A          ; PlayerX == PendingX at spawn
        LD      A,SpawnY
        LD      (PlayerY),A
        LD      (PendingY),A          ; PlayerY == PendingY at spawn
        LD      A,MovePeriod
        LD      (MoveCooldown),A
        LD      A,(CurGravPeriod)
        LD      (GravityCooldown),A
        LD      A,NoKey
        LD      (LastKey),A
        CALL    LoadDePending
        CALL    CheckCollAtDe
        JR      C,SpawnFailed
        LD      A,1
        LD      (ActPieceEnabled),A
        CALL    LcdRefNextPrev
        RET
SpawnFailed:
        XOR     A                      ; reason code 0 = immediate spawn collision
        JP      EnterGameOver        ; EnterGameOver jumps to game-over LCD
