; Permanent Atom layout for the Stage 7 aggregate-call proof.
            %DEFINE SegmentedOutput 1
            %DEFINE TargetStreamingOutput 0
            %DEFINE LegacyCompilerSlices 0
            %DEFINE AggregateCallSlices 1
            %DEFINE Stage7LL1 1
            %DEFINE LegacyEncoders 0
            %DEFINE HybridLL1Full 1
            %DEFINE RuntimeProofServices 1
            %INCLUDE "memory-map.asmi"
            %INCLUDE "proof-segmented-state.asmi"
            %INCLUDE "loop-compiler-state.asmi"
            %INCLUDE "aggregate-call-state.asmi"
            %INCLUDE "loop-z80-state.asmi"
            %INCLUDE "stage7-ll1-aggregate-call-code-begin.asmi"
            %INCLUDE "source-adapter.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-source-adapter.asmi"
            %INCLUDE "loop-tokenizer.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-tokenizer.asmi"
            %INCLUDE "loop-semantic-sink.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-semantic-sink.asmi"
            %INCLUDE "loop-symbols.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-symbols.asmi"
            %INCLUDE "loop-parser.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-parser.asmi"
            %INCLUDE "loop-z80-sink.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-loop-z80-sink.asmi"
            %INCLUDE "typed-expression-z80.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-typed-expression-z80.asmi"
            %INCLUDE "aggregate-z80.asm"
            %INCLUDE "stage7-ll1-aggregate-call-after-aggregate-z80.asmi"
            %INCLUDE "loop-keywords.asmi"
            %INCLUDE "stage7-ll1-aggregate-call-after-keywords.asmi"
            %INCLUDE "stage7-ll1-aggregate-call-source.asmi"
            %INCLUDE "stage7-ll1-aggregate-call-backup-source.asmi"
            %INCLUDE "stage7-ll1-aggregate-call-runtime-begin.asmi"
            %INCLUDE "proof-z80-runtime.asm"
            %INCLUDE "stage7-ll1-aggregate-call-runtime-after.asmi"
            %INCLUDE "stage7-ll1-aggregate-call-proof-body.asmi"
