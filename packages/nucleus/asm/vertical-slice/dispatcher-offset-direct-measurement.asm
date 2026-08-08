; Ideal one-byte semantic dispatcher when every handler begins in one page.

            .include "memory-map.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
OffsetDirectSelectionStart:
OffsetDirectPage:
            .db OffsetDirect0-OffsetDirectPage
            .db OffsetDirect1-OffsetDirectPage
            .db OffsetDirect2-OffsetDirectPage
            .db OffsetDirect3-OffsetDirectPage
            .db OffsetDirect4-OffsetDirectPage
            .db OffsetDirect5-OffsetDirectPage
            .db OffsetDirect6-OffsetDirectPage
            .db OffsetDirect7-OffsetDirectPage
.routine in A out carry,zero clobbers sign,parity,halfCarry,A,HL
OffsetDirectDispatch:
            SUB  12
            CP   8
            JR   NC,OffsetDirectInvalid
            LD   L,A
            LD   H,0
            LD   L,(HL)
            LD   H,0
            JP   (HL)
OffsetDirectInvalid:
            SCF
            RET
OffsetDirectSelectionEnd:

.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect0: OR A
               RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect1: OR A
               RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect2: OR A
               RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect3: OR A
               RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect4: OR A
               RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect5: OR A
               RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect6: OR A
               RET
.routine out carry,zero clobbers sign,parity,halfCarry,A
OffsetDirect7: OR A
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
