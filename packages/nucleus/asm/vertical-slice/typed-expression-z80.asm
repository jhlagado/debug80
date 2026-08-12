; Correctness-first direct-Z80 backend for the complete scalar-expression
; increment. All evaluation values use canonical 16-bit carriers on the Z80
; stack. Declared u8/boolean objects still occupy one byte; u16 occupies two.

; Typed dispatch and loop dispatch are currently mutually exclusive. These
; aliases make the temporary reuse visible; merging the dispatchers requires
; dedicated storage or a new liveness proof.
EmitTypedTrapPosition .equ EmitLoopHead
EmitTypedWidth        .equ EmitCodeStart

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedDispatch:
            LD   HL,SemanticBufferBase+1
            LD   (SemanticReadCursor),HL
            XOR  A
            LD   (EmitBooleanFixupDepth),A
            LD   (EmitControlFixupCount),A
            LD   HL,EmitControlLabelValidBase
            LD   B,EmitControlLabelCapacity
TypedResetControlLabels:
            LD   (HL),A
            INC  HL
            DJNZ TypedResetControlLabels
            LD   A,(SemanticBufferBase)
            OR   A
            RET  Z
            LD   B,A
TypedDispatchNext:
            PUSH BC
            CALL NextSemanticByte
            SUB  SemanticDefineProgramU8
            CP   TypedOperationCount
            JR   NC,TypedInvalidPopped
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,TypedOperationTable
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            LD   DE,TypedDispatchReturn
            PUSH DE
            JP   (HL)
TypedDispatchReturn:
            POP  BC
            RET  C
            DJNZ TypedDispatchNext
            JP   StructuredResolveFixups
TypedInvalidPopped:
            POP  BC
TypedInternalOperation:
            JP   TypedExpressionStackUnderflow
TypedBooleanFixupCapacity:
            LD   A,DiagnosticBooleanFixupCapacity
            JP   CompilerSetDiagnostic

TypedOperationTable:
            .dw TypedDefine8          ; 20
            .dw TypedBeginMain        ; 21
            .dw TypedDeclare8         ; 22
            .dw TypedInternalOperation ; 23 retired literal8
            .dw TypedLoadProgram8     ; 24
            .dw TypedLoadLocal8       ; 25
            .dw TypedInternalOperation ; 26 retired multiply8
            .dw TypedInternalOperation ; 27 retired add8
            .dw TypedStoreProgram8    ; 28
            .dw TypedStoreLocal8      ; 29
            .dw TypedWrite8           ; 30
            .dw TypedEndMain          ; 31
            .dw TypedDefine16         ; 32
            .dw TypedDeclare16        ; 33
            .dw TypedLiteral16        ; 34
            .dw TypedLoadProgram16    ; 35
            .dw TypedLoadLocal16      ; 36
            .dw TypedAdd8             ; 37
            .dw TypedAdd16            ; 38
            .dw TypedSubtract8        ; 39
            .dw TypedSubtract16       ; 40
            .dw TypedMultiply8        ; 41
            .dw TypedMultiply16       ; 42
            .dw TypedDivide8          ; 43
            .dw TypedDivide16         ; 44
            .dw TypedNegate8          ; 45
            .dw TypedNegate16         ; 46
            .dw TypedNot8             ; 47
            .dw TypedNot16            ; 48
            .dw TypedNotBoolean       ; 49
            .dw TypedAnd8             ; 50
            .dw TypedAnd16            ; 51
            .dw TypedOr8              ; 52
            .dw TypedOr16             ; 53
            .dw TypedXor8             ; 54
            .dw TypedXor16            ; 55
            .dw TypedModulo8          ; 56
            .dw TypedModulo16         ; 57
            .dw TypedCompare          ; 58
            .dw TypedCompare          ; 59
            .dw TypedCompare          ; 60
            .dw TypedNarrow8          ; 61
            .dw TypedStoreProgram16   ; 62
            .dw TypedStoreLocal16     ; 63
            .dw TypedBeginAnd         ; 64
            .dw TypedBeginOr          ; 65
            .dw TypedEndBoolean       ; 66
            .dw StructuredLabel       ; 67
            .dw StructuredBranchFalse ; 68
            .dw StructuredJump        ; 69
            .dw StructuredForSetup    ; 70
            .dw StructuredForTest     ; 71
            .dw StructuredForNext     ; 72
            .dw StructuredForCleanup  ; 73
            .dw TypedBeginRoutine     ; 74
            .dw TypedLoadLocal8       ; 75 parameter u8
            .dw TypedLoadLocal16      ; 76 parameter u16
            .dw TypedCallScalar       ; 77
            .dw TypedReturnScalar     ; 78
            .dw TypedStoreLocal8      ; 79 parameter u8
            .dw TypedStoreLocal16     ; 80 parameter u16
            .dw TypedEndRoutine       ; 81
.if AggregateCallSlices
            .dw Stage7BeginRoutine    ; 82
            .dw Stage7BindParameter   ; 83
            .dw Stage7Call            ; 84
            .dw Stage7ReturnAggregate ; 85
            .dw Stage7EndRoutine      ; 86
            .dw Stage7LoadProgramAlias ; 87
            .dw Stage7LoadParameterAlias ; 88
            .dw Stage7SelectField     ; 89
            .dw Stage7SelectIndex     ; 90
            .dw Stage7LoadIndirect8   ; 91
            .dw Stage7LoadIndirect16  ; 92
            .dw Stage7StoreIndirect8  ; 93
            .dw Stage7StoreIndirect16 ; 94
            .dw Stage7CopyAggregate   ; 95
            .dw Stage7StringLength    ; 96
            .dw Stage7StringIndex     ; 97
            .dw Stage8FailRoutine     ; 98
            .dw Stage8FailMain        ; 99
            .dw Stage8ReturnSuccess   ; 100
            .dw Stage8ReturnSuccess   ; 101
            .dw Stage8EndFailableRoutine ; 102
            .dw Stage8SkipHandler     ; 103
            .dw Stage8BeginHandler    ; 104
            .dw Stage8EndHandler      ; 105
            .dw Stage8BeginCallableMain ; 106
            .dw Stage7LoadReadOnlyAlias ; 107
TypedOperationCount .equ 88
.else
TypedOperationCount .equ 62
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedDefine8:
            CALL NextSemanticByte     ; byte offset
            CALL NextSemanticByte     ; value
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedDefine16:
            CALL NextSemanticByte     ; byte offset
            CALL NextSemanticByte
            CALL EmitByte
            RET  C
            CALL NextSemanticByte
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedBeginMain:
            CALL TypedBeginProgramFrame
            RET  C
            LD   HL,ExpressionFrameBytes
            JP   EmitEight

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedBeginProgramFrame:
            LD   DE,(EmitDataFixup)
            LD   HL,(EmitCursor)
            CALL PatchWord
            JP   TypedSaveRootFrame

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedDeclare8:
            CALL NextSemanticByte
            LD   A,$3B                    ; DEC SP
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedDeclare16:
            CALL NextSemanticByte
            LD   A,$3B
            CALL EmitByte
            RET  C
            LD   A,$3B
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedLiteral16:
            CALL NextSemanticByte
            LD   C,A
            CALL NextSemanticByte
            LD   H,A
            LD   L,C
            LD   A,$21                    ; LD HL,nn
.routine in A,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitOpcodeWordPushHL:
            CALL EmitOpcodeWord
            RET  C
            LD   A,$E5                    ; PUSH HL
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
TypedLoadProgram8:
            CALL ExpressionProgramAddress
            LD   A,$3A                    ; LD A,(nn)
            CALL EmitOpcodeWord
            RET  C
            LD   HL,TypedAtoHL
            JP   EmitFour

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
TypedLoadProgram16:
            CALL ExpressionProgramAddress
            LD   A,$2A                    ; LD HL,(nn)
            JR   TypedEmitOpcodeWordPushHL

; C receives -(byte offset + 1), the displacement of the low byte from IX.
.routine out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
TypedLocalDisplacement:
            CALL NextSemanticByte
            CPL
            LD   C,A
            OR   A
            RET

.routine in C,HL out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
TypedEmitIndexed:
            LD   B,0
            PUSH BC
            LD   B,2
            CALL EmitBytes
            POP  BC
            RET  C
            LD   A,C
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedEmitPopHL:
            LD   A,$E1                    ; POP HL
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedLoadLocal8:
            CALL TypedLocalDisplacement
            LD   HL,TypedLoadLocalLow
            CALL TypedEmitIndexed
            RET  C
            LD   HL,TypedZeroHighPush
            JP   EmitThree

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedLoadLocal16:
            CALL TypedLocalDisplacement
            LD   HL,TypedLoadLocalLow
            CALL TypedEmitIndexed
            RET  C
            DEC  C
            LD   HL,TypedLoadLocalHigh
            CALL TypedEmitIndexed
            RET  C
            LD   A,$E5
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedPopOperands:
            LD   HL,TypedPopOperandsBytes
            JP   EmitPair

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedPushHL:
            LD   A,$E5
            JP   EmitByte

.routine in B,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitSequence:
            PUSH BC
            PUSH HL
            CALL TypedPopOperands
            POP  HL
            POP  BC
            RET  C
            CALL EmitBytes
            RET  C
            JR   TypedPushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedAdd8:
            LD   HL,TypedAdd8Bytes
            JR   TypedBinary5
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedSubtract8:
            LD   HL,TypedSubtract8Bytes
            JR   TypedBinary5
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedXor8:
            LD   HL,TypedXor8Bytes
            JR   TypedBinary5
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedAnd8:
            LD   HL,TypedAnd8Bytes
            JR   TypedBinary5
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedOr8:
            LD   HL,TypedOr8Bytes
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedBinary5:
            LD   B,5
            JR   TypedEmitSequence

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedXor16:
            LD   HL,TypedXor16Bytes
            JR   TypedBinary6
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedAnd16:
            LD   HL,TypedAnd16Bytes
            JR   TypedBinary6
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedOr16:
            LD   HL,TypedOr16Bytes
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedBinary6:
            LD   B,6
            JR   TypedEmitSequence

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedAdd16:
            LD   HL,TypedAdd16Bytes
            LD   B,1
            JR   TypedEmitSequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedSubtract16:
            LD   HL,TypedSubtract16Bytes
            LD   B,3
            JR   TypedEmitSequence

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedMultiply8:
            CALL TypedMultiply
            RET  C
            LD   HL,TypedZeroHigh
            CALL   EmitPair
            RET  C
            JR   TypedPushHL
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedMultiply16:
            CALL TypedMultiply
            RET  C
            JR   TypedPushHL
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedMultiply:
            CALL TypedPopOperands
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeMultiplyU16Offset
            JP   EmitRuntimeCall
.else
            LD   HL,MultiplyU16
            JP   EmitCall
.endif

; Emit a call whose carry-clear success path must skip a generated failure
; outcome. DE returns the branch operand for the caller to patch.
.routine in HL out A,DE,carry,zero clobbers sign,parity,halfCarry,B,C,HL
TypedEmitFailableCall:
            CALL EmitCall
            RET  C
            JP   EmitJrNcPlaceholder

.if TargetStreamingOutput
.routine in DE out A,DE,carry,zero clobbers sign,parity,halfCarry,B,C,HL
TypedEmitFailableRuntimeCall:
            CALL EmitRuntimeCall
            RET  C
            JP   EmitJrNcPlaceholder
.endif

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
TypedReadTrapPosition:
            CALL ReadSemanticWord
            LD   (EmitTypedTrapPosition),DE
            RET

.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitTrapHead:
            LD   (EmitExitFixup),DE
            LD   HL,(EmitTypedTrapPosition)
            JP   EmitLoadHl

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedDivide8:
            LD   C,1
            JR   TypedDivide
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedDivide16:
            LD   C,0
            JR   TypedDivide
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedModulo8:
            LD   C,3
            JR   TypedDivide
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedModulo16:
            LD   C,2
TypedDivide:
            CALL TypedReadTrapPosition
            LD   A,C
            LD   (EmitTypedWidth),A
            CALL TypedPopOperands
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeDivideU16Offset
.else
            LD   HL,DivideU16
.endif
            LD   A,(EmitTypedWidth)
            BIT  1,A
            JR   Z,TypedDivideCall
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeModuloU16Offset
.else
            LD   HL,ModuloU16
.endif
TypedDivideCall:
.if TargetStreamingOutput
            CALL TypedEmitFailableRuntimeCall
.else
            CALL TypedEmitFailableCall
.endif
            RET  C
            LD   A,3
            CALL TypedEmitCurrentTrap
            RET  C
            LD   A,(EmitTypedWidth)
            AND  1
            JR   Z,TypedDividePush
            LD   HL,TypedZeroHigh
            CALL   EmitPair
            RET  C
TypedDividePush:
            JP   TypedPushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNegate8:
            LD   HL,TypedNegate8Bytes
            LD   B,6
            JR   TypedUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNegate16:
            LD   HL,TypedNegate16Bytes
            LD   B,8
            JR   TypedUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNot8:
            LD   HL,TypedNot8Bytes
            LD   B,6
            JR   TypedUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNot16:
            LD   HL,TypedNot16Bytes
            LD   B,7
            JR   TypedUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNotBoolean:
            LD   HL,TypedNotBooleanBytes
            LD   B,7
TypedUnarySequence:
            CALL EmitBytes
            RET  C
            JP   TypedPushHL

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitCompare:
            CALL EmitLoadAImmediate
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeCompareU16Offset
            JP   EmitRuntimeCall
.else
            LD   HL,CompareU16
            JP   EmitCall
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedCompare:
            CALL NextSemanticByte
            LD   C,A
            PUSH BC
            CALL TypedPopOperands
            POP  BC
            RET  C
            LD   A,C
            CALL TypedEmitCompare
            RET  C
            JP   TypedPushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNarrow8:
            CALL TypedReadTrapPosition
            CALL TypedEmitPopHL
            RET  C
            LD   HL,TypedTestHigh
            CALL   EmitPair
            RET  C
            LD   A,$28                    ; JR Z,success
            CALL EmitRelativePlaceholder
            RET  C
            LD   A,2
            CALL TypedEmitCurrentTrap
            RET  C
            JP   TypedPushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
TypedStoreProgram8:
            CALL ExpressionProgramAddress
            PUSH HL
            LD   HL,TypedPopHLtoA
            CALL   EmitPair
            POP  HL
            RET  C
            LD   A,$32
            JP   EmitOpcodeWord
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
TypedStoreProgram16:
            CALL ExpressionProgramAddress
            PUSH HL
            CALL TypedEmitPopHL
            POP  HL
            RET  C
            LD   A,$22
            JP   EmitOpcodeWord

.routine out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
TypedStoreLocal8:
            CALL TypedLocalDisplacement
            CALL TypedEmitPopHL
            RET  C
            LD   HL,TypedStoreLocalLow
            JP   TypedEmitIndexed
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedStoreLocal16:
            CALL TypedStoreLocal8
            RET  C
            DEC  C
            LD   HL,TypedStoreLocalHigh
            JP   TypedEmitIndexed

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedWrite8:
            CALL TypedReadTrapPosition
            LD   HL,TypedPopHLtoA
            CALL   EmitPair
            RET  C
.if TargetStreamingOutput
            LD   A,1
            CALL EmitTargetVectorCall
            RET  C
            CALL EmitJrNcPlaceholder
.else
            LD   HL,WriteOutputByte
            CALL TypedEmitFailableCall
.endif
            RET  C
            CALL TypedEmitTrapHead
            RET  C
            CALL EmitUnhandledTrapPrefix
            RET  C
            JR   TypedEmitTrapTail

; Every terminal typed-expression trap must dismantle the routine frame before
; emitting the common trap record and RET. Without this epilogue the generated
; return consumes local bytes or the saved IX value as its return address.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitTrapEnding:
            CALL TypedRestoreRootFrame
            RET  C
            LD   A,$F5                    ; PUSH AF, preserve trap reason
            CALL EmitByte
            RET  C
            LD   A,$AF                    ; XOR A
            CALL EmitByte
            RET  C
.if TargetStreamingOutput
            LD   DE,ActivationDepth-StateBase
            CALL TargetStateAddress
.else
            LD   HL,ActivationDepth
.endif
            CALL EmitStoreA
            RET  C
            LD   A,$F1                    ; POP AF
            CALL EmitByte
            RET  C
            JP   EmitTrapEnding

; Emit the common terminal trap body for source position HL and trap code A.
; The caller owns and patches the conditional branch around this terminal path.
.routine in A,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitTrapBody:
            PUSH AF
            CALL EmitLoadHl
            JR   C,TypedEmitTrapBodyFailure
            POP  AF
            CALL EmitLoadAImmediate
            RET  C
            JR   TypedEmitTrapEnding
TypedEmitTrapBodyFailure:
            LD   L,A
            POP  BC
            LD   A,L
            SCF
            RET

; Emit and patch a terminal trap using the retained typed-expression source
; position. A is the trap code and DE the success-branch operand.
.routine in A,DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitCurrentTrap:
            PUSH AF
            CALL TypedEmitTrapHead
            JR   C,TypedEmitTrapBodyFailure
            POP  AF
            CALL EmitLoadAImmediate
            RET  C
            JR   TypedEmitTrapTail

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEmitTrapTail:
            CALL TypedEmitTrapEnding
            RET  C
            LD   DE,(EmitExitFixup)
            JP   PatchHere

; Save the outer machine frame before main allocates locals, and restore that
; exact frame on every terminal trap, including a trap inside recursive calls.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedSaveRootFrame:
            LD   HL,TypedStoreSPPrefix
            JR   TypedRootFrameReady

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedRestoreRootFrame:
            LD   HL,TypedLoadSPPrefix
            JR   TypedRootFrameReady
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedRootFrameReady:
            PUSH HL
            CALL   EmitPair
            POP  HL
            RET  C
            PUSH HL
.if TargetStreamingOutput
            LD   DE,RootSP-StateBase
            CALL TargetStateAddress
.else
            LD   HL,RootSP
.endif
            CALL EmitWord
            POP  HL
            RET  C
            INC  HL
            INC  HL
            CALL   EmitPair
            RET  C
.if TargetStreamingOutput
            LD   DE,RootIX-StateBase
            CALL TargetStateAddress
.else
            LD   HL,RootIX
.endif
            JP   EmitWord

; Begin the single retained value routine. Operand bytes are routine ordinal
; and parameter type. HL carries the copied argument into this entry.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
TypedBeginRoutine:
            CALL NextSemanticByte
            CALL NextSemanticByte
            LD   (EmitTypedWidth),A
            LD   C,ControlRoutineLabel
            CALL StructuredDefineLabel
            RET  C
            LD   HL,ExpressionFrameBytes
            CALL   EmitEight
            RET  C
            LD   A,(EmitTypedWidth)
            CP   ScalarTypeU16
            LD   HL,TypedParameter8Bytes
            LD   B,4
            JR   NZ,TypedBeginRoutineParameter
            LD   HL,TypedParameter16Bytes
            LD   B,8
TypedBeginRoutineParameter:
            JP   EmitBytes

; Evaluate has already left the copied argument as one canonical carrier.
; Claim activation capacity before the callee begins, then call the fixed
; forward label. The result returns in HL and becomes the enclosing carrier.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
TypedCallScalar:
            CALL NextSemanticByte     ; ordinal
            CALL NextSemanticByte     ; result type
            LD   (EmitTypedWidth),A
            CALL TypedReadTrapPosition
            CALL TypedEmitPopHL           ; argument
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeActivationClaimOffset
            CALL TypedEmitFailableRuntimeCall
.else
            LD   HL,ActivationClaim
            CALL TypedEmitFailableCall
.endif
            RET  C
            LD   A,5
            CALL TypedEmitCurrentTrap
            RET  C
            LD   C,ControlRoutineLabel
            LD   A,$CD                    ; CALL nn
            CALL StructuredEmitFixup
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeActivationReleaseOffset
            CALL EmitRuntimeCall
.else
            LD   HL,ActivationRelease
            CALL EmitCall
.endif
            RET  C
            LD   A,$E5                    ; PUSH HL result carrier
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedReturnScalar:
            CALL TypedEmitPopHL           ; result
            RET  C
            CALL ExpressionRestoreFrame
            RET  C
            LD   A,$C9
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry
TypedEndRoutine:
            XOR  A
            RET

.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedPushBooleanFixup:
            LD   A,(EmitBooleanFixupDepth)
            CP   EmitBooleanFixupCapacity
            JP   NC,TypedBooleanFixupCapacity
            LD   C,A
            LD   B,0
            LD   HL,EmitBooleanFixupBase
            ADD  HL,BC
            ADD  HL,BC
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   A,(EmitBooleanFixupDepth)
            INC  A
            LD   (EmitBooleanFixupDepth),A
            OR   A
            RET

.routine out A,carry,zero,DE clobbers sign,parity,halfCarry,B,C,HL
TypedPopBooleanFixup:
            LD   A,(EmitBooleanFixupDepth)
            OR   A
            JP   Z,TypedInternalOperation
            DEC  A
            LD   (EmitBooleanFixupDepth),A
            LD   C,A
            LD   B,0
            LD   HL,EmitBooleanFixupBase
            ADD  HL,BC
            ADD  HL,BC
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedBeginAnd:
            LD   HL,TypedBeginAndBytes
            LD   B,6
            JR   TypedBeginBoolean
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedBeginOr:
            LD   HL,TypedBeginOrBytes
            LD   B,6
TypedBeginBoolean:
            CALL EmitBytes
            RET  C
            CALL EmitJrPlaceholder
            RET  C
            JR   TypedPushBooleanFixup

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedEndBoolean:
            CALL TypedPopBooleanFixup
            RET  C
            JP   PatchHere

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedEndMain:
            LD   A,(EmitBooleanFixupDepth)
            OR   A
            JP   NZ,TypedInternalOperation
            CALL ExpressionRestoreFrame
            RET  C
            JP   EmitSuccessReturn

; Entry point used by the typed-expression proof.
TypedBackendStart:
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeProgramHeader:
            CALL BeginProgram
.if AggregateCallSlices
            JR   EncodeProgramEntry

; Emit startup into the code segment. Prepared bytes are copied from rodata
; into initialized RAM, then the complete BSS allocation is cleared before the
; existing entry jump transfers to main.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeSegmentedProgramHeader:
            LD   HL,(StaticImageLength)
            LD   A,H
            OR   L
            JR   Z,EncodeSegmentedBss
            LD   HL,GeneratedRoDataBase
            CALL EmitLoadHl
            RET  C
            LD   DE,ProgramDataBase
            CALL EmitLoadDeImmediate
            RET  C
            LD   HL,(StaticImageLength)
            CALL EmitLoadBcImmediate
            RET  C
            LD   HL,SegmentedCopyBytes
            CALL EmitPair
            RET  C
EncodeSegmentedBss:
            LD   HL,(ProgramBssLength)
            LD   A,H
            OR   L
            JR   Z,EncodeSegmentedEntry
            LD   HL,ProgramBssBase
            CALL EmitLoadHl
            RET  C
            LD   HL,(ProgramBssLength)
            CALL EmitLoadBcImmediate
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeInitializeBssOffset
            CALL EmitRuntimeCall
.else
            LD   HL,InitializeBss
            CALL EmitCall
.endif
            RET  C
EncodeSegmentedEntry:
.endif
EncodeProgramEntry:
            LD   A,$C3
            CALL EmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitDataFixup),HL
            LD   HL,0
            JP   EmitWord

.if AggregateCallSlices
SegmentedCopyBytes: .db $ED,$B0           ; LDIR
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
EncodeTypedExpressionProgram:
            LD   HL,GeneratedLimit
            CALL EncodeProgramHeader
            JP   C,AbortProgram
.if AggregateCallSlices
            JP   AggregateDispatch
.else
            CALL TypedDispatch
            JP   C,AbortProgram
            JP   FinishProgram
.endif
TypedBackendEnd:

            .include "structured-control-z80.asm"
.if AggregateCallSlices
            .include "aggregate-call-z80.asm"
.endif

.if AggregateCallSlices
Stage7LoadIndirect8Prefix: .db $E1,$7E
.endif
TypedAtoHL:             .db $6F,$26,$00,$E5
TypedStoreSPPrefix:     .db $ED,$73
TypedStoreIXPrefix:     .db $DD,$22
TypedLoadSPPrefix:      .db $ED,$7B
TypedLoadIXPrefix:      .db $DD,$2A
TypedParameter16Bytes:  .db $3B,$3B,$DD,$75,$FF,$DD,$74,$FE
TypedParameter8Bytes    .equ TypedParameter16Bytes+1
TypedLoadLocalLow:      .db $DD,$6E
TypedLoadLocalHigh:     .db $DD,$66
TypedStoreLocalLow       .equ TypedParameter16Bytes+2
TypedStoreLocalHigh      .equ TypedParameter16Bytes+5
TypedZeroHighPush       .equ TypedAtoHL+1
TypedZeroHigh           .equ TypedAtoHL+1
TypedPopOperandsBytes:  .db $D1,$E1
.if AggregateCallSlices
                          .db $E5,$D5
.endif
TypedTestHigh:          .db $7C,$B7
TypedAdd8Bytes:         .db $7D,$83,$6F,$26,$00
.if AggregateCallSlices
TypedAdd16Bytes          .equ Stage7OffsetAddress+3
.else
TypedAdd16Bytes:        .db $19
.endif
TypedSubtract8Bytes:    .db $7D,$93,$6F,$26,$00
TypedSubtract16Bytes:   .db $AF,$ED,$52
TypedNegate8Bytes:      .db $E1,$AF,$95,$6F,$26,$00
TypedNegate16Bytes:     .db $E1,$AF,$95,$6F,$3E,$00,$9C,$67
TypedNot8Bytes:         .db $E1,$7D,$2F,$6F,$26,$00
TypedPopHLtoA           .equ TypedNot8Bytes
TypedNot16Bytes:        .db $E1,$7D,$2F,$6F,$7C,$2F,$67
TypedNotBooleanBytes:   .db $E1,$7D,$EE,$01,$6F,$26,$00
TypedAnd8Bytes:         .db $7D,$A3,$6F,$26,$00
TypedAnd16Bytes:        .db $7D,$A3,$6F,$7C,$A2,$67
TypedOr8Bytes:          .db $7D,$B3,$6F,$26,$00
TypedOr16Bytes:         .db $7D,$B3,$6F,$7C,$B2,$67
TypedXor8Bytes:         .db $7D,$AB,$6F,$26,$00
TypedXor16Bytes:        .db $7D,$AB,$6F,$7C,$AA,$67
; POP HL; LD A,L; OR A; JR NZ/Z,+3; PUSH HL
TypedBeginAndBytes:     .db $E1,$7D,$B7,$20,$03,$E5
TypedBeginOrBytes:      .db $E1,$7D,$B7,$28,$03,$E5
