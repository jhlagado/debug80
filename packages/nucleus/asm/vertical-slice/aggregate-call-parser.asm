; Predictive aggregate paths, bounded routine signatures, forwards, and the
; predefined Stage 8 service surface. Runtime carriers are never entered in
; the source symbol model as integers.

.routine in A out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
Stage7RoutineAddress:
            LD   L,A
            LD   H,0
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,HL
            LD   DE,Stage7RoutineTableBase
            ADD  HL,DE
            OR   A
            RET

.routine in A out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
Stage7ParameterAddress:
            LD   L,A
            LD   H,0
            ADD  HL,HL
            ADD  HL,HL
            LD   DE,Stage7ParameterTableBase
            ADD  HL,DE
            OR   A
            RET

; Z returns one exact routine match and A its table index. NZ means that the
; current name is not a retained routine; it is not itself a diagnostic.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7FindRoutineCurrent:
            LD   A,(Stage7RoutineCount)
            OR   A
            JR   Z,Stage7FindRoutineMissing
            LD   C,A
            LD   B,0
Stage7FindRoutineLoop:
            LD   A,B
            CALL Stage7RoutineAddress
            CALL TokenNameRecordEquals
            JR   C,Stage7FindRoutineFound
            INC  B
            DEC  C
            JR   NZ,Stage7FindRoutineLoop
Stage7FindRoutineMissing:
            LD   A,(Stage8ForwardMainFlags)
            AND  Stage7RoutineMain
            JR   Z,Stage7FindRoutineAbsent
            CALL TypedNameEqualsMain
            JR   NC,Stage7FindRoutineAbsent
            LD   A,Stage7MainRoutine
            CP   A
            RET
Stage7FindRoutineAbsent:
            LD   A,$FF
            OR   A
            RET
Stage7FindRoutineFound:
            LD   A,B
            CP   A
            RET

Stage7CurrentNameMatchesAtHL .equ TokenNameRecordEquals

; Carry identifies a predefined service or error constant and A returns its
; dense ordinal. No match returns carry clear.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage8MatchPredefinedCurrent:
            LD   HL,Stage8PredefinedTable
            LD   C,Stage8PredefinedCount
Stage8MatchPredefinedLoop:
            LD   B,(HL)
            INC  HL
            LD   A,(TokenLength)
            CP   B
            JR   NZ,Stage8MatchPredefinedSkip
            LD   DE,(TokenLexemePointer)
Stage8MatchPredefinedByte:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,Stage8MatchPredefinedSkip
            INC  DE
            INC  HL
            DJNZ Stage8MatchPredefinedByte
            LD   A,Stage8PredefinedCount
            SUB  C
            SCF
            RET
Stage8MatchPredefinedSkip:
            LD   E,B
            LD   D,0
            ADD  HL,DE
            DEC  C
            JR   NZ,Stage8MatchPredefinedLoop
            OR   A
            RET

.if TargetStreamingOutput
; Compile one multipart source stream and publish one flat append-only object.
; IX points at the stable compact target descriptor; A/HL retain the existing
; bounded source-part descriptor ABI.
.routine in A,HL,IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileTargetAggregateCallParts:
            LD   (TargetDescriptorPointer),IX
            CALL CompileAggregateCallParts
            RET  C
            JP   EncodeAggregateProgram
.endif

.routine in A,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileAggregateCallParts:
            PUSH AF
            PUSH HL
            CALL CompileSliceResetState
            POP  HL
            POP  AF
            CALL SourceInitializeParts
            RET  C
            JR   CompileAggregateCallReady
.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileAggregateCallSlice:
            CALL CompileSliceInitialize
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileAggregateCallReady:
            INC  A
            LD   (AggregateMode),A
            LD   HL,Stage7StateBase
            LD   B,Stage7CompilerWorkspaceEnd-Stage7StateBase
            XOR  A
CompileAggregateCallResetLoop:
            LD   (HL),A
            INC  HL
            DJNZ CompileAggregateCallResetLoop
            LD   (ControlNextLabel),A
.if Stage7LL1
            CALL HybridLL1Parse
.else
            CALL Stage7ParseTopLevel
.endif
            RET  C
            JP   SemanticSinkFinish

; Reject a routine name that collides with an ordinary name or an earlier
; routine. The current token remains the name being checked.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7RejectCurrentDeclarationName:
            CALL SymbolFindCurrent
            JP   C,TypedDuplicateNameFailure
            CALL Stage7FindRoutineCurrent
            JP   Z,TypedDuplicateNameFailure
            CALL Stage8MatchPredefinedCurrent
            JP   C,TypedDuplicateNameFailure
            OR   A
            RET

.if HybridLL1Full
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7ParseTopLevel:
            CALL ParserPeek
            RET  C
            CP   TokenRecord
            JR   Z,Stage7TopLevelRecord
            CP   TokenVar
            JR   Z,Stage7TopLevelVar
            CP   TokenConst
            JR   Z,Stage7TopLevelConst
            CP   TokenSub
            JR   Z,Stage7TopLevelRoutine
            LD   A,DiagnosticExpectedTopLevel
            JP   CompilerSetDiagnostic
Stage7TopLevelRecord:
            CALL ParserTake
            RET  C
            JP   AggregateParseRecordAfterTake
Stage7TopLevelVar:
            CALL ParserTake
            RET  C
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            JP   AggregateParseProgramAfterVar
Stage7TopLevelConst:
            CALL ParserTake
            RET  C
            CALL TypedParseTopLevelConstAfterTake
            RET  C
            JP   Stage7ParseTopLevel
Stage7TopLevelRoutine:
            CALL ParserTake
            RET  C
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            LD   HL,NameMain
            LD   B,4
            CALL TokenNameEquals
            JP   C,Stage7ParseMainAfterName
            JP   Stage7ParseRoutineAfterName
.endif

; Check the current parameter name against the current signature prefix.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7CheckParameterDuplicate:
            LD   A,(Stage7CurrentParameterCount)
            OR   A
            RET  Z
            LD   C,A
            LD   A,(Stage7CurrentParameterStart)
            LD   B,A
Stage7CheckParameterLoop:
            LD   A,B
            CALL Stage7ParameterAddress
            CALL TokenNameRecordEquals
            JP   C,TypedDuplicateNameFailure
            INC  B
            DEC  C
            JR   NZ,Stage7CheckParameterLoop
            OR   A
            RET

; Reject a parameter name that collides with an ordinary declaration, an
; earlier routine, the routine whose signature is being parsed, or an earlier
; parameter in that signature.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7CheckParameterDeclarationName:
            CALL TypedRejectCurrentOrdinaryName
            RET  C
            CALL Stage7RejectCurrentDeclarationName
            RET  C
            LD   A,(Stage7CurrentRoutine)
            CALL Stage7RoutineAddress
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   A,(HL)
            LD   B,A
            EX   DE,HL
            CALL TokenNameEquals
            JP   C,TypedDuplicateNameFailure
            JR   Stage7CheckParameterDuplicate

; Append the current parameter name and its parsed type A.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7AppendParameter:
            LD   (Stage7PathType),A
            LD   A,(Stage7ParameterCount)
            CP   Stage7ParameterCapacity
            JR   NC,Stage7ParameterCapacityFailure
            CALL Stage7ParameterAddress
            CALL TokenRetainNameAtHL
            INC  HL
            LD   A,(Stage7PathType)
            LD   (HL),A
            LD   HL,Stage7ParameterCount
            INC  (HL)
            LD   HL,Stage7CurrentParameterCount
            INC  (HL)
            LD   A,(Stage7PathType)
            OR   A
            RET
Stage7ParameterCapacityFailure:
            LD   A,DiagnosticParameterCapacity
            JP   CompilerSetDiagnostic

; Parse the parameter list and optional result of the provisional routine.
.if HybridLL1Full
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7ParseSignature:
            CALL ParserExpectLeft
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenRightParen
            JR   Z,Stage7SignatureClose
Stage7SignatureParameter:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL Stage7CheckParameterDeclarationName
            RET  C
            PUSH HL
            LD   HL,(TokenLexemePointer)
            LD   (DeclarationNamePointer),HL
            LD   A,(TokenLength)
            LD   (DeclarationNameLength),A
            POP  HL
            CALL ParserExpectAs
            RET  C
            CALL AggregateParseType
            RET  C
            PUSH AF
            CALL TypedRestoreDeclarationToken
            POP  AF
            CALL Stage7AppendParameter
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenComma
            JR   NZ,Stage7SignatureClose
            CALL ParserTake
            RET  C
            JR   Stage7SignatureParameter
Stage7SignatureClose:
            CALL ParserExpectRight
            RET  C
            XOR  A
            LD   (Stage7CurrentResultType),A
            CALL ParserPeek
            RET  C
            CP   TokenAs
            JR   NZ,Stage7SignatureLine
            CALL ParserTake
            RET  C
            CALL AggregateParseType
            RET  C
            LD   (Stage7CurrentResultType),A
Stage7SignatureLine:
            JP   ParserExpectLine
.endif

; Install one retained parameter as an activation symbol and emit the copy
; from its caller-stack carrier into the routine's negative IX frame.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7InstallParameter:
            LD   (Stage7CurrentParameterStart),A
            LD   A,C
            LD   (Stage7ArgumentIndex),A
            LD   A,(Stage7CurrentParameterStart)
            CALL Stage7ParameterAddress
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   B,(HL)
            INC  HL
            LD   A,(HL)
            LD   (Stage7PathType),A
            LD   (TokenLexemePointer),DE
            LD   A,B
            LD   (TokenLength),A
            LD   A,(NextLocalSlot)
            LD   (Stage7PathOffset),A
            LD   C,A
            LD   B,0
            LD   A,(Stage7PathType)
            CP   AggregateFirstDynamicTypeId
            JR   C,Stage7InstallScalarParameter
            LD   D,SymbolAggregateFlag+SymbolClassParameter
            JR   Stage7InstallParameterSymbol
Stage7InstallScalarParameter:
            OR   SymbolClassParameter
            LD   D,A
Stage7InstallParameterSymbol:
            CALL SymbolPrepareCurrentWord
            RET  C
            LD   A,(SymbolCount)
            LD   E,A
            LD   D,0
            LD   HL,AggregateSymbolTypeBase
            ADD  HL,DE
            LD   A,(Stage7PathType)
            LD   (HL),A
            CALL SymbolCommit
            RET  C
            LD   A,SemanticBindParameter
            CALL SemanticSinkOperation
            RET  C
            LD   A,(Stage7PathType)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage7PathOffset)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage7ArgumentIndex)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage7PathType)
            CP   AggregateFirstDynamicTypeId
            LD   A,2
            JR   NC,Stage7InstallParameterWidth
            LD   A,(Stage7PathType)
            CALL TypedTypeWidth
Stage7InstallParameterWidth:
            LD   HL,NextLocalSlot
            ADD  A,(HL)
            LD   (HL),A
            OR   A
            RET

; Current token is a non-main routine name.
.if HybridLL1Full
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7ParseRoutineAfterName:
            LD   A,(Stage7RoutineCount)
            CP   Stage7RoutineCapacity
            JP   NC,Stage7RoutineCapacityFailure
            CALL Stage7RejectCurrentDeclarationName
            RET  C
            LD   A,(Stage7RoutineCount)
            LD   (Stage7CurrentRoutine),A
            CALL Stage7RoutineAddress
            CALL TokenRetainNameAtHL
            INC  HL
            LD   A,(Stage7ParameterCount)
            LD   (HL),A
            LD   (Stage7CurrentParameterStart),A
            XOR  A
            LD   (Stage7CurrentParameterCount),A
            CALL Stage7ParseSignature
            RET  C
            LD   A,(Stage7CurrentRoutine)
            CALL Stage7RoutineAddress
            LD   DE,Stage7RoutineParameterCount
            ADD  HL,DE
            LD   A,(Stage7CurrentParameterCount)
            LD   (HL),A
            INC  HL
            LD   A,(Stage7CurrentResultType)
            LD   (HL),A
            INC  HL
            LD   A,(Stage7CurrentRoutine)
            ADD  A,Stage7RoutineLabelBase
            LD   (HL),A
            LD   (Stage7CallLabel),A
            LD   HL,Stage7RoutineCount
            INC  (HL)
            LD   A,(SymbolCount)
            LD   (Stage7GlobalSymbolCount),A
            XOR  A
            LD   (NextLocalSlot),A
            CALL ControlReset
            LD   A,(Stage7CurrentResultType)
            OR   A
            LD   A,ControlRoutineValue
            JR   NZ,Stage7RoutineKindReady
            XOR  A
Stage7RoutineKindReady:
            LD   (ControlRoutineKind),A
            LD   A,(Stage7CurrentResultType)
            LD   (ControlResultType),A
            LD   A,1
            LD   (ControlSequenceFallsThrough),A
            LD   A,SemanticBeginGeneralRoutine
            CALL SemanticSinkOperation
            RET  C
            LD   A,(Stage7CallLabel)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage7CurrentParameterCount)
            CALL SemanticSinkPut
            RET  C
            LD   B,A
            LD   A,(Stage7CurrentParameterStart)
            LD   D,A
            XOR  A
            LD   E,A
Stage7RoutineParameterLoop:
            LD   A,B
            OR   A
            JR   Z,Stage7RoutineLocals
            DEC  A
            ADD  A,A
            ADD  A,4
            LD   C,A
            LD   A,D
            PUSH DE
            PUSH BC
            CALL Stage7InstallParameter
            POP  BC
            POP  DE
            RET  C
            INC  D
            INC  E
            DEC  B
            JR   Stage7RoutineParameterLoop
Stage7RoutineLocals:
            CALL TypedParseLocalRun
            RET  C
Stage7RoutineStatements:
            CALL TypedParseStatements
            RET  C
            LD   A,(Stage7CurrentResultType)
            OR   A
            JR   Z,Stage7RoutineEndToken
            LD   A,(ControlSequenceFallsThrough)
            OR   A
            JP   NZ,TypedRoutineFlowFailure
Stage7RoutineEndToken:
            LD   E,TokenEnd
            CALL ParserExpect
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   A,SemanticEndGeneralRoutine
            CALL SemanticSinkOperation
            RET  C
            LD   A,(Stage7CurrentResultType)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage7GlobalSymbolCount)
            LD   (SymbolCount),A
            XOR  A
            LD   (NextLocalSlot),A
            JP   Stage7ParseTopLevel
Stage7RoutineCapacityFailure:
            LD   A,DiagnosticRoutineCapacity
            JP   CompilerSetDiagnostic

; Main is the final declaration in this increment. `fails` is accepted but
; its full call/failure surface remains Stage 8.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7ParseMainAfterName:
            CALL Stage7RejectCurrentDeclarationName
            RET  C
            CALL ParserExpectLeft
            RET  C
            CALL ParserExpectRight
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenFails
            JR   NZ,Stage7MainLine
            CALL ParserTake
            RET  C
Stage7MainLine:
            CALL ParserExpectLine
            RET  C
            LD   A,SemanticBeginMain
            CALL SemanticSinkOperation
            RET  C
            LD   A,(SymbolCount)
            LD   (Stage7GlobalSymbolCount),A
            XOR  A
            LD   (NextLocalSlot),A
            LD   (Stage7CurrentResultType),A
            LD   (ControlRoutineKind),A
            CALL ControlReset
            LD   A,1
            LD   (ControlSequenceFallsThrough),A
Stage7MainLocals:
            CALL TypedParseLocalRun
            RET  C
Stage7MainStatements:
            CALL TypedParseStatements
            RET  C
            LD   E,TokenEnd
            CALL ParserExpect
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   A,SemanticEndMain
            CALL SemanticSinkOperation
            RET  C
            LD   E,TokenEof
            JP   ParserExpect
.endif

; Return aggregate symbol info in D, byte payload in BC, and exact type ID in
; A. The ordinary symbol-table address determines the parallel type entry.
.routine out A,BC,D,carry,zero clobbers sign,parity,halfCarry,E,HL
Stage7LookupAggregateCurrent:
            CALL SymbolFindCurrent
            JP   NC,SymbolLookupMissing
            PUSH HL
            INC  HL
            INC  HL
            INC  HL
            LD   D,(HL)
            LD   A,D
            LD   (Stage7ArgumentCount),A
            INC  HL
            LD   C,(HL)
            INC  HL
            LD   B,(HL)
            POP  HL
            LD   DE,SymbolTableBase
            OR   A
            SBC  HL,DE
            LD   A,L
            LD   E,0
Stage7SymbolIndexLoop:
            CP   SymbolEntrySize
            JR   C,Stage7SymbolIndexReady
            SUB  SymbolEntrySize
            INC  E
            JR   Stage7SymbolIndexLoop
Stage7SymbolIndexReady:
            LD   A,E
            LD   E,A
            LD   H,0
            LD   L,E
            LD   DE,AggregateSymbolTypeBase
            ADD  HL,DE
            LD   A,(HL)
            LD   E,A
            LD   A,(Stage7ArgumentCount)
            LD   D,A
            LD   A,E
            OR   A
            RET

.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7EmitOperationByte:
            PUSH BC
            CALL SemanticSinkOperation
            POP  BC
            RET  C
            LD   A,C
            JP   SemanticSinkPut

; Stage 7 structural operands are emitted whenever their owning operation is
; emitted. They are not expression values and therefore do not consult the
; constant-folding emission flag used by TypedEmitWord.
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
Stage7EmitWord:
            PUSH HL
            LD   A,L
            CALL SemanticSinkPut
            POP  HL
            RET  C
            LD   A,H
            JP   SemanticSinkPut

; D is the symbol class and BC its byte offset. Emit its opaque root carrier
; and return the exact aggregate type in A.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7EmitAggregateSymbolRoot:
            CALL Stage7LookupAggregateCurrent
            RET  C
            LD   (Stage7PathType),A
            LD   A,D
            AND  SymbolClassMask
            JR   Z,Stage7EmitAggregateRootReadOnly
            CP   SymbolClassProgram
            JR   NZ,Stage7EmitAggregateRootParameter
            LD   A,SemanticLoadProgramAlias
Stage7EmitAggregateRootAddress:
            PUSH BC
            CALL SemanticSinkOperation
            POP  HL
            RET  C
            CALL Stage7EmitWord
            JR   Stage7EmitAggregateRootReady
Stage7EmitAggregateRootReadOnly:
            LD   A,SemanticLoadReadOnlyAlias
            JR   Stage7EmitAggregateRootAddress
Stage7EmitAggregateRootParameter:
            CP   SymbolClassParameter
            JP   NZ,TypedTypeFailure
            LD   A,SemanticLoadParameterAlias
Stage7EmitAggregateRootSelected:
            CALL Stage7EmitOperationByte
Stage7EmitAggregateRootReady:
            RET  C
            LD   A,(Stage7PathType)
            OR   A
            RET

; Emit one checked postfix chain. A is the current aggregate type and one
; carrier is live on the generated evaluation stack. D returns zero for an
; address path or one when `.length` has already produced a scalar value.
.routine in A out A,D,carry,zero clobbers sign,parity,halfCarry,B,C,E,HL,IX,IY
Stage7ParsePathSuffix:
            LD   D,0
Stage7PathSuffixLoop:
            PUSH AF
            CALL ParserPeek
            JP   C,Stage7PathSuffixFailure
            CP   TokenDot
            JR   Z,Stage7PathFieldComposition
            CP   TokenLeftBracket
            JP   Z,Stage7PathIndexComposition
            POP  AF
            LD   D,0
            OR   A
            RET
Stage7PathFieldComposition:
            POP  AF
            LD   (Stage7PathType),A
            CALL Stage8RequireNoPendingFailure
            RET  C
            LD   A,(Stage7PathType)
            PUSH AF
Stage7PathField:
            CALL ParserTake
            JP   C,Stage7PathSuffixFailure
            LD   E,TokenName
            CALL ParserExpect
            JP   C,Stage7PathSuffixFailure
            POP  AF
            PUSH AF
            CP   AggregateFirstDynamicTypeId
            JP   C,Stage7PathFieldTypeFailure
            CALL AggregateTypeAddress
            LD   A,(HL)
            CP   AggregateTypeKindString
            JR   NZ,Stage7PathRecordField
            LD   HL,NameLength
            LD   B,6
            CALL TokenNameEquals
            JP   NC,Stage7PathFieldTypeFailure
            LD   A,(Stage7PathType)
            CALL AggregateTypeAddress
            INC  HL
            LD   C,(HL)                  ; capacity for L <= N validation
            LD   A,SemanticStringLength
            CALL Stage7EmitOperationByte
            JP   C,Stage7PathSuffixFailure
            LD   HL,(TokenStartOffset)
            CALL Stage7EmitWord
            JP   C,Stage7PathSuffixFailure
            POP  AF
            LD   A,ScalarTypeU8
            LD   D,1
            OR   A
            RET
Stage7FieldMissing:
            LD   A,DiagnosticUnknownName
            JP   CompilerSetDiagnostic
Stage7PathRecordField:
            POP  AF
            CALL AggregateTypeAddress
            LD   A,(HL)
            CP   AggregateTypeKindRecord
            JP   NZ,TypedTypeFailure
            INC  HL
            LD   A,(HL)
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,AggregateRecordTableBase
            ADD  HL,DE
            LD   B,(HL)
            INC  HL
            LD   D,(HL)
Stage7PathRecordFieldLoop:
            LD   A,D
            OR   A
            JR   Z,Stage7FieldMissing
            LD   A,B
            CALL AggregateFieldAddress
            PUSH DE
            CALL TokenNameRecordEquals
            POP  DE
            JR   C,Stage7PathRecordFieldFound
            INC  B
            DEC  D
            JR   Stage7PathRecordFieldLoop
Stage7PathRecordFieldFound:
            LD   A,B
            CALL AggregateFieldAddress
            LD   DE,AggregateFieldTypeId
            ADD  HL,DE
            LD   A,(HL)
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            OR   A
            PUSH AF
            LD   (Stage7PathOffset),DE
            LD   A,SemanticSelectField
            CALL SemanticSinkOperation
            JP   C,Stage7PathSuffixFailure
            LD   HL,(Stage7PathOffset)
            CALL Stage7EmitWord
            JP   C,Stage7PathSuffixFailure
            POP  AF
            JP   Stage7PathSuffixLoop
Stage7PathIndexComposition:
            POP  AF
            LD   (Stage7PathType),A
            CALL Stage8RequireNoPendingFailure
            RET  C
            LD   A,(Stage7PathType)
            PUSH AF
Stage7PathIndex:
            LD   HL,(TokenStartOffset)
            PUSH HL
            CALL ParserTake
            JP   C,Stage7PathIndexFailure
            LD   A,(ExpressionExpectedType)
            PUSH AF
            LD   A,(ExpressionEmitEnabled)
            PUSH AF
            LD   A,1
            LD   (ExpressionEmitEnabled),A
            LD   A,ScalarTypeU16
            LD   (ExpressionExpectedType),A
            CALL TypedParseOr
            JP   C,Stage7PathIndexExpressionFailure
            CALL TypedRequireComposable
            JP   C,Stage7PathIndexExpressionFailure
            LD   (ExpressionRightMeta),A
            LD   (ExpressionRightValue),HL
            POP  AF
            LD   (ExpressionEmitEnabled),A
            POP  AF
            LD   (ExpressionExpectedType),A
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   Z,Stage7PathIndexTypeFailure
            LD   E,TokenRightBracket
            CALL ParserExpect
            JP   C,Stage7PathIndexFailure
            POP  HL
            LD   (Stage7CallOffset),HL
            POP  AF
            CP   AggregateFirstDynamicTypeId
            JP   C,TypedTypeFailure
            PUSH AF
            CALL AggregateTypeAddress
            LD   A,(HL)
            CP   AggregateTypeKindString
            JR   Z,Stage7PathStringIndex
            CP   AggregateTypeKindArray
            JP   NZ,Stage7PathFieldTypeFailure
            INC  HL
            LD   A,(HL)                  ; element type
            LD   (Stage7PathType),A
            INC  HL
            LD   C,(HL)                  ; fixed length
            INC  HL
            LD   B,(HL)
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaConstant
            JR   Z,Stage7PathIndexDynamic
            LD   HL,(ExpressionRightValue)
            OR   A
            SBC  HL,BC
            JR   NC,Stage7PathIndexRangeFailure
Stage7PathIndexDynamic:
            LD   (Stage7PathOffset),BC
            LD   A,(Stage7PathType)
            CALL AggregateGetExtent
            LD   (Stage7PathExtent),HL
            LD   A,SemanticSelectIndex
            CALL SemanticSinkOperation
            JR   C,Stage7PathSuffixFailure
            LD   HL,(Stage7PathOffset)
            CALL Stage7EmitWord
            JR   C,Stage7PathSuffixFailure
            LD   HL,(Stage7PathExtent)
            CALL Stage7EmitWord
            JR   C,Stage7PathSuffixFailure
            LD   HL,(Stage7CallOffset)
            CALL Stage7EmitWord
            JR   C,Stage7PathSuffixFailure
            POP  AF
            CALL AggregateTypeAddress
            INC  HL
            LD   A,(HL)
            JP   Stage7PathSuffixLoop
Stage7PathStringIndex:
            INC  HL
            LD   C,(HL)                  ; capacity
            LD   A,SemanticStringIndex
            CALL Stage7EmitOperationByte
            JR   C,Stage7PathSuffixFailure
            LD   HL,(Stage7CallOffset)
            CALL Stage7EmitWord
            JR   C,Stage7PathSuffixFailure
            POP  AF
            LD   A,ScalarTypeU8
            JP   Stage7PathSuffixLoop
Stage7PathSuffixFailure:
            POP  AF
            SCF
            RET
Stage7PathIndexTypeFailure:
            POP  HL
            POP  AF
            JP   TypedTypeFailure
Stage7PathIndexFailure:
            POP  HL
            JR   Stage7PathSuffixFailure
Stage7PathIndexExpressionFailure:
            POP  AF
            LD   (ExpressionEmitEnabled),A
            POP  AF
            LD   (ExpressionExpectedType),A
            JR   Stage7PathIndexFailure
Stage7PathIndexRangeFailure:
            LD   A,(ExpressionSuppressFault)
            OR   A
            JR   NZ,Stage7PathIndexDynamic
            LD   HL,(Stage7CallOffset)
            LD   (TokenStartOffset),HL
            POP  AF
            JP   TypedRangeFailure
Stage7PathFieldTypeFailure:
            POP  AF
            JP   TypedTypeFailure

; Address one bounded nested-call frame. Eight bytes retain the source-call
; metadata that nested argument calls may overwrite. The scalar parser keeps
; only its balanced expression context, a source frame keeps its result flag,
; and a service keeps only its source offset temporarily on the compiler
; hardware stack.
.routine in A out A,HL,carry,zero clobbers sign,parity,halfCarry,D,DE
Stage7CallFrameAddress:
            LD   L,A
            LD   H,0
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,HL
            LD   DE,Stage7CallFrameBase
            ADD  HL,DE
            OR   A
            RET

.routine out A,HL,carry,zero clobbers sign,parity,halfCarry,D,DE
Stage7CurrentCallFrame:
            LD   A,(Stage7CallDepth)
            DEC  A
            JR   Stage7CallFrameAddress

; Parse and validate one scalar argument against the expected type in A while
; preserving the enclosing expression context across nested calls.
.routine in A out A,HL,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,IX,IY
Stage7ParseScalarArgument:
            LD   D,A
            LD   A,(ExpressionExpectedType)
            LD   B,A
            LD   A,(ExpressionEmitEnabled)
            LD   C,A
            PUSH BC
            PUSH DE
            LD   A,D
            LD   (ExpressionExpectedType),A
            LD   A,1
            LD   (ExpressionEmitEnabled),A
            CALL TypedParseOr
            JR   C,Stage7ScalarArgumentFailure
            LD   (Stage7PathType),A
            LD   (ExpressionRightValue),HL
            POP  DE
            POP  BC
            LD   A,C
            LD   (ExpressionEmitEnabled),A
            LD   A,B
            LD   (ExpressionExpectedType),A
            LD   E,D
            LD   A,(Stage7PathType)
            LD   HL,(ExpressionRightValue)
            CALL TypedCheckAssignable
            RET  C
            JP   Stage8RequireNoPendingFailure
Stage7ScalarArgumentFailure:
            LD   L,A
            POP  DE
            POP  BC
            LD   A,C
            LD   (ExpressionEmitEnabled),A
            LD   A,B
            LD   (ExpressionExpectedType),A
            LD   A,L
            SCF
            RET

; Parse one call to a retained routine. A is the routine-table index and C is
; zero when the result is discarded or one when its carrier remains live.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7ParseCall:
            LD   B,A
            LD   A,(Stage7CallDepth)
            CP   Stage7CallFrameCapacity
            JR   C,Stage7PushCallFrameSpace
            LD   A,DiagnosticExpressionCapacity
            JP   CompilerSetDiagnostic
Stage7PushCallFrameSpace:
            CALL Stage7CallFrameAddress
            LD   A,C
            PUSH AF
            PUSH HL
            LD   A,B
            CP   Stage7MainRoutine
            JR   Z,Stage7PushMainCallFrame
            CALL Stage7RoutineAddress
            INC  HL
            INC  HL
            INC  HL
            LD   D,(HL)                  ; parameter start
            INC  HL
            LD   E,(HL)                  ; parameter count
            INC  HL
            LD   B,(HL)                  ; result
            INC  HL
            LD   A,(HL)                  ; label
            INC  HL
            LD   C,(HL)                  ; failure flags
            JR   Stage7PushCallFrameReady
Stage7PushMainCallFrame:
            LD   D,0                     ; parameter start
            LD   E,0                     ; parameter count
            LD   B,0                     ; result-free
            LD   A,(Stage8ForwardMainFlags)
            LD   C,A
            LD   A,Stage7MainLabel
Stage7PushCallFrameReady:
            POP  HL
            LD   (HL),A
            POP  AF
            OR   A
            JR   Z,Stage7PushCallFrameLabelReady
            SET  6,(HL)
Stage7PushCallFrameLabelReady:
            INC  HL
            LD   (HL),B
            INC  HL
            LD   (HL),D
            INC  HL
            LD   (HL),E
            INC  HL
            LD   (HL),E                  ; original argument count
            INC  HL
            LD   DE,(TokenStartOffset)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   (HL),C
            LD   HL,Stage7CallDepth
            INC  (HL)
            CALL ParserExpectLeft
            JP   C,Stage7CallFailure
Stage7CallArgumentLoop:
            CALL Stage7CurrentCallFrame
            INC  HL
            INC  HL
            INC  HL
            LD   A,(HL)
            OR   A
            JR   Z,Stage7CallArgumentsDone
            DEC  HL
            LD   A,(HL)                  ; current parameter table index
            CALL Stage7ParameterAddress
            INC  HL
            INC  HL
            INC  HL
            LD   A,(HL)
            LD   D,A
            XOR  A
            LD   (Stage8DirectFailable),A
            LD   A,D
            CP   AggregateFirstDynamicTypeId
            JR   NC,Stage7CallAggregateArgument
            CALL Stage7ParseScalarArgument
            JP   C,Stage7CallFailure
            JR   Stage7CallArgumentReady
Stage7CallAggregateArgument:
            CALL Stage7ParseAggregateValue
            JP   C,Stage7CallFailure
            PUSH AF
            CALL Stage7CurrentCallFrame
            INC  HL
            INC  HL
            LD   A,(HL)
            CALL Stage7ParameterAddress
            INC  HL
            INC  HL
            INC  HL
            LD   D,(HL)
            POP  AF
            CP   D
            JP   NZ,Stage7CallTypeFailure
            CALL Stage8RequireNoPendingFailure
            JP   C,Stage7CallFailure
Stage7CallArgumentReady:
            CALL Stage7CurrentCallFrame
            INC  HL
            INC  HL
            INC  (HL)
            INC  HL
            DEC  (HL)
            JR   Z,Stage7CallArgumentsDone
            LD   E,TokenComma
            CALL ParserExpect
            JR   C,Stage7CallFailure
            JR   Stage7CallArgumentLoop
Stage7CallArgumentsDone:
            CALL ParserExpectRight
            JR   C,Stage7CallFailure
            CALL Stage7CurrentCallFrame
            LD   A,(HL)
            LD   (Stage7CallLabel),A
            INC  HL
            LD   A,(HL)
            LD   (Stage7CallResultType),A
            INC  HL
            INC  HL
            INC  HL
            LD   A,(HL)
            LD   (Stage7ArgumentCount),A
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            LD   (Stage7CallOffset),DE
            INC  HL
            LD   A,(HL)
            LD   (Stage8CallFlags),A
            LD   HL,Stage7CallDepth
            DEC  (HL)
            LD   A,(Stage8CallFlags)
            AND  Stage7RoutineFails
            JR   Z,Stage7CallFailureClassReady
            LD   A,(Stage7CallDepth)
            OR   A
            JP   NZ,HybridLL1FailureContext
Stage7CallFailureClassReady:
; Publish one completed call description. Stage7CallLabel contains the packed
; target, kind, and keep-result choice. Target-specific signature fields are
; present only for source routines.
Stage7PublishCallable:
            LD   A,SemanticCallGeneral
            CALL SemanticSinkOperation
            RET  C
            LD   A,(Stage7CallLabel)
            CALL SemanticSinkPut
            RET  C
            AND  Stage8CallableServiceFlag
            JR   NZ,Stage7PublishCallableCommon
            LD   A,(Stage7ArgumentCount)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage7CallResultType)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage8CallFlags)
            CALL SemanticSinkPut
            RET  C
Stage7PublishCallableCommon:
            LD   HL,(Stage7CallOffset)
            CALL Stage7EmitWord
            RET  C
            CALL Stage8EmitFailurePlaceholders
            RET  C
            LD   A,(Stage8CallFlags)
            AND  Stage7RoutineFails
            LD   (Stage8DirectFailable),A
            LD   A,(Stage7CallResultType)
            OR   A
            RET
Stage7CallTypeFailure:
            LD   HL,Stage7CallDepth
            DEC  (HL)
            JP   TypedTypeFailure
Stage7CallFailure:
            LD   HL,Stage7CallDepth
            DEC  (HL)
            SCF
            RET

; Parse a name-rooted aggregate path or aggregate-returning call. The result
; must still be an address path; scalar selection is rejected by this entry.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage7ParseAggregateValue:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL Stage7FindRoutineCurrent
            JR   NZ,Stage7AggregateValueSymbol
            LD   C,1
            CALL Stage7ParseCall
            RET  C
            CP   AggregateFirstDynamicTypeId
            JP   C,TypedTypeFailure
            JR   Stage7AggregateValueSuffix
Stage7AggregateValueSymbol:
            CALL Stage7LookupAggregateCurrent
            RET  C
            LD   A,D
            AND  SymbolAggregateFlag
            JP   Z,TypedTypeFailure
            CALL Stage7EmitAggregateSymbolRoot
            RET  C
Stage7AggregateValueSuffix:
            CALL Stage7ParsePathSuffix
            RET  C
            LD   E,A
            LD   A,D
            OR   A
            JP   NZ,TypedTypeFailure
            LD   A,E
            CP   AggregateFirstDynamicTypeId
            JP   C,TypedTypeFailure
            OR   A
            RET

; Convert a scalar address path to an ordinary typed expression carrier.
.routine in A,D out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
Stage7FinishScalarPath:
            CP   AggregateFirstDynamicTypeId
            JP   NC,TypedTypeFailure
            LD   (Stage7PathType),A
            LD   A,D
            LD   (Stage7ArgumentCount),A
            OR   A
            JR   NZ,Stage7ScalarPathReady
            LD   A,(Stage7PathType)
            CP   ScalarTypeU16
            LD   A,SemanticLoadIndirect8
            JR   NZ,Stage7ScalarPathEmit
            LD   A,SemanticLoadIndirect16
Stage7ScalarPathEmit:
            CALL SemanticSinkOperation
            JR   C,Stage7ScalarPathFailure
Stage7ScalarPathReady:
            LD   A,(Stage7PathType)
            OR   A
            RET
Stage7ScalarPathFailure:
            SCF
            RET

; Hooks entered by the scalar primary parser after it has consumed the NAME.
Stage7TypedPrimaryRoutine:
            LD   C,1
            CALL Stage7ParseCall
            RET  C
            OR   A
            JP   Z,TypedTypeFailure
            CP   AggregateFirstDynamicTypeId
            JR   NC,Stage7TypedPrimaryRoutineAggregate
            OR   A
            RET
Stage7TypedPrimaryRoutineAggregate:
            CALL Stage7ParsePathSuffix
            RET  C
            JR   Stage7FinishScalarPath

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8TypedPrimaryService:
            LD   HL,(TokenStartOffset)
            LD   (Stage7CallOffset),HL
            LD   C,1
            JR   Stage8ParseServiceCall

.routine in A out A,B,HL,carry,zero clobbers sign,parity,halfCarry,C,D,DE,IX,IY
Stage8TypedPrimaryConstant:
            SUB  Stage8PredefinedConstantBase-1
            LD   L,A
            LD   H,0
            LD   B,ScalarMetaConstant+ScalarTypeU8
            JP   TypedPrimaryEmitTypedConstant

; A is the dense service ID and C says whether a successful u8 result is kept.
.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
Stage8ParseServiceCall:
            LD   E,A
            LD   D,0
            LD   HL,Stage8ServiceSignatureTable
            ADD  HL,DE
            LD   A,(HL)
            DEC  C
            JR   NZ,Stage8ServiceDescriptorReady
            OR   Stage8CallableKeepFlag
Stage8ServiceDescriptorReady:
            LD   (Stage8ServiceId),A
            CALL ParserExpectLeft
            RET  C
            LD   A,(Stage8ServiceId)
            RRCA
            RRCA
            RRCA
            AND  $03
            JR   Z,Stage8ServiceExpectRight
            LD   D,A
Stage8ServiceArgument:
            LD   HL,(Stage7CallOffset)
            PUSH HL
            LD   A,D
            CALL Stage7ParseScalarArgument
            POP  HL
            LD   (Stage7CallOffset),HL
            RET  C
Stage8ServiceExpectRight:
            CALL ParserExpectRight
            RET  C
            LD   A,(Stage8ServiceId)
            LD   (Stage7CallLabel),A
            AND  Stage8ServiceResultU8
            RLCA
            RLCA
            RLCA
Stage8ServiceResultTypeReady:
            LD   (Stage7CallResultType),A
            LD   A,Stage7RoutineFails
            LD   (Stage8CallFlags),A
            JP   Stage7PublishCallable

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
Stage8EmitFailurePlaceholders:
            LD   HL,(SinkCursor)
            LD   (Stage8CallModePointer),HL
            LD   C,3
            XOR  A
Stage8FailurePlaceholderLoop:
            CALL SemanticSinkPut
            RET  C
            DEC  C
            JR   NZ,Stage8FailurePlaceholderLoop
            RET

Stage7TypedPrimaryAggregateSymbol:
            CALL Stage7EmitAggregateSymbolRoot
            RET  C
            JR   Stage7TypedPrimaryRoutineAggregate

; Current routine name has already been consumed as a complete statement.
.if HybridLL1Full
.else
Stage7ParseCallStatement:
            LD   C,0
            CALL Stage7ParseCall
            RET  C
            CALL ParserExpectLine
            RET  C
            JP   TypedParseStatementsContinue

; Return one exact aggregate alias and mark the structured path non-fallthrough.
Stage7ParseAggregateReturn:
            LD   A,(Stage7CurrentResultType)
            PUSH AF
            CALL Stage7ParseAggregateValue
            JR   C,Stage7AggregateReturnFailure
            LD   D,A
            POP  AF
            CP   D
            JP   NZ,TypedTypeFailure
            CALL ParserExpectLine
            RET  C
            LD   A,SemanticReturnAggregate
            CALL SemanticSinkOperation
            RET  C
            XOR  A
            LD   (ControlSequenceFallsThrough),A
            JP   TypedParseStatementsContinue
Stage7AggregateReturnFailure:
            POP  AF
            SCF
            RET
.endif

; D contains the aggregate symbol info and DeclarationPayload its root offset.
Stage7ParseAggregateAssignment:
            LD   A,D
            AND  SymbolClassMask
            JR   NZ,Stage7AggregateAssignmentWritable
            LD   A,DiagnosticReadOnlyAssignment
            JP   CompilerSetDiagnostic
Stage7AggregateAssignmentWritable:
            CALL Stage7EmitAggregateSymbolRoot
            RET  C
            CALL Stage7ParsePathSuffix
            RET  C
            LD   E,A
            LD   A,D
            OR   A
            JP   NZ,TypedTypeFailure
            LD   A,E
            LD   (Stage7PathType),A
            CALL ParserExpectEqual
            RET  C
            LD   HL,(TokenStartOffset)
            LD   (Stage7CallOffset),HL
            LD   A,(Stage7PathType)
            CP   AggregateFirstDynamicTypeId
            JR   NC,Stage7AggregateCopyAssignment
            LD   E,A
            CALL TypedExpressionBeginRuntime
            RET  C
            LD   D,A
            LD   A,(Stage7PathType)
            LD   E,A
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            LD   A,1
            LD   (Stage8RetainedCarriers),A
            CALL Stage8SelectFailureConsumer
            RET  C
            LD   A,(Stage7PathType)
            CP   ScalarTypeU16
            LD   A,SemanticStoreIndirect8
            JR   NZ,Stage7ScalarAssignmentEmit
            LD   A,SemanticStoreIndirect16
Stage7ScalarAssignmentEmit:
            CALL SemanticSinkOperation
            RET  C
.if Stage7LL1
            RET
.else
            JP   ParserExpectLine
.endif
Stage7AggregateCopyAssignment:
            PUSH AF
            CALL Stage7ParseAggregateValue
            JR   C,Stage7AggregateCopyFailure
            LD   D,A
            POP  AF
            CP   D
            JP   NZ,TypedTypeFailure
            CALL AggregateGetExtent
            LD   (Stage7PathExtent),HL
            LD   A,1
            LD   (Stage8RetainedCarriers),A
            CALL Stage8SelectFailureConsumer
            RET  C
            LD   A,SemanticCopyAggregate
            CALL SemanticSinkOperation
            RET  C
            LD   HL,(Stage7PathExtent)
            CALL Stage7EmitWord
            RET  C
            LD   HL,(Stage7CallOffset)
            CALL Stage7EmitWord
            RET  C
.if Stage7LL1
            RET
.else
            JP   ParserExpectLine
.endif
Stage7AggregateCopyFailure:
            POP  AF
            SCF
            RET

.if Stage7LL1
            .include "stage7-ll1-parser.asm"
            .include "stage7-ll1-actions.asm"
.endif
