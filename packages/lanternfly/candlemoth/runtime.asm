; Candlemoth level-0 runtime — FLAT PORT PROFILE
;
; This file implements the `flat` profile. The trap epilogue writes to ports
; 03 and 02 directly rather than through a service call, so a host using the
; vector lowering needs its own copy of this file with the epilogue changed.
; Review finding 26 records that. `buildRuntimeImage` reports an error for a
; non-port profile rather than producing an image whose faults are silent.
;
; The fourteen routines the lowering table names, hand-written because the
; Z80 has no multiply, no divide and no comparison that yields a value.
; `docs/level0-lowering.md` gives the contract each one is written to; this
; file is the implementation and `test/runtime.test.ts` is the proof.
;
; Convention throughout, matching the lowering table:
;   DE  left operand
;   HL  right operand, and the result
; A and BC are clobbered by every routine here. IX, IY and the shadow set are
; untouched, so a caller may keep values there across a call.
;
; The compiler plants a CALL to each of these by ordinal, and the ordinals are
; part of the contract because they are how the address table is indexed. The
; order below is the order of the `Helper` enum in expression.lafy.

PORT_STATUS     .equ $02
PORT_DIAGNOSTIC .equ $03

; Exit status. Zero is success, one is a compile fault, two is a runtime trap
; from this file. The diagnostic byte says which trap.
STATUS_TRAP     .equ $02

FAULT_BOUNDS    .equ $01
FAULT_DIVZERO   .equ $02

; ---------------------------------------------------------------- ordinal 0
; multiply: HL = DE * HL, low sixteen bits.
;
; Shift and add, least significant bit of the multiplier first. The high half
; of the product is discarded, which is what the language's wrapping
; multiplication asks for — an exact multiplication that leaves sixteen bits
; is caught at compile time by the folder, not here.
Multiply:
        LD      B,H
        LD      C,L             ; BC = multiplier
        LD      HL,0            ; HL = product
_mulLoop:
        LD      A,B
        OR      C
        RET     Z               ; multiplier exhausted
        SRL     B
        RR      C               ; multiplier >>= 1, low bit to carry
        JR      NC,_mulSkip
        ADD     HL,DE           ; that bit was set
_mulSkip:
        EX      DE,HL
        ADD     HL,HL           ; multiplicand <<= 1
        EX      DE,HL
        JR      _mulLoop

; ---------------------------------------------------------------- ordinal 1
; divide: HL = DE / HL, unsigned. Division by zero traps.
;
; Restoring division, sixteen iterations. The dividend shifts left out of DE
; while the quotient shifts in behind it, so one register pair carries both
; and the remainder needs no separate storage.
Divide:
        LD      A,H
        OR      L
        JP      Z,TrapDivideByZero
        LD      B,H
        LD      C,L             ; BC = divisor
        LD      HL,0            ; HL = remainder
        LD      A,16
_divLoop:
        SLA     E
        RL      D               ; dividend <<= 1, high bit to carry
        ADC     HL,HL           ; remainder = remainder * 2 + that bit
        SBC     HL,BC
        JR      C,_divRestore
        INC     E               ; it fitted: quotient bit is one
        JR      _divNext
_divRestore:
        ADD     HL,BC           ; it did not: put the remainder back
_divNext:
        DEC     A
        JR      NZ,_divLoop
        EX      DE,HL           ; quotient to HL
        RET

; ---------------------------------------------------------------- ordinal 2
; signedDivide: HL = DE / HL, signed. Division by zero traps.
;
; Magnitudes are divided and the sign applied afterwards, so the quotient
; truncates towards zero. That is the same direction the compile-time folder
; truncates in, which is what keeps a folded division and an emitted one
; agreeing.
SignedDivide:
        LD      A,D
        XOR     H
        PUSH    AF              ; bit 7 holds the sign of the result
        BIT     7,D
        CALL    NZ,NegateDe
        BIT     7,H
        CALL    NZ,NegateHl
        CALL    Divide
        POP     AF
        BIT     7,A
        RET     Z
        JP      NegateHl

; DE = -DE. Used by signed division only, so it is not an ordinal.
NegateDe:
        XOR     A
        SUB     E
        LD      E,A
        LD      A,0
        SBC     A,D
        LD      D,A
        RET

; HL = -HL.
NegateHl:
        XOR     A
        SUB     L
        LD      L,A
        LD      A,0
        SBC     A,H
        LD      H,A
        RET

; --------------------------------------------------------- ordinals 3 to 8
; Unsigned comparisons. Each subtracts the left operand from the right, so
; carry means the right operand was the smaller — that is, left > right — and
; zero means they were equal. Every routine leaves 0 or 1 in HL.
;
; JP does not disturb the flags, so a routine may test carry and then zero
; from the one subtraction.

; ordinal 3 — left = right
CompareEqual:
        OR      A
        SBC     HL,DE
        JP      Z,ReturnTrue
        JP      ReturnFalse

; ordinal 4 — left <> right
CompareNotEqual:
        OR      A
        SBC     HL,DE
        JP      Z,ReturnFalse
        JP      ReturnTrue

; ordinal 5 — left < right
CompareLess:
        OR      A
        SBC     HL,DE
        JP      C,ReturnFalse
        JP      Z,ReturnFalse
        JP      ReturnTrue

; ordinal 6 — left <= right
CompareLessEqual:
        OR      A
        SBC     HL,DE
        JP      C,ReturnFalse
        JP      ReturnTrue

; ordinal 7 — left > right
CompareGreater:
        OR      A
        SBC     HL,DE
        JP      C,ReturnTrue
        JP      ReturnFalse

; ordinal 8 — left >= right
CompareGreaterEqual:
        OR      A
        SBC     HL,DE
        JP      C,ReturnTrue
        JP      Z,ReturnTrue
        JP      ReturnFalse

; ------------------------------------------------------- ordinals 9 to 12
; Signed comparisons. The same subtraction, read differently: the difference
; is negative when the sign flag and the overflow flag disagree. `JP PO` tests
; overflow clear and `JP M` tests sign set, so each routine is one test of
; overflow and then one of sign.
;
; A negative difference means right < left, which is left > right.

; ordinal 9 — left < right, signed
CompareSignedLess:
        OR      A
        SBC     HL,DE
        JP      Z,ReturnFalse
        JP      PO,_slNoOverflow
        JP      P,ReturnFalse        ; overflow set, sign clear: difference negative
        JP      ReturnTrue
_slNoOverflow:
        JP      M,ReturnFalse        ; overflow clear, sign set: difference negative
        JP      ReturnTrue

; ordinal 10 — left <= right, signed
CompareSignedLessEqual:
        OR      A
        SBC     HL,DE
        JP      Z,ReturnTrue
        JP      PO,_sleNoOverflow
        JP      P,ReturnFalse
        JP      ReturnTrue
_sleNoOverflow:
        JP      M,ReturnFalse
        JP      ReturnTrue

; ordinal 11 — left > right, signed
CompareSignedGreater:
        OR      A
        SBC     HL,DE
        JP      Z,ReturnFalse
        JP      PO,_sgNoOverflow
        JP      P,ReturnTrue
        JP      ReturnFalse
_sgNoOverflow:
        JP      M,ReturnTrue
        JP      ReturnFalse

; ordinal 12 — left >= right, signed
CompareSignedGreaterEqual:
        OR      A
        SBC     HL,DE
        JP      Z,ReturnTrue
        JP      PO,_sgeNoOverflow
        JP      P,ReturnTrue
        JP      ReturnFalse
_sgeNoOverflow:
        JP      M,ReturnTrue
        JP      ReturnFalse

; Shared exits. These are global labels rather than locals because AZM scopes
; a local label to the routine above it, and every comparison branches here.
ReturnTrue:
        LD      HL,1
        RET
ReturnFalse:
        LD      HL,0
        RET

; --------------------------------------------------------------- ordinal 13
; boundsCheck: HL is the subscript, DE the declared length. Returns with HL
; unchanged, or traps.
;
; The subscript is saved across the subtraction rather than recomputed,
; because the caller has already spent the index expression and the address
; arithmetic that follows needs the same value.
BoundsCheck:
        PUSH    HL
        OR      A
        SBC     HL,DE           ; carry means subscript < length
        POP     HL              ; POP HL leaves the flags alone
        RET     C
        LD      A,FAULT_BOUNDS
        JP      Trap

TrapDivideByZero:
        LD      A,FAULT_DIVZERO

; A holds the diagnostic byte. Level 0 has no error subsystem and a failed
; subscript has no continuation, so the trap reports and stops rather than
; returning a fault the caller would have to check on every subscript.
Trap:
        OUT     (PORT_DIAGNOSTIC),A
        LD      A,STATUS_TRAP
        OUT     (PORT_STATUS),A
        HALT
