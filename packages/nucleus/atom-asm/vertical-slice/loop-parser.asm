; Permanent Atom layout for the loop parser.
            %INCLUDE "loop-parser-core.asmi"
            %INCLUDE "typed-expression-parser.asm"
            %INCLUDE "aggregate-parser.asm"
            %IF AggregateCallSlices
            %IF Stage7LL1
            %INCLUDE "aggregate-call-parser-stage7.asm"
            %ELSE
            %INCLUDE "aggregate-call-parser.asm"
            %ENDIF
            %ENDIF
