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

; The integrated typed-call path keeps parameters and locals in each native
; stack frame. These helpers therefore account only for bounded active depth;
; they preserve HL so a checked argument or returned carrier can cross them.
.routine out A,carry,zero clobbers sign,parity,halfCarry,C
NativeActivationClaim:
            LD   A,(NativeActivationDepth)
            LD   C,A
            LD   A,(NativeActivationLimit)
            CP   C
            JR   Z,NativeActivationClaimFull
            LD   A,C
            CP   NativeActivationCapacity
            JR   NC,NativeActivationClaimFull
            INC  A
            LD   (NativeActivationDepth),A
            XOR  A
            RET
NativeActivationClaimFull:
            LD   A,5
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry
NativeActivationRelease:
            LD   A,(NativeActivationDepth)
            DEC  A
            LD   (NativeActivationDepth),A
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

; Full-width multiplication for typed generated expressions. The sixteen
; shift/add rounds return the low sixteen bits, matching u16 wraparound.
.routine in DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
NativeMultiplyU16:
            LD   BC,0
            LD   A,16
NativeMultiplyU16Loop:
            SRL  D
            RR   E
            JR   NC,NativeMultiplyU16Skip
            PUSH HL
            ADD  HL,BC
            LD   B,H
            LD   C,L
            POP  HL
NativeMultiplyU16Skip:
            ADD  HL,HL
            DEC  A
            JR   NZ,NativeMultiplyU16Loop
            LD   H,B
            LD   L,C
            OR   A
            RET

; Unsigned quotient. Carry reports a zero divisor without producing a value.
.routine in DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
NativeDivideU16:
            LD   A,D
            OR   E
            JR   Z,NativeDivideU16Zero
            LD   BC,0
NativeDivideU16Loop:
            OR   A
            SBC  HL,DE
            JR   C,NativeDivideU16Done
            INC  BC
            JR   NativeDivideU16Loop
NativeDivideU16Done:
            LD   H,B
            LD   L,C
            OR   A
            RET
NativeDivideU16Zero:
            SCF
            RET

; A selects Comparison*. Both integer widths and booleans use canonical u16
; carriers here; the parser has already restricted Boolean relations to =/<>.
.routine in A,DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
NativeCompareU16:
            LD   B,A
            OR   A
            SBC  HL,DE
            PUSH AF
            POP  DE
            LD   A,B
            CP   ComparisonEqual
            JR   Z,NativeCompareEqual
            CP   ComparisonNotEqual
            JR   Z,NativeCompareNotEqual
            CP   ComparisonLess
            JR   Z,NativeCompareLess
            CP   ComparisonLessEqual
            JR   Z,NativeCompareLessEqual
            CP   ComparisonGreater
            JR   Z,NativeCompareGreater
NativeCompareGreaterEqual:
            PUSH DE
            POP  AF
            JR   NC,NativeCompareTrue
            JR   NativeCompareFalse
NativeCompareEqual:
            PUSH DE
            POP  AF
            JR   Z,NativeCompareTrue
            JR   NativeCompareFalse
NativeCompareNotEqual:
            PUSH DE
            POP  AF
            JR   NZ,NativeCompareTrue
            JR   NativeCompareFalse
NativeCompareLess:
            PUSH DE
            POP  AF
            JR   C,NativeCompareTrue
            JR   NativeCompareFalse
NativeCompareLessEqual:
            PUSH DE
            POP  AF
            JR   C,NativeCompareTrue
            JR   Z,NativeCompareTrue
            JR   NativeCompareFalse
NativeCompareGreater:
            PUSH DE
            POP  AF
            JR   C,NativeCompareFalse
            JR   Z,NativeCompareFalse
NativeCompareTrue:
            LD   HL,1
            OR   A
            RET
NativeCompareFalse:
            LD   HL,0
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
