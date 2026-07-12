; Tetro frame-time logic dispatcher.

; LogicTick —
; Run one complete game update while the matrix is
; blank between scanned frames. Rendering is rebuilt
; as a full back-buffer pass, then copied to the live
; Framebuffer before the next ScanFrame.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
@LogicTick:
        CALL    SanitizeActPos
        LD      A,(GameOver)
        OR      A
        JR      Z,LogicGOverDone
        CALL    WaitGOverGate
        RET

LogicGOverDone:
        LD      A,(SplashTimer)
        OR      A
        JR      Z,LogicSplashDone
        CALL    SplashState
        RET

LogicSplashDone:
        LD      A,(ClearPending)
        OR      A
        JR      Z,LogicPauseCheck
        CALL    LineClearState
        CALL    RebuildFb
        RET

LogicPauseCheck:
        LD      A,(Paused)
        OR      A
        JR      Z,LogicActive
        CALL    PollInput
        RET

LogicActive:
        LD      A,(InputLockout)
        OR      A
        JR      Z,LogicRunFrame
        CALL    WaitKeyRelease
        RET

LogicRunFrame:
        CALL    PollInput
        LD      A,(Paused)
        OR      A
        RET     NZ
        LD      A,(GameOver)
        OR      A
        RET     NZ
        LD      A,(ClearPending)
        OR      A
        JR      NZ,LogicRenderFrame
        CALL    ApplyGravity
        LD      A,(GameOver)
        OR      A
        RET     NZ

LogicRenderFrame:
        CALL    RebuildFb
        RET
