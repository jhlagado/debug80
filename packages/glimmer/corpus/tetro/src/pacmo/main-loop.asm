
        ORG     $4000


; Start —
; Pacmo entry point. Initializes game state, then scans
; one fixed-dwell matrix frame and runs one blanked logic
; frame forever from MainLoop. The loop does not return
; a semantic status value.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
Start:
        CALL    CM_INTST

MainLoop:
        CALL    CM_SCNFR
        CALL    CM_LGCTC
        JR      MainLoop
