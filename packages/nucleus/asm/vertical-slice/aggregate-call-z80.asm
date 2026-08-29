; Stage 7 direct-Z80 lowering for opaque aggregate carriers. Every source
; scalar and alias carrier occupies one canonical word on the evaluation
; stack; declared storage widths remain unchanged.

ACZTOFF .equ TrapOffset-StateBase ; runtime state offset for TrapOffset

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX
Stage7BeginRoutine:
            CALL NextSemanticByte
            LD   C,A
            CALL NextSemanticByte     ; retained parameter count
.if TargetStreamingOutput
            CALL NextSemanticByte     ; target bank
            PUSH BC
            CALL TargetSelectOutputBank
            POP  BC
            RET  C
.endif
Stage7DefineRoutineFrame:
            CALL StructuredDefineLabel
            RET  C
            LD   HL,ExpressionFrameBytes
            JP   EmitEight

; Operands are exact type, negative-frame byte offset, and positive caller
; displacement. The prologue copies one canonical argument into this
; activation before any body statement runs.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7BindParameter:
            CALL NextSemanticByte
            LD   (Stage7PathType),A
            CALL NextSemanticByte
            CPL
            LD   (Stage7PathOffset),A       ; -(destination + 1)
            CALL NextSemanticByte
            LD   (Stage7ArgumentIndex),A    ; positive source displacement
            LD   A,(Stage7PathType)
            CP   AggregateFirstDynamicTypeId
            JR   NC,Stage7BindWord
            CP   ScalarTypeU16
            JR   Z,Stage7BindWord
            LD   A,$3B                      ; DEC SP
            CALL EmitByte
            RET  C
            LD   HL,Stage7LoadIXL
            CALL Stage7EmitPairArgumentIndex
            RET  C
            LD   HL,Stage7StoreIXL
            JR   Stage7EmitPairPathOffset
Stage7BindWord:
            LD   HL,Stage7DecSP2
            CALL   EmitPair
            RET  C
            LD   HL,Stage7LoadIXL
            CALL Stage7EmitPairArgumentIndex
            RET  C
            LD   HL,Stage7LoadIXH
            CALL EmitPair
            RET  C
            LD   A,(Stage7ArgumentIndex)
            INC  A
            CALL EmitByte
            RET  C
            LD   HL,Stage7StoreIXL
            CALL Stage7EmitPairPathOffset
            RET  C
            LD   HL,Stage7StoreIXH
            CALL EmitPair
            RET  C
            LD   A,(Stage7PathOffset)
            DEC  A
            JP   EmitByte

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
Stage7EmitPairArgumentIndex:
            CALL EmitPair
            RET  C
            LD   A,(Stage7ArgumentIndex)
            JP   EmitByte

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
Stage7EmitPairPathOffset:
            CALL EmitPair
            RET  C
            LD   A,(Stage7PathOffset)
            JP   EmitByte

; Emit a bounds trap after a target helper has returned carry. The branch
; around the trap is patched before normal lowering continues.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7BoundsGuard:
            CALL EmitJrNcPlaceholder
            RET  C
            LD   (EmitFailureFixup),DE
            LD   HL,(Stage7CallOffset)
            LD   A,1
            CALL TypedEmitTrapBody
            RET  C
            LD   DE,(EmitFailureFixup)
            JP   PatchHere

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
Stage7ReadCallOffset:
            CALL ReadSemanticWord
            LD   (Stage7CallOffset),DE
            RET

; Retain the source position of a propagated failure. The root wrapper uses
; the last propagation site when failure finally leaves callable main.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
Stage8EmitFailureOffset:
            LD   HL,(Stage7CallOffset)
            CALL EmitLoadHl
            RET  C
.if TargetStreamingOutput
            LD   DE,ACZTOFF
            CALL TargetStateAddress
.else
            LD   HL,TrapOffset
.endif
            LD   A,$22                    ; LD (nn),HL
            JP   EmitOpcodeWord

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7Call:
            CALL NextSemanticByte
            LD   (Stage7CallLabel),A
            AND  Stage8CallableServiceFlag
            JR   NZ,Stage8ReadServiceCall
            CALL NextSemanticByte
            LD   (Stage7ArgumentCount),A
            CALL NextSemanticByte
            LD   (Stage7CallResultType),A
            CALL NextSemanticByte
            LD   (Stage8EmitCallFlags),A
            JR   Stage8ReadCallCommon
Stage8ReadServiceCall:
            LD   A,(Stage7CallLabel)
            AND  Stage8ServiceResultU8
            RLCA
            RLCA
            RLCA
            LD   (Stage7CallResultType),A
Stage8ReadCallCommon:
            CALL Stage7ReadCallOffset
            LD   DE,Stage8EmitCallMode
            LD   B,3
Stage8ReadCallStateLoop:
            CALL NextSemanticByte          ; mode, handler, retained carriers
            LD   (DE),A
            INC  DE
            DJNZ Stage8ReadCallStateLoop
            LD   A,(Stage7CallLabel)
            AND  Stage8CallableServiceFlag
            JP   NZ,Stage8InvokeService
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeActivationClaimOffset
            CALL TypedEmitFailableRuntimeCall
.else
            LD   HL,ActivationClaim
            CALL TypedEmitFailableCall
.endif
            RET  C
            LD   (EmitExitFixup),DE
            LD   HL,(Stage7CallOffset)
            LD   A,5
            CALL TypedEmitTrapBody
            RET  C
            LD   DE,(EmitExitFixup)
            CALL PatchHere
            RET  C
            LD   A,(Stage7CallLabel)
            AND  Stage8CallableSourceMask
            LD   C,A
.if TargetStreamingOutput
            CALL Stage7EmitSourceCall
.else
            LD   A,$CD
            CALL StructuredEmitFixup
.endif
            RET  C
            LD   A,(Stage8EmitCallFlags)
            AND  Stage7RoutineFails
            JR   NZ,Stage8CallableSourceFailable
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeActivationReleaseOffset
            CALL EmitRuntimeCall
.else
            LD   HL,ActivationRelease
            CALL EmitCall
.endif
            RET  C
            JR   Stage8CallableSuccess

.if TargetStreamingOutput
; Emit an ordinary local CALL when the target routine shares the current bank.
; A cross-bank call supplies destination bank A and address HL to vector 9;
; the adapter switches, calls, restores the caller bank, and preserves the
; ordinary source-routine result/failure ABI.
.routine in C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7EmitSourceCall:
            LD   A,(Stage8EmitCallFlags)
            CALL TargetUnpackBank
            LD   D,A
            LD   A,(TargetOutputBank)
            CP   D
            JR   NZ,Stage7EmitFarSourceCall
            LD   A,$CD
            JP   StructuredEmitFixup
Stage7EmitFarSourceCall:
            PUSH BC
            PUSH DE
            LD   C,D
            LD   A,$3E                    ; LD A,destination bank
            CALL EmitOpcodeByte
            POP  DE
            POP  BC
            RET  C
            LD   A,$21                    ; LD HL,target address
            CALL StructuredEmitFarFixup
            RET  C
            LD   A,9                      ; far-call vector ordinal
            JP   EmitTargetVectorCall
.endif
Stage8CallableSourceFailable:
            LD   A,$F5                    ; PUSH AF result discriminant/code
            CALL EmitByte
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeActivationReleaseOffset
            CALL EmitRuntimeCall
.else
            LD   HL,ActivationRelease
            CALL EmitCall
.endif
            RET  C
            LD   A,$F1                    ; POP AF
            CALL EmitByte
            RET  C
Stage8CallableFailable:
            CALL EmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            CALL Stage8EmitFailureOutcome
            RET  C
Stage8CallableFailureReady:
            LD   DE,(EmitExitFixup)
            CALL PatchHere
            RET  C
Stage8CallableSuccess:
            LD   A,(Stage7ArgumentCount)
            LD   C,A
            CALL Stage8DiscardCarriers
            RET  C
            LD   A,(Stage7CallResultType)
            OR   A
            RET  Z
            LD   A,(Stage7CallLabel)
            AND  Stage8CallableKeepFlag
            RET  Z
            LD   A,(Stage7CallLabel)
            AND  Stage8CallableServiceFlag
            JR   NZ,Stage8CallableServiceResult
            LD   A,$E5                    ; PUSH HL result carrier
            JP   EmitByte
Stage8CallableServiceResult:
            LD   HL,Stage8ErrorCarrierBytes
            JP   EmitFour

.routine in C out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
Stage8DiscardCarriers:
            LD   A,C
            OR   A
            RET  Z
Stage8DiscardCarrier:
            LD   A,$D1                    ; POP DE carrier
            CALL EmitByte
            RET  C
            DEC  C
            JR   Stage8DiscardCarriers

Stage7ReturnAggregate .equ TypedReturnScalar

; Failable completion uses carry plus A privately: carry clear denotes success;
; carry set carries one u8 error code in A. Source code cannot inspect this ABI.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8FailRoutine:
            CALL Stage7ReadCallOffset
            CALL Stage8EmitFailureOffset
            RET  C
            LD   HL,Stage8PopErrorBytes
            CALL   EmitPair
            RET  C
            JR   Stage8FailureReturnTail

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage8FailMain:
            CALL Stage7ReadCallOffset
            LD   HL,Stage8PopErrorBytes
            CALL   EmitPair
            RET  C
            LD   HL,(Stage7CallOffset)
            CALL EmitLoadHl
            RET  C
            CALL EmitUnhandledTrapPrefix
            RET  C
            JP   TypedEmitTrapEnding

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8ReturnSuccess:
            CALL TypedEmitPopHL           ; result carrier
            RET  C
            JR   Stage8SuccessTail

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage8EndFailableRoutine:
            CALL NextSemanticByte
            OR   A
            RET  NZ
Stage8SuccessTail:
            CALL ExpressionRestoreFrame
            RET  C
            LD   HL,Stage8SuccessReturnBytes
            JP   EmitPair

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage8SkipHandler:
            CALL NextSemanticByte
            LD   C,A
            LD   A,$C3
            JP   StructuredEmitFixup

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8BeginHandler:
            CALL NextSemanticByte
            LD   C,A
            CALL StructuredDefineLabel
            RET  C
            CALL NextSemanticByte
            LD   (Stage8EmitCallFlags),A
            LD   HL,Stage8ErrorCarrierBytes
            CALL EmitFour
            RET  C
            LD   A,(Stage8EmitCallFlags)
            AND  SymbolClassMask
            CP   SymbolClassProgram
            JP   Z,TypedStoreProgram8
            JP   TypedStoreLocal8

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage8EndHandler:
            CALL NextSemanticByte
            LD   C,A
            JP   StructuredDefineLabel

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8EmitFailureOutcome:
            LD   A,(Stage8EmitCallMode)
            OR   A
            JP   Z,TypedInternalOperation
            CP   Stage8CallModeHandle
            JR   Z,Stage8FailureHandle
            CALL Stage8EmitFailureOffset
            RET  C
Stage8FailureReturnTail:
            CALL ExpressionRestoreFrame
            RET  C
            LD   HL,Stage8FailureReturnBytes
            JP   EmitPair
Stage8FailureHandle:
            LD   A,$4F                    ; LD C,A error code
            CALL EmitByte
            RET  C
            LD   A,(Stage7ArgumentCount)
            LD   HL,Stage8EmitRetainedCarriers
            ADD  A,(HL)
            LD   C,A
            CALL Stage8DiscardCarriers
            RET  C
            LD   A,$79                    ; LD A,C
            CALL EmitByte
            RET  C
            LD   A,(Stage8EmitHandlerLabel)
            LD   C,A
            LD   A,$C3
            JP   StructuredEmitFixup

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8InvokeService:
            LD   A,(Stage7CallLabel)
            AND  Stage8ServiceArgumentMask
            JR   Z,Stage8ServiceAddress
            CP   Stage8ServiceArgumentU16
            JR   Z,Stage8ServiceWordArgument
            LD   HL,Stage8PopErrorBytes   ; POP HL / LD A,L
            CALL EmitPair
            RET  C
            JR   Stage8ServiceAddress
Stage8ServiceWordArgument:
            CALL TypedEmitPopHL           ; offset
            RET  C
Stage8ServiceAddress:
            LD   A,(Stage7CallLabel)
            AND  Stage8CallableServiceMask
.if TargetStreamingOutput
            CALL EmitTargetVectorCall
.else
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,Stage8ServiceAddressTable
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            CALL EmitCall
.endif
            RET  C
            XOR  A
            LD   (Stage7ArgumentCount),A
            JP   Stage8CallableFailable

.if TargetStreamingOutput
.else
Stage8ServiceAddressTable:
            .dw ReadInputByte
            .dw WriteOutputByte
            .dw ReadStorageByte
            .dw RewindStorageInput
            .dw WriteStorageByte
            .dw SeekStorageOutput
.endif

; Startup is a terminal wrapper around main's ordinary callable body. The
; source body therefore has the same frame, return, recursion, and failure ABI
; as every other result-free routine; only this wrapper converts final failure
; into unhandled-error and final success into host completion.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8BeginCallableMain:
            CALL NextSemanticByte
            LD   (Stage8EmitCallFlags),A
.if TargetStreamingOutput
            CALL NextSemanticByte
            CALL TargetSelectOutputBank
            RET  C
.endif
            CALL TypedBeginProgramFrame
            RET  C
            LD   C,Stage7MainLabel
            LD   A,$CD
            CALL StructuredEmitFixup
            RET  C
            LD   A,(Stage8EmitCallFlags)
            AND  Stage7RoutineFails
            JR   Z,Stage8MainWrapperSuccess
            CALL EmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
.if TargetStreamingOutput
            LD   A,$F5                    ; PUSH AF
            CALL EmitByte
            RET  C
            LD   DE,ACZTOFF
            CALL TargetStateAddress
            LD   A,$2A                    ; LD HL,(nn)
            CALL EmitOpcodeWord
            RET  C
            LD   A,$F1                    ; POP AF
            CALL EmitByte
.else
            LD   HL,Stage8ReloadFailureOffsetBytes
            CALL EmitFive
.endif
            RET  C
            CALL EmitUnhandledTrapPrefix
            RET  C
            CALL TypedEmitTrapEnding
            RET  C
            LD   DE,(EmitExitFixup)
            CALL PatchHere
            RET  C
Stage8MainWrapperSuccess:
            CALL TypedRestoreRootFrame
            RET  C
            CALL EmitSuccessReturn
            RET  C
            LD   C,Stage7MainLabel
            JP   Stage7DefineRoutineFrame

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7EndRoutine:
            CALL NextSemanticByte
            OR   A
            RET  NZ
            CALL ExpressionRestoreFrame
            RET  C
            LD   A,$C9
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7LoadProgramAlias:
            CALL ExpressionProgramAddress
            JR   Stage7LoadAliasReady

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7LoadReadOnlyAlias:
            CALL ReadSemanticWord
.if TargetStreamingOutput
            LD   HL,(TargetCurrentRoBase)
            ADD  HL,DE
.else
            LD   HL,(StaticImageLength)
            ADD  HL,DE
            LD   DE,GeneratedRoDataBase
            ADD  HL,DE
.endif
Stage7LoadAliasReady:
            LD   A,$21                    ; LD HL,nn
            JP   TypedEmitOpcodeWordPushHL

Stage7LoadParameterAlias .equ TypedLoadLocal16

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7SelectField:
            CALL ReadSemanticWord
            LD   (Stage7PathOffset),DE
            LD   HL,Stage7PopHLLoadDE
            CALL   EmitPair
            RET  C
            LD   HL,(Stage7PathOffset)
            CALL EmitWord
            RET  C
            LD   HL,Stage7AddDEPush
            JP   EmitPair

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7SelectIndex:
            CALL ReadSemanticWord
            LD   (Stage7PathOffset),DE     ; length
            CALL Stage7ReadExtentAndOffset ; stride and source position
            LD   HL,Stage7PopIndexBase
            CALL   EmitPair
            RET  C
            LD   HL,(Stage7PathOffset)
            CALL EmitLoadBcImmediate
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeCheckArrayIndexOffset
            CALL EmitRuntimeCall
.else
            LD   HL,CheckArrayIndex
            CALL EmitCall
.endif
            RET  C
            CALL Stage7BoundsGuard
            RET  C
            LD   A,$E5                    ; retain base
            CALL EmitByte
            RET  C
            LD   HL,(Stage7PathExtent)
            LD   A,$21                    ; LD HL,nn stride
            CALL EmitOpcodeWord
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeMultiplyU16Offset
            CALL EmitRuntimeCall
.else
            LD   HL,MultiplyU16
            CALL EmitCall
.endif
            RET  C
            LD   HL,Stage7PopDEAddPush
            JP   EmitThree

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7LoadIndirect8:
            LD   HL,Stage7LoadIndirect8Bytes
            LD   B,6
            JP   EmitBytes
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7LoadIndirect16:
            LD   HL,Stage7LoadIndirect16Bytes
            JP   EmitFive
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7StoreIndirect8:
            LD   HL,Stage7StoreIndirect8Bytes
            JP   EmitThree
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7StoreIndirect16:
            LD   HL,Stage7StoreIndirect16Bytes
            JP   EmitFive

; Both full-region calls complete before LDIR is emitted. A failed first or
; second check reaches bounds with the destination still untouched.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7CopyAggregate:
            CALL Stage7ReadExtentAndOffset
            LD   HL,Stage7CopyPrepare
            CALL   EmitFour
            RET  C
            CALL Stage7EmitRegionCheck
            RET  C
            CALL Stage7PreserveCarrierRegion
            RET  C
            LD   HL,Stage7CopyFinish
            CALL   EmitPair
            RET  C
            LD   HL,(Stage7PathExtent)
            CALL EmitLoadBcImmediate
            RET  C
            LD   HL,Stage7LDIR
            JP   EmitPair

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
Stage7ReadExtentAndOffset:
            CALL ReadSemanticWord
            LD   (Stage7PathExtent),DE
            JP   Stage7ReadCallOffset

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7PreserveCarrierRegion:
            CALL TypedEmitPopHL           ; source
            RET  C
            LD   A,$E5                    ; retain source
            CALL EmitByte
            RET  C

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7EmitRegionCheck:
.if TargetStreamingOutput
            LD   DE,(TargetCurrentRoBase)
            CALL EmitLoadDeImmediate
            RET  C
            LD   HL,(TargetCurrentRoCapacity)
            PUSH HL
            LD   A,$FD
            CALL EmitByte
            POP  HL
            RET  C
            LD   A,$21
            CALL EmitOpcodeWord
            RET  C
            LD   HL,(Stage7PathExtent)
            CALL EmitLoadBcImmediate
            RET  C
            LD   DE,NucleusRuntimeCheckAggregateRegionOffset
            CALL EmitRuntimeCall
.else
            LD   DE,ProgramDataRegionLimit
            CALL EmitLoadDeImmediate
            RET  C
            LD   HL,(Stage7PathExtent)
            CALL EmitLoadBcImmediate
            RET  C
            LD   HL,CheckAggregateRegion
            CALL EmitCall
.endif
            RET  C
            JP   Stage7BoundsGuard

.routine out A,DE,carry,zero clobbers sign,parity,halfCarry,HL
Stage7ReadStringExtent:
            CALL NextSemanticByte
            LD   (Stage7ArgumentCount),A
            LD   L,A
            LD   H,0
            INC  HL
            INC  HL
            LD   (Stage7PathExtent),HL
            JP   Stage7ReadCallOffset

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7StringLength:
            CALL Stage7ReadStringExtent
            CALL Stage7PreserveCarrierRegion
            RET  C
            CALL TypedEmitPopHL           ; carrier
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeCheckStringLengthOffset
.else
            LD   HL,CheckStringLength
.endif
            JR   Stage7EmitStringCheck

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7StringIndex:
            CALL Stage7ReadStringExtent
            LD   HL,Stage7PopIndexBase
            CALL   EmitPair
            RET  C
            LD   HL,Stage7PushDEHL
            CALL   EmitPair
            RET  C
            CALL Stage7EmitRegionCheck
            RET  C
            LD   HL,Stage7CopyFinish
            CALL   EmitPair
            RET  C
.if TargetStreamingOutput
            LD   DE,NucleusRuntimeCheckStringIndexOffset
.else
            LD   HL,CheckStringIndex
.endif

.if TargetStreamingOutput
.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
.else
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
.endif
Stage7EmitStringCheck:
.if TargetStreamingOutput
            PUSH DE
.else
            PUSH HL
.endif
            LD   A,(Stage7ArgumentCount)
            LD   C,A
            LD   A,$0E                    ; LD C,n capacity
            CALL EmitOpcodeByte
.if TargetStreamingOutput
            POP  DE
.else
            POP  HL
.endif
            RET  C
.if TargetStreamingOutput
            CALL EmitRuntimeCall
.else
            CALL EmitCall
.endif
            RET  C
            CALL Stage7BoundsGuard
            RET  C
            LD   A,$E5
            JP   EmitByte

Stage7PopHLLoadDE:        .db $E1,$11
Stage7IndexToA            .equ TypedLoadSPPrefix+1
Stage7LoadBImmediate:     .db $06
Stage7OffsetAddress:      .db $5F,$16,$00,$19,$E5
Stage7LoadIndirect8Bytes  .equ Stage7LoadIndirect8Prefix
Stage7LoadIndirect16Bytes:.db $E1,$5E,$23,$56,$D5
Stage7StoreIndirect16Bytes:.db $D1,$E1,$73,$23,$72
Stage7CopyPrepare         .equ TypedPopOperandsBytes
Stage7CopyFinish:         .db $E1,$D1
Stage7PopDEAddPush:       .db $D1,$19,$E5
Stage7PushDEHL:           .db $D5,$E5
Stage7LDIR                .equ SegmentedCopyBytes

Stage7DecSP2              .equ TypedParameter16Bytes
Stage7LoadIXL             .equ TypedLoadLocalLow
Stage7LoadIXH             .equ TypedLoadLocalHigh
Stage7StoreIXL            .equ TypedStoreLocalLow
Stage7StoreIXH            .equ TypedStoreLocalHigh
Stage7AddDEPush           .equ Stage7OffsetAddress+3
Stage7PopIndexBase        .equ TypedPopOperandsBytes
Stage7StoreIndirect8Bytes .equ Stage7StoreIndirect16Bytes
Stage8PopErrorBytes       .equ TypedNot8Bytes ; POP HL / LD A,L prefix
Stage8FailureReturnBytes: .db $37,$C9      ; SCF / RET
Stage8SuccessReturnBytes: .db $B7,$C9      ; OR A / RET
Stage8ErrorCarrierBytes .equ TypedAtoHL       ; LD L,A / LD H,0 / PUSH HL
.if TargetStreamingOutput
.else
Stage8ReloadFailureOffsetBytes:
            .db $F5,$2A                   ; PUSH AF / LD HL,(nn)
            .dw TrapOffset
            .db $F1                       ; POP AF
.endif
