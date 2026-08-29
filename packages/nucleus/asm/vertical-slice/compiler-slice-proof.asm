; End-to-end proof of the streaming source adapter, tokenizer, predictive
; parser, semantic checks, positioned diagnostic, and operation sink.

            .include "compiler-slice-proof-config.asmi"
            .include "memory-map.asmi"
            .include "compiler-state.asmi"
            .include "compiler-slice-code-begin.asmi"
            .include "source-adapter.asm"
            .include "tokenizer.asm"
            .include "semantic-sink.asm"
            .include "parser.asm"
            .include "compiler-slice-proof-body.asmi"
