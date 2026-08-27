; Generic double-buffer helpers for the
; 8x8 RGB matrix Framebuffer.

; FbClearAll —
; Zero all bytes in FramebufferBack.
;!      clobbers  A,B,HL
FC_FBCLR:
        LD      HL,CM_FRMB0
        LD      B,SC_FRMBF
        XOR     A
FC_FBCL1:
        LD      (HL),A
        INC     HL
        DJNZ    FC_FBCL1
        RET

; FbClearRow —
; Clear one RGB row in FramebufferBack.
; A contains the row byte offset, normally 0, 4, 8,
; ... 28. The carry flag is incidental.
;!      in        A
;!      out       carry,zero
;!      clobbers  A,DE,HL
FC_FBCL0:
        LD      E,A
        LD      D,0
        LD      HL,CM_FRMB0
        ADD     HL,DE
        XOR     A
        LD      (HL),A
        INC     HL
        LD      (HL),A
        INC     HL
        LD      (HL),A
        INC     HL
        LD      (HL),A
        RET

; FbCopyAll —
; Copy FramebufferBack to the live Framebuffer.
; LDIR copies the full FramebufferBytes block.
;!      clobbers  BC,DE,HL
FC_FBCPY:
        LD      HL,CM_FRMB0
        LD      DE,CM_FRMBF
        LD      BC,SC_FRMBF
        LDIR
        RET

; FbCopyRow —
; Copy one RGB row from back to live Framebuffer.
; A contains the row byte offset, normally 0, 4, 8,
; ... 28.
;!      in        A
;!      clobbers  A,DE,HL
FC_FBCP0:
        LD      E,A
        LD      D,0
        LD      HL,CM_FRMB0
        ADD     HL,DE
        PUSH    HL
        LD      HL,CM_FRMBF
        ADD     HL,DE
        EX      DE,HL
        POP     HL
        LD      A,(HL)
        LD      (DE),A
        INC     HL
        INC     DE
        LD      A,(HL)
        LD      (DE),A
        INC     HL
        INC     DE
        LD      A,(HL)
        LD      (DE),A
        INC     HL
        INC     DE
        LD      A,(HL)
        LD      (DE),A
        RET
