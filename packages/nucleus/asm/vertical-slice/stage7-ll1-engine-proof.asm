; Independently exercise the packed Stage 7 LL(1) engine and generated tables
; with the smallest complete main program. All semantic actions are proof-only
; RET aliases; this proof tests grammar selection, terminal consumption, stack
; order, indirect action returns, and clean completion.

            .include "stage7-ll1-engine-proof-config.asmi"
            .include "memory-map.asmi"
            .include "proof-unsegmented-state.asmi"
            .include "loop-compiler-state.asmi"
            .include "aggregate-call-state.asmi"

            .include "stage7-ll1-engine-front.asmi"
            .include "stage7-ll1-parser.asm"
            .include "stage7-ll1-engine-proof-before-actions.asmi"
            .include "../../grammar/stage7-proof-actions.asmi"
            .include "stage7-ll1-engine-proof-after-actions.asmi"
