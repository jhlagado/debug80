; Tetro frame-time logic dispatcher.

; LogicTick —
; Run one complete game update while the matrix is
; blank between scanned frames. Rendering is rebuilt
; as a full back-buffer pass, then copied to the live
; Framebuffer before the next ScanFrame.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
CM_LGCTC:
        CALL    TP_SNTZC
        LD      A,(GameOver)
        OR      A
        JR      Z,TL_LGCGV
        CALL    TN_WTGVR
        RET

TL_LGCGV:
        LD      A,(TW_SPLSH)
        OR      A
        JR      Z,TL_LGCSP
        CALL    TB_SPLS0
        RET

TL_LGCSP:
        LD      A,(TW_CLRPN)
        OR      A
        JR      Z,TL_LGCPS
        CALL    TB_LNCLR
        CALL    CM_RBLDF
        RET

TL_LGCPS:
        LD      A,(Paused)
        OR      A
        JR      Z,TL_LGCCT
        CALL    CM_PLLNP
        RET

TL_LGCCT:
        LD      A,(TW_INPTL)
        OR      A
        JR      Z,TL_LGCR0
        CALL    TN_WTKYR
        RET

TL_LGCR0:
        CALL    CM_PLLNP
        LD      A,(Paused)
        OR      A
        RET     NZ
        LD      A,(GameOver)
        OR      A
        RET     NZ
        LD      A,(TW_CLRPN)
        OR      A
        JR      NZ,TL_LGCRN
        CALL    TP_APPLY
        LD      A,(GameOver)
        OR      A
        RET     NZ

TL_LGCRN:
        CALL    CM_RBLDF
        RET
