; One-byte semantic dispatcher with page-local trampolines to arbitrary handlers.

            .include "memory-map.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
OffsetTrampolineSelectionStart:
OffsetTrampolinePage:
            .db OffsetTrampoline0-OffsetTrampolinePage
            .db OffsetTrampoline1-OffsetTrampolinePage
            .db OffsetTrampoline2-OffsetTrampolinePage
            .db OffsetTrampoline3-OffsetTrampolinePage
            .db OffsetTrampoline4-OffsetTrampolinePage
            .db OffsetTrampoline5-OffsetTrampolinePage
            .db OffsetTrampoline6-OffsetTrampolinePage
            .db OffsetTrampoline7-OffsetTrampolinePage
OffsetTrampoline0: JP Dispatch0
OffsetTrampoline1: JP Dispatch1
OffsetTrampoline2: JP Dispatch2
OffsetTrampoline3: JP Dispatch3
OffsetTrampoline4: JP Dispatch4
OffsetTrampoline5: JP Dispatch5
OffsetTrampoline6: JP Dispatch6
OffsetTrampoline7: JP Dispatch7
.routine in A out carry,zero clobbers sign,parity,halfCarry,A,HL
OffsetTrampolineDispatch:
            SUB  12
            CP   8
            JR   NC,OffsetTrampolineInvalid
            LD   L,A
            LD   H,0
            LD   L,(HL)
            LD   H,0
            JP   (HL)
OffsetTrampolineInvalid:
            SCF
            RET
OffsetTrampolineSelectionEnd:

.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch0:  OR A
            RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch1:  OR A
            RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch2:  OR A
            RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch3:  OR A
            RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch4:  OR A
            RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch5:  OR A
            RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch6:  OR A
            RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
Dispatch7:  OR A
            RET
CompilerCodeEnd:
CompilerCoreEnd:

            .org ProofBase
ProofStart:
            LD   A,$A5
            LD   (ProofStatus),A
            HALT
ProofStatus: .db 0
ProofEnd:

            .end
