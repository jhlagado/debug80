; Typed-expression parser section owner. The core parser and structured-control
; extension are separate source parts so dependency includes stay in the header
; while the emitted order remains typed parser, structured-control parser.

            .include "typed-expression-parser-core.asmi"
            .include "structured-control-parser.asm"
