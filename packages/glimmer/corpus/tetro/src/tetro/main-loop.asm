
        ORG     $4000


;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
Start:
        CALL    CM_INTST

MainLoop:
        CALL    CM_SCNFR
        CALL    CM_LGCTC
        JR      MainLoop
