; ---------------------------------------------------------
;  Macros used across Caverns
; ---------------------------------------------------------

; set8 dest, value  -> ld a,value / ld (dest),a
.macro set8,dst,val
    ld a,val
    ld (dst),a
.endm

; set16 dest, value -> ld hl,value / ld (dest),hl
.macro set16,dst,val
    ld hl,val
    ld (dst),hl
.endm

; copy src,dst,count -> ldir wrapper
.macro copy,src,dst,count
    ld hl,src
    ld de,dst
    ld bc,count
    ldir
.endm
