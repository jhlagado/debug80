; One-byte semantic dispatcher with page-local trampolines to arbitrary handlers.

            .include "memory-map.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
OffsetTrampolineSelectionStart:
OffsetTrampolinePage:
            .db OT0OFF
            .db OT1OFF
            .db OT2OFF
            .db OT3OFF
            .db OT4OFF
            .db OT5OFF
            .db OT6OFF
            .db OT7OFF
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
OT0OFF .equ OffsetTrampoline0-OffsetTrampolinePage ; trampoline dispatcher page offset 0
OT1OFF .equ OffsetTrampoline1-OffsetTrampolinePage ; trampoline dispatcher page offset 1
OT2OFF .equ OffsetTrampoline2-OffsetTrampolinePage ; trampoline dispatcher page offset 2
OT3OFF .equ OffsetTrampoline3-OffsetTrampolinePage ; trampoline dispatcher page offset 3
OT4OFF .equ OffsetTrampoline4-OffsetTrampolinePage ; trampoline dispatcher page offset 4
OT5OFF .equ OffsetTrampoline5-OffsetTrampolinePage ; trampoline dispatcher page offset 5
OT6OFF .equ OffsetTrampoline6-OffsetTrampolinePage ; trampoline dispatcher page offset 6
OT7OFF .equ OffsetTrampoline7-OffsetTrampolinePage ; trampoline dispatcher page offset 7
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
