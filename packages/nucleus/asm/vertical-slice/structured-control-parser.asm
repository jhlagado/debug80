; Bounded structured-control parser layered over typed scalar expressions.
; Parser frames live only during source checking. Z80 emission reuses their
; workspace after the complete semantic transcript has been published.

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
ControlReset:
            XOR  A
            LD   (ControlDepth),A
.if AggregateCallSlices
            RET
.else
            LD   (ControlNextLabel),A
            RET
.endif

.routine in A out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
ControlFrameAddress:
            LD   L,A
            LD   H,0
            ADD  HL,HL
            LD   E,L
            LD   D,H
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,DE
            LD   DE,ControlFrameBase
            ADD  HL,DE
            OR   A
            RET

; A is ControlKind*. Return the new frame base in HL.
.routine in A out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C
ControlPushFrame:
            LD   B,A
            LD   A,(ControlDepth)
            CP   ControlFrameCapacity
            JR   NC,ControlCapacityFailure
            PUSH AF
            CALL ControlFrameAddress
            POP  AF
            INC  A
            LD   (ControlDepth),A
            LD   (HL),B
            INC  HL
            LD   B,ControlFrameSize-1
            XOR  A
ControlClearFrame:
            LD   (HL),A
            INC  HL
            DJNZ ControlClearFrame
            LD   A,(ControlDepth)
            DEC  A
            CALL ControlFrameAddress
            PUSH HL
            LD   DE,ControlFrameCounter
            ADD  HL,DE
            LD   (HL),ControlNoCounter
            POP  HL
            OR   A
            RET
ControlCapacityFailure:
            LD   A,DiagnosticControlCapacity
            JP   CompilerSetDiagnostic

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
ControlTopFrame:
            LD   A,(ControlDepth)
            OR   A
            JR   Z,ControlLoopFailure
            DEC  A
            JP   ControlFrameAddress

.routine in B out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
ControlTopFrameField:
            CALL ControlTopFrame
            RET  C
            LD   E,B
            LD   D,0
            ADD  HL,DE
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
ControlPopFrame:
            LD   HL,ControlDepth
            LD   A,(HL)
            OR   A
            JR   Z,ControlLoopFailure
            DEC  (HL)
            XOR  A
            RET

.routine in B out A,C,DE,HL,carry,zero clobbers sign,parity,halfCarry
ControlAllocateInto:
            LD   A,(ControlNextLabel)
.if AggregateCallSlices
            CP   Stage7ControlLabelLimit
.else
            ; Ordinal 31 is the retained routine entry.
            CP   ControlRoutineLabel
.endif
            JR   NC,ControlLabelFailure
            LD   C,A
            INC  A
            LD   (ControlNextLabel),A
            CALL ControlTopFrameField
            RET  C
            LD   (HL),C
            RET

ControlLabelFailure:
            LD   A,DiagnosticControlLabelCapacity
            JP   CompilerSetDiagnostic
ControlLoopFailure:
            LD   A,DiagnosticExpectedLoop
            JP   CompilerSetDiagnostic

; Emit operation D followed by byte C.
.routine in C,D out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
ControlEmitOperationByte:
            LD   A,D
            CALL SemanticSinkOperation
            RET  C
            LD   A,C
            JP   SemanticSinkPut

.routine in C out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ControlEmitLabel:
            LD   D,SemanticControlLabel
            JP   ControlEmitOperationByte
.routine in C out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ControlEmitBranchFalse:
            LD   D,SemanticBranchFalse
            JP   ControlEmitOperationByte
.routine in C out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ControlEmitJump:
            LD   D,SemanticJump
            JP   ControlEmitOperationByte

; Return the nearest enclosing while/for frame in HL.
.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C
ControlFindLoop:
            LD   A,(ControlDepth)
            OR   A
            JR   Z,ControlLoopFailure
ControlFindLoopNext:
            DEC  A
            PUSH AF
            CALL ControlFrameAddress
            LD   A,(HL)
            CP   ControlKindWhile
            JR   Z,ControlFindLoopFound
            CP   ControlKindFor
            JR   Z,ControlFindLoopFound
            POP  AF
            OR   A
            JR   NZ,ControlFindLoopNext
            JR   ControlLoopFailure
ControlFindLoopFound:
            POP  AF
            OR   A
            RET

; C is a local byte offset. Reject a source write or nested counter reuse while
; that exact local is the counter of any active counted loop.
.routine in C out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ControlCheckActiveCounter:
            LD   A,(ControlDepth)
            OR   A
            RET  Z
ControlCheckCounterNext:
            DEC  A
            PUSH AF
            CALL ControlFrameAddress
            LD   A,(HL)
            CP   ControlKindFor
            JR   NZ,ControlCheckCounterContinue
            LD   DE,ControlFrameCounter
            ADD  HL,DE
            LD   A,(HL)
            CP   C
            JR   Z,ControlActiveCounterFailure
ControlCheckCounterContinue:
            POP  AF
            OR   A
            JR   NZ,ControlCheckCounterNext
            RET
ControlActiveCounterFailure:
            POP  AF
            LD   A,DiagnosticActiveCounter
            JP   CompilerSetDiagnostic

.if HybridLL1Full
.else
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredParseBooleanHeader:
            LD   A,ScalarTypeBoolean
            CALL TypedExpressionBeginRuntime
            RET  C
            LD   E,ScalarTypeBoolean
            CALL TypedCheckAssignable
            RET  C
            JP   ParserExpectLine

; Parse an if/elseif/else chain. TokenIf has already been consumed.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredParseIf:
            LD   A,ControlKindIf
            CALL ControlPushFrame
            RET  C
            LD   B,ControlFrameExit
            CALL ControlAllocateInto
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            RET  C
            LD   DE,ControlFrameCounter-1
            ADD  HL,DE
            LD   (HL),1
StructuredParseIfCondition:
            CALL StructuredParseBooleanHeader
            RET  C
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            CALL ControlEmitBranchFalse
            RET  C
            CALL TypedParseStatements
            RET  C
            CALL StructuredRecordIfClause
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenElseIf
            JR   Z,StructuredParseElseIf
            CP   TokenElse
            JR   Z,StructuredParseElse
            CP   TokenEnd
            JP   NZ,ParserExpectedScalar
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            JR   StructuredParseIfEnd
StructuredParseElseIf:
            CALL StructuredEmitFrameExitAndLabel
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            RET  C
            CALL ParserTake
            RET  C
            JR   StructuredParseIfCondition
StructuredParseElse:
            CALL StructuredEmitFrameExitAndLabel
            RET  C
            CALL ParserTake
            RET  C
            CALL ParserExpectLine
            RET  C
            CALL TypedParseStatements
            RET  C
            CALL StructuredRecordIfClause
            RET  C
            LD   B,ControlFrameMode
            CALL ControlTopFrameField
            LD   (HL),1
            CALL ParserPeek
            RET  C
            CP   TokenEnd
            JP   NZ,ParserExpectedScalar
StructuredParseIfEnd:
            CALL ParserTake
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            LD   B,ControlFrameCounter
            CALL ControlTopFrameField
            PUSH HL
            LD   A,(HL)
            POP  HL
            LD   DE,ControlFrameMode-ControlFrameCounter
            ADD  HL,DE
            AND  (HL)
            XOR  1
            PUSH AF
            CALL ControlPopFrame
            POP  AF
            RET

.routine out A,C,DE,HL,carry,zero clobbers sign,parity,halfCarry,B
StructuredEmitFrameExitAndLabel:
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   C,(HL)
            CALL ControlEmitJump
            RET  C
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            JP   ControlEmitLabel
.endif

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B
StructuredRecordIfClause:
            LD   A,(ControlSequenceFallsThrough)
            OR   A
            RET  Z
            LD   B,ControlFrameCounter
            CALL ControlTopFrameField
            LD   (HL),0
            XOR  A
            RET

; TokenWhile has already been consumed.
.if HybridLL1Full
.else
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredParseWhile:
            LD   A,ControlKindWhile
            CALL ControlPushFrame
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            RET  C
            INC  HL
            LD   (HL),C
            LD   B,ControlFrameExit
            CALL ControlAllocateInto
            RET  C
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            CALL StructuredParseBooleanHeader
            RET  C
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   C,(HL)
            CALL ControlEmitBranchFalse
            RET  C
            CALL TypedParseStatements
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenEnd
            JP   NZ,ParserExpectedScalar
            LD   B,ControlFrameContinue
            CALL ControlTopFrameField
            LD   C,(HL)
            CALL ControlEmitJump
            RET  C
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
StructuredCompleteLoop:
            CALL ParserTake
            RET  C
            CALL ParserExpectLine
            RET  C
            JP   ControlPopFrame

; Parse bare exit/continue. The token has already been consumed.
.routine in A out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredParseLoopTransfer:
            LD   (DeclarationInfo),A
            CALL ControlFindLoop
            RET  C
            LD   DE,ControlFrameExit
            LD   A,(DeclarationInfo)
            CP   TokenExit
            JR   Z,StructuredLoopTransferSelected
            LD   DE,ControlFrameContinue
StructuredLoopTransferSelected:
            ADD  HL,DE
            LD   C,(HL)
            CALL ControlEmitJump
            RET  C
            JP   ParserExpectLine
.endif

; Parse one compile-time step constant. B returns mode bit 1 and DE magnitude.
.routine out A,B,DE,carry,zero clobbers sign,parity,halfCarry,C,HL
StructuredParseStep:
            XOR  A
            LD   (ExpressionLeftMeta),A
            CALL ParserPeek
            RET  C
            CP   TokenPlus
            JR   Z,StructuredStepPositive
            CP   TokenMinus
            JR   NZ,StructuredStepMagnitude
            LD   A,2
            LD   (ExpressionLeftMeta),A
StructuredStepPositive:
            CALL ParserTake
            RET  C
StructuredStepMagnitude:
            CALL ParserTake
            RET  C
            CP   TokenNumber
            JR   Z,StructuredStepNumber
            CP   TokenName
            JR   NZ,StructuredStepFailure
            CALL SymbolLookupCurrent
            RET  C
            LD   D,A
            AND  SymbolRecordTypeFlag+SymbolAggregateFlag
            JR   NZ,StructuredStepFailure
            LD   A,D
            AND  SymbolClassMask
            JR   NZ,StructuredStepFailure
            LD   A,D
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JR   Z,StructuredStepFailure
StructuredStepNumber:
            LD   D,B
            LD   E,C
StructuredStepHaveMagnitude:
            LD   A,D
            OR   E
            JR   Z,StructuredStepFailure
            LD   A,(ExpressionLeftMeta)
            LD   B,A
            OR   A
            RET
StructuredStepFailure:
            LD   A,DiagnosticLoopStep
            JP   CompilerSetDiagnostic

; TokenFor has already been consumed.
.if HybridLL1Full
.else
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredParseFor:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            LD   HL,(TokenStartOffset)
            LD   (ExpressionCallOffset),HL
            CALL SymbolLookupCurrent
            RET  C
            LD   (DeclarationInfo),A
            LD   (DeclarationPayload),BC
            LD   D,A
            AND  SymbolClassMask
            CP   SymbolClassLocal
            JP   NZ,StructuredCounterFailure
            LD   A,D
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   Z,StructuredCounterFailure
            CALL ControlCheckActiveCounter
            RET  C
            CALL ParserExpectEqual
            RET  C
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            CALL TypedExpressionBeginRuntime
            RET  C
            LD   D,A
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            LD   E,A
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            CALL ParserTake
            RET  C
            CP   TokenTo
            LD   B,1
            JR   Z,StructuredForBound
            CP   TokenUntil
            JP   NZ,StructuredCounterFailure
            LD   B,0
StructuredForBound:
            PUSH BC
            LD   A,ScalarTypeU16
            CALL TypedExpressionBeginRuntime
            POP  BC
            RET  C
            PUSH BC
            LD   E,ScalarTypeU16
            CALL TypedCheckAssignable
            POP  BC
            RET  C
            LD   DE,1
            PUSH BC
            PUSH DE
            CALL ParserPeek
            POP  DE
            POP  BC
            RET  C
            CP   TokenStep
            JR   NZ,StructuredForStepReady
            PUSH BC
            CALL ParserTake
            POP  BC
            RET  C
            PUSH BC
            CALL StructuredParseStep
            LD   A,B
            POP  BC
            RET  C
            OR   B
            LD   B,A
StructuredForStepReady:
            PUSH BC
            PUSH DE
            CALL ParserExpectLine
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   A,ControlKindFor
            CALL ControlPushFrame
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   B,ControlFrameContinue
            CALL ControlAllocateInto
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   B,ControlFrameExit
            CALL ControlAllocateInto
            POP  DE
            POP  BC
            RET  C
            PUSH DE
            CALL ControlTopFrame
            POP  DE
            PUSH HL
            INC  HL
            INC  HL
            INC  HL
            INC  HL
            LD   A,(DeclarationPayload)
            LD   (HL),A
            INC  HL
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeU16
            LD   A,B
            JR   NZ,StructuredForModeReady
            SET  2,A
StructuredForModeReady:
            LD   (HL),A
            INC  HL
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   DE,(ExpressionCallOffset)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            POP  HL
            CALL StructuredEmitForSetup
            RET  C
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            CALL StructuredEmitForTest
            RET  C
            CALL TypedParseStatements
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenEnd
            JP   NZ,ParserExpectedScalar
            LD   B,ControlFrameContinue
            CALL ControlTopFrameField
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            CALL StructuredEmitForNext
            RET  C
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            LD   A,SemanticForCleanup
            CALL SemanticSinkOperation
            RET  C
            JP   StructuredCompleteLoop
.endif
StructuredCounterFailure:
            LD   A,DiagnosticLoopCounter
            JP   CompilerSetDiagnostic

; Emit the fixed-width counted-loop records from the current frame.
.routine in HL out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredEmitForSetup:
            PUSH HL
            LD   A,SemanticForSetup
            CALL SemanticSinkOperation
            POP  HL
            RET  C
            LD   DE,ControlFrameCounter
            ADD  HL,DE
            LD   A,(HL)
            PUSH HL
            CALL SemanticSinkPut
            POP  HL
            RET  C
            INC  HL
            LD   A,(HL)
            JP   SemanticSinkPut

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredEmitForTest:
            CALL ControlTopFrame
            PUSH HL
            LD   A,SemanticForTest
            CALL SemanticSinkOperation
            POP  HL
            RET  C
            LD   DE,ControlFrameCounter
            ADD  HL,DE
            LD   A,(HL)                  ; counter
            PUSH HL
            CALL SemanticSinkPut
            POP  HL
            RET  C
            INC  HL
            LD   A,(HL)                  ; mode
            PUSH HL
            CALL SemanticSinkPut
            POP  HL
            RET  C
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   A,(HL)                  ; exit label
            JP   SemanticSinkPut
StructuredEmitFrameBytes:
            LD   A,(HL)
            PUSH BC
            PUSH HL
            CALL SemanticSinkPut
            POP  HL
            POP  BC
            RET  C
            INC  HL
            DJNZ StructuredEmitFrameBytes
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
StructuredEmitForNext:
            CALL ControlTopFrame
            PUSH HL
            LD   A,SemanticForNext
            CALL SemanticSinkOperation
            POP  HL
            RET  C
            LD   DE,ControlFrameLabelA
            ADD  HL,DE
            LD   A,(HL)                  ; test label
            PUSH HL
            CALL SemanticSinkPut
            POP  HL
            RET  C
            INC  HL                     ; continue label
            INC  HL                     ; exit label
            LD   A,(HL)
            PUSH HL
            CALL SemanticSinkPut
            POP  HL
            RET  C
            INC  HL                     ; counter
            LD   B,6                    ; counter, mode, step, trap offset
            JR   StructuredEmitFrameBytes
