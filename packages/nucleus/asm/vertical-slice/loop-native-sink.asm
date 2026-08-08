; Streaming direct-Z80 encoder for the counted-loop semantic stream.

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeEmitByte:
            LD   B,A
            LD   HL,(EmitCursor)
            LD   DE,(EmitLimit)
            LD   A,H
            CP   D
            JR   NZ,NativeEmitByteRoom
            LD   A,L
            CP   E
            JR   Z,NativeEmitByteFull
NativeEmitByteRoom:
            LD   A,B
            LD   (HL),A
            INC  HL
            LD   (EmitCursor),HL
            OR   A
            RET
NativeEmitByteFull:
            LD   A,DiagnosticSinkCapacity
            JP   CompilerSetDiagnostic

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitWord:
            LD   C,H
            LD   A,L
            CALL NativeEmitByte
            RET  C
            LD   A,C
            JP   NativeEmitByte

; Patch one Z80 relative displacement. DE is the operand and HL the target.
.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativePatchRelative:
            LD   (EmitPatchAddress),DE
            INC  DE
            OR   A
            SBC  HL,DE
            LD   C,L
            LD   A,H
            OR   A
            JR   Z,NativePatchPositive
            INC  A
            JR   NZ,NativePatchInvalid
            BIT  7,C
            JR   Z,NativePatchInvalid
            JR   NativePatchStore
NativePatchPositive:
            BIT  7,C
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

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,HL
NativeBeginProgram:
            LD   (EmitLimit),HL
            LD   HL,0
            LD   (GeneratedSize),HL
            LD   HL,GeneratedBase
            LD   (EmitCursor),HL
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeLoopProgram:
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
            CALL NativeEmitLoadAImmediate
            RET

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

.routine out A,carry,zero,DE clobbers sign,parity,halfCarry,B,HL
NativeEmitJrCPlaceholder:
            LD   A,$38
            JP   NativeEmitRelativePlaceholder

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
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativeDispatchCallOperations:
            LD   HL,SemanticBufferBase+1
            LD   (SemanticReadCursor),HL
            LD   A,(SemanticBufferBase)
            LD   (SemanticRemaining),A
NativeDispatchCallNext:
            LD   A,(SemanticRemaining)
            OR   A
            RET  Z
            DEC  A
            LD   (SemanticRemaining),A
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
            RET  C
            JR   NativeDispatchCallNext
NativeDispatchCallInvalid:
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
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeCallWriteLocal:
            LD   HL,NativeWriteOutputByte
            CALL NativeEmitCall
            RET  C
            CALL NativeEmitJrCPlaceholder
            RET  C
            LD   (EmitFailureFixup),DE
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeCallBeginForward:
            CALL NativeNextSemanticByte
            LD   HL,(EmitCursor)
            LD   (EmitRoutineAddress),HL
            LD   DE,(EmitRoutineCallFixup)
            CALL NativePatchWord
            OR   A
            RET

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
            OR   A
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
NativeEncodeCallProgram:
            LD   HL,GeneratedLimit
            CALL NativeBeginProgram
            LD   HL,0
            LD   (EmitRoutineAddress),HL
            CALL NativeDispatchCallOperations
            RET  C
            JP   NativeFinishProgram
NativeCallBackendEnd:

; Default entry and proof-only bounded entry for the checked-array program.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeArrayProgram:
            LD   HL,GeneratedLimit
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeArrayProgramWithinLimit:
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
