; Stage 6 aggregate layout and static-image construction.
;
; Types use one-byte IDs. 1..3 are the predefined scalar types; dynamic IDs
; index a bounded four-byte descriptor plus a retained word extent. Aggregate
; storage is allocated only by top-level var declarations. Initializer bytes
; are written into a private static image which the Z80 backend publishes
; only after the complete source has succeeded.

.routine in A out A,HL clobbers carry,zero,sign,parity,halfCarry,DE
AggregateTypeAddress:
            SUB  AggregateFirstDynamicTypeId
            LD   L,A
            LD   H,0
            ADD  HL,HL
            ADD  HL,HL
            LD   DE,AggregateTypeTableBase
            ADD  HL,DE
            RET

.routine in A out A,HL clobbers carry,zero,sign,parity,halfCarry,DE
AggregateExtentAddress:
            SUB  AggregateFirstDynamicTypeId
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,AggregateTypeExtentBase
            ADD  HL,DE
            RET

.routine in A out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
AggregateGetExtent:
            CP   AggregateFirstDynamicTypeId
            JR   NC,AggregateGetDynamicExtent
            LD   HL,1
            CP   AggregateTypeIdU16
            JR   Z,AggregateGetU16Extent
            OR   A
            RET
AggregateGetU16Extent:
            INC  L
            OR   A
            RET
AggregateGetDynamicExtent:
            CALL AggregateExtentAddress
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            OR   A
            RET

; Append the descriptor and extent in AggregateCandidate*. No structural
; lookup is performed, so this entry creates nominal record identity.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
AggregateAppendType:
            LD   A,(AggregateTypeCount)
            CP   AggregateTypeCapacity
            JR   NC,AggregateTypeCapacityFailure
            ADD  A,AggregateFirstDynamicTypeId
            CALL AggregateTypeAddress
            LD   D,H
            LD   E,L
            LD   HL,AggregateCandidateKind
            LD   BC,AggregateTypeEntrySize
            LDIR
            LD   A,(AggregateTypeCount)
            ADD  A,AggregateFirstDynamicTypeId
            LD   C,A
            CALL AggregateExtentAddress
            LD   DE,(AggregateCandidateExtent)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   HL,AggregateTypeCount
            INC  (HL)
            LD   A,C
            OR   A
            RET
AggregateTypeCapacityFailure:
            LD   A,DiagnosticTypeMetadataCapacity
            JP   CompilerSetDiagnostic

; Intern a structural string or array descriptor. CandidateKind/Aux/Length and
; CandidateExtent must already be complete.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
AggregateInternType:
            LD   A,(AggregateTypeCount)
            OR   A
            JR   Z,AggregateAppendType
            LD   B,A
            LD   C,AggregateFirstDynamicTypeId
AggregateInternLoop:
            LD   A,C
            CALL AggregateTypeAddress
            LD   DE,AggregateCandidateKind
            PUSH BC
            LD   B,AggregateTypeEntrySize
AggregateInternCompareLoop:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,AggregateInternDifferent
            INC  DE
            INC  HL
            DJNZ AggregateInternCompareLoop
            POP  BC
            JR   AggregateInternFound
AggregateInternDifferent:
            POP  BC
AggregateInternNext:
            INC  C
            DJNZ AggregateInternLoop
            JR   AggregateAppendType
AggregateInternFound:
            LD   A,C
            OR   A
            RET

; The first compiler admits one aggregate object up to the selected complete
; program-data region. HL is a nonzero mathematical extent.
.routine in HL out A,HL,carry,zero clobbers sign,parity,halfCarry
AggregateCheckExtentCapacity:
            LD   A,H
.if SegmentedOutput
            CP   4
            JR   C,AggregateExtentCapacityReady
            JR   NZ,AggregateExtentCapacityFailure
            LD   A,L
            OR   A
            JR   NZ,AggregateExtentCapacityFailure
.else
            OR   A
            JR   NZ,AggregateExtentCapacityFailure
.endif
AggregateExtentCapacityReady:
            OR   A
            RET
AggregateExtentCapacityFailure:
            LD   A,DiagnosticProgramDataCapacity
            JP   CompilerSetDiagnostic

.if HybridLL1Full
AggregateNestedArrayFailure:
            POP  AF
AggregateTypeShapeFailure:
            LD   A,DiagnosticTypeBound
            JP   CompilerSetDiagnostic
AggregateProgramDataCapacityFailure:
            LD   A,DiagnosticProgramDataCapacity
            JP   CompilerSetDiagnostic
AggregateStringCapacityFailure:
            LD   A,DiagnosticStringCapacity
            JP   CompilerSetDiagnostic
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
AggregateParseBound:
            LD   A,ScalarTypeU16
            CALL TypedExpressionBeginConstant
            RET  C
            LD   D,A
            AND  ScalarMetaConstant
            JP   Z,AggregateTypeShapeFailure
            LD   E,ScalarTypeU16
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            LD   A,H
            OR   L
            JR   Z,AggregateTypeShapeFailure
            PUSH HL
            LD   E,TokenRightBracket
            CALL ParserExpect
            POP  HL
            RET

AggregateTypeShapeFailure:
            LD   A,DiagnosticTypeBound
            JP   CompilerSetDiagnostic

; Parse any admitted aggregate type. Bounds and complete extents are retained
; as words. Object allocation is still bounded by the selected program-data
; region, and exceeding that implementation capacity receives a capacity
; diagnostic rather than changing the source type.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
AggregateParseType:
            CALL ParserTake
            RET  C
            CP   TokenU8
            JR   Z,AggregateTypeU8
            CP   TokenU16
            JR   Z,AggregateTypeU16
            CP   TokenBoolean
            JR   Z,AggregateTypeBoolean
            CP   TokenString
            JR   Z,AggregateParseStringType
            CP   TokenName
            JR   NZ,AggregateTypeShapeFailure
            CALL SymbolLookupCurrent
            RET  C
            LD   D,A
            AND  SymbolRecordTypeFlag+SymbolAggregateFlag
            CP   SymbolRecordTypeFlag
            JR   NZ,AggregateTypeShapeFailure
            LD   A,C
            JR   AggregateTypeBaseReady
AggregateTypeU8:
            LD   A,AggregateTypeIdU8
            JR   AggregateTypeBaseReady
AggregateTypeU16:
            LD   A,AggregateTypeIdU16
            JR   AggregateTypeBaseReady
AggregateTypeBoolean:
            LD   A,AggregateTypeIdBoolean
            JR   AggregateTypeBaseReady
AggregateParseStringType:
            LD   E,TokenLeftBracket
            CALL ParserExpect
            RET  C
            CALL AggregateParseBound
            RET  C
            LD   A,H
            OR   A
            JP   NZ,AggregateStringCapacityFailure
            LD   A,L
            OR   A
            JP   Z,AggregateTypeShapeFailure
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
            CALL AggregateInternType
            RET  C
AggregateTypeBaseReady:
            LD   (AggregateCurrentTypeId),A
            CALL ParserPeek
            RET  C
            CP   TokenLeftBracket
            JR   Z,AggregateParseArraySuffix
            LD   A,(AggregateCurrentTypeId)
            OR   A
            RET
AggregateParseArraySuffix:
            LD   A,(AggregateCurrentTypeId)
            CP   AggregateFirstDynamicTypeId
            JR   C,AggregateArrayElementReady
            PUSH AF
            CALL AggregateTypeAddress
            LD   A,(HL)
            CP   AggregateTypeKindArray
            JR   Z,AggregateNestedArrayFailure
            POP  AF
            JR   AggregateArrayElementReady
AggregateNestedArrayFailure:
            POP  AF
            JP   AggregateTypeShapeFailure
AggregateArrayElementReady:
            LD   (AggregateCandidateAux),A
            CALL ParserTake
            RET  C
            CALL AggregateParseBound
            RET  C
            LD   (AggregateCandidateLength),HL
            LD   B,H
            LD   C,L
            LD   A,(AggregateCandidateAux)
            CALL AggregateGetExtent
            LD   D,H
            LD   E,L
            LD   HL,0
AggregateArrayExtentLoop:
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            CALL AggregateCheckExtentCapacity
            RET  C
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,AggregateArrayExtentLoop
            LD   (AggregateCandidateExtent),HL
            LD   A,AggregateTypeKindArray
            LD   (AggregateCandidateKind),A
            CALL AggregateInternType
            RET  C
            LD   (AggregateCurrentTypeId),A
            CALL ParserPeek
            RET  C
            CP   TokenLeftBracket
            JP   Z,AggregateTypeShapeFailure
            LD   A,(AggregateCurrentTypeId)
            OR   A
            RET
AggregateProgramDataCapacityFailure:
            LD   A,DiagnosticProgramDataCapacity
            JP   CompilerSetDiagnostic
AggregateStringCapacityFailure:
            LD   A,DiagnosticStringCapacity
            JP   CompilerSetDiagnostic
.endif

.routine in A out A,HL clobbers carry,zero,sign,parity,halfCarry,DE
AggregateFieldAddress:
            LD   E,A
            LD   D,0
            LD   H,D
            LD   L,E
            ADD  HL,HL
            ADD  HL,DE
            ADD  HL,HL
            LD   DE,AggregateFieldTableBase
            ADD  HL,DE
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
AggregateCheckFieldDuplicate:
            LD   A,(AggregateCurrentFieldCount)
            OR   A
            RET  Z
            LD   C,A
            LD   A,(AggregateCurrentFieldStart)
AggregateFieldDuplicateLoop:
            PUSH AF
            PUSH BC
            CALL AggregateFieldAddress
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   B,(HL)
            EX   DE,HL
            CALL TokenNameEquals
            JR   C,AggregateFieldDuplicateUnwind
            POP  BC
            POP  AF
            INC  A
            DEC  C
            JR   NZ,AggregateFieldDuplicateLoop
            OR   A
            RET
AggregateFieldDuplicateUnwind:
            POP  BC
            POP  AF
AggregateFieldDuplicateFailure:
            JP   TypedDuplicateNameFailure

.if HybridLL1Full
AggregateRecordEmptyFailure:
            LD   A,DiagnosticRecordEmpty
            JP   CompilerSetDiagnostic
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
AggregateParseRecordAfterTake:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL TypedRetainDeclarationName
            RET  C
            LD   A,(AggregateTypeCount)
            CP   AggregateTypeCapacity
            JP   NC,AggregateTypeCapacityFailure
            LD   A,(AggregateRecordCount)
            CP   AggregateRecordCapacity
            JP   NC,AggregateTypeCapacityFailure
            CALL ParserExpectLine
            RET  C
            LD   A,(AggregateFieldCount)
            LD   (AggregateCurrentFieldStart),A
            XOR  A
            LD   (AggregateCurrentFieldCount),A
            LD   H,A
            LD   L,A
            LD   (AggregateCurrentRecordExtent),HL
AggregateRecordFieldLoop:
            CALL ParserPeek
            RET  C
            CP   TokenEnd
            JR   Z,AggregateRecordFinish
            CP   TokenName
            JP   NZ,AggregateTypeShapeFailure
            CALL ParserTake
            RET  C
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
            PUSH HL
            CALL ParserExpectAs
            POP  HL
            RET  C
            PUSH HL
            CALL AggregateParseType
            POP  HL
            RET  C
            LD   B,A
            INC  HL
            LD   (HL),B
            INC  HL
            LD   DE,(AggregateCurrentRecordExtent)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            PUSH DE
            LD   A,B
            CALL AggregateGetExtent
            POP  DE
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            CALL AggregateCheckExtentCapacity
            RET  C
            LD   (AggregateCurrentRecordExtent),HL
            CALL ParserExpectLine
            RET  C
            LD   HL,AggregateCurrentFieldCount
            INC  (HL)
            JR   AggregateRecordFieldLoop
AggregateRecordFinish:
            LD   A,(AggregateCurrentFieldCount)
            OR   A
            JR   Z,AggregateRecordEmptyFailure
            CALL ParserTake
            RET  C
            CALL ParserExpectLine
            RET  C
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
.if AggregateCallSlices
            JP   Stage7ParseTopLevel
.else
            JP   TypedParseTopLevel
.endif
AggregateRecordEmptyFailure:
            LD   A,DiagnosticRecordEmpty
            JP   CompilerSetDiagnostic
.endif

AggregateInitializerCapacityFailure:
            LD   A,DiagnosticInitializerCapacity
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
AggregateInitializerLeave:
            LD   HL,AggregateInitializerDepth
            DEC  (HL)
            OR   A
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
AggregateWriteByte:
            LD   B,A
            LD   HL,(AggregateCurrentObjectOffset)
            LD   DE,AggregateInitializerBase
            ADD  HL,DE
            LD   A,B
            LD   (HL),A
            LD   HL,(AggregateCurrentObjectOffset)
            INC  HL
            LD   (AggregateCurrentObjectOffset),HL
            OR   A
            RET

; Decode the already tokenized string literal directly from resident source.
; B is the fixed capacity. The enclosing object is already zeroed, so the
; final cursor advances over padding without rewriting it.
.routine in B out A,B,carry,zero clobbers sign,parity,halfCarry,C,D,DE,HL
AggregateDecodeString:
            LD   A,(TokenLength)
            LD   C,A
            PUSH BC
            CALL AggregateWriteByte
            POP  BC
            RET  C
            LD   A,B
            SUB  C
            LD   B,A
            LD   HL,(TokenLexemePointer)
            INC  HL
AggregateDecodeStringLoop:
            LD   A,C
            OR   A
            JR   Z,AggregateDecodeStringAdvancePadding
            LD   A,(HL)
            INC  HL
            CP   "\\"
            JR   NZ,AggregateDecodeStringWrite
            LD   A,(HL)
            INC  HL
            CP   "x"
            JR   Z,AggregateDecodeStringHex
            CP   "0"
            JR   Z,AggregateDecodeStringZero
            CP   "n"
            JR   Z,AggregateDecodeStringNewline
            CP   "r"
            JR   Z,AggregateDecodeStringReturn
            CP   "t"
            JR   Z,AggregateDecodeStringTab
            JR   AggregateDecodeStringWrite
AggregateDecodeStringHex:
            LD   A,(HL)
            INC  HL
            CALL TokenIsHexDigit
            ADD  A,A
            ADD  A,A
            ADD  A,A
            ADD  A,A
            LD   D,A
            LD   A,(HL)
            INC  HL
            CALL TokenIsHexDigit
            OR   D
            JR   AggregateDecodeStringWrite
AggregateDecodeStringZero:
            XOR  A
            JR   AggregateDecodeStringWrite
AggregateDecodeStringNewline:
            LD   A,10
            JR   AggregateDecodeStringWrite
AggregateDecodeStringReturn:
            LD   A,13
            JR   AggregateDecodeStringWrite
AggregateDecodeStringTab:
            LD   A,9
AggregateDecodeStringWrite:
            PUSH BC
            PUSH HL
            CALL AggregateWriteByte
            POP  HL
            POP  BC
            RET  C
            DEC  C
            JR   AggregateDecodeStringLoop
AggregateDecodeStringAdvancePadding:
            LD   E,B
            LD   D,0
            INC  DE                      ; permanent terminator at capacity+1
            LD   HL,(AggregateCurrentObjectOffset)
            ADD  HL,DE
            LD   (AggregateCurrentObjectOffset),HL
            OR   A
            RET

AggregateInitializerShapeFailure:
            LD   A,DiagnosticInitializerShape
            JP   CompilerSetDiagnostic
AggregateInitializerCountFailure:
            LD   A,DiagnosticInitializerCount
            JP   CompilerSetDiagnostic

.routine out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL
AggregatePeekPreserveBC:
            PUSH BC
            CALL ParserPeek
            POP  BC
            RET

.routine out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL
AggregateTakePreserveBC:
            PUSH BC
            CALL ParserTake
            POP  BC
            RET

.routine in A,BC,zero out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL
AggregateExpectCommaPreserveBC:
            JR   Z,AggregateInitializerCountFailure
            CP   TokenComma
            JR   NZ,AggregateInitializerShapeFailure
            JR   AggregateTakePreserveBC

; Parse one type-directed static initializer at the current image cursor.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
AggregateParseInitializer:
            CP   AggregateFirstDynamicTypeId
            JR   C,AggregateParseScalarInitializer
            PUSH AF
            CALL AggregateTypeAddress
            LD   A,(HL)
            POP  DE
            LD   E,D
            LD   D,0
            CP   AggregateTypeKindString
            JR   Z,AggregateParseStringInitializer
            CP   AggregateTypeKindRecord
            JR   Z,AggregateParseRecordInitializer
            CP   AggregateTypeKindArray
            JP   Z,AggregateParseArrayInitializer
            JR   AggregateInitializerShapeFailure

AggregateParseScalarInitializer:
            LD   E,A
            PUSH DE
            CALL TypedExpressionBeginConstant
            POP  DE
            RET  C
            CALL TypedCheckAssignable
            RET  C
            AND  ScalarMetaConstant
            JP   Z,TypedTypeFailure
            LD   A,L
            PUSH DE
            PUSH HL
            CALL AggregateWriteByte
            POP  HL
            POP  DE
            RET  C
            LD   A,E
            CP   AggregateTypeIdU16
            JR   Z,AggregateParseScalarU16High
            OR   A
            RET
AggregateParseScalarU16High:
            LD   A,H
            JP   AggregateWriteByte

AggregateParseStringInitializer:
            EX   DE,HL
            LD   A,L
            CALL AggregateTypeAddress
            INC  HL
            LD   B,(HL)
            PUSH BC
            LD   E,TokenStringLiteral
            CALL ParserExpect
            POP  BC
            RET  C
            LD   A,(TokenLength)
            CP   B
            JR   C,AggregateParseStringDecode
            JR   Z,AggregateParseStringDecode
            LD   A,DiagnosticStringLength
            JP   CompilerSetDiagnostic
AggregateParseStringDecode:
            ; AggregateZeroCurrentObject already defined the complete object,
            ; so decoding need only overwrite the length and payload bytes.
            JP   AggregateDecodeString

.routine in A,BC out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL
AggregateBeginCompositeInitializer:
            PUSH AF
            CALL AggregatePeekPreserveBC
            POP  DE
            RET  C
            CP   D
            JP   NZ,AggregateInitializerShapeFailure
            CALL AggregateTakePreserveBC
            RET  C
            LD   A,(AggregateInitializerDepth)
            CP   AggregateInitializerDepthCapacity
            JP   NC,AggregateInitializerCapacityFailure
            INC  A
            LD   (AggregateInitializerDepth),A
            OR   A
            RET

AggregateParseRecordInitializer:
            EX   DE,HL
            LD   A,L
            CALL AggregateTypeAddress
            INC  HL
            LD   A,(HL)
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,AggregateRecordTableBase
            ADD  HL,DE
            LD   B,(HL)
            INC  HL
            LD   C,(HL)
            LD   A,TokenLeftParen
            CALL AggregateBeginCompositeInitializer
            RET  C
AggregateRecordInitializerLoop:
            PUSH BC
            LD   A,B
            CALL AggregateFieldAddress
            INC  HL
            INC  HL
            INC  HL
            LD   A,(HL)
            CALL AggregateParseInitializer
            POP  BC
            RET  C
            INC  B
            DEC  C
            JR   Z,AggregateRecordInitializerExpectClose
            CALL AggregatePeekPreserveBC
            RET  C
            CP   TokenRightParen
            CALL AggregateExpectCommaPreserveBC
            RET  C
            JR   AggregateRecordInitializerLoop
AggregateRecordInitializerExpectClose:
            LD   BC,(TokenRightParen<<8)|TokenRightBracket
            JR   AggregateInitializerExpectClose

AggregateParseArrayInitializer:
            EX   DE,HL
            LD   A,L
            CALL AggregateTypeAddress
            INC  HL
            LD   C,(HL)
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            PUSH BC
            PUSH DE
            LD   A,TokenLeftBracket
            CALL AggregateBeginCompositeInitializer
            POP  DE
            POP  BC
            RET  C
AggregateArrayInitializerLoop:
            PUSH BC
            PUSH DE
            LD   A,C
            CALL AggregateParseInitializer
            POP  DE
            POP  BC
            RET  C
            DEC  DE
            LD   A,D
            OR   E
            JR   Z,AggregateArrayInitializerExpectClose
            PUSH DE
            CALL AggregatePeekPreserveBC
            POP  DE
            RET  C
            CP   TokenRightBracket
            PUSH DE
            CALL AggregateExpectCommaPreserveBC
            POP  DE
            RET  C
            JR   AggregateArrayInitializerLoop
AggregateArrayInitializerExpectClose:
            LD   BC,(TokenRightBracket<<8)|TokenRightParen

.routine in BC out A,BC,carry,zero clobbers sign,parity,halfCarry,D,DE,HL,IX,IY
AggregateInitializerExpectClose:
            CALL AggregatePeekPreserveBC
            RET  C
            CP   B
            JR   Z,AggregateInitializerTakeClose
            CP   C
            JP   Z,AggregateInitializerShapeFailure
            JP   AggregateInitializerCountFailure
AggregateInitializerTakeClose:
            CALL ParserTake
            RET  C
            JP   AggregateInitializerLeave

; Zero exactly the candidate object's complete extent before applying an
; explicit initializer. This also defines every byte of a zero initializer.
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL
AggregateZeroCurrentObject:
            LD   HL,(AggregateCurrentObjectOffset)
            LD   DE,AggregateInitializerBase
            ADD  HL,DE
            LD   BC,(AggregateCurrentObjectExtent)
AggregateZeroCurrentLoop:
            LD   A,B
            OR   C
            RET  Z
            XOR  A
            LD   (HL),A
            INC  HL
            DEC  BC
            JR   AggregateZeroCurrentLoop

; The current token is the program variable name.
.if HybridLL1Full
.else
.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
AggregateParseProgramAfterVar:
            CALL TypedRetainDeclarationName
            RET  C
            CALL ParserExpectAs
            RET  C
            CALL AggregateParseType
            RET  C
            LD   (AggregateCurrentTypeId),A
            CALL AggregateGetExtent
            LD   (AggregateCurrentObjectExtent),HL
            LD   DE,(StaticImageLength)
            LD   (AggregateCurrentObjectOffset),DE
            ADD  HL,DE
            JP   C,AggregateProgramDataCapacityFailure
            LD   A,H
            OR   A
            JP   NZ,AggregateProgramDataCapacityFailure
            LD   (AggregateCurrentObjectEnd),HL
            CALL AggregateZeroCurrentObject
            RET  C
            XOR  A
            LD   (AggregateInitializerDepth),A
            LD   (AggregateHasInitializer),A
            CALL ParserPeek
            RET  C
            CP   TokenEquals
            JR   NZ,AggregateProgramInitializerDone
            CALL ParserTake
            RET  C
            LD   HL,(StaticImageLength)
            LD   (AggregateCurrentObjectOffset),HL
            LD   A,(AggregateCurrentTypeId)
            LD   B,A
            PUSH BC
            CALL AggregateParseInitializer
            JR   C,AggregateProgramInitializerFailure
            POP  BC
            LD   A,1
            LD   (AggregateHasInitializer),A
            LD   A,B
            LD   (AggregateCurrentTypeId),A
            LD   HL,(AggregateCurrentObjectOffset)
            LD   DE,(AggregateCurrentObjectEnd)
            OR   A
            SBC  HL,DE
            JP   NZ,AggregateInitializerCountFailure
            JR   AggregateProgramInitializerDone
AggregateProgramInitializerFailure:
            POP  BC
            SCF
            RET
AggregateProgramInitializerDone:
            CALL ParserExpectLine
            RET  C
            LD   BC,(StaticImageLength)
            LD   A,(AggregateCurrentTypeId)
            CP   AggregateFirstDynamicTypeId
            JR   C,AggregateProgramScalarInfo
            LD   D,SymbolInfoAggregateProgram
            JR   AggregateProgramPrepareSymbol
AggregateProgramScalarInfo:
            OR   SymbolClassProgram
            LD   D,A
AggregateProgramPrepareSymbol:
            PUSH BC
            CALL TypedPrepareCurrentWord
            POP  BC
            RET  C
            LD   A,(SymbolCount)
            LD   E,A
            LD   D,0
            LD   HL,AggregateSymbolTypeBase
            ADD  HL,DE
            LD   A,(AggregateCurrentTypeId)
            LD   (HL),A
            CALL SymbolCommit
            RET  C
            LD   HL,(AggregateCurrentObjectEnd)
            LD   (StaticImageLength),HL
            LD   A,L
            LD   (NextProgramSlot),A
.if AggregateCallSlices
            JP   Stage7ParseTopLevel
.else
            JP   TypedParseTopLevel
.endif
.endif

; Dedicated Stage 6 compile entry. Historical slices keep AggregateMode clear;
; this entry makes the complete static-image path authoritative.
.if AggregateCallSlices
.else
            .routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
CompileAggregateSlice:
            CALL CompileSliceInitialize
            LD   A,1
            LD   (AggregateMode),A
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
