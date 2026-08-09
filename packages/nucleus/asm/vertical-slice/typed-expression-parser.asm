; Correctness-first typed scalar declarations and expressions.
;
; Expression results return metadata in A and, when constant, a value in HL.
; The low two metadata bits are ScalarType*, and ScalarMetaConstant marks an
; exact compile-time value. Runtime expressions are emitted as a checked
; postfix stream of 16-bit carriers; u8 and boolean carriers have a zero high
; byte. The declared type, not the carrier, controls width and compatibility.

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedRetainDeclarationName:
            LD   HL,(TokenLexemePointer)
            LD   (DeclarationNamePointer),HL
            LD   A,(TokenLength)
            LD   (DeclarationNameLength),A
            LD   HL,TokenStartOffset
            LD   DE,DeclarationNamePosition
            LD   BC,6
            LDIR
            OR   A
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedPrepareCurrentWord:
            LD   HL,(DeclarationNamePointer)
            LD   (TokenLexemePointer),HL
            LD   A,(DeclarationNameLength)
            LD   (TokenLength),A
            PUSH BC
            PUSH DE
            LD   HL,DeclarationNamePosition
            LD   DE,TokenStartOffset
            LD   BC,6
            LDIR
            POP  DE
            POP  BC
            JP   SymbolPrepareCurrentWord

; Expression-only sink wrappers allow the same parser to evaluate static
; constant initializers without emitting runtime operations.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedEmitOperation:
            LD   D,A
            LD   A,(ExpressionEmitEnabled)
            OR   A
            LD   A,D
            RET  Z
            JP   SemanticSinkOperation

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedEmitByte:
            LD   D,A
            LD   A,(ExpressionEmitEnabled)
            OR   A
            LD   A,D
            RET  Z
            JP   SemanticSinkPut

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedEmitWord:
            PUSH HL
            LD   A,L
            CALL TypedEmitByte
            POP  HL
            RET  C
            LD   A,H
            JP   TypedEmitByte

; Push one pending binary-expression context into the bounded compiler stack.
; Retaining the operator source offset is necessary because a nested operation
; may replace the global offset before the outer operation is reduced.
.routine in A out A,HL,carry,zero clobbers sign,parity,halfCarry,B,C,DE,IX,IY
TypedExpressionAddress:
            LD   E,A
            LD   D,0
            ADD  A,A
            ADD  A,A
            ADD  A,A
            SUB  E
            LD   E,A
            LD   HL,ExpressionStackBase
            ADD  HL,DE
            RET

TypedExpressionPush:
            LD   A,(ExpressionStackDepth)
            CP   ExpressionStackCapacity
            JR   NC,TypedExpressionStackFull
            LD   C,A
            LD   B,0
            CALL TypedExpressionAddress
            LD   A,(ExpressionLeftMeta)
            LD   (HL),A
            INC  HL
            LD   DE,(ExpressionLeftValue)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   A,(ExpressionSuppressFault)
            LD   (HL),A
            INC  HL
            LD   A,(ExpressionOperator)
            LD   (HL),A
            INC  HL
            LD   DE,(ExpressionOperatorOffset)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   A,(ExpressionStackDepth)
            INC  A
            LD   (ExpressionStackDepth),A
            OR   A
            RET
TypedExpressionStackFull:
            LD   A,DiagnosticExpressionCapacity
            JP   CompilerSetDiagnostic

; Store A/HL as the pending left result before pushing it.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedSaveLeft:
            LD   (ExpressionLeftMeta),A
            LD   (ExpressionLeftValue),HL
            JP   TypedExpressionPush

; Save the right result, then restore the most recent left result.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedRestoreOperands:
            LD   (ExpressionRightMeta),A
            LD   (ExpressionRightValue),HL
            ; Every reduction follows TypedSaveLeft. Keep the defensive test so
            ; a future parser change cannot turn a broken invariant into a
            ; wrapped address beyond CompilerWorkspaceEnd.
            LD   A,(ExpressionStackDepth)
            OR   A
            JR   Z,TypedExpressionStackUnderflow
            DEC  A
            LD   (ExpressionStackDepth),A
            LD   C,A
            CALL TypedExpressionAddress
            LD   A,(HL)
            LD   (ExpressionLeftMeta),A
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            LD   (ExpressionLeftValue),DE
            INC  HL
            LD   A,(HL)
            LD   (ExpressionSuppressFault),A
            INC  HL
            LD   A,(HL)
            LD   (ExpressionOperator),A
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            LD   (ExpressionOperatorOffset),DE
            OR   A
            RET
TypedExpressionStackUnderflow:
            LD   A,DiagnosticInternalOperation
            JP   CompilerSetDiagnostic

TypedRangeFailure:
            LD   A,DiagnosticIntegerRange
            JP   CompilerSetDiagnostic
TypedTypeFailure:
            LD   A,DiagnosticTypeMismatch
            JP   CompilerSetDiagnostic
TypedDivisionFailure:
            LD   B,C                     ; statically selected divide width
            LD   C,DiagnosticDivisionZero
            JR   TypedCheckedFault
TypedNarrowFailure:
            LD   B,ScalarTypeU8           ; u8(...) always has u8 result type
            LD   C,DiagnosticNarrowing
TypedCheckedFault:
            LD   A,(ExpressionSuppressFault)
            OR   A
            JR   NZ,TypedSuppressedFault
            LD   A,C
            JP   CompilerSetDiagnostic
TypedSuppressedFault:
            LD   A,B
            LD   HL,0
            OR   ScalarMetaConstant
            OR   A
            RET

; Resolve two integer operands. The four source metadata/value cells are live.
; C returns u8 or u16. Exact constants adopt the typed peer or expected type.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedResolveIntegerPair:
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JR   Z,TypedTypeFailure
            LD   D,A
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JR   Z,TypedTypeFailure
            LD   E,A
            LD   A,D
            OR   A
            JR   NZ,TypedResolveLeftTyped
            LD   A,E
            OR   A
            JR   NZ,TypedResolveUseRight
            LD   A,(ExpressionExpectedType)
            CP   ScalarTypeU8
            JR   Z,TypedResolveBothExactU8
            LD   C,ScalarTypeU16
            OR   A
            RET
TypedResolveBothExactU8:
            LD   HL,(ExpressionLeftValue)
            LD   A,H
            OR   A
            JR   NZ,TypedRangeFailure
            LD   HL,(ExpressionRightValue)
            LD   A,H
            OR   A
            JR   NZ,TypedRangeFailure
            LD   C,ScalarTypeU8
            OR   A
            RET
TypedResolveUseRight:
            LD   C,E
            CP   ScalarTypeU8
            JR   NZ,TypedResolveDone
            LD   HL,(ExpressionLeftValue)
            LD   A,H
            OR   A
            JR   NZ,TypedRangeFailure
TypedResolveDone:
            OR   A
            RET
TypedResolveLeftTyped:
            LD   A,E
            OR   A
            JR   NZ,TypedResolveBothTyped
            LD   C,D
            LD   A,D
            CP   ScalarTypeU8
            JR   NZ,TypedResolveDone
            LD   HL,(ExpressionRightValue)
            LD   A,H
            OR   A
            JP   NZ,TypedRangeFailure
            JR   TypedResolveDone
TypedResolveBothTyped:
            LD   A,D
            CP   ScalarTypeU16
            JR   Z,TypedResolveU16
            LD   A,E
            CP   ScalarTypeU16
            JR   Z,TypedResolveU16
            LD   C,ScalarTypeU8
            OR   A
            RET
TypedResolveU16:
            LD   C,ScalarTypeU16
            OR   A
            RET

; Return constant in A when both operands are constant.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedBothConstant:
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaConstant
            RET  Z
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaConstant
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedMaskResultWidth:
            LD   A,C
            CP   ScalarTypeU8
            RET  NZ
            LD   H,0
            RET

; Constant multiplication modulo 65536, using sixteen shift/add steps.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedConstantMultiply:
            LD   HL,(ExpressionLeftValue)
            LD   DE,(ExpressionRightValue)
            LD   BC,0
            LD   A,16
TypedConstantMultiplyLoop:
            SRL  D
            RR   E
            JR   NC,TypedConstantMultiplySkip
            PUSH HL
            ADD  HL,BC
            LD   B,H
            LD   C,L
            POP  HL
TypedConstantMultiplySkip:
            ADD  HL,HL
            DEC  A
            JR   NZ,TypedConstantMultiplyLoop
            LD   H,B
            LD   L,C
            RET

; Compile-time unsigned division. The bounded 16-bit domain makes the simple
; subtraction loop finite; the later size pass may replace it with a bitwise
; divider if measurements justify the added code.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedConstantDivide:
            LD   DE,(ExpressionRightValue)
            LD   A,D
            OR   E
            JP   Z,TypedDivisionFailure
            LD   HL,(ExpressionLeftValue)
            LD   BC,0
TypedConstantDivideLoop:
            OR   A
            SBC  HL,DE
            JR   C,TypedConstantDivideDone
            INC  BC
            JR   TypedConstantDivideLoop
TypedConstantDivideDone:
            ADD  HL,DE
            LD   H,B
            LD   L,C
            OR   A
            RET

; Emit a width-selected binary operation. D=u8 ordinal, E=u16 ordinal.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedEmitWidthOperation:
            LD   A,C
            CP   ScalarTypeU8
            LD   A,D
            JR   Z,TypedEmitWidthSelected
            LD   A,E
TypedEmitWidthSelected:
            JP   TypedEmitOperation

; Reduce +, -, *, /, integer and, or. ExpressionOperator holds the token.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedReduceIntegerBinary:
            CALL TypedResolveIntegerPair
            RET  C
            LD   A,(ExpressionOperator)
            CP   TokenPlus
            JR   Z,TypedReduceAdd
            CP   TokenMinus
            JR   Z,TypedReduceSubtract
            CP   TokenStar
            JR   Z,TypedReduceMultiply
            CP   TokenSlash
            JP   Z,TypedReduceDivide
            CP   TokenAnd
            JR   Z,TypedReduceAnd
TypedReduceOr:
            LD   D,SemanticOr8
            LD   E,SemanticOr16
            CALL TypedEmitWidthOperation
            RET  C
            CALL TypedBothConstant
            JP   Z,TypedReduceIntegerMeta
            LD   HL,(ExpressionLeftValue)
            LD   DE,(ExpressionRightValue)
            LD   A,L
            OR   E
            LD   L,A
            LD   A,H
            OR   D
            LD   H,A
            JP   TypedReduceIntegerConstantDone
TypedReduceAnd:
            LD   D,SemanticAnd8
            LD   E,SemanticAnd16
            CALL TypedEmitWidthOperation
            RET  C
            CALL TypedBothConstant
            JP   Z,TypedReduceIntegerMeta
            LD   HL,(ExpressionLeftValue)
            LD   DE,(ExpressionRightValue)
            LD   A,L
            AND  E
            LD   L,A
            LD   A,H
            AND  D
            LD   H,A
            JP   TypedReduceIntegerConstantDone
TypedReduceAdd:
            LD   D,SemanticAdd8
            LD   E,SemanticAdd16
            CALL TypedEmitWidthOperation
            RET  C
            CALL TypedBothConstant
            JR   Z,TypedReduceIntegerMeta
            LD   HL,(ExpressionLeftValue)
            LD   DE,(ExpressionRightValue)
            ADD  HL,DE
            JR   TypedReduceIntegerConstantDone
TypedReduceSubtract:
            LD   D,SemanticSubtract8
            LD   E,SemanticSubtract16
            CALL TypedEmitWidthOperation
            RET  C
            CALL TypedBothConstant
            JR   Z,TypedReduceIntegerMeta
            LD   HL,(ExpressionLeftValue)
            LD   DE,(ExpressionRightValue)
            OR   A
            SBC  HL,DE
            JR   TypedReduceIntegerConstantDone
TypedReduceMultiply:
            LD   D,SemanticMultiply8
            LD   E,SemanticMultiply16
            CALL TypedEmitWidthOperation
            RET  C
            CALL TypedBothConstant
            JR   Z,TypedReduceIntegerMeta
            CALL TypedConstantMultiply
            JR   TypedReduceIntegerConstantDone
TypedReduceDivide:
            LD   D,SemanticDivide8
            LD   E,SemanticDivide16
            CALL TypedEmitWidthOperation
            RET  C
            LD   HL,(ExpressionOperatorOffset)
            CALL TypedEmitWord
            RET  C
            ; A divisor known to be zero is invalid even when the dividend is
            ; dynamic. The fault helper also implements constant short-circuit
            ; suppression, so the unevaluated Boolean arm remains admissible.
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaConstant
            JR   Z,TypedReduceDivideFold
            LD   HL,(ExpressionRightValue)
            LD   A,H
            OR   L
            JP   Z,TypedDivisionFailure
TypedReduceDivideFold:
            CALL TypedBothConstant
            JR   Z,TypedReduceIntegerMeta
            CALL TypedConstantDivide
            RET  C
TypedReduceIntegerConstantDone:
            CALL TypedMaskResultWidth
            LD   A,C
            OR   ScalarMetaConstant
            OR   A
            RET
TypedReduceIntegerMeta:
            LD   A,C
            OR   A
            RET

; Primary expressions.
TypedParsePrimary:
            CALL ParserTake
            RET  C
            CP   TokenNumber
            JR   Z,TypedPrimaryNumber
            CP   TokenCharacter
            JR   Z,TypedPrimaryCharacter
            CP   TokenTrue
            JR   Z,TypedPrimaryTrue
            CP   TokenFalse
            JR   Z,TypedPrimaryFalse
            CP   TokenName
            JR   Z,TypedPrimaryName
            CP   TokenLeftParen
            JP   Z,TypedPrimaryParen
            CP   TokenU8
            JP   Z,TypedPrimaryNarrow
            CP   TokenU16
            JP   Z,TypedPrimaryWiden
            JP   ParserExpectedScalar
TypedPrimaryNumber:
            LD   H,B
            LD   L,C
            PUSH HL
            LD   A,SemanticLiteral16
            CALL TypedEmitOperation
            POP  HL
            RET  C
            PUSH HL
            CALL TypedEmitWord
            POP  HL
            RET  C
            LD   A,ScalarMetaConstant+ScalarTypeExact
            OR   A
            RET
TypedPrimaryCharacter:
            LD   H,0
            LD   L,C
            JR   TypedPrimaryU8Constant
TypedPrimaryTrue:
            LD   HL,1
            JR   TypedPrimaryBooleanConstant
TypedPrimaryFalse:
            LD   HL,0
TypedPrimaryBooleanConstant:
            PUSH HL
            LD   A,SemanticLiteral16
            CALL TypedEmitOperation
            POP  HL
            RET  C
            PUSH HL
            CALL TypedEmitWord
            POP  HL
            RET  C
            LD   A,ScalarMetaConstant+ScalarTypeBoolean
            OR   A
            RET
TypedPrimaryU8Constant:
            PUSH HL
            LD   A,SemanticLiteral16
            CALL TypedEmitOperation
            POP  HL
            RET  C
            PUSH HL
            CALL TypedEmitWord
            POP  HL
            RET  C
            LD   A,ScalarMetaConstant+ScalarTypeU8
            OR   A
            RET
TypedPrimaryName:
            CALL SymbolLookupCurrent
            RET  C
            LD   D,A
            AND  SymbolClassMask
            JR   Z,TypedPrimaryConstantName
            LD   A,D
            AND  ScalarMetaTypeMask
            LD   E,A
            LD   A,D
            AND  SymbolClassMask
            CP   SymbolClassProgram
            JR   Z,TypedPrimaryProgramName
            LD   A,E
            CP   ScalarTypeU16
            LD   A,SemanticLoadLocalU8
            JR   NZ,TypedPrimaryEmitLoad
            LD   A,SemanticLoadLocal16
            JR   TypedPrimaryEmitLoad
TypedPrimaryProgramName:
            LD   A,E
            CP   ScalarTypeU16
            LD   A,SemanticLoadProgramU8
            JR   NZ,TypedPrimaryEmitLoad
            LD   A,SemanticLoadProgram16
TypedPrimaryEmitLoad:
            PUSH DE
            PUSH BC
            CALL TypedEmitOperation
            POP  BC
            POP  DE
            RET  C
            LD   A,C
            PUSH DE
            CALL TypedEmitByte
            POP  DE
            RET  C
            LD   A,E
            OR   A
            RET
TypedPrimaryConstantName:
            LD   H,B
            LD   L,C
            PUSH DE
            PUSH HL
            LD   A,SemanticLiteral16
            CALL TypedEmitOperation
            POP  HL
            RET  C
            PUSH HL
            CALL TypedEmitWord
            POP  HL
            POP  DE
            RET  C
            LD   A,D
            AND  ScalarMetaTypeMask
            OR   ScalarMetaConstant
            OR   A
            RET
TypedPrimaryParen:
            CALL TypedParseOr
            RET  C
            PUSH AF
            PUSH HL
            CALL ParserExpectRight
            JR   C,TypedPrimaryParenFailure
            POP  HL
            POP  AF
            RET
TypedPrimaryParenFailure:
            POP  HL
            POP  AF
            SCF
            RET

; Parse the parenthesized operand of an explicit conversion under the
; conversion's own expected type. The enclosing expected type is restored on
; every exit; A/HL return the checked operand on success.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseConversionOperand:
            LD   C,A
            LD   A,(ExpressionExpectedType)
            LD   B,A
            PUSH BC
            LD   A,C
            LD   (ExpressionExpectedType),A
            CALL ParserExpectLeft
            JR   C,TypedParseConversionFailure
            CALL TypedParseOr
            JR   C,TypedParseConversionFailure
            LD   D,A
            PUSH DE
            PUSH HL
            CALL ParserExpectRight
            JR   C,TypedParseConversionRightFailure
            POP  HL
            POP  DE
            POP  BC
            LD   A,B
            LD   (ExpressionExpectedType),A
            LD   A,D
            OR   A
            RET
TypedParseConversionRightFailure:
            POP  HL
            POP  DE
TypedParseConversionFailure:
            POP  BC
            LD   A,B
            LD   (ExpressionExpectedType),A
            SCF
            RET

TypedPrimaryNarrow:
            LD   HL,(TokenStartOffset)
            LD   (ExpressionOperatorOffset),HL
            PUSH HL                       ; this conversion's trap position
            LD   A,ScalarTypeU8
            CALL TypedParseConversionOperand
            JR   C,TypedPrimaryNarrowContextFailure
            ; Restore the enclosing context while keeping this conversion's
            ; value and source offset live for the checked narrowing below.
            LD   D,A
            LD   B,H
            LD   C,L
            POP  HL
            LD   (ExpressionOperatorOffset),HL
            LD   H,B
            LD   L,C
            LD   A,D
            LD   D,A
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   Z,TypedTypeFailure
            LD   A,D
            AND  ScalarMetaConstant
            JR   Z,TypedPrimaryDynamicNarrow
            LD   A,H
            OR   A
            JP   NZ,TypedNarrowFailure
            LD   A,ScalarMetaConstant+ScalarTypeU8
            OR   A
            RET
TypedPrimaryDynamicNarrow:
            LD   A,SemanticNarrowU8
            CALL TypedEmitOperation
            RET  C
            LD   HL,(ExpressionOperatorOffset)
            CALL TypedEmitWord
            RET  C
            LD   A,ScalarTypeU8
            OR   A
            RET
TypedPrimaryNarrowContextFailure:
            POP  HL
            SCF
            RET
TypedPrimaryWiden:
            LD   A,ScalarTypeU16
            CALL TypedParseConversionOperand
            RET  C
            LD   D,A
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   Z,TypedTypeFailure
            LD   A,D
            AND  ScalarMetaConstant
            LD   A,ScalarTypeU16
            RET  Z
            OR   ScalarMetaConstant
            RET

; Unary + and - bind above multiplicative operators.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseUnary:
            CALL ParserPeek
            RET  C
            CP   TokenPlus
            JR   Z,TypedUnaryPlus
            CP   TokenMinus
            JR   Z,TypedUnaryMinus
            JP   TypedParsePrimary
TypedUnaryPlus:
            CALL ParserTake
            RET  C
            CALL TypedParseUnary
            RET  C
            LD   D,A
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   Z,TypedTypeFailure
            LD   A,D
            OR   A
            RET
TypedUnaryMinus:
            CALL ParserTake
            RET  C
            CALL TypedParseUnary
            RET  C
            LD   D,A
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   Z,TypedTypeFailure
            OR   A
            JR   NZ,TypedUnaryMinusTyped
            LD   A,(ExpressionExpectedType)
            CP   ScalarTypeU8
            JR   Z,TypedUnaryMinusU8
            LD   A,ScalarTypeU16
            JR   TypedUnaryMinusResolved
TypedUnaryMinusTyped:
            LD   A,D
            AND  ScalarMetaTypeMask
TypedUnaryMinusResolved:
            LD   C,A
            CP   ScalarTypeU8
            LD   A,SemanticNegate8
            JR   Z,TypedUnaryMinusEmit
            LD   A,SemanticNegate16
TypedUnaryMinusEmit:
            PUSH BC
            PUSH DE
            PUSH HL
            CALL TypedEmitOperation
            POP  HL
            POP  DE
            POP  BC
            RET  C
            LD   A,D
            AND  ScalarMetaConstant
            LD   A,C
            RET  Z
            XOR  A
            SUB  L
            LD   L,A
            LD   A,0
            SBC  A,H
            LD   H,A
            CALL TypedMaskResultWidth
            LD   A,C
            OR   ScalarMetaConstant
            RET
TypedUnaryMinusU8:
            ; Width selection must not destroy evidence that the exact literal
            ; itself exceeded u8 before negation applies modulo 256.
            LD   A,D
            AND  ScalarMetaConstant
            JR   Z,TypedUnaryMinusU8Ready
            LD   A,H
            OR   A
            JP   NZ,TypedRangeFailure
TypedUnaryMinusU8Ready:
            LD   A,ScalarTypeU8
            JR   TypedUnaryMinusResolved

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseMultiplicative:
            CALL TypedParseUnary
            RET  C
TypedMultiplicativeLoop:
            PUSH AF
            PUSH HL
            CALL ParserPeek
            JR   C,TypedMultiplicativePeekFailure
            CP   TokenStar
            JR   Z,TypedMultiplicativeOperator
            CP   TokenSlash
            JR   NZ,TypedMultiplicativeDone
TypedMultiplicativeOperator:
            LD   (ExpressionOperator),A
            CALL ParserTake
            JR   C,TypedMultiplicativePeekFailure
            LD   HL,(TokenStartOffset)
            LD   (ExpressionOperatorOffset),HL
            POP  HL
            POP  AF
            CALL TypedSaveLeft
            RET  C
            CALL TypedParseUnary
            RET  C
            CALL TypedRestoreOperands
            RET  C
            CALL TypedReduceIntegerBinary
            RET  C
            JR   TypedMultiplicativeLoop
TypedMultiplicativeDone:
            POP  HL
            POP  AF
            RET
TypedMultiplicativePeekFailure:
            POP  HL
            POP  AF
            SCF
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseAdditive:
            CALL TypedParseMultiplicative
            RET  C
TypedAdditiveLoop:
            PUSH AF
            PUSH HL
            CALL ParserPeek
            JR   C,TypedAdditivePeekFailure
            CP   TokenPlus
            JR   Z,TypedAdditiveOperator
            CP   TokenMinus
            JR   NZ,TypedAdditiveDone
TypedAdditiveOperator:
            LD   (ExpressionOperator),A
            CALL ParserTake
            JR   C,TypedAdditivePeekFailure
            POP  HL
            POP  AF
            CALL TypedSaveLeft
            RET  C
            CALL TypedParseMultiplicative
            RET  C
            CALL TypedRestoreOperands
            RET  C
            CALL TypedReduceIntegerBinary
            RET  C
            JR   TypedAdditiveLoop
TypedAdditiveDone:
            POP  HL
            POP  AF
            RET
TypedAdditivePeekFailure:
            POP  HL
            POP  AF
            SCF
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedComparisonToken:
            CP   TokenEquals
            JR   Z,TypedComparisonEqual
            CP   TokenNotEqual
            JR   Z,TypedComparisonNotEqual
            CP   TokenLess
            JR   Z,TypedComparisonLess
            CP   TokenLessEqual
            JR   Z,TypedComparisonLessEqual
            CP   TokenGreater
            JR   Z,TypedComparisonGreater
            CP   TokenGreaterEqual
            JR   Z,TypedComparisonGreaterEqualYes
            OR   A
            RET
TypedComparisonGreaterEqualYes:
            LD   C,ComparisonGreaterEqual
            SCF
            RET
TypedComparisonEqual:        LD C,ComparisonEqual
                             SCF
                             RET
TypedComparisonNotEqual:     LD C,ComparisonNotEqual
                             SCF
                             RET
TypedComparisonLess:         LD C,ComparisonLess
                             SCF
                             RET
TypedComparisonLessEqual:    LD C,ComparisonLessEqual
                             SCF
                             RET
TypedComparisonGreater:      LD C,ComparisonGreater
                             SCF
                             RET

TypedParseComparison:
            CALL TypedParseAdditive
            RET  C
            PUSH AF
            PUSH HL
            CALL ParserPeek
            JR   C,TypedComparisonStackFailure
            CALL TypedComparisonToken
            JR   NC,TypedComparisonNone
            LD   A,C
            LD   (ExpressionOperator),A
            CALL ParserTake
            JR   C,TypedComparisonStackFailure
            POP  HL
            POP  AF
            CALL TypedSaveLeft
            RET  C
            CALL TypedParseAdditive
            RET  C
            CALL TypedRestoreOperands
            RET  C
            CALL TypedReduceComparison
            RET  C
            PUSH AF
            PUSH HL
            CALL ParserPeek
            JR   C,TypedComparisonStackFailure
            CALL TypedComparisonToken
            JR   C,TypedComparisonChained
            POP  HL
            POP  AF
            RET
TypedComparisonNone:
            POP  HL
            POP  AF
            RET
TypedComparisonStackFailure:
            POP  HL
            POP  AF
            SCF
            RET
TypedComparisonChained:
            POP  HL
            POP  AF
            LD   A,DiagnosticComparisonChain
            JP   CompilerSetDiagnostic
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedReduceComparison:
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaTypeMask
            LD   D,A
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaTypeMask
            LD   E,A
            LD   A,D
            CP   ScalarTypeBoolean
            JR   NZ,TypedComparisonInteger
            LD   A,E
            CP   ScalarTypeBoolean
            JP   NZ,TypedTypeFailure
            LD   A,(ExpressionOperator)
            CP   ComparisonNotEqual+1
            JP   NC,TypedTypeFailure
            LD   A,SemanticCompareBoolean
            JR   TypedComparisonEmit
TypedComparisonInteger:
            CALL TypedResolveIntegerPair
            RET  C
            LD   A,C
            CP   ScalarTypeU8
            LD   A,SemanticCompare8
            JR   Z,TypedComparisonEmit
            LD   A,SemanticCompare16
TypedComparisonEmit:
            CALL TypedEmitOperation
            RET  C
            LD   A,(ExpressionOperator)
            CALL TypedEmitByte
            RET  C
            CALL TypedBothConstant
            LD   A,ScalarTypeBoolean
            RET  Z
            LD   HL,(ExpressionLeftValue)
            LD   DE,(ExpressionRightValue)
            OR   A
            SBC  HL,DE
            LD   A,(ExpressionOperator)
            JR   Z,TypedComparisonWasEqual
            JR   C,TypedComparisonWasLess
            LD   C,1
            JR   TypedComparisonSelect
TypedComparisonWasEqual:
            LD   C,0
            JR   TypedComparisonSelect
TypedComparisonWasLess:
            LD   C,$FF
TypedComparisonSelect:
            ; C is -1, 0, or 1. Map the requested relation to a Boolean.
            LD   B,A
            LD   HL,0
            LD   A,B
            CP   ComparisonEqual
            JR   Z,TypedComparisonSelectEqual
            CP   ComparisonNotEqual
            JR   Z,TypedComparisonSelectNotEqual
            CP   ComparisonLess
            JR   Z,TypedComparisonSelectLess
            CP   ComparisonLessEqual
            JR   Z,TypedComparisonSelectLessEqual
            CP   ComparisonGreater
            JR   Z,TypedComparisonSelectGreater
            LD   A,C
            CP   $FF
            JR   Z,TypedComparisonConstantDone
            INC  L
            JR   TypedComparisonConstantDone
TypedComparisonSelectEqual:
            LD   A,C
            OR   A
            JR   NZ,TypedComparisonConstantDone
            INC  L
            JR   TypedComparisonConstantDone
TypedComparisonSelectNotEqual:
            LD   A,C
            OR   A
            JR   Z,TypedComparisonConstantDone
            INC  L
            JR   TypedComparisonConstantDone
TypedComparisonSelectLess:
            LD   A,C
            CP   $FF
            JR   NZ,TypedComparisonConstantDone
            INC  L
            JR   TypedComparisonConstantDone
TypedComparisonSelectLessEqual:
            LD   A,C
            CP   1
            JR   Z,TypedComparisonConstantDone
            INC  L
            JR   TypedComparisonConstantDone
TypedComparisonSelectGreater:
            LD   A,C
            CP   1
            JR   NZ,TypedComparisonConstantDone
            INC  L
TypedComparisonConstantDone:
            LD   A,ScalarMetaConstant+ScalarTypeBoolean
            OR   A
            RET

; `not` binds below comparisons and above `and`.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseNot:
            CALL ParserPeek
            RET  C
            CP   TokenNot
            JP   NZ,TypedParseComparison
            CALL ParserTake
            RET  C
            CALL TypedParseNot
            RET  C
            LD   D,A
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            LD   C,ScalarTypeBoolean
            LD   A,SemanticNotBoolean
            JR   Z,TypedNotEmit
            LD   A,D
            AND  ScalarMetaTypeMask
            OR   A
            JR   NZ,TypedNotTypedInteger
            LD   A,(ExpressionExpectedType)
            CP   ScalarTypeU8
            JR   Z,TypedNotExactU8
            LD   C,ScalarTypeU16
            LD   A,SemanticNot16
            JR   TypedNotEmit
TypedNotExactU8:
            ; As with unary minus, validate the exact operand before applying
            ; the width-specific complement and masking the result.
            LD   A,D
            AND  ScalarMetaConstant
            JR   Z,TypedNotExactU8Ready
            LD   A,H
            OR   A
            JP   NZ,TypedRangeFailure
TypedNotExactU8Ready:
            LD   C,ScalarTypeU8
            LD   A,SemanticNot8
            JR   TypedNotEmit
TypedNotTypedInteger:
            LD   A,D
            AND  ScalarMetaTypeMask
            LD   C,A
            CP   ScalarTypeU8
            LD   A,SemanticNot8
            JR   Z,TypedNotEmit
            LD   A,SemanticNot16
TypedNotEmit:
            PUSH BC
            PUSH DE
            PUSH HL
            CALL TypedEmitOperation
            POP  HL
            POP  DE
            POP  BC
            RET  C
            LD   A,D
            AND  ScalarMetaConstant
            LD   A,C
            RET  Z
            CP   ScalarTypeBoolean
            JR   NZ,TypedNotIntegerConstant
            LD   A,L
            XOR  1
            LD   L,A
            LD   H,0
            JR   TypedNotConstantDone
TypedNotIntegerConstant:
            LD   A,L
            CPL
            LD   L,A
            LD   A,H
            CPL
            LD   H,A
            CALL TypedMaskResultWidth
TypedNotConstantDone:
            LD   A,C
            OR   ScalarMetaConstant
            RET

; Boolean short circuit is represented by prefix/suffix operations so the
; native backend can branch around the right operand. Integer and/or use the
; ordinary postfix reduction.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseAnd:
            CALL TypedParseNot
            RET  C
TypedAndLoop:
            PUSH AF
            PUSH HL
            CALL ParserPeek
            JP   C,TypedBooleanPeekFailure
            CP   TokenAnd
            JP   NZ,TypedBooleanDone
            LD   (ExpressionOperator),A
            CALL ParserTake
            JR   C,TypedBooleanPeekFailure
            POP  HL
            POP  AF
            CALL TypedSaveLeft
            RET  C
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JR   NZ,TypedAndParseRight
            LD   A,SemanticBeginBooleanAnd
            CALL TypedEmitOperation
            RET  C
            CALL TypedBeginSuppressionIfFalse
TypedAndParseRight:
            CALL TypedParseNot
            RET  C
            CALL TypedRestoreOperands
            RET  C
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JR   NZ,TypedAndInteger
            CALL TypedReduceBoolean
            RET  C
            JR   TypedAndLoop
TypedAndInteger:
            CALL TypedReduceIntegerBinary
            RET  C
            JR   TypedAndLoop

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseOr:
            CALL TypedParseAnd
            RET  C
TypedOrLoop:
            PUSH AF
            PUSH HL
            CALL ParserPeek
            JR   C,TypedBooleanPeekFailure
            CP   TokenOr
            JR   NZ,TypedBooleanDone
            LD   (ExpressionOperator),A
            CALL ParserTake
            JR   C,TypedBooleanPeekFailure
            POP  HL
            POP  AF
            CALL TypedSaveLeft
            RET  C
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JR   NZ,TypedOrParseRight
            LD   A,SemanticBeginBooleanOr
            CALL TypedEmitOperation
            RET  C
            CALL TypedBeginSuppressionIfTrue
TypedOrParseRight:
            CALL TypedParseAnd
            RET  C
            CALL TypedRestoreOperands
            RET  C
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JR   NZ,TypedOrInteger
            CALL TypedReduceBoolean
            RET  C
            JR   TypedOrLoop
TypedBooleanDone:
            POP  HL
            POP  AF
            RET
TypedBooleanPeekFailure:
            POP  HL
            POP  AF
            SCF
            RET
TypedOrInteger:
            CALL TypedReduceIntegerBinary
            RET  C
            JR   TypedOrLoop

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedBeginSuppressionIfFalse:
            LD   C,0
            JR   TypedBeginSuppression
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedBeginSuppressionIfTrue:
            LD   C,1
TypedBeginSuppression:
            LD   A,(ExpressionLeftMeta)
            AND  ScalarMetaConstant
            RET  Z
            LD   HL,(ExpressionLeftValue)
            LD   A,L
            CP   C
            RET  NZ
            LD   HL,ExpressionSuppressFault
            INC  (HL)
            RET
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedReduceBoolean:
            LD   A,(ExpressionRightMeta)
            AND  ScalarMetaTypeMask
            CP   ScalarTypeBoolean
            JP   NZ,TypedTypeFailure
            LD   A,SemanticEndBoolean
            CALL TypedEmitOperation
            RET  C
            CALL TypedBothConstant
            LD   A,ScalarTypeBoolean
            RET  Z
            LD   HL,(ExpressionLeftValue)
            LD   A,L
            OR   H
            LD   C,A
            LD   A,(ExpressionOperator)
            CP   TokenAnd
            JR   Z,TypedBooleanAndSelect
            LD   A,C
            OR   A
            JR   NZ,TypedBooleanTrue
            JR   TypedBooleanRight
TypedBooleanAndSelect:
            LD   A,C
            OR   A
            JR   Z,TypedBooleanFalse
TypedBooleanRight:
            LD   HL,(ExpressionRightValue)
            JR   TypedBooleanConstant
TypedBooleanFalse:
            LD   HL,0
            JR   TypedBooleanConstant
TypedBooleanTrue:
            LD   HL,1
TypedBooleanConstant:
            LD   A,ScalarMetaConstant+ScalarTypeBoolean
            OR   A
            RET

; Assignment compatibility resolves exact constants and the sole implicit
; widening. A/HL is the expression; E is the destination type.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedCheckAssignable:
            LD   D,A
            AND  ScalarMetaTypeMask
            OR   A
            JR   NZ,TypedAssignableTyped
            LD   A,E
            CP   ScalarTypeBoolean
            JP   Z,TypedTypeFailure
            CP   ScalarTypeU8
            JR   NZ,TypedAssignableExactDone
            LD   A,H
            OR   A
            JP   NZ,TypedRangeFailure
TypedAssignableExactDone:
            LD   A,D
            AND  ScalarMetaConstant
            OR   E
            RET
TypedAssignableTyped:
            CP   E
            JR   Z,TypedAssignableSame
            CP   ScalarTypeU8
            JP   NZ,TypedTypeFailure
            LD   A,E
            CP   ScalarTypeU16
            JP   NZ,TypedTypeFailure
TypedAssignableSame:
            LD   A,D
            AND  ScalarMetaConstant
            OR   E
            RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedExpressionBeginRuntime:
            LD   (ExpressionExpectedType),A
            LD   A,1
            LD   (ExpressionEmitEnabled),A
            XOR  A
            LD   (ExpressionSuppressFault),A
            LD   (ExpressionStackDepth),A
            JP   TypedParseOr
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedExpressionBeginConstant:
            LD   (ExpressionExpectedType),A
            XOR  A
            LD   (ExpressionEmitEnabled),A
            LD   (ExpressionSuppressFault),A
            LD   (ExpressionStackDepth),A
            JP   TypedParseOr

; Parse u8, u16, or boolean and return ScalarType* in A.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseType:
            CALL ParserTake
            RET  C
            CP   TokenU8
            JR   Z,TypedTypeU8
            CP   TokenU16
            JR   Z,TypedTypeU16
            CP   TokenBoolean
            JR   Z,TypedTypeBoolean
            LD   A,DiagnosticExpectedType
            JP   CompilerSetDiagnostic
TypedTypeU8:       LD A,ScalarTypeU8
                   OR A
                   RET
TypedTypeU16:      LD A,ScalarTypeU16
                   OR A
                   RET
TypedTypeBoolean:  LD A,ScalarTypeBoolean
                   OR A
                   RET

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedTypeWidth:
            CP   ScalarTypeU16
            LD   A,1
            RET  NZ
            INC  A
            RET

; Emit a typed static program object. D=type, BC=offset, HL=value.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedEmitProgramDefinition:
            LD   A,D
            CP   ScalarTypeU16
            LD   A,SemanticDefineProgramU8
            JR   NZ,TypedEmitProgramDefinitionOp
            LD   A,SemanticDefineProgram16
TypedEmitProgramDefinitionOp:
            PUSH BC
            PUSH DE
            PUSH HL
            CALL SemanticSinkOperation
            POP  HL
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            PUSH HL
            LD   A,C
            CALL SemanticSinkPut
            POP  HL
            POP  DE
            POP  BC
            RET  C
            PUSH DE
            PUSH HL
            LD   A,L
            CALL SemanticSinkPut
            POP  HL
            POP  DE
            RET  C
            LD   A,D
            CP   ScalarTypeU16
            JR   Z,TypedEmitProgramDefinitionHigh
            OR   A
            RET
TypedEmitProgramDefinitionHigh:
            LD   A,H
            JP   SemanticSinkPut

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseConstantAfterName:
            CALL TypedRetainDeclarationName
            CALL ParserExpectAs
            RET  C
            CALL TypedParseType
            RET  C
            LD   (DeclarationInfo),A
            CALL ParserExpectEqual
            RET  C
            LD   A,(DeclarationInfo)
            CALL TypedExpressionBeginConstant
            RET  C
            LD   D,A
            LD   A,(DeclarationInfo)
            LD   E,A
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            AND  ScalarMetaConstant
            JP   Z,TypedTypeFailure
            LD   (DeclarationPayload),HL
            CALL ParserExpectLine
            RET  C
            LD   A,(DeclarationInfo)
            OR   SymbolClassConstant
            LD   D,A
            LD   BC,(DeclarationPayload)
            CALL TypedPrepareCurrentWord
            RET  C
            JP   SymbolCommit

; Current token is the variable name.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseProgramAfterVar:
            CALL TypedRetainDeclarationName
            CALL ParserExpectAs
            RET  C
            CALL TypedParseType
            RET  C
            LD   (DeclarationInfo),A
            ; Preserve the legacy initialized-array proof behind u8[...].
            CP   ScalarTypeU8
            JR   NZ,TypedProgramScalar
            CALL ParserPeek
            RET  C
            CP   TokenLeftBracket
            JR   NZ,TypedProgramScalar
            LD   A,(NextProgramSlot)
            LD   C,A
            LD   B,0
            LD   D,SymbolInfoProgramU8
            CALL TypedPrepareCurrentWord
            RET  C
            JP   ParserParseArrayProgramAfterU8
TypedProgramScalar:
            CALL ParserPeek
            RET  C
            CP   TokenEquals
            JR   Z,TypedProgramExplicit
            LD   HL,0
            LD   A,(DeclarationInfo)
            OR   ScalarMetaConstant
            JR   TypedProgramHaveExpression
TypedProgramExplicit:
            CALL ParserTake
            RET  C
            LD   A,(DeclarationInfo)
            CALL TypedExpressionBeginConstant
            RET  C
TypedProgramHaveExpression:
            LD   D,A
            LD   A,(DeclarationInfo)
            LD   E,A
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            AND  ScalarMetaConstant
            JP   Z,TypedTypeFailure
            LD   (DeclarationPayload),HL
            CALL ParserExpectLine
            RET  C
            LD   A,(NextProgramSlot)
            LD   C,A
            LD   B,0
            LD   (ExpressionLeftValue),BC
            PUSH BC
            LD   A,(DeclarationInfo)
            OR   SymbolClassProgram
            LD   D,A
            CALL TypedPrepareCurrentWord
            POP  BC
            RET  C
            CALL SymbolCommit
            RET  C
            LD   BC,(ExpressionLeftValue)
            LD   HL,(DeclarationPayload)
            LD   A,(DeclarationInfo)
            LD   D,A
            CALL TypedEmitProgramDefinition
            RET  C
            LD   A,(DeclarationInfo)
            CALL TypedTypeWidth
            LD   HL,NextProgramSlot
            ADD  A,(HL)
            LD   (HL),A
            JP   TypedParseTopLevel

TypedParseTopLevel:
            CALL ParserPeek
            RET  C
            CP   TokenVar
            JR   Z,TypedTopLevelVar
            CP   TokenConst
            JR   Z,TypedTopLevelConst
            CP   TokenSub
            JP   Z,TypedParseMain
            LD   A,DiagnosticExpectedTopLevel
            JP   CompilerSetDiagnostic
TypedTopLevelVar:
            CALL ParserTake
            RET  C
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            JP   TypedParseProgramAfterVar
TypedTopLevelConst:
            CALL ParserTake
            RET  C
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL TypedParseConstantAfterName
            RET  C
            JR   TypedParseTopLevel
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseTopLevelConstAfterTake:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL TypedParseConstantAfterName
            RET  C
            JP   TypedParseTopLevel

TypedParseMain:
            CALL ParserTake
            RET  C
            CALL ParserExpectRoutineHeader
            RET  C
            LD   A,SemanticBeginMain
            CALL SemanticSinkOperation
            RET  C
TypedParseLocals:
            CALL ParserPeek
            RET  C
            CP   TokenVar
            JP   NZ,TypedParseStatements
            CALL ParserTake
            RET  C
            CALL TypedParseLocalDeclaration
            RET  C
            JR   TypedParseLocals

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseLocalDeclaration:
            LD   E,TokenName
            CALL ParserExpect
            RET  C
            CALL TypedRetainDeclarationName
            CALL ParserExpectAs
            RET  C
            CALL TypedParseType
            RET  C
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
            RET  C
            CALL ParserPeek
            RET  C
            CP   TokenEquals
            JR   Z,TypedLocalExplicit
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
            JR   TypedLocalHaveExpression
TypedLocalExplicit:
            CALL ParserTake
            RET  C
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            CALL TypedExpressionBeginRuntime
            RET  C
TypedLocalHaveExpression:
            LD   D,A
            LD   A,(DeclarationInfo)
            AND  ScalarMetaTypeMask
            LD   E,A
            LD   A,D
            CALL TypedCheckAssignable
            RET  C
            CALL ParserExpectLine
            RET  C
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

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedEmitLocalDeclare:
            CP   ScalarTypeU16
            LD   A,SemanticDeclareLocalU8
            JR   NZ,TypedEmitLocalDeclareSelected
            LD   A,SemanticDeclareLocal16
TypedEmitLocalDeclareSelected:
            CALL SemanticSinkOperation
            RET  C
            LD   A,(NextLocalSlot)
            JP   SemanticSinkPut

; D is symbol info and C its byte offset.
.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedEmitStoreByInfo:
            LD   A,D
            AND  SymbolClassMask
            CP   SymbolClassProgram
            JR   Z,TypedStoreProgram
            CP   SymbolClassLocal
            JP   NZ,TypedTypeFailure
            LD   A,D
            AND  ScalarMetaTypeMask
            CP   ScalarTypeU16
            LD   A,SemanticStoreLocalU8
            JR   NZ,TypedStoreSelected
            LD   A,SemanticStoreLocal16
            JR   TypedStoreSelected
TypedStoreProgram:
            LD   A,D
            AND  ScalarMetaTypeMask
            CP   ScalarTypeU16
            LD   A,SemanticStoreProgramU8
            JR   NZ,TypedStoreSelected
            LD   A,SemanticStoreProgram16
TypedStoreSelected:
            JP   ParserEmitOperationC

TypedParseStatements:
            CALL ParserPeek
            RET  C
            CP   TokenEnd
            JP   Z,TypedParseEndMain
            CP   TokenName
            JP   NZ,ParserExpectedScalar
            CALL ParserTake
            RET  C
            LD   HL,NameWriteOutputByte
            LD   B,15
            CALL TokenNameEquals
            JR   C,TypedParseWrite
            CALL TypedParseAssignment
            RET  C
            JR   TypedParseStatements
TypedParseWrite:
            LD   HL,(TokenStartOffset)
            LD   (ExpressionCallOffset),HL
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
            CALL ParserExpectOrFailLine
            RET  C
            JR   TypedParseStatements

.routine out A,BC,DE,HL,carry,zero clobbers sign,parity,halfCarry,IX,IY
TypedParseAssignment:
            CALL SymbolLookupCurrent
            RET  C
            LD   (DeclarationInfo),A
            LD   (DeclarationPayload),BC
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

TypedParseEndMain:
            CALL ParserTake
            RET  C
            CALL ParserExpectLine
            RET  C
            LD   A,SemanticEndMain
            CALL SemanticSinkOperation
            RET  C
            LD   E,TokenEof
            JP   ParserExpect
