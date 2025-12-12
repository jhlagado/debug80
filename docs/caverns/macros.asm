; ---------------------------------------------------------
;  Macros used across Caverns
; ---------------------------------------------------------

; PRINT "text"
; Emits inline C-string and calls printStr; wraps with CR/LF
.macro PRINT,msg1
    call printStr
    .cstr "\r\n",msg1,"\r\n"
.endm
