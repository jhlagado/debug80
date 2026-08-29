; Permanent Atom layout for the compiler-slice proof.
            %DEFINE AggregateCallSlices 0
            %INCLUDE "memory-map.asmi"
            %INCLUDE "compiler-state.asmi"
            %INCLUDE "compiler-slice-code-begin.asmi"
            %INCLUDE "source-adapter.asm"
            %INCLUDE "tokenizer.asm"
            %INCLUDE "semantic-sink.asm"
            %INCLUDE "parser.asm"
            %INCLUDE "compiler-slice-proof-body.asmi"
