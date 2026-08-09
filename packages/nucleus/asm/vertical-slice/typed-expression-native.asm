; Correctness-first direct-Z80 backend for the complete scalar-expression
; increment. All evaluation values use canonical 16-bit carriers on the Z80
; stack. Declared u8/boolean objects still occupy one byte; u16 occupies two.

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNativeDispatch:
            LD   HL,SemanticBufferBase+1
            LD   (SemanticReadCursor),HL
            XOR  A
            LD   (EmitBooleanFixupDepth),A
            LD   A,(SemanticBufferBase)
            OR   A
            RET  Z
            LD   B,A
TypedNativeDispatchNext:
            PUSH BC
            CALL NativeNextSemanticByte
            SUB  SemanticDefineProgramU8
            CP   TypedNativeOperationCount
            JR   NC,TypedNativeInvalidPopped
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,TypedNativeOperationTable
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            LD   DE,TypedNativeDispatchReturn
            PUSH DE
            JP   (HL)
TypedNativeDispatchReturn:
            POP  BC
            RET  C
            DJNZ TypedNativeDispatchNext
            OR   A
            RET
TypedNativeInvalidPopped:
            POP  BC
TypedNativeInternalOperation:
            LD   A,DiagnosticInternalOperation
            JP   CompilerSetDiagnostic
TypedNativeBooleanFixupCapacity:
            LD   A,DiagnosticBooleanFixupCapacity
            JP   CompilerSetDiagnostic

TypedNativeOperationTable:
            .dw TypedNativeDefine8          ; 20
            .dw TypedNativeBeginMain        ; 21
            .dw TypedNativeDeclare8         ; 22
            .dw TypedNativeInternalOperation ; 23 retired literal8
            .dw TypedNativeLoadProgram8     ; 24
            .dw TypedNativeLoadLocal8       ; 25
            .dw TypedNativeInternalOperation ; 26 retired multiply8
            .dw TypedNativeInternalOperation ; 27 retired add8
            .dw TypedNativeStoreProgram8    ; 28
            .dw TypedNativeStoreLocal8      ; 29
            .dw TypedNativeWrite8           ; 30
            .dw TypedNativeEndMain          ; 31
            .dw TypedNativeDefine16         ; 32
            .dw TypedNativeDeclare16        ; 33
            .dw TypedNativeLiteral16        ; 34
            .dw TypedNativeLoadProgram16    ; 35
            .dw TypedNativeLoadLocal16      ; 36
            .dw TypedNativeAdd8             ; 37
            .dw TypedNativeAdd16            ; 38
            .dw TypedNativeSubtract8        ; 39
            .dw TypedNativeSubtract16       ; 40
            .dw TypedNativeMultiply8        ; 41
            .dw TypedNativeMultiply16       ; 42
            .dw TypedNativeDivide8          ; 43
            .dw TypedNativeDivide16         ; 44
            .dw TypedNativeNegate8          ; 45
            .dw TypedNativeNegate16         ; 46
            .dw TypedNativeNot8             ; 47
            .dw TypedNativeNot16            ; 48
            .dw TypedNativeNotBoolean       ; 49
            .dw TypedNativeAnd8             ; 50
            .dw TypedNativeAnd16            ; 51
            .dw TypedNativeOr8              ; 52
            .dw TypedNativeOr16             ; 53
            .dw TypedNativeCompare          ; 54
            .dw TypedNativeCompare          ; 55
            .dw TypedNativeCompare          ; 56
            .dw TypedNativeNarrow8          ; 57
            .dw TypedNativeStoreProgram16   ; 58
            .dw TypedNativeStoreLocal16     ; 59
            .dw TypedNativeBeginAnd         ; 60
            .dw TypedNativeBeginOr          ; 61
            .dw TypedNativeEndBoolean       ; 62
TypedNativeOperationCount .equ 43

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedNativeDefine8:
            CALL NativeNextSemanticByte     ; byte offset
            CALL NativeNextSemanticByte     ; value
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedNativeDefine16:
            CALL NativeNextSemanticByte     ; byte offset
            CALL NativeNextSemanticByte
            CALL NativeEmitByte
            RET  C
            CALL NativeNextSemanticByte
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeBeginMain:
            LD   DE,(EmitDataFixup)
            LD   HL,(EmitCursor)
            CALL NativePatchWord
            LD   HL,NativeExpressionFrameBytes
            LD   B,8
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedNativeDeclare8:
            CALL NativeNextSemanticByte
            LD   A,$3B                    ; DEC SP
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedNativeDeclare16:
            CALL NativeNextSemanticByte
            LD   A,$3B
            CALL NativeEmitByte
            RET  C
            LD   A,$3B
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeLiteral16:
            CALL NativeNextSemanticByte
            LD   C,A
            CALL NativeNextSemanticByte
            LD   H,A
            LD   L,C
            LD   A,$21                    ; LD HL,nn
            CALL NativeEmitOpcodeWord
            RET  C
            LD   A,$E5                    ; PUSH HL
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeLoadProgram8:
            CALL NativeNextSemanticByte
            CALL NativeExpressionProgramAddress
            LD   A,$3A                    ; LD A,(nn)
            CALL NativeEmitOpcodeWord
            RET  C
            LD   HL,TypedNativeAtoHL
            LD   B,4
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeLoadProgram16:
            CALL NativeNextSemanticByte
            CALL NativeExpressionProgramAddress
            LD   A,$2A                    ; LD HL,(nn)
            CALL NativeEmitOpcodeWord
            RET  C
            LD   A,$E5
            JP   NativeEmitByte

; C receives -(byte offset + 1), the displacement of the low byte from IX.
.routine out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
TypedNativeLocalDisplacement:
            CALL NativeNextSemanticByte
            CPL
            LD   C,A
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeLoadLocal8:
            CALL TypedNativeLocalDisplacement
            LD   B,0
            PUSH BC
            LD   HL,TypedNativeLoadLocalLow
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            CALL NativeEmitByte
            RET  C
            LD   HL,TypedNativeZeroHighPush
            LD   B,3
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeLoadLocal16:
            CALL TypedNativeLocalDisplacement
            LD   B,0
            PUSH BC
            LD   HL,TypedNativeLoadLocalLow
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            CALL NativeEmitByte
            RET  C
            DEC  C
            LD   B,0
            PUSH BC
            LD   HL,TypedNativeLoadLocalHigh
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            CALL NativeEmitByte
            RET  C
            LD   A,$E5
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedNativePopOperands:
            LD   HL,TypedNativePopOperandsBytes
            LD   B,2
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TypedNativePushHL:
            LD   A,$E5
            JP   NativeEmitByte

.routine in B,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeEmitSequence:
            PUSH BC
            PUSH HL
            CALL TypedNativePopOperands
            POP  HL
            POP  BC
            RET  C
            CALL NativeEmitBytes
            RET  C
            JP   TypedNativePushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeAdd8:
            LD   HL,TypedNativeAdd8Bytes
            LD   B,5
            JP   TypedNativeEmitSequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeAdd16:
            LD   HL,TypedNativeAdd16Bytes
            LD   B,1
            JP   TypedNativeEmitSequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeSubtract8:
            LD   HL,TypedNativeSubtract8Bytes
            LD   B,5
            JP   TypedNativeEmitSequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeSubtract16:
            LD   HL,TypedNativeSubtract16Bytes
            LD   B,3
            JP   TypedNativeEmitSequence

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeMultiply8:
            CALL TypedNativePopOperands
            RET  C
            LD   HL,NativeMultiplyU16
            CALL NativeEmitCall
            RET  C
            LD   HL,TypedNativeZeroHigh
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            JP   TypedNativePushHL
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeMultiply16:
            CALL TypedNativePopOperands
            RET  C
            LD   HL,NativeMultiplyU16
            CALL NativeEmitCall
            RET  C
            JP   TypedNativePushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNativeDivide8:
            LD   C,1
            JR   TypedNativeDivide
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeDivide16:
            LD   C,0
TypedNativeDivide:
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (EmitLoopHead),DE
            LD   A,C
            LD   (EmitCodeStart),A
            CALL TypedNativePopOperands
            RET  C
            LD   HL,NativeDivideU16
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            LD   HL,(EmitLoopHead)
            CALL NativeEmitLoadHl
            RET  C
            LD   A,3
            CALL NativeEmitLoadAImmediate
            RET  C
            CALL TypedNativeEmitTrapEnding
            RET  C
            LD   DE,(EmitExitFixup)
            CALL NativePatchHere
            RET  C
            LD   A,(EmitCodeStart)
            OR   A
            JR   Z,TypedNativeDividePush
            LD   HL,TypedNativeZeroHigh
            LD   B,2
            CALL NativeEmitBytes
            RET  C
TypedNativeDividePush:
            JP   TypedNativePushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNativeNegate8:
            LD   HL,TypedNativeNegate8Bytes
            LD   B,6
            JR   TypedNativeUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNativeNegate16:
            LD   HL,TypedNativeNegate16Bytes
            LD   B,8
            JR   TypedNativeUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNativeNot8:
            LD   HL,TypedNativeNot8Bytes
            LD   B,6
            JR   TypedNativeUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNativeNot16:
            LD   HL,TypedNativeNot16Bytes
            LD   B,7
            JR   TypedNativeUnarySequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeNotBoolean:
            LD   HL,TypedNativeNotBooleanBytes
            LD   B,7
TypedNativeUnarySequence:
            CALL NativeEmitBytes
            RET  C
            JP   TypedNativePushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeAnd8:
            LD   HL,TypedNativeAnd8Bytes
            LD   B,5
            JP   TypedNativeEmitSequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeAnd16:
            LD   HL,TypedNativeAnd16Bytes
            LD   B,6
            JP   TypedNativeEmitSequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeOr8:
            LD   HL,TypedNativeOr8Bytes
            LD   B,5
            JP   TypedNativeEmitSequence
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeOr16:
            LD   HL,TypedNativeOr16Bytes
            LD   B,6
            JP   TypedNativeEmitSequence

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeCompare:
            CALL NativeNextSemanticByte
            LD   C,A
            PUSH BC
            CALL TypedNativePopOperands
            POP  BC
            RET  C
            LD   A,C
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeCompareU16
            CALL NativeEmitCall
            RET  C
            JP   TypedNativePushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeNarrow8:
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (EmitLoopHead),DE
            LD   A,$E1                    ; POP HL
            CALL NativeEmitByte
            RET  C
            LD   HL,TypedNativeTestHigh
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   A,$28                    ; JR Z,success
            CALL NativeEmitRelativePlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            LD   HL,(EmitLoopHead)
            CALL NativeEmitLoadHl
            RET  C
            LD   A,2
            CALL NativeEmitLoadAImmediate
            RET  C
            CALL TypedNativeEmitTrapEnding
            RET  C
            LD   DE,(EmitExitFixup)
            CALL NativePatchHere
            RET  C
            JP   TypedNativePushHL

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeStoreProgram8:
            CALL NativeNextSemanticByte
            CALL NativeExpressionProgramAddress
            PUSH HL
            LD   HL,TypedNativePopHLtoA
            LD   B,2
            CALL NativeEmitBytes
            POP  HL
            RET  C
            LD   A,$32
            JP   NativeEmitOpcodeWord
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeStoreProgram16:
            CALL NativeNextSemanticByte
            CALL NativeExpressionProgramAddress
            PUSH HL
            LD   A,$E1
            CALL NativeEmitByte
            POP  HL
            RET  C
            LD   A,$22
            JP   NativeEmitOpcodeWord

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeStoreLocal8:
            CALL TypedNativeLocalDisplacement
            LD   A,$E1
            CALL NativeEmitByte
            RET  C
            LD   B,0
            PUSH BC
            LD   HL,TypedNativeStoreLocalLow
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            JP   NativeEmitByte
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TypedNativeStoreLocal16:
            CALL TypedNativeLocalDisplacement
            LD   A,$E1
            CALL NativeEmitByte
            RET  C
            LD   B,0
            PUSH BC
            LD   HL,TypedNativeStoreLocalLow
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            CALL NativeEmitByte
            RET  C
            DEC  C
            LD   B,0
            PUSH BC
            LD   HL,TypedNativeStoreLocalHigh
            LD   B,2
            CALL NativeEmitBytes
            POP  BC
            RET  C
            LD   A,C
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeWrite8:
            CALL NativeNextSemanticByte
            LD   E,A
            CALL NativeNextSemanticByte
            LD   D,A
            LD   (EmitLoopHead),DE
            LD   HL,TypedNativePopHLtoA
            LD   B,2
            CALL NativeEmitBytes
            RET  C
            LD   HL,NativeWriteOutputByte
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            LD   HL,(EmitLoopHead)
            CALL NativeEmitLoadHl
            RET  C
            CALL NativeEmitUnhandledTrapPrefix
            RET  C
            CALL TypedNativeEmitTrapEnding
            RET  C
            LD   DE,(EmitExitFixup)
            JP   NativePatchHere

; Every terminal typed-expression trap must dismantle the routine frame before
; emitting the common trap record and RET. Without this epilogue the generated
; return consumes local bytes or the saved IX value as its return address.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeEmitTrapEnding:
            CALL NativeExpressionRestoreFrame
            RET  C
            JP   NativeEmitTrapEnding

.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativePushBooleanFixup:
            LD   A,(EmitBooleanFixupDepth)
            CP   EmitBooleanFixupCapacity
            JP   NC,TypedNativeBooleanFixupCapacity
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
TypedNativePopBooleanFixup:
            LD   A,(EmitBooleanFixupDepth)
            OR   A
            JP   Z,TypedNativeInternalOperation
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
TypedNativeBeginAnd:
            LD   HL,TypedNativeBeginAndBytes
            LD   B,6
            JR   TypedNativeBeginBoolean
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeBeginOr:
            LD   HL,TypedNativeBeginOrBytes
            LD   B,6
TypedNativeBeginBoolean:
            CALL NativeEmitBytes
            RET  C
            CALL NativeEmitJrPlaceholder
            RET  C
            JP   TypedNativePushBooleanFixup

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
TypedNativeEndBoolean:
            CALL TypedNativePopBooleanFixup
            RET  C
            JP   NativePatchHere

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
TypedNativeEndMain:
            LD   A,(EmitBooleanFixupDepth)
            OR   A
            JP   NZ,TypedNativeInternalOperation
            CALL NativeExpressionRestoreFrame
            RET  C
            JP   NativeEmitSuccessReturn

; Entry point used by the typed-expression proof.
TypedNativeBackendStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeTypedExpressionProgram:
            LD   HL,GeneratedLimit
            CALL NativeBeginProgram
            LD   A,$C3
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitDataFixup),HL
            LD   HL,0
            CALL NativeEmitWord
            RET  C
            CALL TypedNativeDispatch
            RET  C
            JP   NativeFinishProgram
TypedNativeBackendEnd:

TypedNativeAtoHL:             .db $6F,$26,$00,$E5
TypedNativeLoadLocalLow:      .db $DD,$6E
TypedNativeLoadLocalHigh:     .db $DD,$66
TypedNativeStoreLocalLow:     .db $DD,$75
TypedNativeStoreLocalHigh:    .db $DD,$74
TypedNativeZeroHighPush:      .db $26,$00,$E5
TypedNativeZeroHigh:          .db $26,$00
TypedNativePopOperandsBytes:  .db $D1,$E1
TypedNativePopHLtoA:          .db $E1,$7D
TypedNativeTestHigh:          .db $7C,$B7
TypedNativeAdd8Bytes:         .db $7D,$83,$6F,$26,$00
TypedNativeAdd16Bytes:        .db $19
TypedNativeSubtract8Bytes:    .db $7D,$93,$6F,$26,$00
TypedNativeSubtract16Bytes:   .db $AF,$ED,$52
TypedNativeNegate8Bytes:      .db $E1,$AF,$95,$6F,$26,$00
TypedNativeNegate16Bytes:     .db $E1,$AF,$95,$6F,$3E,$00,$9C,$67
TypedNativeNot8Bytes:         .db $E1,$7D,$2F,$6F,$26,$00
TypedNativeNot16Bytes:        .db $E1,$7D,$2F,$6F,$7C,$2F,$67
TypedNativeNotBooleanBytes:   .db $E1,$7D,$EE,$01,$6F,$26,$00
TypedNativeAnd8Bytes:         .db $7D,$A3,$6F,$26,$00
TypedNativeAnd16Bytes:        .db $7D,$A3,$6F,$7C,$A2,$67
TypedNativeOr8Bytes:          .db $7D,$B3,$6F,$26,$00
TypedNativeOr16Bytes:         .db $7D,$B3,$6F,$7C,$B2,$67
; POP HL; LD A,L; OR A; JR NZ/Z,+3; PUSH HL
TypedNativeBeginAndBytes:     .db $E1,$7D,$B7,$20,$03,$E5
TypedNativeBeginOrBytes:      .db $E1,$7D,$B7,$28,$03,$E5
