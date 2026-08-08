; Direct-Z80 runtime and bounded output adapter for the counted-loop slice.

.routine out carry,zero clobbers sign,parity,halfCarry,A,B,C,HL
NativeReset:
            XOR  A
            LD   (NativeTrapNumber),A
            LD   (NativeTrapRoutine),A
            LD   (NativeTrapError),A
            LD   (ServiceCallCount),A
            LD   (ServiceOutputLength),A
            LD   (ServiceInputCursor),A
            LD   HL,0
            LD   (NativeTrapOffset),HL
            LD   HL,ServiceOutputBase
            LD   B,ServiceOutputCapacity
NativeResetOutput:
            LD   (HL),A
            INC  HL
            DJNZ NativeResetOutput
            LD   A,NativeRunReady
            LD   (NativeRunState),A
            OR   A
            RET

; Carry returns endOfInput, a configured input failure, or success in A.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
NativeReadInputByte:
            LD   A,(ServiceInputFailure)
            OR   A
            JR   NZ,NativeReadInputByteFailure
            LD   A,(ServiceInputCursor)
            LD   C,A
            LD   A,(ServiceInputLength)
            CP   C
            JR   Z,NativeReadInputByteEnd
            LD   B,0
            LD   HL,ServiceInputBase
            ADD  HL,BC
            INC  C
            LD   A,C
            LD   (ServiceInputCursor),A
            LD   A,(HL)
            OR   A
            RET
NativeReadInputByteEnd:
            LD   A,1
NativeReadInputByteFailure:
            SCF
            RET

; Input A is the byte. Carry returns a recoverable outputFailure code.
; D is preserved because this slice allocates its scalar counter there.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,E,HL
NativeWriteOutputByte:
            LD   E,A
            LD   A,(ServiceCallCount)
            INC  A
            LD   (ServiceCallCount),A
            LD   C,A
            LD   A,(ServiceFailureCall)
            OR   A
            JR   Z,NativeWriteOutputByteStore
            CP   C
            JR   Z,NativeWriteOutputByteFailure
NativeWriteOutputByteStore:
            LD   A,(ServiceOutputLength)
            CP   ServiceOutputCapacity
            JR   NC,NativeWriteOutputByteFailure
            LD   C,A
            LD   B,0
            LD   HL,ServiceOutputBase
            ADD  HL,BC
            LD   A,E
            LD   (HL),A
            LD   A,(ServiceOutputLength)
            INC  A
            LD   (ServiceOutputLength),A
            XOR  A
            RET
NativeWriteOutputByteFailure:
            LD   A,3
            SCF
            RET
