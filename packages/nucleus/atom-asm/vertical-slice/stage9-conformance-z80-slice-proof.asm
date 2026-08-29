; Permanent Atom layout for the Stage 9 conformance proof.
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
            %INCLUDE "stage9-conformance-code-begin.asmi"
            %INCLUDE "source-adapter.asm"
            %INCLUDE "stage9-conformance-after-source-adapter.asmi"
            %INCLUDE "loop-tokenizer.asm"
            %INCLUDE "stage9-conformance-after-tokenizer.asmi"
            %INCLUDE "loop-semantic-sink.asm"
            %INCLUDE "stage9-conformance-after-semantic-sink.asmi"
            %INCLUDE "loop-symbols.asm"
            %INCLUDE "stage9-conformance-after-symbols.asmi"
            %INCLUDE "loop-parser.asm"
            %INCLUDE "stage9-conformance-after-parser.asmi"
            %INCLUDE "loop-z80-sink.asm"
            %INCLUDE "stage9-conformance-after-loop-z80-sink.asmi"
            %INCLUDE "typed-expression-z80.asm"
            %INCLUDE "stage9-conformance-after-typed-expression-z80.asmi"
            %INCLUDE "aggregate-z80.asm"
            %INCLUDE "stage9-conformance-after-aggregate-z80.asmi"
            %INCLUDE "loop-keywords.asmi"
            %INCLUDE "stage9-conformance-after-keywords.asmi"
            %INCLUDE "stage9-conformance-runtime-begin.asmi"
            %INCLUDE "proof-z80-runtime.asm"
            %INCLUDE "stage9-conformance-runtime-after.asmi"
            %INCLUDE "stage9-conformance-corpus-source.asmi"
            %INCLUDE "stage9-conformance-proof-body.asmi"
