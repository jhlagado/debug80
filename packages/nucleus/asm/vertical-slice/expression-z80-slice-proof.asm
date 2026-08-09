; Compile general scalar symbols and a precedence expression to direct Z80.

            .include "memory-map.asmi"
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
LegacyEncoders .equ 1
            .include "loop-z80-sink.asm"
            .include "typed-expression-z80.asm"
SinkCodeEnd:
CompilerCodeEnd:

CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
ExpressionProofSource:
            .db "var bytes as u8 = 0",10
            .db "sub main() fails",10
            .db "    var left as u8 = 2",10
            .db "    var right as u8 = 3",10
            .db "    //xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",10
            .db "    bytes = left + right * 4",10
            .db "    "
ExpressionOutputCall:
            .db "writeOutputByte(bytes) or fail",10
            .db "end",10
ExpressionProofSourceEnd:

DuplicateScalarSource:
            .db "var total as u8 = 0",10
            .db "var "
DuplicateScalarName:
            .db "total as u8 = 1",10
            .db "sub main() fails",10
            .db "end",10
DuplicateScalarSourceEnd:

UnknownScalarSource:
            .db "var total as u8 = 0",10
            .db "sub main() fails",10
            .db "    "
UnknownScalarName:
            .db "missing = total",10
            .db "end",10
UnknownScalarSourceEnd:

MalformedExpressionSource:
            .db "var total as u8 = 0",10
            .db "sub main() fails",10
            .db "    total = 1 +"
MalformedExpressionPoint:
            .db 10
            .db "end",10
MalformedExpressionSourceEnd:

FullScalarSource:
            .db "var a as u8 = 0",10
            .db "var b as u8 = 0",10
            .db "var c as u8 = 0",10
            .db "var d as u8 = 0",10
            .db "var e as u8 = 0",10
            .db "var f as u8 = 0",10
            .db "var "
FullScalarName:
            .db "g as u8 = 0",10
FullScalarSourceEnd:

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

            LD   A,70
            LD   HL,ExpressionProofSource
            LD   DE,ExpressionProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailEncode

            CALL Reset
            XOR  A
            LD   (ServiceFailureCall),A
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailSuccessState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailSuccessOutput
            LD   A,(ServiceOutputBase)
            CP   14
            JP   NZ,ProofFailSuccessByte
            LD   A,(GeneratedBase+3)
            CP   14
            JP   NZ,ProofFailAssignment

            CALL Reset
            LD   A,1
            LD   (ServiceFailureCall),A
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailOutputState
            LD   A,(TrapNumber)
            CP   6
            JP   NZ,ProofFailOutputTrap
            LD   A,(TrapError)
            CP   3
            JP   NZ,ProofFailOutputError
            LD   HL,(TrapOffset)
            LD   DE,ExpressionOutputCall-ExpressionProofSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailOutputOffset
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailOutputAtomic

            LD   A,71
            LD   HL,DuplicateScalarSource
            LD   DE,DuplicateScalarSourceEnd
            CALL CompileSlice
            JP   NC,ProofFailDuplicateAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticDuplicateName
            JP   NZ,ProofFailDuplicateCode
            LD   HL,(DiagnosticOffset)
            LD   DE,DuplicateScalarName-DuplicateScalarSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailDuplicatePosition

            LD   A,72
            LD   HL,UnknownScalarSource
            LD   DE,UnknownScalarSourceEnd
            CALL CompileSlice
            JP   NC,ProofFailUnknownAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticUnknownName
            JP   NZ,ProofFailUnknownCode
            LD   HL,(DiagnosticOffset)
            LD   DE,UnknownScalarName-UnknownScalarSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailUnknownPosition

            LD   A,73
            LD   HL,MalformedExpressionSource
            LD   DE,MalformedExpressionSourceEnd
            CALL CompileSlice
            JP   NC,ProofFailMalformedAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticExpectedScalar
            JP   NZ,ProofFailMalformedCode
            LD   HL,(DiagnosticOffset)
            LD   DE,MalformedExpressionPoint-MalformedExpressionSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailMalformedPosition

            LD   A,74
            LD   HL,FullScalarSource
            LD   DE,FullScalarSourceEnd
            CALL CompileSlice
            JP   NC,ProofFailFullAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticSymbolCapacity
            JP   NZ,ProofFailFullCode
            LD   HL,(DiagnosticOffset)
            LD   DE,FullScalarName-FullScalarSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailFullPosition

            ; Leave the successful program and transcript for host inspection.
            LD   A,70
            LD   HL,ExpressionProofSource
            LD   DE,ExpressionProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailEncode

            LD   A,$A5
            LD   (ProofStatus),A
            HALT

.routine in B,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
ProofCompareBytes:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,ProofCompareBytesNo
            INC  DE
            INC  HL
            DJNZ ProofCompareBytes
            OR   A
            RET
ProofCompareBytesNo:
            SCF
            RET

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

ProofFailCompile:             LD A,1
                              JR ProofFailed
ProofFailOperations:          LD A,2
                              JR ProofFailed
ProofFailEncode:              LD A,3
                              JR ProofFailed
ProofFailSuccessState:        LD A,4
                              JR ProofFailed
ProofFailSuccessOutput:       LD A,5
                              JR ProofFailed
ProofFailSuccessByte:         LD A,6
                              JR ProofFailed
ProofFailAssignment:          LD A,7
                              JR ProofFailed
ProofFailOutputState:         LD A,8
                              JR ProofFailed
ProofFailOutputTrap:          LD A,9
                              JR ProofFailed
ProofFailOutputError:         LD A,10
                              JR ProofFailed
ProofFailOutputOffset:        LD A,11
                              JR ProofFailed
ProofFailOutputAtomic:        LD A,12
                              JR ProofFailed
ProofFailDuplicateAccepted:   LD A,13
                              JR ProofFailed
ProofFailDuplicateCode:       LD A,14
                              JR ProofFailed
ProofFailDuplicatePosition:   LD A,15
                              JR ProofFailed
ProofFailUnknownAccepted:     LD A,16
                              JR ProofFailed
ProofFailUnknownCode:         LD A,17
                              JR ProofFailed
ProofFailUnknownPosition:     LD A,18
                              JR ProofFailed
ProofFailGeneratedSize:       LD A,19
                              JR ProofFailed
ProofFailFullAccepted:        LD A,20
                              JR ProofFailed
ProofFailFullCode:            LD A,21
                              JR ProofFailed
ProofFailFullPosition:        LD A,22
                              JR ProofFailed
ProofFailMalformedAccepted:   LD A,23
                              JR ProofFailed
ProofFailMalformedCode:       LD A,24
                              JR ProofFailed
ProofFailMalformedPosition:   LD A,25
                              JR ProofFailed
ProofFailFrame:               LD A,26
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ExpectedExpressionOperations:
            .db 17
            .db SemanticDefineProgramU8,0,0
            .db SemanticBeginMain
            .db SemanticDeclareLocalU8,0,SemanticLiteralU8,2
            .db SemanticStoreLocalU8,0
            .db SemanticDeclareLocalU8,1,SemanticLiteralU8,3
            .db SemanticStoreLocalU8,1
            .db SemanticLoadLocalU8,0,SemanticLoadLocalU8,1
            .db SemanticLiteralU8,4,SemanticMultiplyU8,SemanticAddU8
            .db SemanticStoreProgramU8,0
            .db SemanticLoadProgramU8,0
            .db SemanticWriteValueU8
            .dw ExpressionOutputCall-ExpressionProofSource
            .db SemanticEndMain
ProofStatus:                 .db 0
ProofCase:                   .db 0
ProofExpectedSP:             .dw 0
ProofEnd:

ExpressionProgramSize .equ 116
GeneratedExpressionEnd      .equ GeneratedBase+ExpressionProgramSize

            .end
