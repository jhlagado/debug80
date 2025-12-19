; Service call macros for RST 10H (uses selectors from constants.asm)

.macro SYS_PUTC       ; put char in A
        LD      C,SVC_PUTCHAR
        RST     $10
.endm

.macro SYS_GETC        ; get char -> A
        LD      C,SVC_GETCHAR
        RST     $10
.endm

.macro SYS_PUTS       ; put zero-terminated string at HL
        LD      C,SVC_PUTSTR
        RST     $10
.endm

; RNG helper: sets carry if random byte (R) < threshold
; Usage:
;   LD B,<threshold>    ; e.g. 97 for ~38%
;   RAND_LT_B
;   JR C,success
.macro RAND
        LD      A,R
        SUB     B           ; carry set if A < B
.endm
