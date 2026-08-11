; Explicit semantic actions for the complete Stage 7 packed LL(1) grammar.
; These routines never select grammar productions. They consume only retained
; expression/type-directed external islands declared by the generated grammar.

; Aggregate initializer staging is dead while a routine body is parsed, so
; the for/flow action scratch safely reuses its first thirteen bytes.
HybridLL1ForMode       .equ AggregateInitializerBase
HybridLL1ForStep       .equ HybridLL1ForMode+1
HybridLL1ForOffset     .equ HybridLL1ForStep+2
HybridLL1FlowStackBase .equ HybridLL1ForOffset+2
HybridLL1ActionStateEnd .equ HybridLL1FlowStackBase+ControlFrameCapacity

; --------------------------------------------------------- retained parsers

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1ConstantExpression:
            LD   A,ScalarTypeExact
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

; A is the logical action ordinal for the contiguous u8/u16/Boolean family.
HybridLL1SetScalarTypeAction:
            SUB  HybridLL1ActionOrdinalTypeU8-1
HybridLL1SetCurrentType:
            LD   (AggregateCurrentTypeId),A
            OR   A
            RET

.routine out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL,IX,IY
HybridLL1ResolveRecordType:
            CALL SymbolLookupCurrent
            RET  C
            LD   D,A
            LD   (DeclarationInfo),A
            LD   (DeclarationPayload),BC
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
            JP   Z,AggregateTypeShapeFailure
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1MakeStringType:
            CALL HybridLL1CheckedBound
            RET  C
            LD   A,H
            OR   A
            JP   NZ,AggregateStringCapacityFailure
            LD   A,L
            CP   254
            JP   NC,AggregateStringCapacityFailure
            LD   A,L
            LD   (AggregateCandidateAux),A
            LD   (AggregateCandidateLength),HL
            LD   A,AggregateTypeKindString
            LD   (AggregateCandidateKind),A
            INC  HL
            INC  HL
            LD   (AggregateCandidateExtent),HL
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
            LD   (AggregateCandidateLength),HL
            LD   B,H
            LD   C,L
            LD   A,(AggregateCandidateAux)
            CALL AggregateGetExtent
            LD   D,H
            LD   E,L
            LD   HL,0
HybridLL1ArrayExtentLoop:
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            CALL AggregateCheckExtentCapacity
            RET  C
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,HybridLL1ArrayExtentLoop
            LD   (AggregateCandidateExtent),HL
            LD   A,AggregateTypeKindArray
            LD   (AggregateCandidateKind),A
            JR   HybridLL1InternCurrentType

; --------------------------------------------------------- scalar constants

HybridLL1RetainDeclarationName .equ TypedRetainDeclarationName

HybridLL1SaveExpectedType:
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C,IX,IY
HybridLL1FinishConstantExpression:
            LD   HL,(ExpressionRightValue)
            LD   A,(ExpressionRightMeta)
            LD   D,A
            AND  ScalarMetaConstant
            JP   Z,TypedTypeFailure
            LD   A,D
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            LD   A,ScalarTypeExact
            JR   NZ,HybridLL1ConstantTypeReady
            LD   A,ScalarTypeBoolean
HybridLL1ConstantTypeReady:
            LD   (DeclarationInfo),A
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

HybridLL1BeginAssert .equ TypedRetainDeclarationNameReady

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
HybridLL1CommitAssert:
            CALL HybridLL1RestoreSubName
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaConstant+ScalarMetaTypeMask
            CP   ScalarMetaConstant+ScalarTypeBoolean
            JR   NZ,HybridLL1AssertTypeFailure
            LD   A,(ExpressionRightValue)
            OR   A
            RET  NZ
            LD   A,DiagnosticAssertionFailed
            JP   CompilerSetDiagnostic
HybridLL1AssertTypeFailure:
            LD   A,DiagnosticTypeMismatch
            JP   CompilerSetDiagnostic

; ------------------------------------------------------ program declarations

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1SaveProgramType:
            LD   A,(AggregateCurrentTypeId)
            LD   (DeclarationInfo),A
            CALL AggregateGetExtent
            LD   (AggregateCurrentObjectExtent),HL
            LD   (AggregateCurrentObjectEnd),HL
            LD   HL,0
            LD   (AggregateCurrentObjectOffset),HL
            CALL AggregateZeroCurrentObject
            RET  C
            XOR  A
            LD   (AggregateInitializerDepth),A
            LD   (AggregateHasInitializer),A
            RET

HybridLL1FinishProgramInitializer:
            LD   A,1
            LD   (AggregateHasInitializer),A
            LD   HL,(AggregateCurrentObjectOffset)
            LD   DE,(AggregateCurrentObjectEnd)
            OR   A
            SBC  HL,DE
            JP   NZ,AggregateInitializerCountFailure
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1CommitProgramVariable:
            LD   A,(AggregateHasInitializer)
            OR   A
            JR   Z,HybridLL1CommitBssObject
            JR   HybridLL1AllocateDataObject
HybridLL1CommitBssObject:
            JR   HybridLL1AllocateBssObject
HybridLL1CommitObjectReady:
            PUSH BC
            LD   A,(DeclarationInfo)
            CP   AggregateFirstDynamicTypeId
            JR   C,HybridLL1ProgramScalarInfo
            LD   D,SymbolInfoAggregateProgram
            JR   HybridLL1ProgramPrepareSymbol
HybridLL1ProgramScalarInfo:
            OR   SymbolClassProgram
            LD   D,A
HybridLL1ProgramPrepareSymbol:
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
            OR   A
            RET

; Return the absolute target address of one initialized program object in BC.
; The complete prepared bytes are appended to the rodata-backed data image.
HybridLL1AllocateDataObject:
            LD   DE,(StaticImageLength)
            CALL HybridLL1AllocateObjectEnd
            RET  C
            LD   (StaticImageLength),HL
            LD   A,(DeclarationInfo)
            CALL AggregateGetExtent
            LD   B,H
            LD   C,L
            LD   HL,AggregateInitializerBase
            LD   DE,(AggregateCurrentObjectOffset)
            PUSH HL
            LD   HL,StaticImageBase
            ADD  HL,DE
            EX   DE,HL
            POP  HL
            LDIR
            LD   BC,(AggregateCurrentObjectOffset)
            LD   HL,ProgramDataBase
            ADD  HL,BC
            LD   B,H
            LD   C,L
            OR   A
            JR   HybridLL1CommitObjectReady

; Return the absolute target address of one default-initialized object in BC.
HybridLL1AllocateBssObject:
            LD   DE,(ProgramBssLength)
            CALL HybridLL1AllocateObjectEnd
            RET  C
            LD   (ProgramBssLength),HL
            LD   B,D
            LD   C,E
            LD   HL,ProgramBssBase
            ADD  HL,BC
            LD   B,H
            LD   C,L
            OR   A
            JR   HybridLL1CommitObjectReady

; Add the current object extent to the selected segment length in DE. Return
; the old offset in DE and the checked mathematical end in HL.
.routine in DE out A,DE,HL,carry,zero clobbers sign,parity,halfCarry
HybridLL1AllocateObjectEnd:
            LD   (AggregateCurrentObjectOffset),DE
            LD   A,(DeclarationInfo)
            CALL AggregateGetExtent
            LD   DE,(AggregateCurrentObjectOffset)
            ADD  HL,DE
HybridLL1CheckProgramSegmentEnd:
; Initialized data and BSS use the same exact 1 KiB extent rule and diagnostic
; as complete aggregate objects.
            JP   AggregateCheckExtentCapacity

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
            LD   H,A
            LD   L,A
            LD   (AggregateCurrentRecordExtent),HL
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
            CALL TokenRetainNameAtHL
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
            LD   DE,(AggregateCurrentRecordExtent)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   A,(AggregateCurrentTypeId)
            PUSH DE
            CALL AggregateGetExtent
            POP  DE
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            CALL AggregateCheckExtentCapacity
            RET  C
            LD   (AggregateCurrentRecordExtent),HL
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
            LD   HL,0
            LD   (AggregateCandidateLength),HL
            LD   HL,(AggregateCurrentRecordExtent)
            LD   (AggregateCandidateExtent),HL
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

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
HybridLL1RequireMain:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JR   Z,HybridLL1RequireOrdinaryForwards
            LD   A,(Stage8ForwardMainFlags)
            AND  Stage8RoutineIncomplete
            JR   NZ,HybridLL1IncompleteForward
            JR   HybridLL1MissingMain
HybridLL1RequireOrdinaryForwards:
            LD   A,(Stage7RoutineCount)
            LD   B,A
            XOR  A
            LD   C,A
HybridLL1RequireForwardLoop:
            LD   A,B
            OR   A
            RET  Z
            LD   A,C
            CALL Stage7RoutineAddress
            LD   DE,Stage7RoutineFlags
            ADD  HL,DE
            LD   A,(HL)
            AND  Stage8RoutineIncomplete
            JR   NZ,HybridLL1IncompleteForward
            INC  C
            DEC  B
            JR   HybridLL1RequireForwardLoop
HybridLL1MissingMain:
            LD   A,DiagnosticExpectedTopLevel
            JP   CompilerSetDiagnostic
HybridLL1IncompleteForward:
            LD   A,DiagnosticForwardIncomplete
            JP   CompilerSetDiagnostic

; The grammar deliberately treats the lexeme `main` as the same NAME token as
; ordinary routine names. This action is the one semantic discriminator.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1RetainSubName:
            JP   TypedRetainDeclarationNameReady

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
HybridLL1RestoreSubName:
            CALL TypedRestoreDeclarationToken
            LD   HL,DeclarationNamePosition
            LD   DE,TokenStartOffset
            CALL CompilerCopyPosition
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1BeginSub:
            CALL HybridLL1RestoreSubName
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
            CALL TokenRetainNameAtHL
            INC  HL
            LD   A,(Stage7ParameterCount)
            LD   (HL),A
            LD   (Stage7CurrentParameterStart),A
            XOR  A
            LD   (Stage7CurrentParameterCount),A
            LD   (Stage7CurrentResultType),A
            LD   (Stage7CurrentFlags),A
            RET
HybridLL1BeginMainSignature:
            LD   A,(Stage8ForwardMainFlags)
            AND  Stage8RoutineIncomplete
            JP   NZ,TypedDuplicateNameFailure
            CALL Stage7RejectCurrentDeclarationName
            RET  C
            LD   A,$FF
            LD   (Stage7CurrentRoutine),A
            XOR  A
            LD   (Stage7CurrentParameterCount),A
            LD   (Stage7CurrentResultType),A
            LD   A,Stage7RoutineMain
            LD   (Stage7CurrentFlags),A
            RET
HybridLL1RoutineCapacityFailure:
            LD   A,DiagnosticRoutineCapacity
            JP   CompilerSetDiagnostic

; A forward uses the ordinary signature builder, then publishes that sole
; signature without opening a body or emitting code.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1BeginForward:
            CALL HybridLL1BeginSub
            RET  C
            LD   A,(Stage7CurrentFlags)
            OR   Stage8RoutineIncomplete
            LD   (Stage7CurrentFlags),A
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1CommitForward:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JR   Z,HybridLL1CommitForwardMain
            DEC  A
            CALL HybridLL1PublishRoutine
            XOR  A
            RET
HybridLL1CommitForwardMain:
            LD   A,(Stage7CurrentFlags)
            LD   (Stage8ForwardMainFlags),A
            XOR  A
            LD   (Stage7CurrentRoutine),A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
HybridLL1RetainParameter:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JR   Z,HybridLL1MainParameterFailure
            CALL Stage7CheckParameterDeclarationName
            RET  C
            LD   HL,DeclarationNamePointer
            CALL TokenRetainNameAtHL
            OR   A
            RET
HybridLL1MainParameterFailure:
            LD   A,DiagnosticExpectedRight
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1CommitParameter:
            CALL TypedRestoreDeclarationToken
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
            LD   A,(Stage7CurrentFlags)
            OR   Stage7RoutineFails
            LD   (Stage7CurrentFlags),A
            OR   A
            RET
HybridLL1SubSignatureLineFailure:
            LD   A,DiagnosticExpectedLine
            JP   CompilerSetDiagnostic

; Open the abbreviated body of one exact incomplete forward and recover its
; sole stored signature, including the original parameter spellings.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginForwardBody:
            CALL HybridLL1RestoreSubName
            CALL HybridLL1RequireBeforeMain
            RET  C
            LD   HL,NameMain
            LD   B,4
            CALL TokenNameEquals
            JR   C,HybridLL1BeginForwardMainBody
            CALL Stage7FindRoutineCurrent
            JR   NZ,HybridLL1ForwardMissing
            LD   (Stage7CurrentRoutine),A
            CALL Stage7RoutineAddress
            LD   DE,Stage7RoutineParameterStart
            ADD  HL,DE
            LD   A,(HL)
            LD   (Stage7CurrentParameterStart),A
            INC  HL
            LD   A,(HL)
            LD   (Stage7CurrentParameterCount),A
            INC  HL
            LD   A,(HL)
            LD   (Stage7CurrentResultType),A
            INC  HL
            LD   A,(HL)
            LD   (Stage7CallLabel),A
            INC  HL
            LD   A,(HL)
            BIT  2,A
            JP   Z,TypedDuplicateNameFailure
            AND  $FB
            LD   (HL),A
            LD   (Stage7CurrentFlags),A
            JR   HybridLL1OpenRoutineBody
HybridLL1BeginForwardMainBody:
            LD   A,(Stage8ForwardMainFlags)
            BIT  2,A
            JR   Z,HybridLL1ForwardMissing
            AND  $FB
            LD   (Stage7CurrentFlags),A
            LD   (Stage8ForwardMainFlags),A
            XOR  A
            LD   (Stage7CurrentParameterCount),A
            LD   (Stage7CurrentResultType),A
            DEC  A
            LD   (Stage7CurrentRoutine),A
            JP   HybridLL1BeginMainBody
HybridLL1ForwardMissing:
            LD   A,DiagnosticUnknownName
            JP   CompilerSetDiagnostic

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginSubBody:
            LD   A,(Stage7CurrentRoutine)
            INC  A
            JP   Z,HybridLL1BeginMainBody
            DEC  A
            CALL HybridLL1PublishRoutine
            JR   HybridLL1OpenRoutineBody

.routine in A out A,BC,DE,HL clobbers carry,zero,sign,parity,halfCarry
HybridLL1PublishRoutine:
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
            INC  HL
            LD   A,(Stage7CurrentFlags)
            LD   (HL),A
            LD   HL,Stage7RoutineCount
            INC  (HL)
            RET
HybridLL1OpenRoutineBody:
            LD   A,(SymbolCount)
            LD   (Stage7GlobalSymbolCount),A
            XOR  A
            LD   (NextLocalSlot),A
            XOR  A
            LD   (ControlDepth),A
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
            LD   A,(Stage7CurrentFlags)
            LD   (Stage8ForwardMainFlags),A
            LD   A,SemanticBeginCallableMain
            CALL SemanticSinkOperation
            RET  C
            LD   A,(Stage7CurrentFlags)
            CALL SemanticSinkPut
            RET  C
            LD   A,(SymbolCount)
            LD   (Stage7GlobalSymbolCount),A
            XOR  A
            LD   (NextLocalSlot),A
            LD   (Stage7CurrentResultType),A
            LD   (ControlRoutineKind),A
            XOR  A
            LD   (ControlDepth),A

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
            CALL HybridLL1EmitRoutineEnd
            RET  C
            LD   A,(Stage7CurrentResultType)
            CALL SemanticSinkPut
            RET  C
            LD   A,(Stage7GlobalSymbolCount)
            LD   (SymbolCount),A
            XOR  A
            LD   (NextLocalSlot),A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
HybridLL1EmitRoutineEnd:
            LD   A,(Stage7CurrentFlags)
            AND  Stage7RoutineFails
            LD   A,SemanticEndGeneralRoutine
            JR   Z,HybridLL1EmitRoutineEndSelected
            LD   A,SemanticEndFailableRoutine
HybridLL1EmitRoutineEndSelected:
            JP   SemanticSinkOperation
HybridLL1EndMainBody:
            CALL HybridLL1EmitRoutineEnd
            RET  C
            XOR  A
            JP   SemanticSinkPut

; ------------------------------------------------------ recoverable failure

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
HybridLL1BeginFail:
            LD   A,(Stage7CurrentFlags)
            AND  Stage7RoutineFails
            JR   Z,HybridLL1FailureContext
            LD   HL,(TokenStartOffset)
            LD   (Stage8FailureOffset),HL
            LD   A,ScalarTypeU8
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1CommitFail:
            LD   E,ScalarTypeU8
            LD   A,(ExpressionRightMeta)
            LD   HL,(ExpressionRightValue)
            CALL TypedCheckAssignable
            RET  C
            CALL Stage8RequireNoPendingFailure
            RET  C
            LD   A,SemanticFailRoutine
HybridLL1FailOperationReady:
            CALL SemanticSinkOperation
            RET  C
            LD   HL,(Stage8FailureOffset)
            PUSH HL
            LD   A,L
            CALL SemanticSinkPut
            POP  HL
            RET  C
            LD   A,H
            CALL SemanticSinkPut
            RET  C
HybridLL1NoFallthrough:
            XOR  A
            LD   (ControlSequenceFallsThrough),A
            RET
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
HybridLL1FailureContext:
            LD   A,DiagnosticFailureContext
            JP   CompilerSetDiagnostic

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
; Both callers have already observed a nonzero Stage8DirectFailable. The
; generic entry checks the token; the selected entry reuses its caller's peek.
Stage8ConsumePropagation:
            CALL ParserPeek
            RET  C
            CP   TokenElse
            JR   NZ,HybridLL1FailureContext
Stage8ConsumePropagationSelected:
            LD   A,(Stage7CurrentFlags)
            AND  Stage7RoutineFails
            JR   Z,HybridLL1FailureContext
            CALL ParserTake
            RET  C
            LD   E,TokenFail
            CALL ParserExpect
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenHandle
            JR   Z,HybridLL1FailureContext
            CP   TokenElse
            JR   Z,HybridLL1FailureContext
            LD   A,Stage8CallModePropagateRoutine
Stage8PropagationModeReady:
            LD   HL,(Stage8CallModePointer)
            LD   (HL),A
            INC  HL
            INC  HL
            LD   A,(Stage8RetainedCarriers)
            LD   (HL),A
Stage8ClearPendingFailure:
            XOR  A
            LD   (Stage8DirectFailable),A
            LD   (Stage8RetainedCarriers),A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry
Stage8SelectFailureConsumer:
            LD   A,(Stage8DirectFailable)
            OR   A
            JR   NZ,Stage8SelectPendingFailure
            LD   (Stage8RetainedCarriers),A
            CALL ParserPeek
            RET  C
            CP   TokenElse
            JR   Z,HybridLL1FailureContext
            CP   TokenHandle
            JR   Z,HybridLL1FailureContext
            OR   A
            RET
Stage8SelectPendingFailure:
            CALL ParserPeek
            RET  C
            CP   TokenElse
            JR   Z,Stage8ConsumePropagationSelected
            CP   TokenHandle
            JR   NZ,HybridLL1FailureContext
            CALL HybridLL1SaveFlow
            RET  C
            LD   A,ControlKindHandler
            CALL ControlPushFrame
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlAllocateInto
            RET  C
            LD   B,ControlFrameExit
            CALL ControlAllocateInto
            RET  C
            LD   HL,(Stage8CallModePointer)
            LD   (HL),Stage8CallModeHandle
            LD   B,ControlFrameLabelA
            CALL ControlTopFrameField
            LD   C,(HL)
            LD   HL,(Stage8CallModePointer)
            INC  HL
            LD   (HL),C
            INC  HL
            LD   A,(Stage8RetainedCarriers)
            LD   (HL),A
            JR   Stage8ClearPendingFailure

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1LookupDeclaration:
            CALL SymbolLookupCurrent
            RET  C
            LD   (DeclarationInfo),A
            LD   (DeclarationPayload),BC
            LD   D,A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginHandle:
            CALL HybridLL1LookupDeclaration
            RET  C
            AND  SymbolRecordTypeFlag+SymbolAggregateFlag
            JP   NZ,TypedTypeFailure
            LD   A,D
            AND  SymbolClassMask
            JP   Z,TypedTypeFailure
            CP   SymbolClassLocal
            JR   NZ,Stage8HandlerCounterReady
            CALL ControlCheckActiveCounter
            RET  C
Stage8HandlerCounterReady:
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeU8
            JP   NZ,TypedTypeFailure
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   C,(HL)
            LD   A,SemanticSkipHandler
            CALL Stage8EmitOperationLabel
            RET  C
            LD   B,ControlFrameLabelA
            CALL ControlTopFrameField
            LD   C,(HL)
            LD   A,SemanticBeginHandler
            CALL Stage8EmitOperationLabel
            RET  C
            LD   A,(DeclarationInfo)
            CALL SemanticSinkPut
            RET  C
            AND  SymbolClassMask
            CP   SymbolClassProgram
            LD   HL,(DeclarationPayload)
            JR   Z,HybridLL1BeginHandleProgramPayload
            LD   A,L
            CALL SemanticSinkPut
            JR   HybridLL1BeginHandlePayloadReady
HybridLL1BeginHandleProgramPayload:
            CALL Stage7EmitWord
HybridLL1BeginHandlePayloadReady:
            RET  C
            JP   HybridLL1SetFallsThrough

.routine in A,C out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
Stage8EmitOperationLabel:
            CALL SemanticSinkOperation
            RET  C
            LD   A,C
            JP   SemanticSinkPut

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1EndHandle:
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
            LD   C,(HL)
            LD   A,SemanticEndHandler
            CALL Stage8EmitOperationLabel
            RET  C
            LD   A,1
            JP   HybridLL1CombineFlow

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
Stage8RequireNoPendingFailure:
            LD   A,(Stage8DirectFailable)
            OR   A
            RET  Z
            JP   HybridLL1FailureContext

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
            CALL HybridLL1ValidateDeclarationExpression
            RET  C
            LD   A,(Stage8DirectFailable)
            OR   A
            JP   NZ,Stage8ConsumePropagation
            CALL ParserPeek
            RET  C
            CP   TokenElse
            JP   Z,HybridLL1FailureContext
            OR   A
            RET

.routine out A,DE,HL,carry,zero clobbers sign,parity,halfCarry,B,C,IX,IY
HybridLL1ValidateDeclarationExpression:
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            LD   E,A
            JR   HybridLL1CheckExpressionAssignable

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
            LD   (Stage7CallOffset),HL
            CALL Stage8MatchPredefinedCurrent
            JR   NC,HybridLL1OrdinaryNameStatement
            CP   Stage8PredefinedConstantBase
            JP   NC,TypedTypeFailure
            LD   C,0
            CALL Stage8ParseServiceCall
            RET  C
            JP   Stage8SelectFailureConsumer
HybridLL1OrdinaryNameStatement:
            CALL Stage7FindRoutineCurrent
            JR   NZ,HybridLL1ParseAssignment
            LD   C,0
            CALL Stage7ParseCall
            RET  C
            JP   Stage8SelectFailureConsumer
HybridLL1ParseAssignment:
            CALL HybridLL1LookupDeclaration
            RET  C
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
            CALL Stage8SelectFailureConsumer
            RET  C
            LD   BC,(DeclarationPayload)
            LD   A,(DeclarationInfo)
            LD   D,A
            JP   TypedEmitStoreByInfo
HybridLL1BeginReturnValue:
            LD   A,(Stage7CurrentResultType)
            OR   A
            RET  Z
            CP   AggregateFirstDynamicTypeId
            RET  NC
            LD   (ExpressionExpectedType),A
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1ReturnValue:
            LD   A,(Stage7CurrentResultType)
            OR   A
            JP   Z,TypedRoutineFlowFailure
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
            OR   A
            JP   Z,TypedRoutineFlowFailure
            CP   AggregateFirstDynamicTypeId
            JR   NC,HybridLL1CommitAggregateReturn
            LD   E,A
            LD   A,(ExpressionRightMeta)
            LD   HL,(ExpressionRightValue)
            CALL TypedCheckAssignable
            RET  C
            CALL Stage8RequireNoPendingFailure
            RET  C
            LD   A,(Stage7CurrentFlags)
            AND  Stage7RoutineFails
            LD   A,SemanticReturnScalar
            JR   Z,HybridLL1ReturnScalarSelected
            LD   A,SemanticReturnFailableScalar
HybridLL1ReturnScalarSelected:
            CALL SemanticSinkOperation
            RET  C
            JR   HybridLL1ReturnCommitted
HybridLL1CommitAggregateReturn:
            LD   D,A
            LD   A,(Stage7PathType)
            CP   D
            JP   NZ,TypedTypeFailure
            CALL Stage8RequireNoPendingFailure
            RET  C
            LD   A,(Stage7CurrentFlags)
            AND  Stage7RoutineFails
            LD   A,SemanticReturnAggregate
            JR   Z,HybridLL1ReturnAggregateSelected
            LD   A,SemanticReturnFailableAggregate
HybridLL1ReturnAggregateSelected:
            CALL SemanticSinkOperation
            RET  C
HybridLL1ReturnCommitted:
            JP   HybridLL1NoFallthrough

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1CommitBareReturn:
            LD   A,(Stage7CurrentResultType)
            OR   A
            JP   NZ,TypedRoutineFlowFailure
            CALL HybridLL1EmitRoutineEnd
            RET  C
            XOR  A
            CALL SemanticSinkPut
            RET  C
            JR   HybridLL1ReturnCommitted

; A is the logical action ordinal. The two ordinals and tokens are contiguous.
HybridLL1EmitTransferAction:
            INC  A
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
            CALL Stage8RequireNoPendingFailure
            RET  C
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
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
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
            LD   B,ControlFrameMode
            CALL ControlTopFrameField
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
            LD   B,ControlFrameExit
            CALL ControlTopFrameField
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
HybridLL1PopAndRestoreFlow:
            CALL ControlPopFrame
            RET  C
            JP   HybridLL1RestoreFlow

; -------------------------------------------------------------- counted loop

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
HybridLL1BeginFor:
            LD   HL,(TokenStartOffset)
            LD   (HybridLL1ForOffset),HL
            CALL HybridLL1LookupDeclaration
            RET  C
            AND  SymbolClassMask
            CP   SymbolClassLocal
            JP   NZ,StructuredCounterFailure
            LD   A,D
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   Z,StructuredCounterFailure
            CALL ControlCheckActiveCounter
            JP   HybridLL1SetLocalExpectedType

HybridLL1CheckForInitial:
            CALL HybridLL1ValidateDeclarationExpression
            RET  C
            JP   Stage8RequireNoPendingFailure

; A is the logical action ordinal for the contiguous to/until family.
HybridLL1SelectForBoundAction:
            AND  1
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
            CALL Stage8RequireNoPendingFailure
            RET  C
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
            LD   B,ControlFrameCounter
            CALL ControlTopFrameField
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
            JP   HybridLL1PopAndRestoreFlow
HybridLL1ActionsEnd:
