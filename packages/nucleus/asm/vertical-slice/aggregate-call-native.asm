; Stage 7 direct-Z80 lowering for opaque aggregate carriers. Every source
; scalar and alias carrier occupies one canonical word on the evaluation
; stack; declared storage widths remain unchanged.

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeBeginRoutine:
            CALL NativeNextSemanticByte
            LD   C,A
            CALL NativeNextSemanticByte     ; retained parameter count
            CALL StructuredNativeDefineLabel
            RET  C
            LD   HL,NativeExpressionFrameBytes
            LD   B,8
            JP   NativeEmitBytes

; Operands are exact type, negative-frame byte offset, and positive caller
; displacement. The prologue copies one canonical argument into this
; activation before any body statement runs.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeBindParameter:
            CALL NativeNextSemanticByte
            LD   (Stage7PathType),A
            CALL NativeNextSemanticByte
            CPL
            LD   (Stage7PathOffset),A       ; -(destination + 1)
            CALL NativeNextSemanticByte
            LD   (Stage7ArgumentIndex),A    ; positive source displacement
            LD   A,(Stage7PathType)
            CP   AggregateFirstDynamicTypeId
            JR   NC,Stage7NativeBindWord
            CP   ScalarTypeU16
            JR   Z,Stage7NativeBindWord
            LD   A,$3B                      ; DEC SP
            CALL NativeEmitByte
            RET  C
            LD   HL,Stage7NativeLoadIXL
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7ArgumentIndex)
            CALL NativeEmitByte
            RET  C
            LD   HL,Stage7NativeStoreIXL
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7PathOffset)
            JP   NativeEmitByte
Stage7NativeBindWord:
            LD   HL,Stage7NativeDecSP2
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   HL,Stage7NativeLoadIXL
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7ArgumentIndex)
            CALL NativeEmitByte
            RET  C
            LD   HL,Stage7NativeLoadIXH
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7ArgumentIndex)
            INC  A
            CALL NativeEmitByte
            RET  C
            LD   HL,Stage7NativeStoreIXL
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7PathOffset)
            CALL NativeEmitByte
            RET  C
            LD   HL,Stage7NativeStoreIXH
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7PathOffset)
            DEC  A
            JP   NativeEmitByte

; Emit a bounds trap after a target helper has returned carry. The branch
; around the trap is patched before normal lowering continues.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeBoundsGuard:
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitFailureFixup),DE
            LD   HL,(Stage7CallOffset)
            CALL NativeEmitLoadHl
            RET  C
            LD   A,1
            CALL NativeEmitLoadAImmediate
            RET  C
            CALL TypedNativeEmitTrapEnding
            RET  C
            LD   DE,(EmitFailureFixup)
            JP   NativePatchHere

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7NativeCall:
            CALL NativeNextSemanticByte
            LD   (Stage7CallLabel),A
            CALL NativeNextSemanticByte
            LD   (Stage7ArgumentCount),A
            CALL NativeNextSemanticByte
            LD   (Stage7CallResultType),A
            CALL NativeNextSemanticByte
            LD   (Stage7PathOffset),A       ; keep-result flag
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (Stage7CallOffset),DE
            LD   HL,NativeActivationClaim
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            LD   HL,(Stage7CallOffset)
            CALL NativeEmitLoadHl
            RET  C
            LD   A,5
            CALL NativeEmitLoadAImmediate
            RET  C
            CALL TypedNativeEmitTrapEnding
            RET  C
            LD   DE,(EmitExitFixup)
            CALL NativePatchHere
            RET  C
            LD   A,(Stage7CallLabel)
            LD   C,A
            LD   A,$CD
            CALL StructuredNativeEmitFixup
            RET  C
            LD   HL,NativeActivationRelease
            CALL NativeEmitCall
            RET  C
            LD   A,(Stage7ArgumentCount)
            OR   A
            JR   Z,Stage7NativeCallResult
Stage7NativeDiscardArguments:
            DEC  A
            LD   (Stage7ArgumentCount),A
            LD   A,$D1                    ; POP DE
            CALL NativeEmitByte
            RET  C
            LD   A,(Stage7ArgumentCount)
            OR   A
            JR   NZ,Stage7NativeDiscardArguments
Stage7NativeCallResult:
            LD   A,(Stage7CallResultType)
            OR   A
            RET  Z
            LD   A,(Stage7PathOffset)
            OR   A
            RET  Z
            LD   A,$E5                    ; PUSH HL result carrier
            JP   NativeEmitByte

Stage7NativeReturnAggregate .equ TypedNativeReturnScalar

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeEndRoutine:
            CALL NativeNextSemanticByte
            OR   A
            RET  NZ
            CALL NativeExpressionRestoreFrame
            RET  C
            LD   A,$C9
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeLoadProgramAlias:
            CALL NativeNextSemanticByte
            CALL NativeExpressionProgramAddress
            LD   A,$21                    ; LD HL,nn
            CALL NativeEmitOpcodeWord
            RET  C
            LD   A,$E5
            JP   NativeEmitByte

Stage7NativeLoadParameterAlias .equ TypedNativeLoadLocal16

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeSelectField:
            CALL NativeNextSemanticByte
            LD   (Stage7PathOffset),A
            LD   HL,Stage7NativePopHLLoadDE
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7PathOffset)
            LD   L,A
            LD   H,0
            CALL NativeEmitWord
            RET  C
            LD   HL,Stage7NativeAddDEPush
            LD   B,2
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeSelectIndex:
            CALL NativeNextSemanticByte
            LD   (Stage7ArgumentCount),A   ; length
            CALL NativeNextSemanticByte
            LD   (Stage7PathExtent),A      ; stride
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (Stage7CallOffset),DE
            LD   HL,Stage7NativePopIndexBase
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7ArgumentCount)
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeCheckArrayIndex
            CALL NativeEmitCall
            RET  C
            CALL Stage7NativeBoundsGuard
            RET  C
            LD   HL,Stage7NativeIndexToA
            LD   B,1
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7PathExtent)
            LD   C,A
            LD   A,$06                    ; LD B,n
            CALL NativeEmitOpcodeByte
            RET  C
            LD   HL,NativeMultiplyU8
            CALL NativeEmitCall
            RET  C
            LD   HL,Stage7NativeOffsetAddress
            LD   B,5
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeLoadIndirect8:
            LD   HL,Stage7NativeLoadIndirect8Bytes
            LD   B,6
            JP   NativeEmitBytes
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeLoadIndirect16:
            LD   HL,Stage7NativeLoadIndirect16Bytes
            LD   B,5
            JP   NativeEmitBytes
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeStoreIndirect8:
            LD   HL,Stage7NativeStoreIndirect8Bytes
            LD   B,3
            JP   NativeEmitBytes
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeStoreIndirect16:
            LD   HL,Stage7NativeStoreIndirect16Bytes
            LD   B,5
            JP   NativeEmitBytes

; Both full-region calls complete before LDIR is emitted. A failed first or
; second check reaches bounds with the destination still untouched.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7NativeCopyAggregate:
            CALL NativeNextSemanticByte
            LD   (Stage7PathExtent),A
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (Stage7CallOffset),DE
            LD   HL,Stage7NativeCopyPrepare
            LD   B,4
            CALL NativeEmitBytes
            RET  C
            CALL Stage7NativeEmitDataEnd
            RET  C
            LD   A,(Stage7PathExtent)
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeCheckAggregateRegion
            CALL NativeEmitCall
            RET  C
            CALL Stage7NativeBoundsGuard
            RET  C
            LD   A,$E1                    ; POP HL source
            CALL NativeEmitByte
            RET  C
            LD   A,$E5                    ; retain source
            CALL NativeEmitByte
            RET  C
            CALL Stage7NativeEmitDataEnd
            RET  C
            LD   A,(Stage7PathExtent)
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeCheckAggregateRegion
            CALL NativeEmitCall
            RET  C
            CALL Stage7NativeBoundsGuard
            RET  C
            LD   HL,Stage7NativeCopyFinish
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,(Stage7PathExtent)
            LD   L,A
            LD   H,0
            LD   A,$01                    ; LD BC,nn
            CALL NativeEmitOpcodeWord
            RET  C
            LD   HL,Stage7NativeLDIR
            LD   B,2
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeEmitDataEnd:
            LD   A,(StaticImageLength)
            LD   L,A
            LD   H,0
            LD   DE,GeneratedBase+3
            ADD  HL,DE
            EX   DE,HL
            JP   NativeEmitLoadDeImmediate

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeStringLength:
            LD   HL,Stage7NativeStringLengthBytes
            LD   B,5
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7NativeStringIndex:
            CALL NativeNextSemanticByte     ; capacity retained by static type
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (Stage7CallOffset),DE
            LD   HL,Stage7NativePopIndexBase
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   HL,NativeCheckStringIndex
            CALL NativeEmitCall
            RET  C
            CALL Stage7NativeBoundsGuard
            RET  C
            LD   A,$E5
            JP   NativeEmitByte

Stage7NativePopHLLoadDE:        .db $E1,$11
Stage7NativeIndexToA:           .db $7B
Stage7NativeLoadBImmediate:     .db $06
Stage7NativeOffsetAddress:      .db $5F,$16,$00,$19,$E5
Stage7NativeLoadIndirect8Bytes: .db $E1,$7E,$6F,$26,$00,$E5
Stage7NativeLoadIndirect16Bytes:.db $E1,$5E,$23,$56,$D5
Stage7NativeStoreIndirect16Bytes:.db $D1,$E1,$73,$23,$72
Stage7NativeCopyPrepare:        .db $D1,$E1,$E5,$D5
Stage7NativeCopyFinish:         .db $E1,$D1
Stage7NativeLDIR:               .db $ED,$B0
Stage7NativeStringLengthBytes:  .db $E1,$6E,$26,$00,$E5

Stage7NativeDecSP2              .equ TypedNativeParameter16Bytes
Stage7NativeLoadIXL             .equ TypedNativeLoadLocalLow
Stage7NativeLoadIXH             .equ TypedNativeLoadLocalHigh
Stage7NativeStoreIXL            .equ TypedNativeStoreLocalLow
Stage7NativeStoreIXH            .equ TypedNativeStoreLocalHigh
Stage7NativeAddDEPush           .equ Stage7NativeOffsetAddress+3
Stage7NativePopIndexBase        .equ TypedNativePopOperandsBytes
Stage7NativeStoreIndirect8Bytes .equ Stage7NativeStoreIndirect16Bytes
