; Permanent Atom layout for the loop compiler proof.
            %DEFINE SegmentedOutput 0
            %DEFINE TargetStreamingOutput 0
            %DEFINE LegacyCompilerSlices 1
            %DEFINE AggregateCallSlices 0
            %DEFINE HybridLL1Full 0
            %INCLUDE "memory-map.asmi"
            %INCLUDE "proof-unsegmented-state.asmi"
            %INCLUDE "loop-compiler-state.asmi"
            %INCLUDE "loop-compiler-slice-code-begin.asmi"
            %INCLUDE "source-adapter.asm"
            %INCLUDE "loop-compiler-slice-after-source-adapter.asmi"
            %INCLUDE "loop-tokenizer.asm"
            %INCLUDE "loop-compiler-slice-after-tokenizer.asmi"
            %INCLUDE "loop-semantic-sink.asm"
            %INCLUDE "loop-compiler-slice-after-semantic-sink.asmi"
            %INCLUDE "loop-symbols.asm"
            %INCLUDE "loop-compiler-slice-after-symbols.asmi"
            %INCLUDE "loop-parser.asm"
            %INCLUDE "loop-compiler-slice-after-parser.asmi"
            %INCLUDE "loop-keywords.asmi"
            %INCLUDE "loop-compiler-slice-after-keywords.asmi"
            %INCLUDE "loop-compiler-slice-source.asmi"
            %INCLUDE "loop-compiler-slice-proof-body.asmi"
            %INCLUDE "loop-compiler-slice-end.asmi"
