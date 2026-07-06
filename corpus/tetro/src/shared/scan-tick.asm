; Cooperative scanline driver.
; Emits one matrix row and one HUD digit per call.

; ScanTick —
; Emit one matrix row using ScanPtr / ScanMask.
; Also services the speaker (SndService) and
; advances the HUD scan (HudScanDig) every call.
; Delegates scan-state advance to ScanNext.
;!      out       carry
;!      clobbers  A,BC,DE,HL
@ScanTick:
        XOR     A
        OUT     (PortRow),A

        LD      HL,(ScanPtr)

        LD      A,(HL)
        OUT     (PortRed),A
        INC     HL

        LD      A,(HL)
        OUT     (PortGreen),A
        INC     HL

        LD      A,(HL)
        OUT     (PortBlue),A

        LD      A,(ScanMask)
        OUT     (PortRow),A

        CALL    SndService
        CALL    HudScanDig
        CALL    ScanNext
        RET

; ScanNext —
; Step ScanMask (RLC) and ScanPtr (+BytesPerRow).
; On wrap back to ScanMaskStart: resets ScanPtr
; to Framebuffer base and increments FramePhase.
; FramePhase is the splash-screen RNG entropy
; source; it is not used for pacing elsewhere.
;!      out       carry
;!      clobbers  A,DE,HL
@ScanNext:
        LD      A,(ScanMask)
        RLC     A
        LD      (ScanMask),A

        LD      HL,(ScanPtr)
        LD      DE,BytesPerRow
        ADD     HL,DE

        CP      ScanMaskStart
        JR      NZ,ScanSavePtr

        LD      HL,Framebuffer
        LD      A,(FramePhase)
        INC     A
        LD      (FramePhase),A

ScanSavePtr:
        LD      (ScanPtr),HL
        RET
