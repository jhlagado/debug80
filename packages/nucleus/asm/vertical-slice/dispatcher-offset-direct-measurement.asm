; Ideal one-byte semantic dispatcher when every handler begins in one page.

            .include "memory-map.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
OffsetDirectSelectionStart:
OffsetDirectPage:
            .db OD0OFF
            .db OD1OFF
            .db OD2OFF
            .db OD3OFF
            .db OD4OFF
            .db OD5OFF
            .db OD6OFF
            .db OD7OFF
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
OD0OFF .equ OffsetDirect0-OffsetDirectPage ; direct dispatcher page offset 0
OD1OFF .equ OffsetDirect1-OffsetDirectPage ; direct dispatcher page offset 1
OD2OFF .equ OffsetDirect2-OffsetDirectPage ; direct dispatcher page offset 2
OD3OFF .equ OffsetDirect3-OffsetDirectPage ; direct dispatcher page offset 3
OD4OFF .equ OffsetDirect4-OffsetDirectPage ; direct dispatcher page offset 4
OD5OFF .equ OffsetDirect5-OffsetDirectPage ; direct dispatcher page offset 5
OD6OFF .equ OffsetDirect6-OffsetDirectPage ; direct dispatcher page offset 6
OD7OFF .equ OffsetDirect7-OffsetDirectPage ; direct dispatcher page offset 7
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
