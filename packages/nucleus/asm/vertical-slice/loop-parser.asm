; Predictive parser for the counted-loop and checked-array proof programs.

.routine in A out A,carry clobbers zero,sign,parity,halfCarry,HL
CompilerSetDiagnostic:
            LD   (DiagnosticCode),A
            LD   A,(SourcePartId)
            LD   (DiagnosticPartId),A
            LD   HL,(TokenStartOffset)
            LD   (DiagnosticOffset),HL
            LD   HL,(TokenStartLine)
            LD   (DiagnosticLine),HL
            LD   HL,(TokenStartColumn)
            LD   (DiagnosticColumn),HL
            SCF
            RET

; D is the diagnostic code and E the expected token ordinal.
.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpect:
            PUSH DE
            CALL TokenizerNext
            POP  DE
            RET  C
            CP   E
            RET  Z
            LD   A,D
            JP   CompilerSetDiagnostic

; Frequent token checks enter the common ParserExpect tail. These wrappers
; trade one shared seven-byte body for each repeated eight-byte inline check.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectLine:
            LD   D,DiagnosticExpectedLine
            LD   E,TokenNewline
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectLeft:
            LD   D,DiagnosticExpectedLeft
            LD   E,TokenLeftParen
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectRight:
            LD   D,DiagnosticExpectedRight
            LD   E,TokenRightParen
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectAs:
            LD   D,DiagnosticExpectedAs
            LD   E,TokenAs
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectU8:
            LD   D,DiagnosticExpectedU8
            LD   E,TokenU8
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectEqual:
            LD   D,DiagnosticExpectedEqual
            LD   E,TokenEquals
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectOr:
            LD   D,DiagnosticExpectedOr
            LD   E,TokenOr
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectFail:
            LD   D,DiagnosticExpectedFail
            LD   E,TokenFail
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectEnd:
            LD   D,DiagnosticExpectedEnd
            LD   E,TokenEnd
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectLeftBracket:
            LD   D,DiagnosticExpectedLeftBracket
            LD   E,TokenLeftBracket
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectRightBracket:
            LD   D,DiagnosticExpectedRightBracket
            LD   E,TokenRightBracket
            JP   ParserExpect
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectComma:
            LD   D,DiagnosticExpectedComma
            LD   E,TokenComma
            JP   ParserExpect

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

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectMain:
            LD   D,DiagnosticExpectedMain
            LD   HL,NameMain
            LD   B,4
            JP   ParserExpectNamed

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
ParserExpectRead:
            LD   D,DiagnosticExpectedRead
            LD   HL,NameReadInputByte
            LD   B,13
            JP   ParserExpectNamed

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectWrite:
            LD   D,DiagnosticExpectedWrite
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

.routine in D out A,carry,zero clobbers sign,parity,halfCarry,D,DE
ParserExpectNumber:
            PUSH BC
            PUSH HL
            LD   E,TokenNumber
            CALL ParserExpect
            POP  HL
            POP  BC
            RET  C
            LD   A,(TokenValue)
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectRoutineHeader:
            CALL ParserExpectMain
            RET  C
            CALL ParserExpectLeft
            RET  C
            CALL ParserExpectRight
            RET  C
            LD   D,DiagnosticExpectedFails
            LD   E,TokenFails
            CALL ParserExpect
            RET  C
            JP   ParserExpectLine

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectIndexDeclaration:
            LD   D,DiagnosticExpectedVar
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

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectOrFailLine:
            CALL ParserExpectOr
            RET  C
            CALL ParserExpectFail
            RET  C
            JP   ParserExpectLine

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectPropagateLine:
            CALL ParserExpectOrFailLine
            RET  C
            LD   A,SemanticPropagate
            JP   SemanticSinkOperation

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectEndLine:
            CALL ParserExpectEnd
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
            LD   D,DiagnosticExpectedNumber
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            CALL ParserExpectLine
            RET  C

            LD   D,DiagnosticExpectedFor
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
            LD   D,DiagnosticExpectedNumber
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            LD   D,DiagnosticExpectedUntil
            LD   E,TokenUntil
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedNumber
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
            LD   D,DiagnosticExpectedChar
            LD   E,TokenCharacter
            CALL ParserExpect
            RET  C
            LD   A,(TokenValue)
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

; Parse `var bytes as u8[4] = [b0, b1, b2, b3]` after `var`.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseArrayProgramAfterVar:
            CALL ParserExpectBytes
            RET  C
            CALL ParserExpectAs
            RET  C
            CALL ParserExpectU8
            RET  C
            CALL ParserExpectLeftBracket
            RET  C
            LD   A,SemanticStaticU8Array
            CALL SemanticSinkOperation
            RET  C
            LD   D,DiagnosticExpectedArrayLength
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
            LD   D,DiagnosticExpectedNumber
            CALL ParserExpectNumber
            RET  C
            CALL SemanticSinkPut
            RET  C
            DEC  C
            JR   Z,ParserArrayInitializerDone
            PUSH BC
            CALL ParserExpectComma
            POP  BC
            RET  C
            JR   ParserArrayInitializer
ParserArrayInitializerDone:
            CALL ParserExpectRightBracket
            RET  C
            CALL ParserExpectLine
            RET  C

            LD   D,DiagnosticExpectedSub
            LD   E,TokenSub
            CALL ParserExpect
            RET  C
            CALL ParserExpectRoutineHeader
            RET  C

            CALL ParserExpectIndexDeclaration
            RET  C
            CALL ParserExpectRead
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
            LD   D,DiagnosticExpectedEof
            LD   E,TokenEof
            CALL ParserExpect
            RET  C
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseProgram:
            CALL TokenizerNext
            RET  C
            CP   TokenSub
            JP   Z,ParserParseLoopProgramAfterSub
            CP   TokenVar
            JP   Z,ParserParseArrayProgramAfterVar
            LD   A,DiagnosticExpectedTopLevel
            JP   CompilerSetDiagnostic

; A is the stable source-part identity; HL..DE is the half-open byte range.
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CompileLoopSlice:
CompileSlice:
            CALL SourceInitialize
            XOR  A
            LD   (DiagnosticCode),A
            LD   (DiagnosticPartId),A
            CALL SemanticSinkReset
            CALL ParserParseProgram
            RET  C
            JP   SemanticSinkFinish
