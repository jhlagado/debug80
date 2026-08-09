; Stage 7 direct-Z80 lowering for opaque aggregate carriers. Every source
; scalar and alias carrier occupies one canonical word on the evaluation
; stack; declared storage widths remain unchanged.

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7BeginRoutine:
            CALL NextSemanticByte
            LD   C,A
            CALL NextSemanticByte     ; retained parameter count
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
            JP   Stage7EmitPairPathOffset
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
            CALL EmitLoadHl
            RET  C
            LD   A,1
            CALL EmitLoadAImmediate
            RET  C
            CALL TypedEmitTrapEnding
            RET  C
            LD   DE,(EmitFailureFixup)
            JP   PatchHere

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
Stage7ReadCallOffset:
            CALL NextSemanticByte
            LD   E,A
            CALL NextSemanticByte
            LD   D,A
            LD   (Stage7CallOffset),DE
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7Call:
            CALL NextSemanticByte
            LD   (Stage7CallLabel),A
            CALL NextSemanticByte
            LD   (Stage7ArgumentCount),A
            CALL NextSemanticByte
            LD   (Stage7CallResultType),A
            CALL NextSemanticByte
            LD   (Stage7PathOffset),A       ; keep-result flag
            CALL Stage7ReadCallOffset
            LD   HL,ActivationClaim
            CALL EmitCall
            RET  C
            CALL EmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            LD   HL,(Stage7CallOffset)
            CALL EmitLoadHl
            RET  C
            LD   A,5
            CALL EmitLoadAImmediate
            RET  C
            CALL TypedEmitTrapEnding
            RET  C
            LD   DE,(EmitExitFixup)
            CALL PatchHere
            RET  C
            LD   A,(Stage7CallLabel)
            LD   C,A
            LD   A,$CD
            CALL StructuredEmitFixup
            RET  C
            LD   HL,ActivationRelease
            CALL EmitCall
            RET  C
            LD   A,(Stage7ArgumentCount)
            OR   A
            JR   Z,Stage7CallResult
Stage7DiscardArguments:
            DEC  A
            LD   (Stage7ArgumentCount),A
            LD   A,$D1                    ; POP DE
            CALL EmitByte
            RET  C
            LD   A,(Stage7ArgumentCount)
            OR   A
            JR   NZ,Stage7DiscardArguments
Stage7CallResult:
            LD   A,(Stage7CallResultType)
            OR   A
            RET  Z
            LD   A,(Stage7PathOffset)
            OR   A
            RET  Z
            LD   A,$E5                    ; PUSH HL result carrier
            JP   EmitByte

Stage7ReturnAggregate .equ TypedReturnScalar

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7EndRoutine:
            CALL NextSemanticByte
            OR   A
            RET  NZ
            CALL ExpressionRestoreFrame
            RET  C
            LD   A,$C9
            JP   EmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7LoadProgramAlias:
            CALL NextSemanticByte
            CALL ExpressionProgramAddress
            LD   A,$21                    ; LD HL,nn
            CALL EmitOpcodeWord
            RET  C
            LD   A,$E5
            JP   EmitByte

Stage7LoadParameterAlias .equ TypedLoadLocal16

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7SelectField:
            CALL NextSemanticByte
            LD   (Stage7PathOffset),A
            LD   HL,Stage7PopHLLoadDE
            CALL   EmitPair
            RET  C
            LD   A,(Stage7PathOffset)
            LD   L,A
            LD   H,0
            CALL EmitWord
            RET  C
            LD   HL,Stage7AddDEPush
            JP   EmitPair

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7SelectIndex:
            CALL NextSemanticByte
            LD   (Stage7ArgumentCount),A   ; length
            CALL NextSemanticByte
            LD   (Stage7PathExtent),A      ; stride
            CALL Stage7ReadCallOffset
            LD   HL,Stage7PopIndexBase
            CALL   EmitPair
            RET  C
            LD   A,(Stage7ArgumentCount)
            CALL EmitLoadAImmediate
            RET  C
            LD   HL,CheckArrayIndex
            CALL EmitCall
            RET  C
            CALL Stage7BoundsGuard
            RET  C
            LD   HL,Stage7IndexToA
            LD   B,1
            CALL EmitBytes
            RET  C
            LD   A,(Stage7PathExtent)
            LD   C,A
            LD   A,$06                    ; LD B,n
            CALL EmitOpcodeByte
            RET  C
            LD   HL,MultiplyU8
            CALL EmitCall
            RET  C
            LD   HL,Stage7OffsetAddress
            JP   EmitFive

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
            CALL NextSemanticByte
            LD   (Stage7PathExtent),A
            CALL Stage7ReadCallOffset
            LD   HL,Stage7CopyPrepare
            CALL   EmitFour
            RET  C
            CALL Stage7EmitRegionCheck
            RET  C
            LD   A,$E1                    ; POP HL source
            CALL EmitByte
            RET  C
            LD   A,$E5                    ; retain source
            CALL EmitByte
            RET  C
            CALL Stage7EmitRegionCheck
            RET  C
            LD   HL,Stage7CopyFinish
            CALL   EmitPair
            RET  C
            LD   A,(Stage7PathExtent)
            LD   L,A
            LD   H,0
            LD   A,$01                    ; LD BC,nn
            CALL EmitOpcodeWord
            RET  C
            LD   HL,Stage7LDIR
            JP   EmitPair

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7EmitRegionCheck:
            CALL Stage7EmitDataEnd
            RET  C
            LD   A,(Stage7PathExtent)
            CALL EmitLoadAImmediate
            RET  C
            LD   HL,CheckAggregateRegion
            CALL EmitCall
            RET  C
            JP   Stage7BoundsGuard

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7EmitDataEnd:
            LD   A,(StaticImageLength)
            LD   L,A
            LD   H,0
            LD   DE,GeneratedBase+3
            ADD  HL,DE
            EX   DE,HL
            JP   EmitLoadDeImmediate

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7StringLength:
            LD   HL,Stage7StringLengthBytes
            JP   EmitFive

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7StringIndex:
            CALL NextSemanticByte     ; capacity retained by static type
            CALL Stage7ReadCallOffset
            LD   HL,Stage7PopIndexBase
            CALL   EmitPair
            RET  C
            LD   HL,CheckStringIndex
            CALL EmitCall
            RET  C
            CALL Stage7BoundsGuard
            RET  C
            LD   A,$E5
            JP   EmitByte

Stage7PopHLLoadDE:        .db $E1,$11
Stage7IndexToA:           .db $7B
Stage7LoadBImmediate:     .db $06
Stage7OffsetAddress:      .db $5F,$16,$00,$19,$E5
Stage7LoadIndirect8Bytes: .db $E1,$7E,$6F,$26,$00,$E5
Stage7LoadIndirect16Bytes:.db $E1,$5E,$23,$56,$D5
Stage7StoreIndirect16Bytes:.db $D1,$E1,$73,$23,$72
Stage7CopyPrepare:        .db $D1,$E1,$E5,$D5
Stage7CopyFinish:         .db $E1,$D1
Stage7LDIR:               .db $ED,$B0
Stage7StringLengthBytes:  .db $E1,$6E,$26,$00,$E5

Stage7DecSP2              .equ TypedParameter16Bytes
Stage7LoadIXL             .equ TypedLoadLocalLow
Stage7LoadIXH             .equ TypedLoadLocalHigh
Stage7StoreIXL            .equ TypedStoreLocalLow
Stage7StoreIXH            .equ TypedStoreLocalHigh
Stage7AddDEPush           .equ Stage7OffsetAddress+3
Stage7PopIndexBase        .equ TypedPopOperandsBytes
Stage7StoreIndirect8Bytes .equ Stage7StoreIndirect16Bytes
