; Prove the correctness-first u8/u16/boolean expression increment end to end.

            .include "memory-map.asmi"
SegmentedOutput .equ 0
            .include "loop-compiler-state.asmi"
            .include "loop-z80-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
LegacyCompilerSlices .equ 1
AggregateCallSlices  .equ 0
SourceAdapterCodeStart:
            .include "source-adapter.asm"
SourceAdapterCodeEnd:
TokenizerCodeStart:
            .include "loop-tokenizer.asm"
TokenizerCodeEnd:
SemanticSinkCodeStart:
            .include "loop-semantic-sink.asm"
SemanticSinkCodeEnd:
SymbolCodeStart:
            .include "loop-symbols.asm"
SymbolCodeEnd:
ParserCodeStart:
            .include "loop-parser.asm"
ParserCodeEnd:
CompilerCommonCodeEnd:
SinkCodeStart:
LegacyEncoders .equ 0
            .include "loop-z80-sink.asm"
TypedSinkCodeStart:
            .include "typed-expression-z80.asm"
TypedSinkCodeEnd:
SinkCodeEnd:
CompilerCodeEnd:
CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
TypedAcceptedSource:
            .db "const folded = 65535 + 2",10
            .db "var out as u8 = 0",10
            .db "var word as u16 = 300",10
            .db "var flag as boolean = true",10
            .db "sub main() fails",10
            .db "    var a as u8 = 250",10
            .db "    var b as u16 = 20",10
            .db "    word = a + b * 3",10
            .db "    out = u8(word - 55)",10
            .db "    out = out + 2",10
            .db "    word = -word + 311",10
            .db "    word = not word and 65535",10
            .db "    word = word + folded",10
            .db "    word = word or 0",10
            .db "    word = word / 1",10
            .db "    flag = false and (u8(300) = 0)",10
            .db "    flag = true or (out / 0 = 0)",10
            .db "    flag = not out > 1",10
            .db "    flag = (out = 1) and (out <> 2) and (out <= 1) and (out >= 1) and not (out > 1)",10
            .db "    out = (not out) and 255",10
            .db "    out = -out + 255",10
            .db "    out = out * 3 / 3",10
            .db "    out = out - 0",10
            .db "    out = 'A' - 64",10
            .db "    word = u16(out) + word",10
            .db "    "
TypedAcceptedOutputCall:
            .db "writeOutputByte(out) or fail",10
            .db "end",10
TypedAcceptedSourceEnd:

TypedDefaultSource:
            .db "var out as u8 = 5",10
            .db "var word as u16",10
            .db "var flag as boolean",10
            .db "sub main() fails",10
            .db "    var localWord as u16",10
            .db "    out = u8(localWord)",10
            .db "    flag = not flag",10
            .db "    writeOutputByte(out) or fail",10
            .db "end",10
TypedDefaultSourceEnd:

TypedNarrowTrapSource:
            .db "var out as u8 = 7",10
            .db "var wide as u16 = 300",10
            .db "sub main() fails",10
            .db "    out = "
TypedNarrowTrapPoint:
            .db "u8(wide)",10
            .db "end",10
TypedNarrowTrapSourceEnd:

TypedDivideTrapSource:
            .db "var out as u8 = 9",10
            .db "var zero as u8 = 0",10
            .db "sub main() fails",10
            .db "    out = out "
TypedDivideTrapPoint:
            .db "/ zero",10
            .db "end",10
TypedDivideTrapSourceEnd:

TypedImplicitNarrowSource:
            .db "var out as u8 = 0",10
            .db "var wide as u16 = 1",10
            .db "sub main() fails",10
            .db "    out = wide",10
            .db "end",10
TypedImplicitNarrowSourceEnd:

TypedBooleanMixSource:
            .db "var flag as boolean = true",10
            .db "sub main() fails",10
            .db "    flag = 1",10
            .db "end",10
TypedBooleanMixSourceEnd:

TypedChainSource:
            .db "var flag as boolean = true",10
            .db "sub main() fails",10
            .db "    flag = 1 < 2 < 3",10
            .db "end",10
TypedChainSourceEnd:

TypedConstantDivideSource:
            .db "const bad = 1 / 0",10
TypedConstantDivideSourceEnd:

TypedConstantNarrowSource:
            .db "const bad = u8(300)",10
TypedConstantNarrowSourceEnd:

TypedLiteralOverflowSource:
            .db "var bad as u16 = 65536",10
TypedLiteralOverflowSourceEnd:

; The u16 definition and main marker consume five bytes. Fifty named-constant
; expression/store pairs fill the remaining 250 bytes, so pair 51 must fail on
; its first operation and unwind the saved symbol metadata.
TypedTranscriptCapacitySource:
            .db "const k = 1",10
            .db "var out as u16 = 0",10
            .db "sub main() fails",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "out=k",10,"out=k",10,"out=k",10,"out=k",10
            .db "end",10
TypedTranscriptCapacitySourceEnd:

; Seventeen pending additions exceed the sixteen-entry expression stack.
TypedExpressionCapacitySource:
            .db "var out as u8 = 0",10
            .db "sub main() fails",10
            .db "out=1+(1+(1+(1+(1+(1+(1+(1+(1+(1+(1+(1+(1+(1+(1+(1+(1+1))))))))))))))))",10
            .db "end",10
TypedExpressionCapacitySourceEnd:

            .org TargetRuntimeBase
RuntimeCodeStart:
            .include "loop-z80-runtime.asm"
RuntimeCodeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   (ServiceFailureCall),A

            LD   A,80
            LD   HL,TypedAcceptedSource
            LD   DE,TypedAcceptedSourceEnd
            CALL CompileSlice
            JP   C,ProofFailAcceptedCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailAcceptedEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailAcceptedState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailAcceptedLength
            LD   A,(ServiceOutputBase)
            CP   1
            JP   NZ,ProofFailAcceptedValue
            LD   A,(GeneratedBase+3)       ; out
            CP   1
            JP   NZ,ProofFailAcceptedStore
            LD   A,(GeneratedBase+6)       ; final comparison conjunction
            CP   1
            JP   NZ,ProofFailAcceptedBoolean
            LD   HL,(GeneratedBase+4)      ; widened add wraps 65535 + 1
            LD   A,H
            OR   L
            JP   NZ,ProofFailAcceptedWord
            LD   HL,(GeneratedSize)
            LD   (TypedGeneratedSize),HL

            LD   A,90
            LD   HL,TypedDefaultSource
            LD   DE,TypedDefaultSourceEnd
            CALL CompileSlice
            JP   C,ProofFailDefaultCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailDefaultEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailDefaultState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailDefaultOutput
            LD   A,(ServiceOutputBase)
            OR   A
            JP   NZ,ProofFailDefaultOutput
            LD   HL,(GeneratedBase+4)      ; word defaults to zero
            LD   A,H
            OR   L
            JP   NZ,ProofFailDefaultProgram
            LD   A,(GeneratedBase+6)       ; false, then not, becomes true
            CP   1
            JP   NZ,ProofFailDefaultBoolean

            LD   A,81
            LD   HL,TypedNarrowTrapSource
            LD   DE,TypedNarrowTrapSourceEnd
            CALL CompileSlice
            JP   C,ProofFailNarrowCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailNarrowEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailNarrowState
            LD   A,(TrapNumber)
            CP   2
            JP   NZ,ProofFailNarrowNumber
            LD   HL,(TrapOffset)
            LD   DE,TypedNarrowTrapPoint-TypedNarrowTrapSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailNarrowOffset
            LD   A,(GeneratedBase+3)
            CP   7
            JP   NZ,ProofFailNarrowAtomic

            LD   A,82
            LD   HL,TypedDivideTrapSource
            LD   DE,TypedDivideTrapSourceEnd
            CALL CompileSlice
            JP   C,ProofFailDivideCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailDivideEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailDivideState
            LD   A,(TrapNumber)
            CP   3
            JP   NZ,ProofFailDivideNumber
            LD   HL,(TrapOffset)
            LD   DE,TypedDivideTrapPoint-TypedDivideTrapSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailDivideOffset
            LD   A,(GeneratedBase+3)
            CP   9
            JP   NZ,ProofFailDivideAtomic

            LD   A,83
            LD   HL,TypedImplicitNarrowSource
            LD   DE,TypedImplicitNarrowSourceEnd
            LD   C,DiagnosticTypeMismatch
            CALL ProofExpectDiagnostic
            JP   C,ProofFailImplicitNarrow
            LD   A,84
            LD   HL,TypedBooleanMixSource
            LD   DE,TypedBooleanMixSourceEnd
            LD   C,DiagnosticTypeMismatch
            CALL ProofExpectDiagnostic
            JP   C,ProofFailBooleanMix
            LD   A,85
            LD   HL,TypedChainSource
            LD   DE,TypedChainSourceEnd
            LD   C,DiagnosticComparisonChain
            CALL ProofExpectDiagnostic
            JP   C,ProofFailChain
            LD   A,86
            LD   HL,TypedConstantDivideSource
            LD   DE,TypedConstantDivideSourceEnd
            LD   C,DiagnosticDivisionZero
            CALL ProofExpectDiagnostic
            JP   C,ProofFailConstantDivide
            LD   A,87
            LD   HL,TypedConstantNarrowSource
            LD   DE,TypedConstantNarrowSourceEnd
            LD   C,DiagnosticNarrowing
            CALL ProofExpectDiagnostic
            JP   C,ProofFailConstantNarrow
            LD   A,88
            LD   HL,TypedLiteralOverflowSource
            LD   DE,TypedLiteralOverflowSourceEnd
            LD   C,DiagnosticLexical
            CALL ProofExpectDiagnostic
            JP   C,ProofFailLiteralOverflow
            LD   A,89
            LD   HL,TypedTranscriptCapacitySource
            LD   DE,TypedTranscriptCapacitySourceEnd
            LD   C,DiagnosticSinkCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailTranscriptCapacity
            LD   A,91
            LD   HL,TypedExpressionCapacitySource
            LD   DE,TypedExpressionCapacitySourceEnd
            LD   C,DiagnosticExpressionCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailExpressionCapacity

            LD   A,92
            LD   HL,TypedDynamicZeroSource
            LD   DE,TypedDynamicZeroSourceEnd
            LD   C,DiagnosticDivisionZero
            CALL ProofExpectDiagnostic
            JP   C,ProofFailDynamicZero
            LD   A,93
            LD   HL,TypedUnaryMinusOverflowSource
            LD   DE,TypedUnaryMinusOverflowSourceEnd
            LD   C,DiagnosticIntegerRange
            CALL ProofExpectDiagnostic
            JP   C,ProofFailUnaryMinusRange
            LD   A,94
            LD   HL,TypedNotOverflowSource
            LD   DE,TypedNotOverflowSourceEnd
            LD   C,DiagnosticIntegerRange
            CALL ProofExpectDiagnostic
            JP   C,ProofFailNotRange
            LD   A,95
            LD   HL,TypedMalformedHexSource
            LD   DE,TypedMalformedHexSourceEnd
            LD   C,DiagnosticLexical
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMalformedHex
            LD   A,96
            LD   HL,TypedMalformedSuffixSource
            LD   DE,TypedMalformedSuffixSourceEnd
            LD   C,DiagnosticLexical
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMalformedSuffix

            ; Fault suppression removes the fault, not the operation's static
            ; type. Both skipped u8 operations must still make 300 invalid as
            ; the exact peer of a u8 comparison.
            LD   A,100
            LD   HL,TypedSuppressedDivideTypeSource
            LD   DE,TypedSuppressedDivideTypeSourceEnd
            LD   C,DiagnosticIntegerRange
            CALL ProofExpectDiagnostic
            JP   C,ProofFailSuppressedDivideType
            LD   A,101
            LD   HL,TypedSuppressedNarrowTypeSource
            LD   DE,TypedSuppressedNarrowTypeSourceEnd
            LD   C,DiagnosticIntegerRange
            CALL ProofExpectDiagnostic
            JP   C,ProofFailSuppressedNarrowType
            LD   A,102
            LD   HL,TypedMissingConversionRightSource
            LD   DE,TypedMissingConversionRightSourceEnd
            LD   C,DiagnosticExpectedRight
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMissingConversionRight
            LD   A,103
            LD   HL,TypedMissingParenRightSource
            LD   DE,TypedMissingParenRightSourceEnd
            LD   C,DiagnosticExpectedRight
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMissingParenRight
            LD   A,104
            LD   HL,TypedMalformedAfterLeftSource
            LD   DE,TypedMalformedAfterLeftSourceEnd
            LD   C,DiagnosticLexical
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMalformedAfterLeft

            ; Put the cursor three bytes below the transcript limit. The local
            ; declaration consumes two bytes and its literal operation consumes
            ; the third; the first literal operand must report capacity.
            LD   A,105
            LD   HL,TypedDefaultLocalCapacitySource
            LD   DE,TypedDefaultLocalCapacitySourceEnd
            CALL SourceInitialize
            CALL SemanticSinkReset
            LD   A,$FF
            LD   (ParserLookaheadKind),A
            CALL SymbolReset
            LD   HL,SemanticBufferLimit-3
            LD   (SinkCursor),HL
            CALL TypedParseLocalDeclaration
            JP   NC,ProofFailDefaultLocalCapacity
            LD   A,(DiagnosticCode)
            CP   DiagnosticSinkCapacity
            JP   NZ,ProofFailDefaultLocalCapacity

            ; Exercise paths absent from the primary program: named u8 and
            ; Boolean constants, unary plus, u8 or, integer less-than, Boolean
            ; equality/inequality, constant division, and boundary narrowing.
            LD   A,97
            LD   HL,TypedCoverageSource
            LD   DE,TypedCoverageSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCoverageCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailCoverageEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailCoverageState
            LD   A,(ServiceOutputBase)
            CP   255
            JP   NZ,ProofFailCoverageOutput
            LD   A,(GeneratedBase+4)       ; dynamic Boolean conjunction
            CP   1
            JP   NZ,ProofFailCoverageBoolean

            ; The inner u8 conversion controls its arithmetic width even though
            ; the enclosing destination is u16: 200+100 wraps to 44, then widens.
            LD   A,98
            LD   HL,TypedConversionContextSource
            LD   DE,TypedConversionContextSourceEnd
            CALL CompileSlice
            JP   C,ProofFailConversionCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailConversionEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailConversionState
            LD   HL,(GeneratedBase+4)
            LD   A,H
            OR   A
            JP   NZ,ProofFailConversionValue
            LD   A,L
            CP   44
            JP   NZ,ProofFailConversionValue

            ; A nested successful divide must not replace the outer divide's
            ; source offset when the outer operation traps.
            LD   A,99
            LD   HL,TypedNestedDivideTrapSource
            LD   DE,TypedNestedDivideTrapSourceEnd
            CALL CompileSlice
            JP   C,ProofFailNestedDivideCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailNestedDivideEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailNestedDivideState
            LD   HL,(TrapOffset)
            LD   DE,TypedNestedDivideOuter-TypedNestedDivideTrapSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailNestedDivideOffset
            LD   HL,(GeneratedBase+3)
            LD   DE,10
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailNestedDivideAtomic

            ; A nested successful narrowing likewise must not replace the
            ; outer checked conversion's trap position.
            LD   A,100
            LD   HL,TypedNestedNarrowTrapSource
            LD   DE,TypedNestedNarrowTrapSourceEnd
            CALL CompileSlice
            JP   C,ProofFailNestedNarrowCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailNestedNarrowEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailNestedNarrowState
            LD   HL,(TrapOffset)
            LD   DE,TypedNestedNarrowOuter-TypedNestedNarrowTrapSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailNestedNarrowOffset
            LD   A,(GeneratedBase+3)
            CP   7
            JP   NZ,ProofFailNestedNarrowAtomic

            ; Defensive invariant failures use their own diagnostics rather
            ; than masquerading as semantic-transcript exhaustion.
            XOR  A
            LD   (ExpressionStackDepth),A
            LD   HL,1
            LD   A,ScalarMetaConstant+ScalarTypeU8
            CALL TypedRestoreOperands
            JP   NC,ProofFailExpressionUnderflow
            LD   A,(DiagnosticCode)
            CP   DiagnosticInternalOperation
            JP   NZ,ProofFailExpressionUnderflow

            LD   A,EmitBooleanFixupCapacity
            LD   (EmitBooleanFixupDepth),A
            LD   DE,0
            CALL TypedPushBooleanFixup
            JP   NC,ProofFailBooleanCapacity
            LD   A,(DiagnosticCode)
            CP   DiagnosticBooleanFixupCapacity
            JP   NZ,ProofFailBooleanCapacity

            XOR  A
            LD   (EmitBooleanFixupDepth),A
            CALL TypedPopBooleanFixup
            JP   NC,ProofFailBooleanUnderflow
            LD   A,(DiagnosticCode)
            CP   DiagnosticInternalOperation
            JP   NZ,ProofFailBooleanUnderflow

            LD   A,1
            LD   (SemanticBufferBase),A
            LD   A,SemanticLiteralU8
            LD   (SemanticBufferBase+1),A
            CALL TypedDispatch
            JP   NC,ProofFailRetiredOperation
            LD   A,(DiagnosticCode)
            CP   DiagnosticInternalOperation
            JP   NZ,ProofFailRetiredOperation

            LD   A,1
            LD   (EmitBooleanFixupDepth),A
            CALL TypedEndMain
            JP   NC,ProofFailUnbalancedBoolean
            LD   A,(DiagnosticCode)
            CP   DiagnosticInternalOperation
            JP   NZ,ProofFailUnbalancedBoolean

            CALL ProofCheckArithmeticFastPaths
            JP   C,ProofFailArithmeticRuntime

            ; Restore the accepted compiler result for host-side inspection.
            LD   A,80
            LD   HL,TypedAcceptedSource
            LD   DE,TypedAcceptedSourceEnd
            CALL CompileSlice
            JP   C,ProofFailAcceptedCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailAcceptedEncode
            LD   A,$A5
            LD   (ProofStatus),A
            HALT

; A=part, HL..DE source, C=expected diagnostic. Carry means mismatch.
.routine in A,C,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
ProofExpectDiagnostic:
            PUSH BC
            CALL CompileSlice
            POP  BC
            JR   NC,ProofExpectedDiagnosticNo
            LD   A,(DiagnosticCode)
            CP   C
            JR   NZ,ProofExpectedDiagnosticNo
            OR   A
            RET
ProofExpectedDiagnosticNo:
            SCF
            RET

; Execute a generated routine with a visible frame sentinel. Returning through
; local storage or a saved IX value cannot satisfy both observations.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofCallGenerated:
            LD   HL,0
            ADD  HL,SP
            LD   (ProofExpectedSP),HL
            LD   IX,$A55A
            CALL GeneratedBase
            PUSH IX
            POP  DE
            LD   HL,$A55A
            OR   A
            SBC  HL,DE
            JR   NZ,ProofCallGeneratedNo
            LD   HL,0
            ADD  HL,SP
            LD   DE,(ProofExpectedSP)
            OR   A
            SBC  HL,DE
            RET  Z
ProofCallGeneratedNo:
            SCF
            RET

; The runtime fast paths must preserve the full multiply/divide/modulo result
; matrix at their gating boundaries. Rows are dividend, divisor, quotient,
; remainder, and wrapped product.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX
ProofCheckArithmeticFastPaths:
            LD   IX,ProofArithmeticCases
ProofCheckArithmeticRow:
            LD   L,(IX+0)
            LD   H,(IX+1)
            LD   E,(IX+2)
            LD   D,(IX+3)
            CALL DivideU16
            JR   C,ProofCheckArithmeticNo
            LD   E,(IX+4)
            LD   D,(IX+5)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofCheckArithmeticNo
            LD   L,(IX+0)
            LD   H,(IX+1)
            LD   E,(IX+2)
            LD   D,(IX+3)
            CALL ModuloU16
            JR   C,ProofCheckArithmeticNo
            LD   E,(IX+6)
            LD   D,(IX+7)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofCheckArithmeticNo
            LD   L,(IX+0)
            LD   H,(IX+1)
            LD   E,(IX+2)
            LD   D,(IX+3)
            CALL MultiplyU16
            JR   C,ProofCheckArithmeticNo
            LD   E,(IX+8)
            LD   D,(IX+9)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofCheckArithmeticNo
            LD   DE,10
            ADD  IX,DE
            PUSH IX
            POP  HL
            LD   DE,ProofArithmeticCasesEnd
            OR   A
            SBC  HL,DE
            JR   NZ,ProofCheckArithmeticRow

            LD   HL,1000
            LD   DE,0
            CALL DivideU16
            JR   NC,ProofCheckArithmeticNo
            LD   HL,1000
            LD   DE,0
            CALL ModuloU16
            JR   NC,ProofCheckArithmeticNo
            LD   HL,37
            LD   DE,0
            CALL MultiplyU16
            JR   C,ProofCheckArithmeticNo
            LD   A,H
            OR   L
            RET  Z
ProofCheckArithmeticNo:
            SCF
            RET

ProofFailedNear:              JP ProofFailed
ProofFailAcceptedCompile:     LD A,1
                              JR ProofFailedNear
ProofFailAcceptedEncode:      LD A,2
                              JR ProofFailedNear
ProofFailAcceptedState:       LD A,3
                              JR ProofFailedNear
ProofFailAcceptedLength:      LD A,4
                              JR ProofFailedNear
ProofFailAcceptedValue:       LD A,5
                              JR ProofFailedNear
ProofFailAcceptedStore:       LD A,6
                              JR ProofFailedNear
ProofFailAcceptedBoolean:     LD A,26
                              JR ProofFailedNear
ProofFailAcceptedWord:        LD A,27
                              JR ProofFailedNear
ProofFailDefaultCompile:      LD A,28
                              JR ProofFailedNear
ProofFailDefaultEncode:       LD A,29
                              JR ProofFailedNear
ProofFailDefaultState:        LD A,30
                              JR ProofFailedNear
ProofFailDefaultOutput:       LD A,31
                              JR ProofFailedNear
ProofFailDefaultProgram:      LD A,32
                              JR ProofFailedNear
ProofFailDefaultBoolean:      LD A,33
                              JR ProofFailedNear
ProofFailNarrowCompile:       LD A,7
                              JR ProofFailedNear
ProofFailNarrowEncode:        LD A,8
                              JR ProofFailedNear
ProofFailNarrowState:         LD A,9
                              JR ProofFailedNear
ProofFailNarrowNumber:        LD A,10
                              JR ProofFailedNear
ProofFailNarrowOffset:        LD A,11
                              JR ProofFailedNear
ProofFailNarrowAtomic:        LD A,12
                              JR ProofFailedNear
ProofFailDivideCompile:       LD A,13
                              JR ProofFailedNear
ProofFailDivideEncode:        LD A,14
                              JR ProofFailedNear
ProofFailDivideState:         LD A,15
                              JR ProofFailedNear
ProofFailDivideNumber:        LD A,16
                              JR ProofFailedNear
ProofFailDivideOffset:        LD A,17
                              JR ProofFailedNear
ProofFailDivideAtomic:        LD A,18
                              JR ProofFailedNear
ProofFailImplicitNarrow:      LD A,19
                              JR ProofFailedNear
ProofFailBooleanMix:          LD A,20
                              JR ProofFailedNear
ProofFailChain:               LD A,21
                              JR ProofFailedNear
ProofFailConstantDivide:      LD A,22
                              JR ProofFailedNear
ProofFailConstantNarrow:      LD A,23
                              JR ProofFailedNear
ProofFailLiteralOverflow:     LD A,24
                              JP ProofFailed
ProofFailTranscriptCapacity:  LD A,25
                              JP ProofFailed
ProofFailExpressionCapacity:  LD A,34
                              JP ProofFailed
ProofFailExpressionUnderflow: LD A,35
                              JP ProofFailed
ProofFailBooleanCapacity:     LD A,36
                              JP ProofFailed
ProofFailBooleanUnderflow:    LD A,37
                              JP ProofFailed
ProofFailRetiredOperation:    LD A,38
                              JP ProofFailed
ProofFailUnbalancedBoolean:   LD A,39
                              JR ProofFailed
ProofFailFrame:               LD A,40
                              JR ProofFailed
ProofFailDynamicZero:         LD A,41
                              JR ProofFailed
ProofFailUnaryMinusRange:     LD A,42
                              JR ProofFailed
ProofFailNotRange:            LD A,43
                              JR ProofFailed
ProofFailMalformedHex:        LD A,44
                              JR ProofFailed
ProofFailMalformedSuffix:     LD A,45
                              JR ProofFailed
ProofFailSuppressedDivideType: LD A,65
                              JR ProofFailed
ProofFailSuppressedNarrowType: LD A,66
                              JR ProofFailed
ProofFailMissingConversionRight: LD A,67
                              JR ProofFailed
ProofFailMissingParenRight:   LD A,68
                              JR ProofFailed
ProofFailMalformedAfterLeft:  LD A,69
                              JR ProofFailed
ProofFailDefaultLocalCapacity: LD A,70
                              JR ProofFailed
ProofFailCoverageCompile:     LD A,46
                              JR ProofFailed
ProofFailCoverageEncode:      LD A,47
                              JR ProofFailed
ProofFailCoverageState:       LD A,48
                              JR ProofFailed
ProofFailCoverageOutput:      LD A,49
                              JR ProofFailed
ProofFailCoverageBoolean:     LD A,50
                              JR ProofFailed
ProofFailConversionCompile:   LD A,51
                              JR ProofFailed
ProofFailConversionEncode:    LD A,52
                              JR ProofFailed
ProofFailConversionState:     LD A,53
                              JR ProofFailed
ProofFailConversionValue:     LD A,54
                              JR ProofFailed
ProofFailNestedDivideCompile: LD A,55
                              JR ProofFailed
ProofFailNestedDivideEncode:  LD A,56
                              JR ProofFailed
ProofFailNestedDivideState:   LD A,57
                              JR ProofFailed
ProofFailNestedDivideOffset:  LD A,58
                              JR ProofFailed
ProofFailNestedDivideAtomic:  LD A,59
                              JR ProofFailed
ProofFailNestedNarrowCompile: LD A,60
                              JR ProofFailed
ProofFailNestedNarrowEncode:  LD A,61
                              JR ProofFailed
ProofFailNestedNarrowState:   LD A,62
                              JR ProofFailed
ProofFailNestedNarrowOffset:  LD A,63
                              JR ProofFailed
ProofFailNestedNarrowAtomic:  LD A,64
                              JR ProofFailed
ProofFailArithmeticRuntime:   LD A,71
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

TypedGeneratedSize:           .dw 0
ProofExpectedSP:              .dw 0
ProofStatus:                  .db 0
ProofCase:                    .db 0
ProofArithmeticCases:
            .dw 1000,1,1000,0,1000
            .dw 1000,2,500,0,2000
            .dw 1000,255,3,235,58392
            .dw 1000,256,3,232,59392
            .dw 1000,257,3,229,60392
            .dw 65535,65535,1,0,1
ProofArithmeticCasesEnd:
ProofEnd:

GeneratedTypedEnd             .equ GeneratedBase+857

            .org SpareBase
TypedDynamicZeroSource:
            .db "var out as u8 = 1",10
            .db "sub main() fails",10
            .db "    out = out / 0",10
            .db "end",10
TypedDynamicZeroSourceEnd:

TypedUnaryMinusOverflowSource:
            .db "var bad as u8 = -256",10
TypedUnaryMinusOverflowSourceEnd:
TypedNotOverflowSource:
            .db "var bad as u8 = not 256",10
TypedNotOverflowSourceEnd:
TypedMalformedHexSource:
            .db "var bad as u16 = 0x2a",10
TypedMalformedHexSourceEnd:
TypedMalformedSuffixSource:
            .db "var bad as u16 = 12u8",10
TypedMalformedSuffixSourceEnd:

TypedSuppressedDivideTypeSource:
            .db "var byte as u8 = 1",10
            .db "var flag as boolean = false",10
            .db "sub main() fails",10
            .db "    flag = false and (byte / 0 = 300)",10
            .db "end",10
TypedSuppressedDivideTypeSourceEnd:

TypedSuppressedNarrowTypeSource:
            .db "var flag as boolean = false",10
            .db "sub main() fails",10
            .db "    flag = false and (u8(300) = 300)",10
            .db "end",10
TypedSuppressedNarrowTypeSourceEnd:

TypedMissingConversionRightSource:
            .db "var out as u8 = 0",10
            .db "sub main() fails",10
            .db "    out = u8(1",10
            .db "end",10
TypedMissingConversionRightSourceEnd:

TypedMissingParenRightSource:
            .db "var out as u8 = 0",10
            .db "sub main() fails",10
            .db "    out = (1",10
            .db "end",10
TypedMissingParenRightSourceEnd:

TypedMalformedAfterLeftSource:
            .db "var out as u8 = 0",10
            .db "sub main() fails",10
            .db "    out = 1 0x2a",10
            .db "end",10
TypedMalformedAfterLeftSourceEnd:

TypedDefaultLocalCapacitySource:
            .db "local as u16",10
TypedDefaultLocalCapacitySourceEnd:

TypedCoverageSource:
            .db "const byteMask = u8(255)",10
            .db "const truth = true",10
            .db "const quotient = 8 / 2",10
            .db "var out as u8 = 0",10
            .db "var flag as boolean = false",10
            .db "sub main() fails",10
            .db "    var value as u8 = +1",10
            .db "    out = not 255",10
            .db "    out = -255",10
            .db "    out = value or byteMask",10
            .db "    flag = truth",10
            .db "    flag = (value < quotient) and (flag = truth) and (flag <> false)",10
            .db "    writeOutputByte(out) or fail",10
            .db "end",10
TypedCoverageSourceEnd:

TypedConversionContextSource:
            .db "var out as u8 = 0",10
            .db "var word as u16 = 0",10
            .db "sub main() fails",10
            .db "    word = u8(200 + 100)",10
            .db "    out = u8(word)",10
            .db "    writeOutputByte(out) or fail",10
            .db "end",10
TypedConversionContextSourceEnd:

TypedNestedDivideTrapSource:
            .db "var result as u16 = 10",10
            .db "var left as u16 = 1",10
            .db "var right as u16 = 2",10
            .db "sub main() fails",10
            .db "    result = result "
TypedNestedDivideOuter:
            .db "/ (left / right)",10
            .db "end",10
TypedNestedDivideTrapSourceEnd:

TypedNestedNarrowTrapSource:
            .db "var out as u8 = 7",10
            .db "var wide as u16 = 300",10
            .db "var small as u16 = 1",10
            .db "sub main() fails",10
            .db "    out = "
TypedNestedNarrowOuter:
            .db "u8(wide + u8(small))",10
            .db "end",10
TypedNestedNarrowTrapSourceEnd:
            .end
