; Streaming direct-Z80 encoder for the counted-loop semantic stream.

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeEmitByte:
            LD   B,A
            LD   HL,(EmitCursor)
            LD   DE,(EmitLimit)
            OR   A
            SBC  HL,DE
            ADD  HL,DE
            JR   Z,NativeEmitByteFull
NativeEmitByteRoom:
            LD   A,B
            LD   (HL),A
            INC  HL
            LD   (EmitCursor),HL
            OR   A
            RET
NativeEmitByteFull:
            JP   SemanticSinkPutFull

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitWord:
            LD   C,H
            LD   A,L
            CALL NativeEmitByte
            RET  C
            LD   A,C
            JP   NativeEmitByte

; Copy B retained opcode bytes. Shared fixed sequences are cheaper as data
; once two or more encoder paths need four or more emitted bytes.
.routine in B,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitBytes:
            LD   A,(HL)
            INC  HL
            PUSH BC
            PUSH HL
            CALL NativeEmitByte
            POP  HL
            POP  BC
            RET  C
            DJNZ NativeEmitBytes
            OR   A
            RET

; Patch one Z80 relative displacement. DE is the operand and HL the target.
.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativePatchRelative:
            LD   (EmitPatchAddress),DE
            INC  DE
            OR   A
            SBC  HL,DE
            LD   C,L
            LD   A,C
            ADD  A,A
            SBC  A,A
            CP   H
            JR   NZ,NativePatchInvalid
NativePatchStore:
            LD   DE,(EmitPatchAddress)
            LD   A,C
            LD   (DE),A
            OR   A
            RET
NativePatchInvalid:
            LD   A,DiagnosticFixupRange
            JP   CompilerSetDiagnostic

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NativeBeginProgram:
            LD   (EmitLimit),HL
            LD   BC,(GeneratedSize)
            LD   (NativePublishedSize),BC
            LD   A,B
            OR   C
            JR   Z,NativeBeginProgramReady
            LD   HL,GeneratedBase
            LD   DE,NativeBackupBase
            LDIR
NativeBeginProgramReady:
            LD   HL,GeneratedBase
            LD   (EmitCursor),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NativeAbortProgram:
            LD   BC,(NativePublishedSize)
            LD   A,B
            OR   C
            JR   Z,NativeAbortProgramSize
            LD   HL,NativeBackupBase
            LD   DE,GeneratedBase
            LDIR
NativeAbortProgramSize:
            LD   HL,(NativePublishedSize)
            LD   (GeneratedSize),HL
            SCF
            RET

.if NativeLegacyEncoders
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeLoopProgram:
            CALL NativeEncodeLoopProgramBody
            JR   NativeEncodeProgramResult
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeCallProgram:
            CALL NativeEncodeCallProgramBody
            JR   NativeEncodeProgramResult
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeExpressionProgram:
            CALL NativeEncodeExpressionProgramBody
            JR   NativeEncodeProgramResult
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeArrayProgram:
            LD   HL,GeneratedLimit
            JR   NativeEncodeArrayProgramWithinLimit
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeArrayProgramWithinLimit:
            CALL NativeEncodeArrayProgramBody
NativeEncodeProgramResult:
            RET  NC
            JP   NativeAbortProgram

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeLoopProgramBody:
            LD   HL,GeneratedLimit
            CALL NativeBeginProgram

            LD   A,(SemanticBufferBase+2)
            CALL NativeEmitLoadDImmediate
            RET  C
            LD   A,(SemanticBufferBase+4)
            CALL NativeEmitLoadDImmediate
            RET  C

            LD   HL,(EmitCursor)
            LD   (EmitLoopHead),HL
            LD   A,$7A
            CALL NativeEmitByte
            RET  C
            LD   A,(SemanticBufferBase+5)
            CALL NativeEmitCompareImmediate
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE

            LD   A,(SemanticBufferBase+7)
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeWriteOutputByte
            CALL NativeEmitCall
            RET  C
            LD   A,$38
            CALL NativeEmitRelativePlaceholder
            RET  C
            LD   (EmitFailureFixup),DE
            LD   A,$7A
            CALL NativeEmitByte
            RET  C
            LD   A,(SemanticBufferBase+5)
            DEC  A
            CALL NativeEmitCompareImmediate
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitUpdateExitFixup),DE
            LD   A,$14
            CALL NativeEmitByte
            RET  C
            CALL NativeEmitJrPlaceholder
            RET  C
            LD   HL,(EmitLoopHead)
            CALL NativePatchRelative
            RET  C

            LD   DE,(EmitExitFixup)
            CALL NativePatchHere
            RET  C
            LD   DE,(EmitUpdateExitFixup)
            CALL NativePatchHere
            RET  C
            CALL NativeEmitSuccessReturn
            RET  C

            LD   DE,(EmitFailureFixup)
            CALL NativePatchHere
            RET  C
            LD   HL,NativeLoopFailureOffset
            CALL NativeEmitLoadHl
            RET  C
            CALL NativeEmitUnhandledTrapPrefix
            RET  C
            CALL NativeEmitTrapEnding
            RET  C

            JP   NativeFinishProgram
.endif

; Small instruction emitters shared by the direct back end. Multiple entry
; points share the opcode-plus-operand tails rather than repeating them in
; every semantic operation.
.routine in A,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitOpcodeWord:
            PUSH HL
            CALL NativeEmitByte
            POP  HL
            RET  C
            JP   NativeEmitWord

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitCall:
            LD   A,$CD
            JP   NativeEmitOpcodeWord

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitLoadHl:
            LD   A,$21
            JP   NativeEmitOpcodeWord

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitStoreA:
            LD   A,$32
            JP   NativeEmitOpcodeWord

.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeEmitOpcodeByte:
            CALL NativeEmitByte
            RET  C
            LD   A,C
            JP   NativeEmitByte

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitLoadAImmediate:
            LD   C,A
            LD   A,$3E
            JP   NativeEmitOpcodeByte

.if NativeLegacyEncoders
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitLoadDImmediate:
            LD   C,A
            LD   A,$16
            JP   NativeEmitOpcodeByte

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitCompareImmediate:
            LD   C,A
            LD   A,$FE
            JP   NativeEmitOpcodeByte
.endif

.if NativeLegacyEncoders
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitLoadScalar:
            LD   HL,NativeScalarSlot
            LD   A,$3A
            JP   NativeEmitOpcodeWord

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitRestoreAfterCall:
            LD   A,$F5
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeActivationPop
            CALL NativeEmitCall
            RET  C
            LD   A,$F1
            JP   NativeEmitByte
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitSuccessReturn:
            LD   A,NativeRunSucceeded
            JR   NativeEmitRunEnding

; At runtime A carries the trap number and HL carries the source offset.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitTrapEnding:
            LD   HL,NativeTrapNumber
            CALL NativeEmitStoreA
            RET  C
            LD   A,$AF
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeTrapRoutine
            CALL NativeEmitStoreA
            RET  C
            LD   HL,NativeTrapOffset
            LD   A,$22
            CALL NativeEmitOpcodeWord
            RET  C
            LD   A,NativeRunTrapped
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitRunEnding:
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeRunState
            CALL NativeEmitStoreA
            RET  C
            LD   A,$C9
            JP   NativeEmitByte

; At runtime A carries an unhandled error and HL the failing source offset.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitUnhandledTrapPrefix:
            LD   HL,NativeTrapError
            CALL NativeEmitStoreA
            RET  C
            LD   A,6
            JP   NativeEmitLoadAImmediate

.routine out A,carry,zero,DE clobbers sign,parity,halfCarry,B,HL
NativeEmitJrPlaceholder:
            LD   A,$18
            JR   NativeEmitRelativePlaceholder
.routine out A,carry,zero,DE clobbers sign,parity,halfCarry,B,HL
NativeEmitJrNcPlaceholder:
            LD   A,$30
.routine in A out A,carry,zero,DE clobbers sign,parity,halfCarry,B,HL
NativeEmitRelativePlaceholder:
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            PUSH HL
            XOR  A
            CALL NativeEmitByte
            POP  DE
            RET

.if NativeLegacyEncoders
.routine out A,carry,zero,DE clobbers sign,parity,halfCarry,B,HL
NativeEmitJrCPlaceholder:
            LD   A,$38
            JP   NativeEmitRelativePlaceholder
.endif

.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
NativePatchWord:
            LD   A,L
            LD   (DE),A
            INC  DE
            LD   A,H
            LD   (DE),A
            OR   A
            RET

; Patch a stored displacement to the current output position.
.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativePatchHere:
            LD   HL,(EmitCursor)
            JP   NativePatchRelative

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
NativeFinishProgram:
            LD   HL,(EmitCursor)
            LD   DE,GeneratedBase
            OR   A
            SBC  HL,DE
            LD   (GeneratedSize),HL
            OR   A
            RET

; Read one operand from the checked semantic transcript. The operation count
; bounds dispatch; individual handlers know the fixed width of their operands.
NativeCallBackendStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
NativeNextSemanticByte:
            LD   HL,(SemanticReadCursor)
            LD   A,(HL)
            INC  HL
            LD   (SemanticReadCursor),HL
            OR   A
            RET

; Dense ordinal dispatcher for the first non-positional backend. A pushed
; continuation turns the Z80's JP (HL) into a compact indirect call. This
; entry is post-parse only: SemanticSinkFinish must have published the complete
; transcript before emitter scratch overlays the retained forward signature.
.if NativeLegacyEncoders
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativeDispatchCallOperations:
            LD   HL,SemanticBufferBase+1
            LD   (SemanticReadCursor),HL
            LD   A,(SemanticBufferBase)
            OR   A
            RET  Z
            LD   B,A
NativeDispatchCallNext:
            PUSH BC
            CALL NativeNextSemanticByte
            SUB  SemanticCallLiteralU8
            CP   NativeCallOperationCount
            JR   NC,NativeDispatchCallInvalid
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,NativeCallOperationTable
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            LD   DE,NativeDispatchCallReturn
            PUSH DE
            JP   (HL)
NativeDispatchCallReturn:
            POP  BC
            RET  C
            DJNZ NativeDispatchCallNext
            OR   A
            RET
NativeDispatchCallInvalid:
            POP  BC
            LD   A,DiagnosticSinkCapacity
            JP   CompilerSetDiagnostic

NativeCallOperationTable:
            .dw NativeCallLiteral
            .dw NativeCallWriteLocal
            .dw NativeCallBeginForward
            .dw NativeCallIfParameterZero
            .dw NativeCallReturnParameter
            .dw NativeCallEndIf
            .dw NativeCallReturnSelfMinus
            .dw NativeCallEndRoutine
NativeCallOperationCount .equ 8

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativeCallLiteral:
            CALL NativeNextSemanticByte
            CALL NativeNextSemanticByte
            CALL NativeEmitLoadAImmediate
            RET  C
            LD   HL,NativeActivationPush
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrCPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            LD   A,$CD
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitRoutineCallFixup),HL
            LD   HL,0
            CALL NativeEmitWord
            RET  C
            CALL NativeEmitRestoreAfterCall
            RET  C
            LD   DE,(EmitExitFixup)
            CALL NativePatchHere
            RET  C
            CALL NativeEmitJrCPlaceholder
            RET  C
            LD   (EmitUpdateExitFixup),DE
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeCallWriteLocal:
            LD   HL,NativeWriteOutputByte
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrCPlaceholder
            RET  C
            LD   (EmitFailureFixup),DE
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeCallBeginForward:
            CALL NativeNextSemanticByte
            LD   HL,(EmitCursor)
            LD   (EmitRoutineAddress),HL
            LD   DE,(EmitRoutineCallFixup)
            JP   NativePatchWord

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeCallIfParameterZero:
            CALL NativeNextSemanticByte
            CALL NativeEmitLoadScalar
            RET  C
            LD   A,$B7
            CALL NativeEmitByte
            RET  C
            LD   A,$20
            CALL NativeEmitRelativePlaceholder
            RET  C
            LD   (EmitIfFixup),DE
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeCallReturnParameter:
            CALL NativeEmitLoadScalar
            RET  C
            LD   A,$C9
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativeCallEndIf:
            LD   DE,(EmitIfFixup)
            JP   NativePatchHere

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeCallReturnSelfMinus:
            CALL NativeNextSemanticByte
            CALL NativeNextSemanticByte
            LD   C,A
            PUSH BC
            CALL NativeEmitLoadScalar
            POP  BC
            RET  C
            LD   A,$D6
            CALL NativeEmitOpcodeByte
            RET  C
            LD   HL,NativeActivationPush
            CALL NativeEmitCall
            RET  C
            LD   A,$D8
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitRoutineAddress)
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitRestoreAfterCall
            RET  C
            LD   A,$C9
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativeCallEndRoutine:
            LD   HL,(EmitRoutineAddress)
            LD   A,H
            OR   L
            RET  NZ
            CALL NativeEmitSuccessReturn
            RET  C
            LD   DE,(EmitUpdateExitFixup)
            CALL NativePatchHere
            RET  C
            LD   HL,NativeCallCapacityOffset
            CALL NativeEmitLoadHl
            RET  C
            CALL NativeEmitTrapEnding
            RET  C
            LD   DE,(EmitFailureFixup)
            CALL NativePatchHere
            RET  C
            LD   HL,NativeCallFailureOffset
            CALL NativeEmitLoadHl
            RET  C
            CALL NativeEmitUnhandledTrapPrefix
            RET  C
            JP   NativeEmitTrapEnding

; Compile the routine slice from its variable-width semantic stream.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeCallProgramBody:
            LD   HL,GeneratedLimit
            CALL NativeBeginProgram
            LD   HL,0
            LD   (EmitRoutineAddress),HL
            CALL NativeDispatchCallOperations
            RET  C
            JP   NativeFinishProgram
NativeCallBackendEnd:
.endif

; Dense postfix-expression backend. Program data follows an initial JP, so its
; address is known before the code entry is patched. Scalar locals use an IX
; frame and therefore remain per activation; the evaluation stack lies below
; that frame and is empty at every statement boundary.
.if NativeLegacyEncoders
NativeExpressionBackendStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativeDispatchExpressionOperations:
            LD   HL,SemanticBufferBase+1
            LD   (SemanticReadCursor),HL
            LD   A,(SemanticBufferBase)
            OR   A
            RET  Z
            LD   B,A
NativeDispatchExpressionNext:
            PUSH BC
            CALL NativeNextSemanticByte
            SUB  SemanticDefineProgramU8
            CP   NativeExpressionOperationCount
            JR   NC,NativeDispatchExpressionInvalid
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,NativeExpressionOperationTable
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            LD   DE,NativeDispatchExpressionReturn
            PUSH DE
            JP   (HL)
NativeDispatchExpressionReturn:
            POP  BC
            RET  C
            DJNZ NativeDispatchExpressionNext
            OR   A
            RET
NativeDispatchExpressionInvalid:
            POP  BC
            LD   A,DiagnosticSinkCapacity
            JP   CompilerSetDiagnostic

NativeExpressionOperationTable:
            .dw NativeExpressionDefineProgram
            .dw NativeExpressionBeginMain
            .dw NativeExpressionDeclareLocal
            .dw NativeExpressionLiteral
            .dw NativeExpressionLoadProgram
            .dw NativeExpressionLoadLocal
            .dw NativeExpressionMultiply
            .dw NativeExpressionAdd
            .dw NativeExpressionStoreProgram
            .dw NativeExpressionStoreLocal
            .dw NativeExpressionWrite
            .dw NativeExpressionEndMain
NativeExpressionOperationCount .equ 12
.endif

.routine in A out HL clobbers carry,halfCarry,D,E
NativeExpressionProgramAddress:
            LD   E,A
            LD   D,0
            LD   HL,GeneratedBase+3
            ADD  HL,DE
            RET

.if NativeLegacyEncoders
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeExpressionDefineProgram:
            CALL NativeNextSemanticByte
            CALL NativeNextSemanticByte
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeExpressionBeginMain:
            LD   DE,(EmitDataFixup)
            LD   HL,(EmitCursor)
            CALL NativePatchWord
            LD   HL,NativeExpressionFrameBytes
            LD   B,8
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeExpressionDeclareLocal:
            CALL NativeNextSemanticByte
            LD   A,$3B
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeExpressionLiteral:
            CALL NativeNextSemanticByte
            CALL NativeEmitLoadAImmediate
            RET  C
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeExpressionPushA:
            LD   A,$F5
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
NativeExpressionLoadProgram:
            CALL NativeNextSemanticByte
            CALL NativeExpressionProgramAddress
            LD   A,$3A
            CALL NativeEmitOpcodeWord
            RET  C
            JP   NativeExpressionPushA

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeExpressionLoadLocal:
            CALL NativeNextSemanticByte
            CPL
            LD   C,A
            LD   A,$DD
            CALL NativeEmitByte
            RET  C
            LD   A,$7E
            CALL NativeEmitOpcodeByte
            RET  C
            JP   NativeExpressionPushA

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeExpressionMultiply:
            LD   A,$C1
            CALL NativeEmitByte
            RET  C
            LD   A,$F1
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeMultiplyU8
            CALL NativeEmitCall
            RET  C
            LD   A,$F5
            JP   NativeEmitByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeExpressionAdd:
            LD   HL,NativeExpressionAddBytes
            LD   B,4
            JP   NativeEmitBytes

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
NativeExpressionStoreProgram:
            CALL NativeNextSemanticByte
            CALL NativeExpressionProgramAddress
            PUSH HL
            LD   A,$F1
            CALL NativeEmitByte
            POP  HL
            RET  C
            LD   A,$32
            JP   NativeEmitOpcodeWord

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeExpressionStoreLocal:
            CALL NativeNextSemanticByte
            CPL
            LD   C,A
            LD   A,$F1
            CALL NativeEmitByte
            RET  C
            LD   A,$DD
            CALL NativeEmitByte
            RET  C
            LD   A,$77
            JP   NativeEmitOpcodeByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeExpressionWrite:
            CALL NativeNextSemanticByte
            LD   C,A
            CALL NativeNextSemanticByte
            LD   H,A
            LD   L,C
            LD   (EmitLoopHead),HL
            LD   A,$F1
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeWriteOutputByte
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrCPlaceholder
            RET  C
            LD   (EmitFailureFixup),DE
            RET
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeExpressionRestoreFrame:
            LD   HL,NativeExpressionRestoreBytes
            LD   B,4
            JP   NativeEmitBytes

.if NativeLegacyEncoders
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeExpressionEndMain:
            CALL NativeExpressionRestoreFrame
            RET  C
            CALL NativeEmitSuccessReturn
            RET  C
            LD   DE,(EmitFailureFixup)
            CALL NativePatchHere
            RET  C
            CALL NativeExpressionRestoreFrame
            RET  C
            LD   HL,(EmitLoopHead)
            CALL NativeEmitLoadHl
            RET  C
            CALL NativeEmitUnhandledTrapPrefix
            RET  C
            JP   NativeEmitTrapEnding

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeExpressionProgramBody:
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
            CALL NativeDispatchExpressionOperations
            RET  C
            JP   NativeFinishProgram
.endif
NativeExpressionFrameBytes:
            .db $DD,$E5,$DD,$21,$00,$00,$DD,$39
.if NativeLegacyEncoders
NativeExpressionAddBytes:
            .db $C1,$F1,$80,$F5
.endif
NativeExpressionRestoreBytes:
            .db $DD,$F9,$DD,$E1
.if NativeLegacyEncoders
NativeExpressionBackendEnd:

; Default entry and proof-only bounded entry for the checked-array program.
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeArrayProgramBody:
            CALL NativeBeginProgram

            LD   HL,NativeReadInputByte
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitExitFixup),DE
            LD   HL,NativeArrayInputFailureOffset
            CALL NativeEmitLoadHl
            RET  C
            CALL NativeEmitJrPlaceholder
            RET  C
            LD   (EmitFailureFixup),DE

            LD   DE,(EmitExitFixup)
            CALL NativePatchHere
            RET  C
            LD   A,(SemanticBufferBase+2)
            CALL NativeEmitCompareImmediate
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitUpdateExitFixup),DE
            LD   A,$5F
            CALL NativeEmitByte
            RET  C
            XOR  A
            CALL NativeEmitLoadDImmediate
            RET  C
            LD   A,$21
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitDataFixup),HL
            LD   HL,0
            CALL NativeEmitWord
            RET  C
            LD   A,$19
            CALL NativeEmitByte
            RET  C
            LD   A,$7E
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeWriteOutputByte
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrNcPlaceholder
            RET  C
            LD   (EmitLoopHead),DE
            LD   HL,NativeArrayOutputFailureOffset
            CALL NativeEmitLoadHl
            RET  C
            CALL NativeEmitJrPlaceholder
            RET  C
            LD   (EmitCodeStart),DE

            LD   DE,(EmitLoopHead)
            CALL NativePatchHere
            RET  C
            CALL NativeEmitSuccessReturn
            RET  C

            LD   DE,(EmitUpdateExitFixup)
            CALL NativePatchHere
            RET  C
            LD   HL,NativeArrayBoundsOffset
            CALL NativeEmitLoadHl
            RET  C
            LD   A,$AF
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeTrapError
            CALL NativeEmitStoreA
            RET  C
            LD   A,1
            CALL NativeEmitLoadAImmediate
            RET  C
            CALL NativeEmitJrPlaceholder
            RET  C
            LD   (EmitExitFixup),DE

            LD   DE,(EmitFailureFixup)
            CALL NativePatchHere
            RET  C
            LD   DE,(EmitCodeStart)
            CALL NativePatchHere
            RET  C
            CALL NativeEmitUnhandledTrapPrefix
            RET  C
            LD   DE,(EmitExitFixup)
            CALL NativePatchHere
            RET  C
            CALL NativeEmitTrapEnding
            RET  C

            LD   HL,(EmitCursor)
            LD   DE,(EmitDataFixup)
            CALL NativePatchWord
            LD   HL,SemanticBufferBase+3
            LD   C,4
NativeEmitArrayData:
            LD   A,(HL)
            PUSH HL
            CALL NativeEmitByte
            POP  HL
            RET  C
            INC  HL
            DEC  C
            JR   NZ,NativeEmitArrayData
            JP   NativeFinishProgram
.endif
