; Generic double-buffer helpers for the
; 8x8 RGB matrix Framebuffer.

; FbClearAll —
; Zero all bytes in FramebufferBack.
;!      clobbers  A,B,HL
@FbClearAll:
        LD      HL,FramebufferBack
        LD      B,FramebufferBytes
        XOR     A
FbClrLoop:
        LD      (HL),A
        INC     HL
        DJNZ    FbClrLoop
        RET

; FbClearRow —
; Clear one RGB row in FramebufferBack.
; A contains the row byte offset, normally 0, 4, 8,
; ... 28. The carry flag is incidental.
;!      in        A
;!      out       carry,zero
;!      clobbers  A,DE,HL
@FbClearRow:
        LD      E,A
        LD      D,0
        LD      HL,FramebufferBack
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
@FbCopyAll:
        LD      HL,FramebufferBack
        LD      DE,Framebuffer
        LD      BC,FramebufferBytes
        LDIR
        RET

; FbCopyRow —
; Copy one RGB row from back to live Framebuffer.
; A contains the row byte offset, normally 0, 4, 8,
; ... 28.
;!      in        A
;!      clobbers  A,DE,HL
@FbCopyRow:
        LD      E,A
        LD      D,0
        LD      HL,FramebufferBack
        ADD     HL,DE
        PUSH    HL
        LD      HL,Framebuffer
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
