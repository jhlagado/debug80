; Isolated byte census for two equivalent eight-operation dispatch selectors.

            .include "memory-map.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
TableDispatchStart:
.routine in A out carry,zero clobbers sign,parity,halfCarry,A,DE,HL
TableDispatch:
            SUB  12
            CP   8
            JR   NC,TableDispatchInvalid
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,TableDispatchTargets
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            JP   (HL)
TableDispatchInvalid:
            SCF
            RET
TableDispatchTargets:
            .dw Dispatch0,Dispatch1,Dispatch2,Dispatch3
            .dw Dispatch4,Dispatch5,Dispatch6,Dispatch7
TableDispatchEnd:

ChainDispatchStart:
.routine in A out carry,zero clobbers sign,parity,halfCarry,A
ChainDispatch:
            CP   12
            JP   Z,Dispatch0
            CP   13
            JP   Z,Dispatch1
            CP   14
            JP   Z,Dispatch2
            CP   15
            JP   Z,Dispatch3
            CP   16
            JP   Z,Dispatch4
            CP   17
            JP   Z,Dispatch5
            CP   18
            JP   Z,Dispatch6
            CP   19
            JP   Z,Dispatch7
            SCF
            RET
ChainDispatchEnd:

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
