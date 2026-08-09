; Minimal direct-Z80 runtime and target-independent output service adapter.

.routine out carry,zero clobbers sign,parity,halfCarry,A,HL
Reset:
            XOR  A
            LD   (TrapNumber),A
            LD   (TrapRoutine),A
            LD   (TrapError),A
            LD   (ServiceOutputLength),A
            LD   (ServiceOutputByte),A
            LD   HL,0
            LD   (TrapOffset),HL
            LD   A,RunReady
            LD   (RunState),A
            OR   A
            RET

; Input A is the byte. Carry returns a recoverable failure, with A as its code.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B
WriteOutputByte:
            LD   B,A
            LD   A,(ServiceForceFailure)
            OR   A
            JR   NZ,WriteOutputByteFailure
            LD   A,B
            LD   (ServiceOutputByte),A
            LD   A,1
            LD   (ServiceOutputLength),A
            XOR  A
            RET
WriteOutputByteFailure:
            LD   A,3
            SCF
            RET
