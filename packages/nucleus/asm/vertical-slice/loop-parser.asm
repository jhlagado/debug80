; Predictive parser for the counted-loop and checked-array proof programs.

; The including proof or build context defines HybridLL1Full explicitly.

LPAIMOD .equ AggregateHasInitializer-AggregateMode+1 ; aggregate mode clear span through initializer flag

.routine in A out A,carry clobbers zero,sign,parity,halfCarry,DE,HL
CompilerSetDiagnostic:
            LD   (DiagnosticCode),A
            LD   A,(SourcePartId)
            LD   (DiagnosticPartId),A
            LD   HL,TokenStartOffset
            LD   DE,DiagnosticOffset
            PUSH BC
            CALL CompilerCopyPosition
            POP  BC
            SCF
            RET

; Copy one complete offset/line/column record from HL to DE. LDIR preserves
; carry, allowing diagnostic callers to establish failure after the copy.
.routine in DE,HL out BC,DE,HL clobbers parity,halfCarry
CompilerCopyPosition:
            LD   BC,6
            LDIR
            RET

; E is the expected token ordinal. An ordinary mismatch reports the token
; ordinal with DiagnosticExpectedTokenBase set.
.routine in E out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserExpect:
            PUSH DE
            CALL ParserTake
            POP  DE
            RET  C
            CP   E
            RET  Z
            LD   A,E
            OR   DiagnosticExpectedTokenBase
            JR   CompilerSetDiagnostic

; The expression parser needs one token of lookahead. Token metadata remains
; current until another tokenizer request, so buffering kind and word payload
; is sufficient for names, positions, numbers, and characters.
.routine out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL
ParserPeek:
            LD   A,(ParserLookaheadKind)
            CP   $FF
            JR   NZ,ParserPeekBuffered
            CALL TokenizerNext
            RET  C
            LD   (ParserLookaheadKind),A
            LD   (ParserLookaheadValue),BC
            LD   A,(ParserLookaheadKind)
            RET
ParserPeekBuffered:
            LD   BC,(ParserLookaheadValue)
            LD   A,(ParserLookaheadKind)
            OR   A
            RET

.routine out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL
ParserTake:
            CALL ParserPeek
            RET  C
            LD   D,A
            LD   A,$FF
            LD   (ParserLookaheadKind),A
            LD   A,D
            OR   A
            RET

; Frequent token checks enter the common ParserExpect tail. These wrappers
; trade one shared seven-byte body for each repeated eight-byte inline check.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectLine:
            LD   E,TokenNewline
            JR   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectLeft:
            LD   E,TokenLeftParen
            JR   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectRight:
            LD   E,TokenRightParen
            JR   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectAs:
            LD   E,TokenAs
            JR   ParserExpect
.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectU8:
            LD   E,TokenU8
            JP   ParserExpect

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectAsU8:
            CALL ParserExpectAs
            RET  C
            JP   ParserExpectU8
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectEqual:
            LD   E,TokenEquals
            JR   ParserExpect
.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectSub:
            LD   E,TokenSub
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectLeftBracket:
            LD   E,TokenLeftBracket
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectRightBracket:
            LD   E,TokenRightBracket
            JP   ParserExpect
.endif
.if HybridLL1Full
.else
.routine in B,D,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectNamed:
            PUSH BC
            PUSH DE
            PUSH HL
            LD   E,TokenName
            CALL ParserExpect
            POP  HL
            POP  DE
            POP  BC
            RET  C
            CALL TokenNameEquals
            JR   NC,ParserExpectNamedNo
            OR   A
            RET
ParserExpectNamedNo:
            LD   A,D
            JP   CompilerSetDiagnostic

.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectIndex:
            LD   D,DiagnosticExpectedIndex
            LD   HL,NameIndex
            LD   B,5
            JP   ParserExpectNamed

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectBytes:
            LD   D,DiagnosticExpectedBytes
            LD   HL,NameBytes
            LD   B,5
            JP   ParserExpectNamed

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectResult:
            LD   D,DiagnosticExpectedResult
            LD   HL,NameResult
            LD   B,6
            JP   ParserExpectNamed
.endif

; Compare the current name token with the one retained by the forward.
.routine in D out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserCurrentNameIsForward:
            PUSH DE
            LD   HL,(ForwardNamePointer)
            LD   A,(ForwardNameLength)
            LD   B,A
            CALL TokenNameEquals
            POP  DE
            JR   NC,ParserCurrentNameNotForward
            OR   A
            RET
ParserCurrentNameNotForward .equ ParserExpectNamedNo

.routine in D out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserExpectForwardName:
            PUSH DE
            LD   E,TokenName
            CALL ParserExpect
            POP  DE
            RET  C
            JP   ParserCurrentNameIsForward

; Retain the current name token as the one complete forward signature.
.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
ParserRetainForwardName:
            LD   HL,(TokenLexemePointer)
            LD   (ForwardNamePointer),HL
            LD   A,(TokenLength)
            LD   (ForwardNameLength),A
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
ParserRetainForwardParameter:
            LD   HL,(TokenLexemePointer)
            LD   (ForwardParameterPointer),HL
            LD   A,(TokenLength)
            LD   (ForwardParameterLength),A
            OR   A
            RET
.endif

.if LegacyCompilerSlices
.routine in D out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserExpectForwardParameter:
            PUSH DE
            LD   E,TokenName
            CALL ParserExpect
            POP  DE
            RET  C
            LD   HL,(ForwardParameterPointer)
            LD   A,(ForwardParameterLength)
            LD   B,A
            PUSH DE
            CALL TokenNameEquals
            POP  DE
            JR   NC,ParserForwardParameterNo
            OR   A
            RET
ParserForwardParameterNo:
            LD   A,D
            JP   CompilerSetDiagnostic
.endif

.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectWrite:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            LD   HL,NameWriteOutputByte
            LD   B,15
            CALL TokenNameEquals
            JR   C,ParserExpectWriteYes
            LD   HL,NameIndex
            LD   B,5
            CALL TokenNameEquals
            JR   C,ParserActiveCounter
            LD   A,DiagnosticExpectedWrite
            JP   CompilerSetDiagnostic
ParserActiveCounter:
            LD   A,DiagnosticActiveCounter
            JP   CompilerSetDiagnostic
ParserExpectWriteYes:
            OR   A
            RET
.endif

.if LegacyCompilerSlices
.routine out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserExpectNumber:
            LD   E,TokenNumber
            CALL ParserExpect
            RET  C
            LD   A,C
            OR   A
            RET
.endif

; Append one operation followed by the byte in C. The helper preserves the
; operand across the sink's internal cursor work.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserEmitOperationC:
            PUSH BC
            CALL SemanticSinkOperation
            POP  BC
            RET  C
            LD   A,C
            JP   SemanticSinkPut

.if LegacyCompilerSlices
; A resolved scalar symbol is represented by its class in A and its storage
; ordinal in C. Expressions emit postfix operations, leaving evaluation order
; independent of either backend's register choices.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserEmitSymbolLoad:
            CP   SymbolInfoProgramU8
            JR   Z,ParserEmitProgramLoad
            CP   SymbolInfoLocalU8
            JR   NZ,ParserExpectedScalar
            LD   A,SemanticLoadLocalU8
            JP   ParserEmitOperationC
ParserEmitProgramLoad:
            LD   A,SemanticLoadProgramU8
            JP   ParserEmitOperationC

.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
ParserEmitSymbolStore:
            CP   SymbolInfoProgramU8
            JR   Z,ParserEmitProgramStore
            CP   SymbolInfoLocalU8
            JR   NZ,ParserExpectedScalar
            LD   A,SemanticStoreLocalU8
            JP   ParserEmitOperationC
ParserEmitProgramStore:
            LD   A,SemanticStoreProgramU8
            JP   ParserEmitOperationC
.endif

ParserExpectedScalar:
            LD   A,DiagnosticExpectedScalar
            ; The legacy proof layouts put this target outside JR range.
.if AggregateCallSlices
            JR   CompilerSetDiagnostic
.else
            JP   CompilerSetDiagnostic
.endif

.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarPrimary:
            CALL ParserTake
            RET  C
            CP   TokenNumber
            JR   Z,ParserParseScalarLiteral
            CP   TokenName
            JR   NZ,ParserExpectedScalar
            CALL SymbolLookupCurrent
            RET  C
            JP   ParserEmitSymbolLoad
ParserParseScalarLiteral:
            LD   A,SemanticLiteralU8
            JP   ParserEmitOperationC

; Precedence climbing uses one loop for both admitted operators. B is the
; minimum precedence; recursive calls only represent nested precedence, not a
; separate parser routine per grammar level.
.routine in B out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarExpressionMin:
            PUSH BC
            CALL ParserParseScalarPrimary
            POP  BC
            RET  C
ParserParseScalarExpressionLoop:
            PUSH BC
            CALL ParserPeek
            POP  BC
            RET  C
            CP   TokenPlus
            JR   Z,ParserScalarPlus
            CP   TokenStar
            JR   NZ,ParserScalarExpressionDone
            LD   C,2
            LD   D,SemanticMultiplyU8
            JR   ParserScalarOperator
ParserScalarPlus:
            LD   C,1
            LD   D,SemanticAddU8
ParserScalarOperator:
            LD   A,C
            CP   B
            JR   C,ParserScalarExpressionDone
            PUSH BC
            PUSH DE
            CALL ParserTake
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   B,C
            INC  B
            CALL ParserParseScalarExpressionMin
            POP  DE
            POP  BC
            RET  C
            LD   A,D
            PUSH BC
            CALL SemanticSinkOperation
            POP  BC
            RET  C
            JR   ParserParseScalarExpressionLoop
ParserScalarExpressionDone:
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarExpression:
            LD   B,1
            JP   ParserParseScalarExpressionMin
.endif

.if HybridLL1Full
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectRoutineHeader:
            LD   D,DiagnosticExpectedMain
            LD   HL,NameMain
            LD   B,4
            CALL ParserExpectNamed
            RET  C
            CALL ParserExpectLeft
            RET  C
            CALL ParserExpectRight
            RET  C
            LD   E,TokenFails
            CALL ParserExpect
            RET  C
            JP   ParserExpectLine
.endif

.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectIndexDeclaration:
            LD   E,TokenVar
            CALL ParserExpect
            RET  C
            CALL ParserExpectIndex
            RET  C
            CALL ParserExpectAs
            RET  C
            CALL ParserExpectU8
            RET  C
            JP   ParserExpectEqual
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectElseFailLine:
            CALL ParserExpectElseFail
            RET  C
            ; The legacy proof layouts put this target outside JR range.
.if AggregateCallSlices
            JR   ParserExpectLine
.else
            JP   ParserExpectLine
.endif

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectElseFail:
            LD   E,TokenElse
            CALL ParserExpect
            RET  C
            LD   E,TokenFail
            ; The legacy proof layouts put this target outside JR range.
.if AggregateCallSlices
            JR   ParserExpect
.else
            JP   ParserExpect
.endif

.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectPropagateLine:
            CALL ParserExpectElseFailLine
            RET  C
            LD   A,SemanticPropagate
            JP   SemanticSinkOperation

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectEndLine:
            LD   E,TokenEnd
            CALL ParserExpect
            RET  C
            JP   ParserExpectLine

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseLoopProgramAfterSub:
            CALL ParserExpectRoutineHeader
            RET  C

            CALL ParserExpectIndexDeclaration
            RET  C
            LD   A,SemanticDeclareU8
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectLine
            RET  C

            LD   E,TokenFor
            CALL ParserExpect
            RET  C
            CALL ParserExpectIndex
            RET  C
            CALL ParserExpectEqual
            RET  C
            LD   A,SemanticForUntilU8
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            LD   E,TokenUntil
            CALL ParserExpect
            RET  C
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectLine
            RET  C

            CALL ParserExpectWrite
            RET  C
            CALL ParserExpectLeft
            RET  C
            LD   A,SemanticWriteOutputByte
            CALL SemanticSinkOperation
            RET  C
            LD   E,TokenCharacter
            CALL ParserExpect
            RET  C
            LD   A,C
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectRight
            RET  C
            CALL ParserExpectPropagateLine
            RET  C

            CALL ParserExpectEndLine
            RET  C
            LD   A,SemanticEndLoop
            CALL SemanticSinkOperation
            RET  C
            JP   ParserFinishRoutine
.endif

; The first general scalar path admits bounded program variables and scalar
; locals, then parses a main body as assignment and output statements. The
; current token is the program variable's name on entry.
.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarProgramDeclaration:
            LD   A,(NextProgramSlot)
            LD   E,A
            LD   D,SymbolInfoProgramU8
            CALL SymbolPrepareCurrent
            RET  C
            JP   ParserParseScalarProgramDeclarationAfterPrepare
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarProgramDeclarationAfterPrepare:
            CALL ParserExpectAsU8
            RET  C
            JP   ParserParseScalarProgramDeclarationAfterU8
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarProgramDeclarationAfterU8:
            CALL ParserExpectEqual
            RET  C
            CALL ParserExpectNumber
            RET  C
            LD   B,0
            PUSH BC
            LD   A,SemanticDefineProgramU8
            CALL SemanticSinkOperation
            JR   C,ParserScalarProgramOperandFailure
            LD   A,(NextProgramSlot)
            CALL SemanticSinkPut
            JR   C,ParserScalarProgramOperandFailure
            POP  BC
            LD   A,C
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectLine
            RET  C
            CALL SymbolCommit
            LD   HL,NextProgramSlot
            INC  (HL)
            XOR  A
            RET
ParserScalarProgramOperandFailure:
            POP  BC
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarLocalDeclaration:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            LD   A,(NextLocalSlot)
            LD   E,A
            LD   D,SymbolInfoLocalU8
            CALL SymbolPrepareCurrent
            RET  C
            CALL ParserExpectAsU8
            RET  C
            CALL ParserExpectEqual
            RET  C
            LD   A,(NextLocalSlot)
            LD   C,A
            LD   A,SemanticDeclareLocalU8
            CALL ParserEmitOperationC
            RET  C
            CALL ParserParseScalarExpression
            RET  C
            LD   A,(NextLocalSlot)
            LD   C,A
            LD   A,SemanticStoreLocalU8
            CALL ParserEmitOperationC
            RET  C
            CALL ParserExpectLine
            RET  C
            CALL SymbolCommit
            LD   HL,NextLocalSlot
            INC  (HL)
            XOR  A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarAssignment:
            CALL SymbolLookupCurrent
            RET  C
            LD   B,A
            PUSH BC
            CALL ParserExpectEqual
            JR   C,ParserScalarAssignmentFailure
            CALL ParserParseScalarExpression
            JR   C,ParserScalarAssignmentFailure
            POP  BC
            LD   A,B
            CALL ParserEmitSymbolStore
            RET  C
            JP   ParserExpectLine
ParserScalarAssignmentFailure:
            POP  BC
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarWrite:
            LD   HL,(TokenStartOffset)
            PUSH HL
            CALL ParserExpectLeft
            JR   C,ParserScalarWriteFailure
            CALL ParserParseScalarExpression
            JR   C,ParserScalarWriteFailure
            CALL ParserExpectRight
            JR   C,ParserScalarWriteFailure
            LD   A,SemanticWriteValueU8
            CALL SemanticSinkOperation
            JR   C,ParserScalarWriteFailure
            POP  HL
            LD   A,L
            PUSH HL
            CALL SemanticSinkPut
            POP  HL
            RET  C
            LD   A,H
            CALL SemanticSinkPut
            RET  C
            JP   ParserExpectElseFailLine
ParserScalarWriteFailure:
            POP  HL
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarStatements:
            CALL ParserPeek
            RET  C
            CP   TokenEnd
            JR   Z,ParserParseScalarEnd
            CP   TokenName
            JP   NZ,ParserExpectedScalar
            CALL ParserTake
            RET  C
            LD   HL,NameWriteOutputByte
            LD   B,15
            CALL TokenNameEquals
            JR   NC,ParserParseScalarAssignmentStatement
            CALL ParserParseScalarWrite
            RET  C
            JR   ParserParseScalarStatements
ParserParseScalarAssignmentStatement:
            CALL ParserParseScalarAssignment
            RET  C
            JR   ParserParseScalarStatements
ParserParseScalarEnd:
            CALL ParserTake
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   A,SemanticEndMain
            CALL SemanticSinkOperation
            RET  C
            LD   E,TokenEof
            JP   ParserExpect

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseScalarTopLevel:
            CALL ParserPeek
            RET  C
            CP   TokenVar
            JR   NZ,ParserParseScalarMain
            CALL ParserTake
            RET  C
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL ParserParseScalarProgramDeclaration
            RET  C
            JR   ParserParseScalarTopLevel
ParserParseScalarMain:
            CP   TokenSub
            JR   NZ,ParserScalarExpectedTopLevel
            CALL ParserTake
            RET  C
            CALL ParserExpectRoutineHeader
            RET  C
            LD   A,SemanticBeginMain
            CALL SemanticSinkOperation
            RET  C
ParserParseScalarLocals:
            CALL ParserPeek
            RET  C
            CP   TokenVar
            JR   NZ,ParserParseScalarStatements
            CALL ParserTake
            RET  C
            CALL ParserParseScalarLocalDeclaration
            RET  C
            JR   ParserParseScalarLocals
ParserScalarExpectedTopLevel:
            LD   A,DiagnosticExpectedTopLevel
            JP   CompilerSetDiagnostic
.endif

.if HybridLL1Full
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
ParserParseProgramAfterVar:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            JP   TypedParseProgramAfterVar
.endif

; The older array slice is selected by the bracketed type suffix. Its body is
; still deliberately fixed; this split only keeps scalar names unrestricted.
.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseArrayProgramAfterU8:
            CALL ParserExpectLeftBracket
            RET  C
            LD   A,SemanticStaticU8Array
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectNumber
            RET  C
            CP   4
            JR   Z,ParserArrayLengthYes
            LD   A,DiagnosticExpectedArrayLength
            JP   CompilerSetDiagnostic
ParserArrayLengthYes:
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectRightBracket
            RET  C
            CALL ParserExpectEqual
            RET  C
            CALL ParserExpectLeftBracket
            RET  C
            LD   C,4
ParserArrayInitializer:
            PUSH BC
            CALL ParserExpectNumber
            POP  BC
            RET  C
            CALL SemanticSinkPut
            RET  C
            DEC  C
            JR   Z,ParserArrayInitializerDone
            PUSH BC
            LD   E,TokenComma
            CALL ParserExpect
            POP  BC
            RET  C
            JR   ParserArrayInitializer
ParserArrayInitializerDone:
            CALL ParserExpectRightBracket
            RET  C
            CALL ParserExpectLine
            RET  C

            LD   E,TokenSub
            CALL ParserExpect
            RET  C
            CALL ParserExpectRoutineHeader
            RET  C

            CALL ParserExpectIndexDeclaration
            RET  C
            LD   D,DiagnosticExpectedRead
            LD   HL,NameReadInputByte
            LD   B,13
            CALL ParserExpectNamed
            RET  C
            CALL ParserExpectLeft
            RET  C
            CALL ParserExpectRight
            RET  C
            LD   A,SemanticReadInputByte
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectPropagateLine
            RET  C
            LD   A,SemanticStoreResultU8
            CALL SemanticSinkOperation
            RET  C

            CALL ParserExpectWrite
            RET  C
            CALL ParserExpectLeft
            RET  C
            CALL ParserExpectBytes
            RET  C
            CALL ParserExpectLeftBracket
            RET  C
            CALL ParserExpectIndex
            RET  C
            CALL ParserExpectRightBracket
            RET  C
            CALL ParserExpectRight
            RET  C
            LD   A,SemanticLoadArrayU8
            CALL SemanticSinkOperation
            RET  C
            LD   A,SemanticWriteOutputU8
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectPropagateLine
            RET  C
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserFinishRoutine:
            CALL ParserExpectEndLine
            RET  C
            LD   A,SemanticReturn
            CALL SemanticSinkOperation
            RET  C
            LD   E,TokenEof
            JP   ParserExpect
.endif

; Parse the first general routine-call slice. It deliberately admits one
; retained forward signature while exercising exact completion and parameter
; lookup, scalar call/result flow, and direct recursion.
.if LegacyCompilerSlices
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseCallProgramAfterForward:
            CALL ParserExpectSub
            RET  C
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL ParserRetainForwardName
            CALL ParserExpectLeft
            RET  C
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL ParserRetainForwardParameter
            CALL ParserExpectAsU8
            RET  C
            CALL ParserExpectRight
            RET  C
            CALL ParserExpectAsU8
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   A,1
            LD   (ForwardOrdinal),A
            CALL ParserExpectSub
            RET  C
            CALL ParserExpectRoutineHeader
            RET  C
            LD   E,TokenVar
            CALL ParserExpect
            RET  C
            CALL ParserExpectResult
            RET  C
            CALL ParserExpectAsU8
            RET  C
            CALL ParserExpectEqual
            RET  C
            LD   D,DiagnosticForwardMismatch
            CALL ParserExpectForwardName
            RET  C
            CALL ParserExpectLeft
            RET  C
            LD   A,SemanticCallLiteralU8
            CALL SemanticSinkOperation
            RET  C
            LD   A,(ForwardOrdinal)
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectRight
            RET  C
            CALL ParserExpectLine
            RET  C

            CALL ParserExpectWrite
            RET  C
            CALL ParserExpectLeft
            RET  C
            CALL ParserExpectResult
            RET  C
            CALL ParserExpectRight
            RET  C
            LD   A,SemanticWriteLocalU8
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectElseFailLine
            RET  C
            CALL ParserExpectEndLine
            RET  C
            LD   A,SemanticEndRoutine
            CALL SemanticSinkOperation
            RET  C

            CALL ParserExpectSub
            RET  C
            LD   D,DiagnosticForwardMismatch
            CALL ParserExpectForwardName
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   A,1
            LD   (ForwardCompleted),A
            LD   A,SemanticBeginForwardU8
            CALL SemanticSinkOperation
            RET  C
            LD   A,(ForwardOrdinal)
            CALL SemanticSinkPut
            RET  C

            LD   E,TokenIf
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedValue
            CALL ParserExpectForwardParameter
            RET  C
            CALL ParserExpectEqual
            RET  C
            LD   A,SemanticIfParameterZero
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectNumber
            RET  C
            OR   A
            JP   NZ,ParserExpectedZero
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectLine
            RET  C

            LD   E,TokenReturn
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedValue
            CALL ParserExpectForwardParameter
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   A,SemanticReturnParameter
            CALL SemanticSinkOperation
            RET  C
            CALL ParserExpectEndLine
            RET  C
            LD   A,SemanticEndIf
            CALL SemanticSinkOperation
            RET  C

            LD   E,TokenReturn
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticForwardMismatch
            CALL ParserExpectForwardName
            RET  C
            CALL ParserExpectLeft
            RET  C
            LD   D,DiagnosticExpectedValue
            CALL ParserExpectForwardParameter
            RET  C
            LD   E,TokenMinus
            CALL ParserExpect
            RET  C
            LD   A,SemanticReturnSelfMinus
            CALL SemanticSinkOperation
            RET  C
            LD   A,(ForwardOrdinal)
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectRight
            RET  C
            CALL ParserExpectLine
            RET  C
            CALL ParserExpectEndLine
            RET  C
            LD   A,SemanticEndRoutine
            CALL SemanticSinkOperation
            RET  C
            LD   A,(ForwardCompleted)
            OR   A
            JR   Z,ParserForwardIncomplete
            LD   E,TokenEof
            JP   ParserExpect
ParserExpectedZero:
            LD   A,DiagnosticExpectedNumber
            JP   CompilerSetDiagnostic
ParserForwardIncomplete:
            LD   A,DiagnosticForwardIncomplete
            JP   CompilerSetDiagnostic
.endif

.if HybridLL1Full
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
ParserParseProgram:
            CALL ParserTake
            RET  C
            CP   TokenSub
            JP   Z,TypedParseMainAfterTake
            CP   TokenVar
            JP   Z,ParserParseProgramAfterVar
            CP   TokenForward
            JP   Z,TypedParseForwardAfterTake
            CP   TokenConst
            JP   Z,TypedParseTopLevelConstAfterTake
            CP   TokenRecord
            JP   Z,AggregateParseRecordAfterTake
            LD   A,DiagnosticExpectedTopLevel
            JP   CompilerSetDiagnostic
.endif

; A is the stable source-part identity; HL..DE is the half-open byte range.
.if LegacyCompilerSlices
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileLoopSlice:
            CALL CompileSliceInitialize
            CALL ParserTake
            RET  C
            CP   TokenSub
            JP   NZ,ParserScalarExpectedTopLevel
            CALL ParserParseLoopProgramAfterSub
            RET  C
            JP   SemanticSinkFinish
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileCallSlice:
            CALL CompileSliceInitialize
            CALL ParserTake
            RET  C
            CP   TokenForward
            JP   NZ,ParserScalarExpectedTopLevel
            CALL ParserParseCallProgramAfterForward
            RET  C
            JP   SemanticSinkFinish
.endif
.if AggregateCallSlices
.else
            .routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileSlice:
            CALL CompileSliceInitialize
.if HybridLL1Full
            XOR  A
            LD   (Stage7CurrentRoutine),A
            CALL HybridLL1Parse
.else
            CALL ParserParseProgram
.endif
            RET  C
            JP   SemanticSinkFinish
.endif
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileSliceInitialize:
.if AggregateCallSlices
            PUSH AF
            XOR  A
            LD   (SourcePartsRemaining),A
            POP  AF
.endif
            CALL SourceInitialize
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileSliceResetState:
            XOR  A
            LD   (DiagnosticCode),A
            LD   (DiagnosticPartId),A
.if AggregateCallSlices
            LD   HL,SemanticBufferBase+1
            LD   (SinkCursor),HL
            LD   (SinkOperationCount),A
            LD   (SemanticBufferBase),A
.else
            CALL SemanticSinkReset
.endif
            LD   A,$FF
            LD   (ParserLookaheadKind),A
.if AggregateCallSlices
            XOR  A
            LD   (SymbolCount),A
            LD   (NextLocalSlot),A
            LD   (NextProgramSlot),A
.else
            CALL SymbolReset
.endif
            XOR  A
            LD   HL,AggregateMode
            LD   B,LPAIMOD
CompileSliceResetAggregateLoop:
            LD   (HL),A
            INC  HL
            DJNZ CompileSliceResetAggregateLoop
            LD   (StaticImageLength),A
            LD   (StaticImageLength+1),A
.if SegmentedOutput
            LD   (ReadOnlyImageLength),A
            LD   (ReadOnlyImageLength+1),A
.endif
.if AggregateCallSlices
            LD   (ProgramBssLength),A
            LD   (ProgramBssLength+1),A
.endif
            LD   (ForwardCompleted),A
            LD   (ForwardOrdinal),A
            RET

; The typed scalar increment is kept in a separate source unit while it is
; correctness-first and under review. The compression pass may fold shared
; tails back into this parser after the rules are stable.
            .include "typed-expression-parser.asm"
            .include "aggregate-parser.asm"
.if AggregateCallSlices
            .include "aggregate-call-parser.asm"
.endif
