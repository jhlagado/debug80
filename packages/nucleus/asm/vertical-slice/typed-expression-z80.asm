; Correctness-first direct-Z80 backend for the complete scalar-expression
; increment. All evaluation values use canonical 16-bit carriers on the Z80
; stack. Declared u8/boolean objects still occupy one byte; u16 occupies two.

            .include "typed-expression-z80-core.asmi"
            .include "structured-control-z80.asm"
.if AggregateCallSlices
            .include "aggregate-call-z80.asm"
.endif
            .include "typed-expression-z80-tail.asmi"
