; Executable proof that the manifest-driven harness and vertical-slice memory
; profile agree with the assembly interface.

            %INCLUDE "memory-map.asmi"

            ORG PRFBS
PRFSTRT: ;@NUC-GLOBAL ProofStart PERMANENT PRFSTRT
            LD   SP,StackTop
            LD   A,$A5
            LD   (PRFSTTS),A
            HALT
ProofEnd:

PRFSTTS: ;@NUC-GLOBAL ProofStatus PERMANENT PRFSTTS
            DB  0

            ;@AZM-END
