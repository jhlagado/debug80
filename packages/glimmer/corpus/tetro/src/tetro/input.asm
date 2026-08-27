; PollInput —
; Read the keypad and dispatch to action handlers.
; scanKeys return contract:
;   Z  = key held, C = new press, NZ = no key.
; Rotation is edge-triggered (new press only).
; Left, right, and drop repeat via HandleHeldDir.
; Skips movement when paused but still allows
; un-pause via HandleUnpause.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
CM_PLLNP:
        LD      C,SC_APSCN
        RST     $10
        JR      NZ,CM_CLRNP
        LD      E,A
        JR      C,TN_KYNWP
        LD      A,E
        CP      KeyPause
        JP      Z,CM_CLRNP
        LD      A,(Paused)
        OR      A
        JR      NZ,CM_CLRNP
        LD      A,E
        CP      SC_KYRT0
        JR      Z,CM_CLRNP
        CP      SC_KYRT1
        JR      Z,CM_CLRNP
        JR      CM_HNDLD

TN_KYNWP:
        LD      A,(Paused)
        OR      A
        JP      NZ,CM_HNDLN
        LD      A,E
        CP      KeyPause
        JP      Z,CM_HNDLP
        LD      A,E
        CP      SC_KYRTT
        JP      Z,TN_HNDLK
        CP      SC_KYRT0
        JP      Z,TN_HNDLC
        CP      SC_KYRT1
        JP      Z,TN_HNDLR
        CP      TC_TTKY0
        JP      Z,TN_HNDLR
        ; fall through

CM_HNDLD:
        LD      A,E
        CP      KeyRight
        JP      Z,TN_HNDL1
        CP      TC_TTKYR
        JP      Z,TN_HNDL1
        CP      KeyLeft
        JP      Z,TN_HNDL0
        CP      TC_TTKYL
        JP      Z,TN_HNDL0
        CP      SC_KYRTT
        JP      Z,TN_HNDLK
        CP      KeyDrop
        JP      Z,TN_HNDLK
        CP      TC_TTKYD
        JP      Z,TN_HNDLK

; ClearInputRpt —
; Reset repeat state after a non-repeating event.
; Restores MoveCooldown to MovePeriod and clears
; both LastKey and DropLockout.
;!      out       carry,zero
;!      clobbers  A
CM_CLRNP:
        LD      A,TC_MVPRD
        LD      (CM_MVCLD),A
        LD      A,NoKey
        LD      (LastKey),A
        XOR     A
        LD      (TW_DRPLC),A
        RET

; WaitGOverGate —
; Enforce a delay before accepting restart input.
; Counts down the 16-bit GOverKeyGateLo counter.
; Fires SndTrigReady exactly once when it reaches
; zero, then falls through to PollGOverRestart.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
TN_WTGVR:
        LD      HL,(TW_GVRK1)
        LD      A,H
        OR      L
        JP      Z,TN_PLLGV

        DEC     HL
        LD      (TW_GVRK1),HL
        LD      A,H
        OR      L
        RET     NZ

        CALL    TS_SNDT2
        RET

; PollGOverRestart —
; Poll for a key press after game-over.
; Carry set from scanKeys means a fresh key press;
; that path jumps to InitRestart.
;!      clobbers  A,BC,DE,HL,IX,IY
TN_PLLGV:
        LD      C,SC_APSCN
        RST     $10
        RET     NC
        JP      TI_INTRS

; WaitKeyRelease —
; Clear InputLockout once no key is being held.
; Prevents accidental input at spawn and start.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
TN_WTKYR:
        LD      C,SC_APSCN
        RST     $10
        RET     Z
        XOR     A
        LD      (TW_INPTL),A
        RET

; HandlePauseKey —
; Toggle pause state and update the LCD banner.
; ClearInputRpt resets key-repeat state afterward.
;!      out       HL,carry,zero
;!      clobbers  A
CM_HNDLP:
        LD      A,(Paused)
        XOR     1
        LD      (Paused),A
        OR      A
        JR      Z,TN_PSSHW
        CALL    TU_LCDS1
        JP      CM_CLRNP
TN_PSSHW:
        CALL    TU_LCDS2
        JP      CM_CLRNP

; HandleUnpause —
; Clear pause and restore the running LCD banner.
; ClearInputRpt resets key-repeat state afterward.
;!      out       HL,carry,zero
;!      clobbers  A
CM_HNDLN:
        XOR     A
        LD      (Paused),A
        CALL    TU_LCDS2
        JP      CM_CLRNP

; HandleRotPress —
; Dispatch clockwise rotation (CW).
; Calls RotateCw, then resets key-repeat state.
;!      out       carry,zero
;!      clobbers  A,C,DE,HL
TN_HNDLR:
        CALL    RotateCw
        JP      CM_CLRNP

; HandleCcwPress —
; Dispatch counter-clockwise rotation (CCW).
; Calls RotateLeft, then resets key-repeat state.
;!      out       carry,zero
;!      clobbers  A,C,DE,HL
TN_HNDLC:
        CALL    TP_RTTLF
        JP      CM_CLRNP

; HandleKeyRight —
; A contains KeyRight for HandleHeldDir.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
TN_HNDL1:
        LD      A,KeyRight
        JP      TN_HNDLH

; HandleKeyLeft —
; A contains KeyLeft for HandleHeldDir.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
TN_HNDL0:
        LD      A,KeyLeft
        JP      TN_HNDLH

; HandleKeyDrop —
; Gate soft-drop on DropLockout then dispatch.
; DropLockout prevents repeated locking on a held
; drop key; clears when ClearInputRpt is called.
; A contains KeyDrop for HandleHeldDir.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
TN_HNDLK:
        LD      A,(TW_DRPLC)
        OR      A
        RET     NZ
        LD      A,KeyDrop
        JP      TN_HNDLH

; HandleHeldDir —
; Manage autorepeat for left, right, and drop.
; A contains the normalized key to process.
; First press of a new key fires immediately then
; waits MovePeriod ticks before repeating.
; Drop uses DropPeriod; lateral uses MovePeriod.
;!      in        A
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
TN_HNDLH:
        LD      E,A
        LD      A,(LastKey)
        CP      E
        JR      Z,CM_HLDSM

        LD      A,E
        LD      (LastKey),A
        LD      A,1
        LD      (CM_MVCLD),A

CM_HLDSM:
        LD      A,(CM_MVCLD)
        DEC     A
        LD      (CM_MVCLD),A
        RET     NZ

        LD      A,E
        CP      KeyDrop
        JR      NZ,TN_HLDDR
        LD      A,TC_DRPPR
        JR      TN_HLDD0
TN_HLDDR:
        LD      A,TC_MVPRD
TN_HLDD0:
        LD      (CM_MVCLD),A
        LD      A,E
        CP      KeyRight
        JP      Z,TP_MVRGH
        CP      KeyLeft
        JP      Z,MoveLeft
        CP      KeyDrop
        JP      Z,SoftDrop
        RET
