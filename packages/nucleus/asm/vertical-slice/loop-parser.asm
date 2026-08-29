; Predictive parser for the counted-loop and checked-array proof programs.

; The including proof or build context defines HybridLL1Full explicitly.

            .include "loop-parser-core.asmi"

; The typed scalar increment is kept in a separate source unit while it is
; correctness-first and under review. The compression pass may fold shared
; tails back into this parser after the rules are stable.
            .include "typed-expression-parser.asm"
            .include "aggregate-parser.asm"
.if AggregateCallSlices
.if Stage7LL1
            .include "aggregate-call-parser-stage7.asm"
.else
            .include "aggregate-call-parser.asm"
.endif
.endif
