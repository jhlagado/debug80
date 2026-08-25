; CP/M BDOS and FCB helpers. IX and IY are not standardized by CP/M, so the
; wrapper preserves both around every guest operating-system call.

CpmBdos .equ $0005

EditorBdosCodeStart:
.routine in C,DE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorCallBdos:
            PUSH IX
            PUSH IY
            CALL CpmBdos
            POP  IY
            POP  IX
            RET

.routine in DE,HL out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
EditorBuildFcb:
            LD   BC,12
            LDIR
            XOR  A
            LD   B,24
EditorClearFcbTail:
            LD   (DE),A
            INC  DE
            DJNZ EditorClearFcbTail
            RET

.routine in DE out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSetDma:
            LD   C,26
            JR   EditorCallBdos

.routine in C out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorTransactionCall:
            LD   DE,EditorTransactionFcb
            JR   EditorCallBdos

.routine in C out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSelectedCall:
            LD   DE,EditorFcb
            JR   EditorCallBdos
EditorBdosCodeEnd:
