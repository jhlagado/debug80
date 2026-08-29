; Permanent Atom layout for the Stage 7 LL(1) engine proof.
            %DEFINE SegmentedOutput 0
            %DEFINE AggregateCallSlices 0
            %INCLUDE "memory-map.asmi"
            %INCLUDE "proof-unsegmented-state.asmi"
            %INCLUDE "loop-compiler-state.asmi"
            %INCLUDE "aggregate-call-state.asmi"
            %INCLUDE "stage7-ll1-engine-front.asmi"
            %INCLUDE "stage7-ll1-parser.asm"
            %INCLUDE "stage7-ll1-engine-proof-before-actions.asmi"
            %INCLUDE "../grammar/stage7-proof-actions.asmi"
            %INCLUDE "stage7-ll1-engine-proof-after-actions.asmi"
