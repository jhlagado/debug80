; Explicit semantic actions for the complete Stage 7 packed LL(1) grammar.
; These routines never select grammar productions. They consume only retained
; expression/type-directed external islands declared by the generated grammar.

HybridLL1ForMode       .equ HybridLL1StackBase+HybridLL1StackCapacity
HybridLL1ForStep       .equ HybridLL1ForMode+1
HybridLL1ForOffset     .equ HybridLL1ForStep+2
HybridLL1FlowStackBase .equ HybridLL1ForOffset+2
HybridLL1ActionStateEnd .equ HybridLL1FlowStackBase+ControlFrameCapacity

; --------------------------------------------------------- retained parsers

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1ConstantExpression:
            LD   A,(ExpressionExpectedType)
            CALL TypedExpressionBeginConstant
            JR   HybridLL1SaveExpressionResult

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1RuntimeExpression:
            LD   A,(ExpressionExpectedType)
            CALL TypedExpressionBeginRuntime
HybridLL1SaveExpressionResult:
            RET  C
            LD   (ExpressionRightMeta),A
            LD   (ExpressionRightValue),HL
            OR   A
            RET

.routine out A,B,DE,carry,zero clobbers sign,parity,halfCarry,C,HL
HybridLL1StepConstant:
            CALL StructuredParseStep
            RET  C
            LD   A,(HybridLL1ForMode)
            OR   B
            LD   (HybridLL1ForMode),A
            LD   (HybridLL1ForStep),DE
            OR   A
            RET

; The declared type has already selected the initializer shape. This external
; island retains the recursive, type-directed aggregate initializer machinery.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1StaticInitializer:
            LD   A,(DeclarationInfo)
            LD   B,A
            PUSH BC
            CALL AggregateParseInitializer
            POP  BC
            RET  C
            LD   A,B
            LD   (DeclarationInfo),A
            OR   A
            RET

HybridLL1StrayClause:
            LD   A,DiagnosticExpectedEnd
            JP   CompilerSetDiagnostic

; --------------------------------------------------------------- type actions

HybridLL1TypeU8:
            LD   A,AggregateTypeIdU8
            JR   HybridLL1SetCurrentType
HybridLL1TypeU16:
            LD   A,AggregateTypeIdU16
            JR   HybridLL1SetCurrentType
HybridLL1TypeBoolean:
            LD   A,AggregateTypeIdBoolean
HybridLL1SetCurrentType:
            LD   (AggregateCurrentTypeId),A
            OR   A
            RET

.routine out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL,IX,IY
HybridLL1ResolveRecordType:
            CALL SymbolLookupCurrent
            RET  C
            LD   D,A
            AND  SymbolRecordTypeFlag+SymbolAggregateFlag
            CP   SymbolRecordTypeFlag
            JP   NZ,AggregateTypeShapeFailure
            LD   A,C
            JR   HybridLL1SetCurrentType

HybridLL1BeginTypeBound:
            LD   A,ScalarTypeU16
            LD   (ExpressionExpectedType),A
            OR   A
            RET

; Return the checked, positive, byte-sized constant bound in HL.
.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C,IX,IY
HybridLL1CheckedBound:
            LD   A,(ExpressionRightMeta)
            LD   D,A
            AND  ScalarMetaConstant
            JP   Z,AggregateTypeShapeFailure
            LD   E,ScalarTypeU16
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            LD   HL,(ExpressionRightValue)
            LD   A,H
            OR   L
            OR   A
            JP   Z,AggregateTypeShapeFailure
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1MakeStringType:
            CALL HybridLL1CheckedBound
            RET  C
            LD   A,H
            OR   A
            JP   NZ,AggregateTypeShapeFailure
            LD   A,L
            LD   (AggregateCandidateLength),A
            LD   (AggregateCandidateAux),A
            LD   A,AggregateTypeKindString
            LD   (AggregateCandidateKind),A
            INC  HL
            LD   A,H
            OR   A
            JP   NZ,AggregateProgramDataCapacityFailure
            LD   A,L
            LD   (AggregateCandidateExtent),A
HybridLL1InternCurrentType:
            CALL AggregateInternType
            RET  C
            JR   HybridLL1SetCurrentType

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1MakeArrayType:
            LD   A,(AggregateCurrentTypeId)
            CP   AggregateFirstDynamicTypeId
            JR   C,HybridLL1ArrayElementReady
            PUSH AF
            CALL AggregateTypeAddress
            LD   A,(HL)
            CP   AggregateTypeKindArray
            JP   Z,AggregateNestedArrayFailure
            POP  AF
HybridLL1ArrayElementReady:
            LD   (AggregateCandidateAux),A
            CALL HybridLL1CheckedBound
            RET  C
            LD   A,H
            OR   A
            JP   NZ,AggregateProgramDataCapacityFailure
            LD   A,L
            LD   (AggregateCandidateLength),A
            LD   B,A
            LD   A,(AggregateCandidateAux)
            CALL AggregateGetExtent
            LD   D,H
            LD   E,L
            LD   HL,0
HybridLL1ArrayExtentLoop:
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            LD   A,H
            OR   A
            JP   NZ,AggregateProgramDataCapacityFailure
            DJNZ HybridLL1ArrayExtentLoop
            LD   A,L
            LD   (AggregateCandidateExtent),A
            LD   A,AggregateTypeKindArray
            LD   (AggregateCandidateKind),A
            JR   HybridLL1InternCurrentType

; --------------------------------------------------------- scalar constants

HybridLL1RetainDeclarationName .equ TypedRetainDeclarationName

HybridLL1SaveDeclarationType:
            LD   A,(AggregateCurrentTypeId)
            LD   (DeclarationInfo),A
HybridLL1SaveExpectedType:
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C,IX,IY
HybridLL1FinishConstantExpression:
            LD   HL,(ExpressionRightValue)
            LD   A,(ExpressionRightMeta)
            LD   D,A
            LD   A,(DeclarationInfo)
            LD   E,A
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            AND  ScalarMetaConstant
            JP   Z,TypedTypeFailure
            LD   HL,(ExpressionRightValue)
            LD   (DeclarationPayload),HL
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
HybridLL1CommitConstant:
            LD   A,(DeclarationInfo)
            OR   SymbolClassConstant
            LD   D,A
            LD   BC,(DeclarationPayload)
            CALL TypedPrepareCurrentWord
            RET  C
            JP   SymbolCommit

; ------------------------------------------------------ program declarations

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1SaveProgramType:
            LD   A,(AggregateCurrentTypeId)
            LD   (DeclarationInfo),A
            CALL AggregateGetExtent
            LD   A,L
            LD   (AggregateCurrentObjectExtent),A
            LD   A,(StaticImageLength)
            LD   (AggregateCurrentObjectOffset),A
            LD   E,A
            LD   D,0
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            LD   A,H
            OR   A
            JP   NZ,AggregateProgramDataCapacityFailure
            LD   A,L
            LD   (AggregateCurrentObjectEnd),A
            CALL AggregateZeroCurrentObject
            RET  C
            XOR  A
            LD   (AggregateInitializerDepth),A
            LD   (AggregateInitializerElements),A
            RET

HybridLL1FinishProgramInitializer:
            LD   A,(AggregateCurrentObjectOffset)
            LD   HL,AggregateCurrentObjectEnd
            CP   (HL)
            JP   NZ,AggregateInitializerCountFailure
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1CommitProgramVariable:
            LD   A,(StaticImageLength)
            LD   C,A
            LD   B,0
            LD   A,(DeclarationInfo)
            CP   AggregateFirstDynamicTypeId
            JR   C,HybridLL1ProgramScalarInfo
            LD   D,SymbolInfoAggregateProgram
            JR   HybridLL1ProgramPrepareSymbol
HybridLL1ProgramScalarInfo:
            OR   SymbolClassProgram
            LD   D,A
HybridLL1ProgramPrepareSymbol:
            PUSH BC
            CALL TypedPrepareCurrentWord
            POP  BC
            RET  C
            LD   A,(SymbolCount)
            LD   E,A
            LD   D,0
            LD   HL,AggregateSymbolTypeBase
            ADD  HL,DE
            LD   A,(DeclarationInfo)
            LD   (HL),A
            CALL SymbolCommit
            RET  C
            LD   A,(AggregateCurrentObjectEnd)
            LD   (StaticImageLength),A
            LD   (NextProgramSlot),A
            OR   A
            RET

; ---------------------------------------------------------- record metadata

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1BeginRecord:
            CALL TypedRetainDeclarationName
            RET  C
            LD   A,(AggregateTypeCount)
            CP   AggregateTypeCapacity
            JP   NC,AggregateTypeCapacityFailure
            LD   A,(AggregateRecordCount)
            CP   AggregateRecordCapacity
            JP   NC,AggregateTypeCapacityFailure
            LD   A,(AggregateFieldCount)
            LD   (AggregateCurrentFieldStart),A
            XOR  A
            LD   (AggregateCurrentFieldCount),A
            LD   (AggregateCurrentRecordExtent),A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1BeginRecordField:
            CALL AggregateCheckFieldDuplicate
            RET  C
            LD   A,(AggregateFieldCount)
            LD   B,A
            LD   A,(AggregateCurrentFieldCount)
            ADD  A,B
            CP   AggregateFieldCapacity
            JP   NC,AggregateTypeCapacityFailure
            PUSH AF
            CALL AggregateFieldAddress
            LD   DE,(TokenLexemePointer)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   A,(TokenLength)
            LD   (HL),A
            POP  AF
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1CommitRecordField:
            LD   A,(AggregateFieldCount)
            LD   B,A
            LD   A,(AggregateCurrentFieldCount)
            ADD  A,B
            CALL AggregateFieldAddress
            INC  HL
            INC  HL
            INC  HL
            LD   A,(AggregateCurrentTypeId)
            LD   (HL),A
            INC  HL
            LD   A,(AggregateCurrentRecordExtent)
            LD   (HL),A
            LD   E,A
            LD   D,0
            LD   A,(AggregateCurrentTypeId)
            PUSH DE
            CALL AggregateGetExtent
            POP  DE
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            LD   A,H
            OR   A
            JP   NZ,AggregateProgramDataCapacityFailure
            LD   A,L
            LD   (AggregateCurrentRecordExtent),A
            LD   HL,AggregateCurrentFieldCount
            INC  (HL)
            XOR  A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
HybridLL1CommitRecord:
            LD   A,(AggregateCurrentFieldCount)
            OR   A
            JP   Z,AggregateRecordEmptyFailure
            LD   A,AggregateTypeKindRecord
            LD   (AggregateCandidateKind),A
            LD   A,(AggregateRecordCount)
            LD   (AggregateCandidateAux),A
            XOR  A
            LD   (AggregateCandidateLength),A
            LD   A,(AggregateCurrentRecordExtent)
            LD   (AggregateCandidateExtent),A
            CALL AggregateAppendType
            RET  C
            LD   (AggregateCurrentTypeId),A
            LD   A,(AggregateRecordCount)
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,AggregateRecordTableBase
            ADD  HL,DE
            LD   A,(AggregateCurrentFieldStart)
            LD   (HL),A
            INC  HL
            LD   A,(AggregateCurrentFieldCount)
            LD   (HL),A
            LD   D,SymbolInfoRecordType
            LD   A,(AggregateCurrentTypeId)
            LD   C,A
            LD   B,0
            CALL TypedPrepareCurrentWord
            RET  C
            CALL SymbolCommit
            RET  C
            LD   A,(AggregateCurrentFieldCount)
            LD   HL,AggregateFieldCount
            ADD  A,(HL)
            LD   (HL),A
            LD   HL,AggregateRecordCount
            INC  (HL)
            XOR  A
            RET

; ----------------------------------------------------- Stage 7 routines/main

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
HybridLL1RequireBeforeMain:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            RET  NZ
            LD   A,DiagnosticExpectedEof
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
HybridLL1RequireMain:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            RET  Z
            LD   A,DiagnosticExpectedTopLevel
            JP   CompilerSetDiagnostic

; The grammar deliberately treats the lexeme `main` as the same NAME token as
; ordinary routine names. This action is the one semantic discriminator.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1BeginSub:
            CALL HybridLL1RequireBeforeMain
            RET  C
            LD   HL,NameMain
            LD   B,4
            CALL TokenNameEquals
            JR   C,HybridLL1BeginMainSignature
            LD   A,(Stage7RoutineCount)
            CP   Stage7RoutineCapacity
            JR   NC,HybridLL1RoutineCapacityFailure
            CALL Stage7RejectCurrentDeclarationName
            RET  C
            LD   A,(Stage7RoutineCount)
            LD   (Stage7CurrentRoutine),A
            CALL Stage7RoutineAddress
            LD   DE,(TokenLexemePointer)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   A,(TokenLength)
            LD   (HL),A
            INC  HL
            LD   A,(Stage7ParameterCount)
            LD   (HL),A
            LD   (Stage7CurrentParameterStart),A
            XOR  A
            LD   (Stage7CurrentParameterCount),A
            LD   (Stage7CurrentResultType),A
            RET
HybridLL1BeginMainSignature:
            CALL Stage7RejectCurrentDeclarationName
            RET  C
            LD   A,$FF
            LD   (Stage7CurrentRoutine),A
            XOR  A
            LD   (Stage7CurrentParameterCount),A
            LD   (Stage7CurrentResultType),A
            RET
HybridLL1RoutineCapacityFailure:
            LD   A,DiagnosticRoutineCapacity
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1RetainParameter:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JR   Z,HybridLL1MainParameterFailure
            CALL Stage7CheckParameterDeclarationName
            RET  C
            LD   HL,(TokenLexemePointer)
            LD   (DeclarationNamePointer),HL
            LD   A,(TokenLength)
            LD   (DeclarationNameLength),A
            OR   A
            RET
HybridLL1MainParameterFailure:
            LD   A,DiagnosticExpectedRight
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1CommitParameter:
            LD   HL,(DeclarationNamePointer)
            LD   (TokenLexemePointer),HL
            LD   A,(DeclarationNameLength)
            LD   (TokenLength),A
            LD   A,(AggregateCurrentTypeId)
            JP   Stage7AppendParameter

HybridLL1AllowSubResult:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JR   Z,HybridLL1SubSignatureLineFailure
            RET

HybridLL1SaveSubResult:
            LD   A,(AggregateCurrentTypeId)
            LD   (Stage7CurrentResultType),A
            OR   A
            RET

HybridLL1MarkSubFails:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            RET  Z
HybridLL1SubSignatureLineFailure:
            LD   A,DiagnosticExpectedLine
            JP   CompilerSetDiagnostic

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginSubBody:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JP   Z,HybridLL1BeginMainBody
            DEC  A
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
            JR   NZ,HybridLL1RoutineKindReady
            XOR  A
HybridLL1RoutineKindReady:
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
HybridLL1InstallParameterLoop:
            LD   A,B
            OR   A
            RET  Z
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
            JR   HybridLL1InstallParameterLoop

HybridLL1BeginMainBody:
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
            JP   HybridLL1SetFallsThrough

.routine out A,carry,zero clobbers sign,parity,halfCarry
HybridLL1SetFallsThrough:
            LD   A,1
            LD   (ControlSequenceFallsThrough),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1EndSub:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JR   Z,HybridLL1EndMainBody
            LD   A,(Stage7CurrentResultType)
            OR   A
            JR   Z,HybridLL1EndRoutineEmit
            LD   A,(ControlSequenceFallsThrough)
            OR   A
            JP   NZ,TypedRoutineFlowFailure
HybridLL1EndRoutineEmit:
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
            RET
HybridLL1EndMainBody:
            LD   A,SemanticEndMain
            JP   SemanticSinkOperation

; ------------------------------------------------------------- local scalars

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
HybridLL1SaveLocalType:
            LD   A,(AggregateCurrentTypeId)
            OR   SymbolClassLocal
            LD   (DeclarationInfo),A
            LD   A,(NextLocalSlot)
            LD   C,A
            LD   B,0
            LD   (DeclarationPayload),BC
            PUSH BC
            LD   A,(DeclarationInfo)
            LD   D,A
            CALL TypedPrepareCurrentWord
            POP  BC
            RET  C
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            CALL TypedEmitLocalDeclare
HybridLL1SetLocalExpectedType:
            RET  C
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            LD   (ExpressionExpectedType),A
            OR   A
            RET

HybridLL1BeginLocalInitializer:
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            JP   HybridLL1SaveExpectedType

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
HybridLL1DefaultLocalInitializer:
            LD   A,1
            LD   (ExpressionEmitEnabled),A
            LD   A,SemanticLiteral16
            CALL TypedEmitOperation
            RET  C
            LD   HL,0
            CALL TypedEmitWord
            RET  C
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            OR   ScalarMetaConstant
            LD   (ExpressionRightMeta),A
            LD   HL,0
            LD   (ExpressionRightValue),HL
            OR   A
            RET

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C,IX,IY
HybridLL1FinishLocalInitializer:
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            LD   E,A
            JP   HybridLL1CheckExpressionAssignable

.routine in E out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C,IX,IY
HybridLL1CheckExpressionAssignable:
            LD   HL,(ExpressionRightValue)
            LD   A,(ExpressionRightMeta)
            JP   TypedCheckAssignable

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1CommitLocal:
            LD   A,(DeclarationInfo)
            LD   D,A
            LD   A,(DeclarationPayload)
            LD   C,A
            CALL TypedEmitStoreByInfo
            RET  C
            CALL SymbolCommit
            RET  C
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            CALL TypedTypeWidth
            LD   HL,NextLocalSlot
            ADD  A,(HL)
            LD   (HL),A
            OR   A
            RET

; ------------------------------------------------------------ simple statements

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1NameStatement:
            CALL ParserTake
            RET  C
            LD   HL,(TokenStartOffset)
            LD   (ExpressionCallOffset),HL
            LD   HL,NameWriteOutputByte
            LD   B,15
            CALL TokenNameEquals
            JR   C,HybridLL1ParseWrite
            CALL Stage7FindRoutineCurrent
            JR   NZ,HybridLL1ParseAssignment
            LD   C,0
            CALL Stage7ParseCall
            RET  C
            JP   ParserExpectLine
HybridLL1ParseAssignment:
            CALL SymbolLookupCurrent
            RET  C
            LD   (DeclarationInfo),A
            LD   (DeclarationPayload),BC
            LD   D,A
            AND  SymbolAggregateFlag
            JP   NZ,Stage7ParseAggregateAssignment
            LD   A,D
            AND  SymbolRecordTypeFlag+SymbolAggregateFlag
            JP   NZ,TypedTypeFailure
            LD   A,D
            AND  SymbolClassMask
            CP   SymbolClassLocal
            JR   NZ,HybridLL1StatementCounterChecked
            CALL ControlCheckActiveCounter
            RET  C
HybridLL1StatementCounterChecked:
            LD   A,D
            AND  SymbolClassMask
            JP   Z,TypedTypeFailure
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
            LD   BC,(DeclarationPayload)
            LD   A,(DeclarationInfo)
            LD   D,A
            CALL TypedEmitStoreByInfo
            RET  C
            JP   ParserExpectLine
HybridLL1ParseWrite:
            CALL ParserExpectLeft
            RET  C
            LD   A,ScalarTypeU8
            CALL TypedExpressionBeginRuntime
            RET  C
            LD   E,ScalarTypeU8
            CALL TypedCheckAssignable
            RET  C
            CALL ParserExpectRight
            RET  C
            LD   A,SemanticWriteValueU8
            CALL SemanticSinkOperation
            RET  C
            LD   HL,(ExpressionCallOffset)
            PUSH HL
            LD   A,L
            CALL SemanticSinkPut
            POP  HL
            RET  C
            LD   A,H
            CALL SemanticSinkPut
            RET  C
            JP   ParserExpectOrFailLine

HybridLL1BeginReturnValue:
            LD   A,(Stage7CurrentResultType)
            OR   A
            JP   Z,TypedRoutineFlowFailure
            CP   AggregateFirstDynamicTypeId
            RET  NC
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1ReturnValue:
            LD   A,(Stage7CurrentResultType)
            CP   AggregateFirstDynamicTypeId
            JR   NC,HybridLL1ReturnAggregateValue
            CALL TypedExpressionBeginRuntime
            JP   HybridLL1SaveExpressionResult
HybridLL1ReturnAggregateValue:
            CALL Stage7ParseAggregateValue
            RET  C
            LD   (Stage7PathType),A
            OR   A
            RET

HybridLL1CommitReturn:
            LD   A,(Stage7CurrentResultType)
            CP   AggregateFirstDynamicTypeId
            JR   NC,HybridLL1CommitAggregateReturn
            LD   E,A
            LD   A,(ExpressionRightMeta)
            LD   HL,(ExpressionRightValue)
            CALL TypedCheckAssignable
            RET  C
            LD   A,SemanticReturnScalar
            CALL SemanticSinkOperation
            RET  C
            JR   HybridLL1ReturnCommitted
HybridLL1CommitAggregateReturn:
            LD   D,A
            LD   A,(Stage7PathType)
            CP   D
            JP   NZ,TypedTypeFailure
            LD   A,SemanticReturnAggregate
            CALL SemanticSinkOperation
            RET  C
HybridLL1ReturnCommitted:
            XOR  A
            LD   (ControlSequenceFallsThrough),A
            RET

HybridLL1EmitExit:
            LD   A,TokenExit
            JR   HybridLL1EmitTransfer
HybridLL1EmitContinue:
            LD   A,TokenContinue
HybridLL1EmitTransfer:
            LD   (DeclarationInfo),A
            CALL ControlFindLoop
            RET  C
            LD   DE,ControlFrameExit
            LD   A,(DeclarationInfo)
            CP   TokenExit
            JR   Z,HybridLL1TransferSelected
            LD   DE,ControlFrameContinue
HybridLL1TransferSelected:
            ADD  HL,DE
            LD   C,(HL)
            JP   ControlEmitJump

; ---------------------------------------------------------- structured flow

; Save the enclosing statement sequence's fallthrough bit at the current
; control depth before a frame is pushed.
.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C
HybridLL1SaveFlow:
            LD   A,(ControlDepth)
            CP   ControlFrameCapacity
            JP   NC,ControlCapacityFailure
            CALL HybridLL1FlowAddress
            LD   A,(ControlSequenceFallsThrough)
            LD   (HL),A
            OR   A
            RET

.routine out A,DE,HL clobbers carry,zero,sign,parity,halfCarry
HybridLL1FlowAddress:
            LD   A,(ControlDepth)
            LD   E,A
            LD   D,0
            LD   HL,HybridLL1FlowStackBase
            ADD  HL,DE
            RET

; The frame has already been popped. Restore its enclosing sequence bit.
.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C
HybridLL1RestoreFlow:
            CALL HybridLL1FlowAddress
            LD   A,(HL)
            LD   (ControlSequenceFallsThrough),A
            OR   A
            RET

; A is the completed compound statement's fallthrough bit.
.routine in A out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C
HybridLL1CombineFlow:
            LD   B,A
            CALL ControlPopFrame
            RET  C
            CALL HybridLL1FlowAddress
            LD   A,(HL)
            AND  B
            LD   (ControlSequenceFallsThrough),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1CheckBooleanResult:
            LD   E,ScalarTypeBoolean
            JP   HybridLL1CheckExpressionAssignable

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginIf:
            CALL HybridLL1SaveFlow
            RET  C
            LD   A,ControlKindIf
            CALL ControlPushFrame
            RET  C
            LD   B,ControlFrameExit
            CALL ControlAllocateInto
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            RET  C
            LD   DE,ControlFrameCounter-ControlFrameLabelA
            ADD  HL,DE
            LD   (HL),1
            LD   A,ScalarTypeBoolean
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginIfBody:
            CALL HybridLL1CheckBooleanResult
            RET  C
            LD   B,ControlFrameLabelA
            JR   HybridLL1BeginConditionBody

.routine in B out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginConditionBody:
            CALL ControlTopFrameField
            RET  C
            LD   C,(HL)
            CALL ControlEmitBranchFalse
HybridLL1CheckedSetFallsThrough:
            RET  C
            JP   HybridLL1SetFallsThrough

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginBranchClause:
            CALL StructuredRecordIfClause
            RET  C
            CALL ControlTopFrame
            LD   DE,ControlFrameExit
            ADD  HL,DE
            LD   C,(HL)
            CALL ControlEmitJump
            RET  C
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            JP   ControlEmitLabel

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginElseIf:
            CALL HybridLL1BeginBranchClause
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            RET  C
            LD   A,ScalarTypeBoolean
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginElse:
            CALL HybridLL1BeginBranchClause
            JR   HybridLL1CheckedSetFallsThrough

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C
HybridLL1FinishElse:
            CALL StructuredRecordIfClause
            RET  C
            CALL ControlTopFrame
            LD   DE,ControlFrameMode
            ADD  HL,DE
            LD   (HL),1
            XOR  A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1FinishIfClauses:
            CALL StructuredRecordIfClause
            RET  C
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            JP   ControlEmitLabel

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1EndIf:
            CALL ControlTopFrame
            LD   DE,ControlFrameExit
            ADD  HL,DE
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            CALL ControlTopFrame
            PUSH HL
            LD   DE,ControlFrameCounter
            ADD  HL,DE
            LD   A,(HL)
            POP  HL
            LD   DE,ControlFrameMode
            ADD  HL,DE
            AND  (HL)
            XOR  1
            JP   HybridLL1CombineFlow

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginWhile:
            CALL HybridLL1SaveFlow
            RET  C
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
            LD   A,ScalarTypeBoolean
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginWhileBody:
            CALL HybridLL1CheckBooleanResult
            RET  C
            LD   B,ControlFrameExit
            JP   HybridLL1BeginConditionBody

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1EndWhile:
            CALL ControlTopFrame
            LD   DE,ControlFrameContinue
            ADD  HL,DE
            LD   C,(HL)
            CALL ControlEmitJump
            RET  C
            CALL ControlTopFrame
            LD   DE,ControlFrameExit
            ADD  HL,DE
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
HybridLL1PopAndRestoreFlow:
            CALL ControlPopFrame
            RET  C
            JP   HybridLL1RestoreFlow

; -------------------------------------------------------------- counted loop

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginFor:
            LD   HL,(TokenStartOffset)
            LD   (HybridLL1ForOffset),HL
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
            JP   HybridLL1SetLocalExpectedType

HybridLL1CheckForInitial .equ HybridLL1FinishLocalInitializer

HybridLL1ForTo:
            LD   A,1
            JR   HybridLL1ForBoundSelected
HybridLL1ForUntil:
            XOR  A
HybridLL1ForBoundSelected:
            LD   (HybridLL1ForMode),A
            CALL HybridLL1FinishLocalInitializer
            RET  C
            LD   A,ScalarTypeU16
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C,IX,IY
HybridLL1CheckForBound:
            LD   E,ScalarTypeU16
            JP   HybridLL1CheckExpressionAssignable

HybridLL1SaveForStep .equ HybridLL1CheckForBound

HybridLL1DefaultForStep:
            CALL HybridLL1CheckForBound
            RET  C
            LD   DE,1
            LD   (HybridLL1ForStep),DE
            XOR  A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginForBody:
            CALL HybridLL1SaveFlow
            RET  C
            LD   A,ControlKindFor
            CALL ControlPushFrame
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            RET  C
            LD   B,ControlFrameContinue
            CALL ControlAllocateInto
            RET  C
            LD   B,ControlFrameExit
            CALL ControlAllocateInto
            RET  C
            CALL ControlTopFrame
            LD   DE,ControlFrameCounter
            ADD  HL,DE
            LD   A,(DeclarationPayload)
            LD   (HL),A
            INC  HL
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeU16
            LD   A,(HybridLL1ForMode)
            JR   NZ,HybridLL1ForModeReady
            SET  2,A
HybridLL1ForModeReady:
            LD   (HL),A
            INC  HL
            LD   DE,(HybridLL1ForStep)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   DE,(HybridLL1ForOffset)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            CALL ControlTopFrame
            CALL StructuredEmitForSetup
            RET  C
            CALL ControlTopFrame
            INC  HL
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            CALL StructuredEmitForTest
            JP   HybridLL1CheckedSetFallsThrough

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1EndFor:
            CALL ControlTopFrame
            LD   DE,ControlFrameContinue
            ADD  HL,DE
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            CALL StructuredEmitForNext
            RET  C
            CALL ControlTopFrame
            LD   DE,ControlFrameExit
            ADD  HL,DE
            LD   C,(HL)
            CALL ControlEmitLabel
            RET  C
            LD   A,SemanticForCleanup
            CALL SemanticSinkOperation
            RET  C
            JP   HybridLL1PopAndRestoreFlow
HybridLL1ActionsEnd:
