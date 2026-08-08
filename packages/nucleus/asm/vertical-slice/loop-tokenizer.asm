; Tokenizer subset for the scalar-local, counted-loop, and array proofs.

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
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B
TokenFinish:
            LD   B,A
            LD   A,1
            LD   (SourceLineHasToken),A
            LD   A,B
            OR   A
            RET

.routine out carry,zero clobbers sign,parity,halfCarry,A,DE,HL
TokenLexicalFailure:
            LD   A,DiagnosticLexical
            JP   CompilerSetDiagnostic

.routine in A out A,carry clobbers zero,sign,parity,halfCarry,C
TokenIsLetter:
            LD   C,A
            OR   $20
            SUB  "a"
            CP   26
            LD   A,C
            RET

.routine in A out A,carry clobbers zero,sign,parity,halfCarry,C
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

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
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
            LD   HL,KeywordTable
            LD   C,KeywordCount
TokenScanKeyword:
            LD   B,(HL)
            INC  HL
            LD   A,(TokenLength)
            CP   B
            JR   NZ,TokenScanKeywordSkip
            LD   DE,(TokenLexemePointer)
TokenScanKeywordByte:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,TokenScanKeywordSkip
            INC  DE
            INC  HL
            DJNZ TokenScanKeywordByte
            LD   A,(HL)
            JP   TokenFinish
TokenScanKeywordSkip:
            LD   E,B
            LD   D,0
            ADD  HL,DE
            INC  HL
            DEC  C
            JR   NZ,TokenScanKeyword
            LD   A,TokenName
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
            JR   NZ,TokenScanCharacterFailure
            LD   A,C
            CP   6
            JR   NC,TokenScanCharacterFailure
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
            LD   C,B
            LD   A,TokenNumber
            JP   TokenFinish

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
TokenScanCharacter:
            CALL SourceTake
            JR   C,TokenScanCharacterFailure
            CALL SourceTake
            JR   C,TokenScanCharacterFailure
            CP   $20
            JR   C,TokenScanCharacterFailure
            CP   $7F
            JR   NC,TokenScanCharacterFailure
            CP   "'"
            JR   Z,TokenScanCharacterFailure
            CP   "\\"
            JR   Z,TokenScanCharacterFailure
            LD   C,A
            CALL SourceTake
            JR   C,TokenScanCharacterFailure
            CP   "'"
            JR   NZ,TokenScanCharacterFailure
            LD   A,TokenCharacter
            JP   TokenFinish
TokenScanCharacterFailure:
            JP   TokenLexicalFailure

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

.routine out A,C,carry,zero clobbers sign,parity,halfCarry,B,D,DE,HL
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
            JP   Z,TokenizerLf
            CP   13
            JP   Z,TokenizerCrLf
            CP   "/"
            JR   Z,TokenizerSlash
            CP   "("
            JR   Z,TokenizerLeftParen
            CP   ")"
            JR   Z,TokenizerRightParen
            CP   "["
            JR   Z,TokenizerLeftBracket
            CP   "]"
            JR   Z,TokenizerRightBracket
            LD   HL,PunctuationTable
            LD   B,PunctuationCount
TokenizerTryPunctuation:
            CP   (HL)
            INC  HL
            JR   Z,TokenizerPunctuation
            INC  HL
            DJNZ TokenizerTryPunctuation
            CP   "'"
            JP   Z,TokenScanCharacter
            CP   "0"
            JR   C,TokenizerTryName
            CP   "9"+1
            JP   C,TokenScanNumber
TokenizerTryName:
            CALL TokenIsLetter
            JP   C,TokenScanName
            JR   TokenizerLexicalFailure

TokenizerSkipByte:
            CALL SourceTake
            JR   TokenizerNextLoop

TokenizerSlash:
            CALL SourceTake
            CALL SourcePeek
            JR   C,TokenizerLexicalFailure
            CP   "/"
            JR   NZ,TokenizerLexicalFailure
            CALL SourceTake
            CALL TokenSkipComment
            JR   TokenizerNextLoop

TokenizerLeftParen:
            LD   C,TokenLeftParen
            JR   TokenizerLeftDelimiter

TokenizerRightParen:
            LD   C,TokenRightParen
            JR   TokenizerRightDelimiter

TokenizerLeftBracket:
            LD   C,TokenLeftBracket
TokenizerLeftDelimiter:
            CALL SourceTake
            LD   A,(SourceDelimiterDepth)
            INC  A
            JR   Z,TokenizerLexicalFailure
            LD   (SourceDelimiterDepth),A
            LD   A,C
            JP   TokenFinish

TokenizerRightBracket:
            LD   C,TokenRightBracket
TokenizerRightDelimiter:
            LD   A,(SourceDelimiterDepth)
            OR   A
            JR   Z,TokenizerLexicalFailure
            DEC  A
            LD   (SourceDelimiterDepth),A
            CALL SourceTake
            LD   A,C
            JP   TokenFinish

TokenizerLexicalFailure:
            JP   TokenLexicalFailure

TokenizerPunctuation:
            LD   C,(HL)
TokenizerSimpleToken:
            CALL SourceTake
            LD   A,C
            JP   TokenFinish

TokenizerLf:
            CALL SourceTake
            JR   TokenizerFinishLine
TokenizerCrLf:
            CALL SourceTake
            CALL SourcePeek
            JR   C,TokenizerLexicalFailure
            CP   10
            JR   NZ,TokenizerLexicalFailure
            CALL SourceTake
TokenizerFinishLine:
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
            OR   A
            RET

TokenizerAtEof:
            LD   A,(SourceDelimiterDepth)
            OR   A
            JR   NZ,TokenizerLexicalFailure
            LD   A,(SourceLineHasToken)
            OR   A
            JR   Z,TokenizerEmitEof
            XOR  A
            LD   (SourceLineHasToken),A
            LD   A,TokenNewline
            OR   A
            RET
TokenizerEmitEof:
            LD   A,TokenEof
            OR   A
            RET
