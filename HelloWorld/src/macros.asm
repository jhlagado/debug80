; Service call macros for RST 10H (uses selectors from constants.asm)

.macro SYS_PUT        ; put char in A
        LD      C,SVC_PUTCHAR
        RST     $10
.endm

.macro SYS_GET        ; get char -> A
        LD      C,SVC_GETCHAR
        RST     $10
.endm

.macro SYS_PUTS       ; put zero-terminated string at HL
        LD      C,SVC_PUTSTR
        RST     $10
.endm

.macro SYS_CLR        ; clear display
        LD      C,SVC_CLEAR
        RST     $10
.endm
