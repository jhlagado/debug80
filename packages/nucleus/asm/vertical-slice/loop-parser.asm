; Predictive parser for one u8 local and one positive exclusive counted loop.

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

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectMain:
            LD   D,DiagnosticExpectedMain
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            LD   HL,NameMain
            LD   B,4
            CALL TokenNameEquals
            JR   NC,ParserExpectMainNo
            OR   A
            RET
ParserExpectMainNo:
            LD   A,DiagnosticExpectedMain
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectIndex:
            LD   D,DiagnosticExpectedIndex
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            LD   HL,NameIndex
            LD   B,5
            CALL TokenNameEquals
            JR   NC,ParserExpectIndexNo
            OR   A
            RET
ParserExpectIndexNo:
            LD   A,DiagnosticExpectedIndex
            JP   CompilerSetDiagnostic

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

.routine in D out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserExpectNumber:
            LD   E,TokenNumber
            CALL ParserExpect
            RET  C
            LD   A,(TokenValue)
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
ParserParseProgram:
            LD   D,DiagnosticExpectedSub
            LD   E,TokenSub
            CALL ParserExpect
            RET  C
            CALL ParserExpectMain
            RET  C
            LD   D,DiagnosticExpectedLeft
            LD   E,TokenLeftParen
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedRight
            LD   E,TokenRightParen
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedFails
            LD   E,TokenFails
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedLine
            LD   E,TokenNewline
            CALL ParserExpect
            RET  C

            LD   D,DiagnosticExpectedVar
            LD   E,TokenVar
            CALL ParserExpect
            RET  C
            CALL ParserExpectIndex
            RET  C
            LD   D,DiagnosticExpectedAs
            LD   E,TokenAs
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedU8
            LD   E,TokenU8
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedEqual
            LD   E,TokenEquals
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedNumber
            CALL ParserExpectNumber
            RET  C
            LD   (ParsedDeclarationInitial),A
            LD   D,DiagnosticExpectedLine
            LD   E,TokenNewline
            CALL ParserExpect
            RET  C

            LD   D,DiagnosticExpectedFor
            LD   E,TokenFor
            CALL ParserExpect
            RET  C
            CALL ParserExpectIndex
            RET  C
            LD   D,DiagnosticExpectedEqual
            LD   E,TokenEquals
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedNumber
            CALL ParserExpectNumber
            RET  C
            LD   (ParsedLoopInitial),A
            LD   D,DiagnosticExpectedUntil
            LD   E,TokenUntil
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedNumber
            CALL ParserExpectNumber
            RET  C
            LD   (ParsedLoopBound),A
            LD   D,DiagnosticExpectedLine
            LD   E,TokenNewline
            CALL ParserExpect
            RET  C

            CALL ParserExpectWrite
            RET  C
            LD   D,DiagnosticExpectedLeft
            LD   E,TokenLeftParen
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedChar
            LD   E,TokenCharacter
            CALL ParserExpect
            RET  C
            LD   A,(TokenValue)
            LD   (ParsedOutputByte),A
            LD   D,DiagnosticExpectedRight
            LD   E,TokenRightParen
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedOr
            LD   E,TokenOr
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedFail
            LD   E,TokenFail
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedLine
            LD   E,TokenNewline
            CALL ParserExpect
            RET  C

            LD   D,DiagnosticExpectedEnd
            LD   E,TokenEnd
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedLine
            LD   E,TokenNewline
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedEnd
            LD   E,TokenEnd
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedLine
            LD   E,TokenNewline
            CALL ParserExpect
            RET  C
            LD   D,DiagnosticExpectedEof
            LD   E,TokenEof
            CALL ParserExpect
            RET  C
            OR   A
            RET

; A is the stable source-part identity; HL..DE is the half-open byte range.
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CompileLoopSlice:
            CALL SourceInitialize
            XOR  A
            LD   (DiagnosticCode),A
            LD   (DiagnosticPartId),A
            CALL SemanticSinkReset
            CALL ParserParseProgram
            RET  C
            CALL SemanticSinkEmitProgram
            RET
