; Permanent Atom layout for the typed-expression z80 backend.
            %INCLUDE "typed-expression-z80-core.asmi"
            %INCLUDE "structured-control-z80.asm"
            %IF AggregateCallSlices
            %INCLUDE "aggregate-call-z80.asm"
            %ENDIF
            %INCLUDE "typed-expression-z80-tail.asmi"
