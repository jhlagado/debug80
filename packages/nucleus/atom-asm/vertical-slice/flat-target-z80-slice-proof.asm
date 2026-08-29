; Permanent Atom layout for the flat target z80 proof.
            %DEFINE SegmentedOutput 1
            %DEFINE TargetStreamingOutput 1
            %DEFINE LegacyCompilerSlices 0
            %DEFINE AggregateCallSlices 1
            %DEFINE Stage7LL1 1
            %DEFINE LegacyEncoders 0
            %DEFINE HybridLL1Full 1
            %DEFINE RuntimeProofServices 1
            %INCLUDE "target-memory-map.asmi"
            %INCLUDE "proof-segmented-state.asmi"
            %INCLUDE "loop-compiler-state.asmi"
            %INCLUDE "aggregate-call-state.asmi"
            %INCLUDE "target-output-state.asmi"
            %INCLUDE "flat-target-z80-slice-generated-base.asmi"
            %INCLUDE "loop-z80-state.asmi"
            %INCLUDE "flat-target-z80-slice-code-begin.asmi"
            %INCLUDE "source-adapter.asm"
            %INCLUDE "flat-target-z80-slice-after-source-adapter.asmi"
            %INCLUDE "loop-tokenizer.asm"
            %INCLUDE "flat-target-z80-slice-after-tokenizer.asmi"
            %INCLUDE "loop-semantic-sink.asm"
            %INCLUDE "flat-target-z80-slice-after-semantic-sink.asmi"
            %INCLUDE "loop-symbols.asm"
            %INCLUDE "flat-target-z80-slice-after-symbols.asmi"
            %INCLUDE "loop-parser.asm"
            %INCLUDE "flat-target-z80-slice-after-parser.asmi"
            %INCLUDE "loop-z80-sink.asm"
            %INCLUDE "flat-target-z80-slice-after-loop-z80-sink.asmi"
            %INCLUDE "target-output.asm"
            %INCLUDE "flat-target-z80-slice-after-target-output.asmi"
            %INCLUDE "typed-expression-z80.asm"
            %INCLUDE "flat-target-z80-slice-after-typed-expression-z80.asmi"
            %INCLUDE "aggregate-z80.asm"
            %INCLUDE "flat-target-z80-slice-after-aggregate-z80.asmi"
            %INCLUDE "loop-keywords.asmi"
            %INCLUDE "flat-target-z80-slice-after-keywords.asmi"
            %INCLUDE "flat-target-z80-slice-source.asmi"
            %INCLUDE "flat-target-z80-slice-staging.asmi"
            %INCLUDE "flat-target-z80-slice-runtime-begin.asmi"
            %INCLUDE "proof-z80-runtime.asm"
            %INCLUDE "flat-target-z80-slice-runtime-after.asmi"
            %INCLUDE "flat-target-z80-slice-proof-body.asmi"
