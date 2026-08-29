; Permanent Atom layout for the loop z80 proof.
            %DEFINE SegmentedOutput 0
            %DEFINE TargetStreamingOutput 0
            %DEFINE LegacyCompilerSlices 1
            %DEFINE AggregateCallSlices 0
            %DEFINE LegacyEncoders 1
            %DEFINE HybridLL1Full 0
            %DEFINE RuntimeProofServices 1
            %INCLUDE "memory-map.asmi"
            %INCLUDE "proof-unsegmented-state.asmi"
            %INCLUDE "loop-compiler-state.asmi"
            %INCLUDE "loop-z80-state.asmi"
            %INCLUDE "loop-z80-slice-code-begin.asmi"
            %INCLUDE "source-adapter.asm"
            %INCLUDE "loop-z80-slice-after-source-adapter.asmi"
            %INCLUDE "loop-tokenizer.asm"
            %INCLUDE "loop-z80-slice-after-tokenizer.asmi"
            %INCLUDE "loop-semantic-sink.asm"
            %INCLUDE "loop-z80-slice-after-semantic-sink.asmi"
            %INCLUDE "loop-symbols.asm"
            %INCLUDE "loop-z80-slice-after-symbols.asmi"
            %INCLUDE "loop-parser.asm"
            %INCLUDE "loop-z80-slice-after-parser.asmi"
            %INCLUDE "loop-z80-sink.asm"
            %INCLUDE "loop-z80-slice-after-loop-z80-sink.asmi"
            %INCLUDE "loop-keywords.asmi"
            %INCLUDE "loop-z80-slice-after-keywords.asmi"
            %INCLUDE "loop-z80-slice-source.asmi"
            %INCLUDE "loop-z80-slice-runtime-begin.asmi"
            %INCLUDE "proof-z80-runtime.asm"
            %INCLUDE "loop-z80-slice-runtime-after.asmi"
            %INCLUDE "loop-z80-slice-proof-body.asmi"
            %INCLUDE "loop-z80-slice-end.asmi"
