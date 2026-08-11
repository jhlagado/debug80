; Predictive parser and fixed semantic checks for the first complete program.

; Store the first diagnostic at the current token start. Carry denotes failure.
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
.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
ParserExpect:
            PUSH DE
            CALL TokenizerNext
            POP  DE
            RET  C
            CP   E
            RET  Z
            LD   A,D
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
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

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
ParserExpectWrite:
            LD   D,DiagnosticExpectedWrite
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            LD   HL,NameWriteOutputByte
            LD   B,15
            CALL TokenNameEquals
            JR   NC,ParserExpectWriteNo
            OR   A
            RET
ParserExpectWriteNo:
            LD   A,DiagnosticExpectedWrite
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
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
            LD   D,DiagnosticExpectedElse
            LD   E,TokenElse
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
            LD   D,DiagnosticExpectedEof
            LD   E,TokenEof
            CALL ParserExpect
            RET  C
            LD   A,(ParsedOutputByte)
            OR   A
            RET

; A is the stable source-part identity; HL..DE is the half-open byte range.
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
CompileVerticalSlice:
            CALL SourceInitialize
            XOR  A
            LD   (DiagnosticCode),A
            LD   (DiagnosticPartId),A
            CALL SemanticSinkReset
            CALL ParserParseProgram
            RET  C
            CALL SemanticSinkEmitProgram
            RET
