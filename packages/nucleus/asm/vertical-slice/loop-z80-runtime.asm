; Direct-Z80 runtime and bounded output adapter for the counted-loop slice.

.routine out carry,zero clobbers sign,parity,halfCarry,A,B,C,HL
Reset:
            XOR  A
            LD   (TrapNumber),A
            LD   (TrapRoutine),A
            LD   (TrapError),A
            LD   (ServiceCallCount),A
            LD   (ServiceFailureCall),A
            LD   (ServiceOutputLength),A
            LD   (ServiceInputCursor),A
            LD   (ServiceInputFailure),A
            LD   (ServiceStorageInputCursor),A
            LD   (ServiceStorageInputFailure),A
            LD   (ServiceStorageOutputLength),A
            LD   (ServiceStorageOutputCursor),A
            LD   (ServiceStorageOutputFailure),A
            LD   (ActivationDepth),A
            LD   (ScalarSlot),A
            LD   A,ActivationCapacity
            LD   (ActivationLimit),A
            LD   HL,0
            LD   (TrapOffset),HL
            LD   HL,ServiceOutputBase
            LD   B,ServiceOutputCapacity
ResetOutput:
            LD   (HL),A
            INC  HL
            DJNZ ResetOutput
            LD   HL,ServiceStorageOutputBase
            LD   B,ServiceStorageOutputCapacity
ResetStorageOutput:
            LD   (HL),A
            INC  HL
            DJNZ ResetStorageOutput
            LD   A,RunReady
            LD   (RunState),A
            OR   A
            RET

; Begin one scalar activation atomically. A is the copied u8 argument. The
; packed arena stores exactly the overwritten byte; Z80 CALL/RET carries the
; Z80 return address separately. Carry reports activation-capacity with
; trap number 5 and leaves depth, arena, and the active scalar unchanged.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
ActivationPush:
            LD   B,A
            LD   A,(ActivationDepth)
            LD   C,A
            ; Reset/configuration fixes the limit before execution and every
            ; accepted push increments depth by one, so depth cannot pass the
            ; limit. Equality is the complete configured-limit test here.
            LD   A,(ActivationLimit)
            CP   C
            JR   Z,ActivationFull
            LD   A,C
            CP   ActivationCapacity
            JR   NC,ActivationFull
            LD   A,(ScalarSlot)
            PUSH BC
            LD   B,0
            LD   HL,ActivationArena
            ADD  HL,BC
            POP  BC
            LD   (HL),A
            INC  C
            LD   A,C
            LD   (ActivationDepth),A
            LD   A,B
            LD   (ScalarSlot),A
            XOR  A
            RET
ActivationFull:
            LD   A,5
            SCF
            RET

; Pop one successful scalar activation. The result is preserved by the
; generated caller while this helper restores its previous scalar byte.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
ActivationPop:
            LD   A,(ActivationDepth)
            DEC  A
            LD   (ActivationDepth),A
            LD   C,A
            LD   B,0
            LD   HL,ActivationArena
            ADD  HL,BC
            LD   A,(HL)
            LD   (ScalarSlot),A
            XOR  A
            RET

; The integrated typed-call path keeps parameters and locals in each Z80
; stack frame. These helpers therefore account only for bounded active depth;
; they preserve HL so a checked argument or returned carrier can cross them.
.routine out A,carry,zero clobbers sign,parity,halfCarry,C
ActivationClaim:
            LD   A,(ActivationDepth)
            LD   C,A
            LD   A,(ActivationLimit)
            CP   C
            JR   Z,ActivationClaimFull
            LD   A,C
            CP   ActivationCapacity
            JR   NC,ActivationClaimFull
            INC  A
            LD   (ActivationDepth),A
            XOR  A
            RET
ActivationClaimFull:
            LD   A,5
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry
ActivationRelease:
            LD   A,(ActivationDepth)
            DEC  A
            LD   (ActivationDepth),A
            XOR  A
            RET

.if AggregateCallSlices
; Carry reports an out-of-domain u16 index. A is the one-byte retained length
; and DE is the canonical index carrier.
.routine in A,DE out A,carry,zero clobbers sign,parity,halfCarry,C
CheckArrayIndex:
            LD   C,A
            LD   A,D
            OR   A
            JR   NZ,AggregateBoundsFailure
            LD   A,E
            CP   C
            JR   NC,AggregateBoundsFailure
            OR   A
            RET

; C is the declared capacity and HL a bounded-string carrier. On success HL is
; the canonical current length. A corrupted length above capacity is rejected.
.routine in C,HL out A,HL,carry,zero clobbers sign,parity,halfCarry
CheckStringLength:
            LD   A,(HL)
            CP   C
            JR   C,CheckStringLengthReady
            JR   Z,CheckStringLengthReady
            SCF
            RET
CheckStringLengthReady:
            LD   L,A
            LD   H,0
            OR   A
            RET

; C is the declared capacity, HL a bounded-string carrier, and DE the canonical
; index. On success HL is the addressed payload byte; no byte is read before
; the length invariant and logical-index checks.
.routine in C,DE,HL out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
CheckStringIndex:
            LD   A,D
            OR   A
            JR   NZ,AggregateBoundsFailure
            LD   A,(HL)
            LD   B,A
            CP   C
            JR   C,CheckStringIndexLengthReady
            JR   NZ,AggregateBoundsFailure
CheckStringIndexLengthReady:
            LD   A,B
            CP   E
            JR   C,AggregateBoundsFailure
            JR   Z,AggregateBoundsFailure
            INC  HL
            ADD  HL,DE
            OR   A
            RET

; A is a fixed extent (zero encodes 256), HL an address, and DE the exclusive
; data end.
; The helper rejects wrapped arithmetic and any region outside GeneratedBase+3
; through the supplied end. It is used twice before aggregate copying begins.
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IY
CheckAggregateRegion:
            PUSH DE
            POP  IY
            LD   C,A
            LD   B,0
            OR   A
            JR   NZ,CheckAggregateExtentReady
            INC  B
CheckAggregateExtentReady:
            PUSH HL
            LD   DE,GeneratedBase+3
            OR   A
            SBC  HL,DE
            JR   C,AggregateRegionLow
            POP  HL
            ADD  HL,BC
            JR   C,AggregateBoundsFailure
            PUSH IY
            POP  DE
            OR   A
            SBC  HL,DE
            JR   C,AggregateRegionSuccess
            JR   Z,AggregateRegionSuccess
AggregateBoundsFailure:
            SCF
            RET
AggregateRegionLow:
            POP  HL
            SCF
            RET
AggregateRegionSuccess:
            OR   A
            RET
.endif

; Unsigned low-byte multiplication for generated expression code. A and B are
; the operands; the result wraps modulo 256 exactly as MUL8 requires.
.routine in A,B out A,carry,zero clobbers sign,parity,halfCarry,B,C
MultiplyU8:
            LD   C,A
            XOR  A
            INC  B
MultiplyU8Loop:
            DEC  B
            RET  Z
            ADD  A,C
            JR   MultiplyU8Loop

; Full-width multiplication for typed generated expressions. Small nonzero
; powers of two shift directly; the general sixteen-round path returns the low
; sixteen bits, matching u16 wraparound.
.routine in DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
MultiplyU16:
            LD   A,D
            OR   A
            JR   NZ,MultiplyU16General
            LD   A,E
            OR   A
            JR   Z,MultiplyU16General
            DEC  A
            AND  E
            JR   NZ,MultiplyU16General
            LD   A,E
MultiplyU16Power:
            SRL  A
            JR   Z,MultiplyU16PowerDone
            ADD  HL,HL
            JR   MultiplyU16Power
MultiplyU16PowerDone:
            OR   A
            RET
MultiplyU16General:
            LD   BC,0
            LD   A,16
MultiplyU16Loop:
            SRL  D
            RR   E
            JR   NC,MultiplyU16Skip
            PUSH HL
            ADD  HL,BC
            LD   B,H
            LD   C,L
            POP  HL
MultiplyU16Skip:
            ADD  HL,HL
            DEC  A
            JR   NZ,MultiplyU16Loop
            LD   H,B
            LD   L,C
            OR   A
            RET

; Unsigned quotient. Carry reports a zero divisor without producing a value.
.routine in DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
DivideU16:
            CALL DivideU16Core
            RET  C
            LD   H,B
            LD   L,C
            OR   A
            RET

.routine in DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
ModuloU16:
            CALL DivideU16Core
            RET

.routine in DE,HL out BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,A
DivideU16Core:
            LD   A,D
            OR   E
            JR   Z,DivideU16Zero
            LD   A,D
            OR   A
            JR   NZ,DivideU16General
            LD   A,E
            DEC  A
            AND  E
            JR   NZ,DivideU16General
            LD   A,E
            DEC  A
            AND  L
            LD   D,A
            LD   A,E
DivideU16Power:
            SRL  A
            JR   Z,DivideU16PowerDone
            SRL  H
            RR   L
            JR   DivideU16Power
DivideU16PowerDone:
            LD   B,H
            LD   C,L
            LD   L,D
            LD   H,0
            OR   A
            RET
DivideU16General:
            LD   BC,0
DivideU16Loop:
            OR   A
            SBC  HL,DE
            JR   C,DivideU16Done
            INC  BC
            JR   DivideU16Loop
DivideU16Done:
            ADD  HL,DE
            OR   A
            RET
DivideU16Zero:
            SCF
            RET

; A selects Comparison*. Both integer widths and booleans use canonical u16
; carriers here; the parser has already restricted Boolean relations to =/<>.
.routine in A,DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
CompareU16:
            LD   B,A
            OR   A
            SBC  HL,DE
            PUSH AF
            POP  DE
            LD   A,B
            CP   ComparisonEqual
            JR   Z,CompareEqual
            CP   ComparisonNotEqual
            JR   Z,CompareNotEqual
            CP   ComparisonLess
            JR   Z,CompareLess
            CP   ComparisonLessEqual
            JR   Z,CompareLessEqual
            CP   ComparisonGreater
            JR   Z,CompareGreater
CompareGreaterEqual:
            PUSH DE
            POP  AF
            JR   NC,CompareTrue
            JR   CompareFalse
CompareEqual:
            PUSH DE
            POP  AF
            JR   Z,CompareTrue
            JR   CompareFalse
CompareNotEqual:
            PUSH DE
            POP  AF
            JR   NZ,CompareTrue
            JR   CompareFalse
CompareLess:
            PUSH DE
            POP  AF
            JR   C,CompareTrue
            JR   CompareFalse
CompareLessEqual:
            PUSH DE
            POP  AF
            JR   C,CompareTrue
            JR   Z,CompareTrue
            JR   CompareFalse
CompareGreater:
            PUSH DE
            POP  AF
            JR   C,CompareFalse
            JR   Z,CompareFalse
CompareTrue:
            LD   HL,1
            OR   A
            RET
CompareFalse:
            LD   HL,0
            OR   A
            RET

; Carry returns endOfInput, a configured input failure, or success in A.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
ReadInputByte:
            LD   A,(ServiceInputFailure)
            OR   A
            JR   NZ,ReadInputByteFailure
            LD   A,(ServiceInputCursor)
            LD   C,A
            LD   A,(ServiceInputLength)
            CP   C
            JR   Z,ReadInputByteEnd
            LD   B,0
            LD   HL,ServiceInputBase
            ADD  HL,BC
            INC  C
            LD   A,C
            LD   (ServiceInputCursor),A
            LD   A,(HL)
            OR   A
            RET
ReadInputByteEnd:
            LD   A,1
ReadInputByteFailure:
            SCF
            RET

; Input A is the byte. Carry returns a recoverable outputFailure code.
; D is preserved because this slice allocates its scalar counter there.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,E,HL
WriteOutputByte:
            LD   E,A
            LD   A,(ServiceCallCount)
            INC  A
            LD   (ServiceCallCount),A
            LD   C,A
            LD   A,(ServiceFailureCall)
            OR   A
            JR   Z,WriteOutputByteStore
            CP   C
            JR   Z,WriteOutputByteFailure
WriteOutputByteStore:
            LD   A,(ServiceOutputLength)
            CP   ServiceOutputCapacity
            JR   NC,WriteOutputByteFailure
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
WriteOutputByteFailure:
            LD   A,3
            SCF
            RET

; Bulk input has the same cursor discipline as standard input, but any
; configured adapter failure is reported as storageFailure.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
ReadStorageByte:
            LD   A,(ServiceStorageInputFailure)
            OR   A
            JR   NZ,StorageFailure
            LD   A,(ServiceStorageInputCursor)
            LD   C,A
            LD   A,(ServiceStorageInputLength)
            CP   C
            JR   Z,ReadStorageByteEnd
            LD   B,0
            LD   HL,ServiceStorageInputBase
            ADD  HL,BC
            INC  C
            LD   A,C
            LD   (ServiceStorageInputCursor),A
            LD   A,(HL)
            OR   A
            RET
ReadStorageByteEnd:
            LD   A,1
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry
RewindStorageInput:
            LD   A,(ServiceStorageInputFailure)
            OR   A
            JR   NZ,StorageFailure
            LD   (ServiceStorageInputCursor),A
            RET

; Input A is written at the current bulk-output cursor. Every check precedes
; the first cursor, length, or output-byte mutation.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,HL
WriteStorageByte:
            LD   D,A
            LD   A,(ServiceStorageOutputFailure)
            OR   A
            JR   NZ,StorageFailure
            LD   A,(ServiceStorageOutputCursor)
            LD   C,A
            LD   A,(ServiceStorageOutputLength)
            CP   C
            JR   C,StorageFailure
            JR   NZ,WriteStorageByteAddress
            LD   A,C
            CP   ServiceStorageOutputCapacity
            JR   NC,StorageFailure
            INC  A
            LD   (ServiceStorageOutputLength),A
WriteStorageByteAddress:
            LD   B,0
            LD   HL,ServiceStorageOutputBase
            ADD  HL,BC
            LD   (HL),D
            INC  C
            LD   A,C
            LD   (ServiceStorageOutputCursor),A
            XOR  A
            RET

; Input HL is an unsigned offset. Only existing positions and the exact end
; are admitted; failure leaves the cursor unchanged.
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry
SeekStorageOutput:
            LD   A,H
            OR   A
            JR   NZ,StorageFailure
            LD   A,(ServiceStorageOutputFailure)
            OR   A
            JR   NZ,StorageFailure
            LD   A,(ServiceStorageOutputLength)
            CP   L
            JR   C,StorageFailure
            LD   A,L
            LD   (ServiceStorageOutputCursor),A
            OR   A
            RET

StorageFailure:
            LD   A,4
            SCF
            RET
