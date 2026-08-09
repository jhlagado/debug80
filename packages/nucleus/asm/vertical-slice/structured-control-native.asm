; Post-parse absolute-label and structured-loop lowering. All generated branch
; operands are compiler-private absolute words and are resolved before the
; generated program is published.

EmitControlCounter      .equ EmitCodeStart
EmitControlMode         .equ EmitCodeStart+1
EmitControlStep         .equ EmitLoopHead
EmitControlTrapOffset   .equ EmitExitFixup
EmitControlTestLabel    .equ EmitFailureFixup
EmitControlExitLabel    .equ EmitFailureFixup+1

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,HL
StructuredNativeReset:
            XOR  A
            LD   (EmitControlFixupCount),A
            LD   HL,EmitControlLabelValidBase
            LD   B,EmitControlLabelCapacity
StructuredNativeResetLabels:
            LD   (HL),A
            INC  HL
            DJNZ StructuredNativeResetLabels
            RET

; C is a label ordinal and DE is the address of a generated word operand.
.routine in C,DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeRecordFixup:
            LD   A,C
            CP   EmitControlLabelCapacity
            JR   NC,StructuredNativeLabelFailure
            LD   A,(EmitControlFixupCount)
            CP   EmitControlFixupCapacity
            JR   NC,StructuredNativeFixupFailure
            PUSH BC
            LD   L,A
            LD   H,0
            ADD  A,A
            ADD  A,L
            LD   L,A
            LD   H,0
            LD   BC,EmitControlFixupBase
            ADD  HL,BC
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   HL,EmitControlFixupCount
            INC  (HL)
            XOR  A
            RET
StructuredNativeLabelFailure:
            JP   ControlLabelFailure
StructuredNativeFixupFailure:
            LD   A,DiagnosticControlFixupCapacity
            JP   CompilerSetDiagnostic

; Emit opcode A with a zero word operand and retain that operand for label C.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeEmitFixup:
            PUSH BC
            CALL NativeEmitByte
            POP  BC
            RET  C
            LD   DE,(EmitCursor)
            PUSH BC
            PUSH DE
            LD   HL,0
            CALL NativeEmitWord
            POP  DE
            POP  BC
            RET  C
            JP   StructuredNativeRecordFixup

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeLabel:
            CALL NativeNextSemanticByte
            LD   C,A
.routine in C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeDefineLabel:
            LD   A,C
            CP   EmitControlLabelCapacity
            JR   NC,StructuredNativeLabelFailure
            LD   B,0
            LD   HL,EmitControlLabelValidBase
            ADD  HL,BC
            LD   A,(HL)
            OR   A
            JP   NZ,TypedNativeInternalOperation
            LD   (HL),1
            LD   L,C
            LD   H,0
            ADD  HL,HL
            LD   BC,EmitControlLabelAddressBase
            ADD  HL,BC
            LD   DE,(EmitCursor)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            XOR  A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeBranchFalse:
            CALL NativeNextSemanticByte
            LD   C,A
            PUSH BC
            LD   HL,StructuredNativeBranchFalseBytes
            LD   B,3
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,$CA                    ; JP Z,nn
            JP   StructuredNativeEmitFixup

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeJump:
            CALL NativeNextSemanticByte
            LD   C,A
            LD   A,$C3                    ; JP nn
            JP   StructuredNativeEmitFixup

; Resolve every retained absolute operand after all label locations are known.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
StructuredNativeResolveFixups:
            LD   A,(EmitControlFixupCount)
            OR   A
            RET  Z
            LD   B,A
            LD   IX,EmitControlFixupBase
StructuredNativeResolveNext:
            LD   C,(IX+0)
            LD   E,(IX+1)
            LD   D,(IX+2)
            LD   A,C
            CP   EmitControlLabelCapacity
            JR   NC,StructuredNativeResolveFailure
            PUSH BC
            PUSH DE
            LD   B,0
            LD   HL,EmitControlLabelValidBase
            ADD  HL,BC
            LD   A,(HL)
            OR   A
            JR   Z,StructuredNativeResolveUnwind
            LD   H,0
            LD   L,C
            ADD  HL,HL
            LD   BC,EmitControlLabelAddressBase
            ADD  HL,BC
            LD   C,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,C
            POP  DE
            CALL NativePatchWord
            POP  BC
            RET  C
            INC  IX
            INC  IX
            INC  IX
            DJNZ StructuredNativeResolveNext
            XOR  A
            RET
StructuredNativeResolveUnwind:
            POP  DE
            POP  BC
StructuredNativeResolveFailure:
            JP   TypedNativeInternalOperation

; Emit a local load into HL without pushing a new expression carrier.
; C is the byte offset, A bit 2 selects u16.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeLoadCounter:
            LD   D,A
            LD   A,C
            CPL
            LD   C,A
            PUSH BC
            PUSH DE
            LD   HL,TypedNativeLoadLocalLow
            LD   B,2
            CALL NativeEmitBytes
            POP  DE
            POP  BC
            RET  C
            LD   A,C
            PUSH DE
            CALL NativeEmitByte
            POP  DE
            RET  C
            BIT  2,D
            JR   NZ,StructuredNativeLoadCounterHigh
            LD   HL,TypedNativeZeroHigh
            LD   B,2
            JP   NativeEmitBytes
StructuredNativeLoadCounterHigh:
            DEC  C
            PUSH BC
            LD   HL,TypedNativeLoadLocalHigh
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            JP   NativeEmitByte

; Store HL to counter byte offset C; A bit 2 selects u16.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeStoreCounter:
            LD   D,A
            LD   A,C
            CPL
            LD   C,A
            PUSH BC
            PUSH DE
            LD   HL,TypedNativeStoreLocalLow
            LD   B,2
            CALL NativeEmitBytes
            POP  DE
            POP  BC
            RET  C
            LD   A,C
            PUSH BC
            PUSH DE
            CALL NativeEmitByte
            POP  DE
            POP  BC
            RET  C
            BIT  2,D
            RET  Z
            DEC  C
            PUSH BC
            LD   HL,TypedNativeStoreLocalHigh
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeForSetup:
            CALL NativeNextSemanticByte
            LD   C,A
            CALL NativeNextSemanticByte
            LD   B,A
            PUSH BC
            LD   HL,StructuredNativePopBoundStart
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,B
            CALL StructuredNativeStoreCounter
            RET  C
            LD   A,$D5                    ; PUSH DE, retained bound
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
StructuredNativeForTest:
            CALL NativeNextSemanticByte
            LD   C,A                      ; counter
            CALL NativeNextSemanticByte
            LD   B,A                      ; mode
            CALL NativeNextSemanticByte
            LD   D,A                      ; exit label
            LD   (EmitControlExitLabel),A
            PUSH BC
            PUSH DE
            LD   HL,StructuredNativeBoundPeek
            LD   B,2
            CALL NativeEmitBytes
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   A,B
            CALL StructuredNativeLoadCounter
            POP  DE
            POP  BC
            RET  C
            BIT  1,B
            JR   NZ,StructuredNativeForTestNegative
            BIT  0,B
            LD   A,ComparisonLess
            JR   Z,StructuredNativeForTestCompare
            LD   A,ComparisonLessEqual
            JR   StructuredNativeForTestCompare
StructuredNativeForTestNegative:
            BIT  0,B
            LD   A,ComparisonGreater
            JR   Z,StructuredNativeForTestCompare
            LD   A,ComparisonGreaterEqual
StructuredNativeForTestCompare:
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeCompareU16
            CALL NativeEmitCall
            RET  C
            LD   A,(EmitControlExitLabel)
            LD   C,A
            LD   HL,StructuredNativeTestHL
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,$CA
            JP   StructuredNativeEmitFixup

; Read and retain the fixed-width ForNext operands in emitter scratch.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
StructuredNativeReadForNext:
            CALL NativeNextSemanticByte
            LD   (EmitControlTestLabel),A
            CALL NativeNextSemanticByte
            LD   (EmitControlExitLabel),A
            CALL NativeNextSemanticByte
            LD   (EmitControlCounter),A
            CALL NativeNextSemanticByte
            LD   (EmitControlMode),A
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (EmitControlStep),DE
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (EmitControlTrapOffset),DE
            XOR  A
            RET

.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
NativeEmitLoadDeImmediate:
            LD   A,$11                    ; LD DE,nn
            PUSH DE
            CALL NativeEmitByte
            POP  DE
            RET  C
            LD   H,D
            LD   L,E
            JP   NativeEmitWord

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
StructuredNativeForNext:
            CALL StructuredNativeReadForNext
            LD   HL,StructuredNativeBoundPeek
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(EmitControlCounter)
            LD   C,A
            LD   A,(EmitControlMode)
            CALL StructuredNativeLoadCounter
            RET  C
            LD   A,$E5                    ; preserve current counter
            CALL NativeEmitByte
            RET  C
            LD   A,(EmitControlMode)
            BIT  1,A
            JR   NZ,StructuredNativeNegativeDistance
            LD   A,$EB                    ; EX DE,HL => bound-current
            CALL NativeEmitByte
            RET  C
StructuredNativeNegativeDistance:
            LD   HL,StructuredNativeSubtractDE
            LD   B,3
            CALL NativeEmitBytes
            RET  C
            LD   DE,(EmitControlStep)
            CALL NativeEmitLoadDeImmediate
            RET  C
            LD   A,(EmitControlMode)
            AND  1
            LD   A,ComparisonLess
            JR   NZ,StructuredNativeDistanceCompare
            ; until exits when distance <= step; to exits when distance < step.
            LD   A,(EmitControlMode)
            BIT  0,A
            LD   A,ComparisonLess
            JR   NZ,StructuredNativeDistanceCompare
            LD   A,ComparisonLessEqual
StructuredNativeDistanceCompare:
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeCompareU16
            CALL NativeEmitCall
            RET  C
            LD   HL,StructuredNativeTestThenPopCurrent
            LD   B,3
            CALL NativeEmitBytes
            RET  C
            LD   A,(EmitControlExitLabel)
            LD   C,A
            LD   A,$C2                    ; JP NZ,exit cleanup
            CALL StructuredNativeEmitFixup
            RET  C
            LD   DE,(EmitControlStep)
            CALL NativeEmitLoadDeImmediate
            RET  C
            LD   A,(EmitControlMode)
            BIT  1,A
            JR   NZ,StructuredNativeSubtractStep
            LD   A,$19                    ; ADD HL,DE
            CALL NativeEmitByte
            JR   StructuredNativeForNextFit
StructuredNativeSubtractStep:
            LD   HL,StructuredNativeSubtractDE
            LD   B,3
            CALL NativeEmitBytes
StructuredNativeForNextFit:
            RET  C
            LD   A,(EmitControlMode)
            BIT  2,A
            JR   NZ,StructuredNativeForNextStore
            BIT  1,A
            JR   NZ,StructuredNativeForNextStore
            LD   HL,StructuredNativeTestHigh
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,$CA                    ; JP Z,fit
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitUpdateExitFixup),HL
            LD   HL,0
            CALL NativeEmitWord
            RET  C
            LD   HL,(EmitControlTrapOffset)
            CALL NativeEmitLoadHl
            RET  C
            LD   A,4
            CALL NativeEmitLoadAImmediate
            RET  C
            CALL TypedNativeEmitTrapEnding
            RET  C
            LD   DE,(EmitUpdateExitFixup)
            LD   HL,(EmitCursor)
            CALL NativePatchWord
StructuredNativeForNextStore:
            LD   A,(EmitControlCounter)
            LD   C,A
            LD   A,(EmitControlMode)
            CALL StructuredNativeStoreCounter
            RET  C
            LD   A,(EmitControlTestLabel)
            LD   C,A
            LD   A,$C3
            JP   StructuredNativeEmitFixup

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
StructuredNativeForCleanup:
            LD   A,$D1                    ; POP DE, discard retained bound
            JP   NativeEmitByte

StructuredNativeBranchFalseBytes .equ TypedNativeBeginAndBytes
StructuredNativePopBoundStart    .equ TypedNativePopOperandsBytes
StructuredNativeBoundPeek:         .db $D1,$D5
StructuredNativeTestHL           .equ TypedNativeBeginAndBytes+1
StructuredNativeSubtractDE:        .db $B7,$ED,$52
StructuredNativeTestThenPopCurrent: .db $7D,$B7,$E1
StructuredNativeTestHigh         .equ TypedNativeTestHigh
