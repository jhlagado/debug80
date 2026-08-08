; Tokenizer subset for the scalar-local and counted-loop proof.

.routine out carry,zero clobbers sign,parity,halfCarry,A,DE,HL
TokenRecordStart:
            LD   HL,(SourceOffset)
            LD   (TokenStartOffset),HL
            LD   HL,(SourceLine)
            LD   (TokenStartLine),HL
            LD   HL,(SourceColumn)
            LD   (TokenStartColumn),HL
            LD   HL,(SourceCursor)
            LD   (TokenLexemePointer),HL
            XOR  A
            LD   (TokenLength),A
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry
TokenFinish:
            LD   (TokenKind),A
            LD   A,1
            LD   (SourceLineHasToken),A
            LD   A,(TokenKind)
            OR   A
            RET

.routine out carry,zero clobbers sign,parity,halfCarry,A,HL
TokenLexicalFailure:
            LD   A,DiagnosticLexical
            JP   CompilerSetDiagnostic

.routine in A out A,carry clobbers zero,sign,parity,halfCarry
TokenIsLetter:
            CP   "A"
            JR   C,TokenIsLetterNo
            CP   "Z"+1
            JR   C,TokenIsLetterYes
            CP   "a"
            JR   C,TokenIsLetterNo
            CP   "z"+1
            JR   C,TokenIsLetterYes
TokenIsLetterNo:
            OR   A
            RET
TokenIsLetterYes:
            SCF
            RET

.routine in A out A,carry clobbers zero,sign,parity,halfCarry
TokenIsNameByte:
            CALL TokenIsLetter
            RET  C
            CP   "0"
            JR   C,TokenIsNameByteUnderscore
            CP   "9"+1
            JR   C,TokenIsNameByteYes
TokenIsNameByteUnderscore:
            CP   "_"
            JR   Z,TokenIsNameByteYes
            OR   A
            RET
TokenIsNameByteYes:
            SCF
            RET

.routine in B,HL out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TokenNameEquals:
            LD   A,(TokenLength)
            CP   B
            JR   NZ,TokenNameEqualsNo
            LD   DE,(TokenLexemePointer)
TokenNameEqualsLoop:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,TokenNameEqualsNo
            INC  DE
            INC  HL
            DJNZ TokenNameEqualsLoop
            SCF
            RET
TokenNameEqualsNo:
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TokenScanName:
            LD   B,0
TokenScanNameLoop:
            CALL SourcePeek
            JR   C,TokenScanNameDone
            CALL TokenIsNameByte
            JR   NC,TokenScanNameDone
            CALL SourceTake
            INC  B
            JR   Z,TokenLexicalFailure
            JR   TokenScanNameLoop
TokenScanNameDone:
            LD   A,B
            LD   (TokenLength),A

            LD   HL,KeywordSub
            LD   B,3
            CALL TokenNameEquals
            JR   C,TokenScanNameSub
            LD   HL,KeywordFails
            LD   B,5
            CALL TokenNameEquals
            JR   C,TokenScanNameFails
            LD   HL,KeywordOr
            LD   B,2
            CALL TokenNameEquals
            JR   C,TokenScanNameOr
            LD   HL,KeywordFail
            LD   B,4
            CALL TokenNameEquals
            JR   C,TokenScanNameFail
            LD   HL,KeywordEnd
            LD   B,3
            CALL TokenNameEquals
            JR   C,TokenScanNameEnd
            LD   HL,KeywordVar
            LD   B,3
            CALL TokenNameEquals
            JR   C,TokenScanNameVar
            LD   HL,KeywordAs
            LD   B,2
            CALL TokenNameEquals
            JR   C,TokenScanNameAs
            LD   HL,KeywordU8
            LD   B,2
            CALL TokenNameEquals
            JR   C,TokenScanNameU8
            LD   HL,KeywordFor
            LD   B,3
            CALL TokenNameEquals
            JR   C,TokenScanNameFor
            LD   HL,KeywordUntil
            LD   B,5
            CALL TokenNameEquals
            JR   C,TokenScanNameUntil
            LD   A,TokenName
            JP   TokenFinish
TokenScanNameSub:
            LD   A,TokenSub
            JP   TokenFinish
TokenScanNameFails:
            LD   A,TokenFails
            JP   TokenFinish
TokenScanNameOr:
            LD   A,TokenOr
            JP   TokenFinish
TokenScanNameFail:
            LD   A,TokenFail
            JP   TokenFinish
TokenScanNameEnd:
            LD   A,TokenEnd
            JP   TokenFinish
TokenScanNameVar:
            LD   A,TokenVar
            JP   TokenFinish
TokenScanNameAs:
            LD   A,TokenAs
            JP   TokenFinish
TokenScanNameU8:
            LD   A,TokenU8
            JP   TokenFinish
TokenScanNameFor:
            LD   A,TokenFor
            JP   TokenFinish
TokenScanNameUntil:
            LD   A,TokenUntil
            JP   TokenFinish

; Scan one or more decimal digits and reject a value above 255.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TokenScanNumber:
            LD   B,0
TokenScanNumberLoop:
            CALL SourcePeek
            JR   C,TokenScanNumberDone
            CP   "0"
            JR   C,TokenScanNumberDone
            CP   "9"+1
            JR   NC,TokenScanNumberDone
            SUB  "0"
            LD   C,A
            LD   A,B
            CP   25
            JR   C,TokenScanNumberAccumulate
            JP   NZ,TokenLexicalFailure
            LD   A,C
            CP   6
            JP   NC,TokenLexicalFailure
TokenScanNumberAccumulate:
            LD   A,B
            ADD  A,A
            LD   D,A
            ADD  A,A
            ADD  A,A
            ADD  A,D
            ADD  A,C
            LD   B,A
            CALL SourceTake
            JR   TokenScanNumberLoop
TokenScanNumberDone:
            LD   A,B
            LD   (TokenValue),A
            LD   A,TokenNumber
            JP   TokenFinish

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
TokenScanCharacter:
            CALL SourceTake
            JP   C,TokenLexicalFailure
            CALL SourcePeek
            JP   C,TokenLexicalFailure
            CP   $20
            JP   C,TokenLexicalFailure
            CP   $7F
            JP   NC,TokenLexicalFailure
            CP   "'"
            JP   Z,TokenLexicalFailure
            CP   "\\"
            JP   Z,TokenLexicalFailure
            CALL SourceTake
            LD   (TokenValue),A
            CALL SourcePeek
            JP   C,TokenLexicalFailure
            CP   "'"
            JP   NZ,TokenLexicalFailure
            CALL SourceTake
            LD   A,TokenCharacter
            JP   TokenFinish

.routine out carry,zero clobbers sign,parity,halfCarry,A,DE,HL
TokenSkipComment:
TokenSkipCommentLoop:
            CALL SourcePeek
            RET  C
            CP   10
            RET  Z
            CP   13
            RET  Z
            CALL SourceTake
            JR   TokenSkipCommentLoop

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
TokenizerNext:
TokenizerNextLoop:
            CALL TokenRecordStart
            CALL SourcePeek
            JP   C,TokenizerAtEof

            CP   " "
            JR   Z,TokenizerSkipByte
            CP   9
            JR   Z,TokenizerSkipByte
            CP   10
            JR   Z,TokenizerLf
            CP   13
            JP   Z,TokenizerCrLf
            CP   "/"
            JR   Z,TokenizerSlash
            CP   "("
            JR   Z,TokenizerLeftParen
            CP   ")"
            JR   Z,TokenizerRightParen
            CP   "="
            JR   Z,TokenizerEquals
            CP   "'"
            JP   Z,TokenScanCharacter
            CP   "0"
            JR   C,TokenizerTryName
            CP   "9"+1
            JP   C,TokenScanNumber
TokenizerTryName:
            CALL TokenIsLetter
            JP   C,TokenScanName
            JP   TokenLexicalFailure

TokenizerSkipByte:
            CALL SourceTake
            JR   TokenizerNextLoop

TokenizerSlash:
            CALL SourceTake
            CALL SourcePeek
            JP   C,TokenLexicalFailure
            CP   "/"
            JP   NZ,TokenLexicalFailure
            CALL SourceTake
            CALL TokenSkipComment
            JR   TokenizerNextLoop

TokenizerLeftParen:
            CALL SourceTake
            LD   A,(SourceDelimiterDepth)
            INC  A
            JP   Z,TokenLexicalFailure
            LD   (SourceDelimiterDepth),A
            LD   A,TokenLeftParen
            JP   TokenFinish

TokenizerRightParen:
            LD   A,(SourceDelimiterDepth)
            OR   A
            JP   Z,TokenLexicalFailure
            DEC  A
            LD   (SourceDelimiterDepth),A
            CALL SourceTake
            LD   A,TokenRightParen
            JP   TokenFinish

TokenizerEquals:
            CALL SourceTake
            LD   A,TokenEquals
            JP   TokenFinish

TokenizerLf:
            CALL SourceTake
            CALL SourceFinishLine
            LD   A,(SourceDelimiterDepth)
            OR   A
            JP   NZ,TokenizerNextLoop
            LD   A,(SourceLineHasToken)
            OR   A
            JP   Z,TokenizerNextLoop
            XOR  A
            LD   (SourceLineHasToken),A
            LD   A,TokenNewline
            LD   (TokenKind),A
            OR   A
            RET

TokenizerCrLf:
            CALL SourceTake
            CALL SourcePeek
            JP   C,TokenLexicalFailure
            CP   10
            JP   NZ,TokenLexicalFailure
            CALL SourceTake
            CALL SourceFinishLine
            LD   A,(SourceDelimiterDepth)
            OR   A
            JP   NZ,TokenizerNextLoop
            LD   A,(SourceLineHasToken)
            OR   A
            JP   Z,TokenizerNextLoop
            XOR  A
            LD   (SourceLineHasToken),A
            LD   A,TokenNewline
            LD   (TokenKind),A
            OR   A
            RET

TokenizerAtEof:
            LD   A,(SourceDelimiterDepth)
            OR   A
            JP   NZ,TokenLexicalFailure
            LD   A,(TokenizerEofPending)
            OR   A
            JR   NZ,TokenizerEmitEof
            LD   A,(SourceLineHasToken)
            OR   A
            JR   Z,TokenizerEmitEof
            XOR  A
            LD   (SourceLineHasToken),A
            INC  A
            LD   (TokenizerEofPending),A
            LD   A,TokenNewline
            LD   (TokenKind),A
            OR   A
            RET
TokenizerEmitEof:
            LD   A,TokenEof
            LD   (TokenKind),A
            OR   A
            RET
