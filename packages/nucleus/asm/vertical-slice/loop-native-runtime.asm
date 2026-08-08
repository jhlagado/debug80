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
            LD   (NativeActivationDepth),A
            LD   (NativeScalarSlot),A
            LD   A,NativeActivationCapacity
            LD   (NativeActivationLimit),A
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

; Begin one scalar activation atomically. A is the copied u8 argument. The
; packed arena stores exactly the overwritten byte; Z80 CALL/RET carries the
; native return address separately. Carry reports activation-capacity with
; trap number 5 and leaves depth, arena, and the active scalar unchanged.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
NativeActivationPush:
            LD   B,A
            LD   A,(NativeActivationDepth)
            LD   C,A
            ; Reset/configuration fixes the limit before execution and every
            ; accepted push increments depth by one, so depth cannot pass the
            ; limit. Equality is the complete configured-limit test here.
            LD   A,(NativeActivationLimit)
            CP   C
            JR   Z,NativeActivationFull
            LD   A,C
            CP   NativeActivationCapacity
            JR   NC,NativeActivationFull
            LD   A,(NativeScalarSlot)
            PUSH BC
            LD   B,0
            LD   HL,NativeActivationArena
            ADD  HL,BC
            POP  BC
            LD   (HL),A
            INC  C
            LD   A,C
            LD   (NativeActivationDepth),A
            LD   A,B
            LD   (NativeScalarSlot),A
            XOR  A
            RET
NativeActivationFull:
            LD   A,5
            SCF
            RET

; Pop one successful scalar activation. The result is preserved by the
; generated caller while this helper restores its previous scalar byte.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
NativeActivationPop:
            LD   A,(NativeActivationDepth)
            DEC  A
            LD   (NativeActivationDepth),A
            LD   C,A
            LD   B,0
            LD   HL,NativeActivationArena
            ADD  HL,BC
            LD   A,(HL)
            LD   (NativeScalarSlot),A
            XOR  A
            RET

; Unsigned low-byte multiplication for generated expression code. A and B are
; the operands; the result wraps modulo 256 exactly as MUL8 requires.
.routine in A,B out A,carry,zero clobbers sign,parity,halfCarry,B,C
NativeMultiplyU8:
            LD   C,A
            XOR  A
            INC  B
NativeMultiplyU8Loop:
            DEC  B
            RET  Z
            ADD  A,C
            JR   NativeMultiplyU8Loop

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
