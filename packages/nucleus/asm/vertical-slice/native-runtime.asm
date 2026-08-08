; Minimal direct-Z80 runtime and target-independent output service adapter.

.routine out carry,zero clobbers sign,parity,halfCarry,A,HL
NativeReset:
            XOR  A
            LD   (NativeTrapNumber),A
            LD   (NativeTrapRoutine),A
            LD   (NativeTrapError),A
            LD   (ServiceOutputLength),A
            LD   (ServiceOutputByte),A
            LD   HL,0
            LD   (NativeTrapOffset),HL
            LD   A,NativeRunReady
            LD   (NativeRunState),A
            OR   A
            RET

; Input A is the byte. Carry returns a recoverable failure, with A as its code.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B
NativeWriteOutputByte:
            LD   B,A
            LD   A,(ServiceForceFailure)
            OR   A
            JR   NZ,NativeWriteOutputByteFailure
            LD   A,B
            LD   (ServiceOutputByte),A
            LD   A,1
            LD   (ServiceOutputLength),A
            XOR  A
            RET
NativeWriteOutputByteFailure:
            LD   A,3
            SCF
            RET
