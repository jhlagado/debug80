; Permanent Atom layout for the target runtime link entry.
            %DEFINE RuntimeProofServices 0
            %DEFINE AggregateCallSlices 1
            %INCLUDE "nucleus-runtime-link-context.asmi"
            %INCLUDE "nucleus-target-runtime-link-begin.asmi"
            %INCLUDE "target-z80-runtime.asm"
            %INCLUDE "nucleus-target-runtime-link-end.asmi"
