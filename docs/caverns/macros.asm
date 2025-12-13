; ---------------------------------------------------------
;  Macros used across Caverns
; ---------------------------------------------------------

; PRINT "text"
; Emits inline C-string and calls printStr; wraps with CR/LF
.macro PRINT,msg1
    call printStr
    .cstr "\r\n",msg1,"\r\n"
.endm

; SET8 dest, value  -> ld a,value / ld (dest),a
.macro SET8,dst,val
    ld a,val
    ld (dst),a
.endm

; SET16 dest, value -> ld hl,value / ld (dest),hl
.macro SET16,dst,val
    ld hl,val
    ld (dst),hl
.endm

; COPY src,dst,count -> ldir wrapper
.macro COPY,src,dst,count
    ld hl,src
    ld de,dst
    ld bc,count
    ldir
.endm
