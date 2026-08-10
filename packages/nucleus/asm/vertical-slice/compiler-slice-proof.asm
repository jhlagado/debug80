; End-to-end proof of the streaming source adapter, tokenizer, predictive
; parser, semantic checks, positioned diagnostic, and operation sink.

            .include "memory-map.asmi"
            .include "compiler-state.asmi"

AggregateCallSlices .equ 0

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "tokenizer.asm"
            .include "semantic-sink.asm"
            .include "parser.asm"
CompilerCodeEnd:

CompilerImmutableStart:
KeywordSub:
            .db  "sub"
KeywordFails:
            .db  "fails"
KeywordOr:
            .db  "or"
KeywordFail:
            .db  "fail"
KeywordEnd:
            .db  "end"
NameMain:
            .db  "main"
NameWriteOutputByte:
            .db  "writeOutputByte"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
AcceptedSource:
            .db  "sub main() fails",10
            .db  "    writeOutputByte('A') or fail",10
            .db  "end",10
AcceptedSourceEnd:

MalformedSource:
            .db  "sub main() fails",10
            .db  "    writeOutputByte('A') or fail",10
MalformedSourceEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A

            LD   A,7
            LD   HL,AcceptedSource
            LD   DE,AcceptedSourceEnd
            CALL CompileVerticalSlice
            JP   C,ProofFailAcceptedCompile
            LD   A,(DiagnosticCode)
            OR   A
            JP   NZ,ProofFailAcceptedDiagnostic
            LD   HL,SemanticBufferBase
            LD   DE,ExpectedOperations
            LD   B,6
            CALL ProofCompareBytes
            JP   C,ProofFailAcceptedOperations

            LD   A,9
            LD   HL,MalformedSource
            LD   DE,MalformedSourceEnd
            CALL CompileVerticalSlice
            JP   NC,ProofFailMalformedAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticExpectedEnd
            JP   NZ,ProofFailMalformedCode
            LD   A,(DiagnosticPartId)
            CP   9
            JP   NZ,ProofFailMalformedPart
            LD   HL,(DiagnosticOffset)
            LD   DE,MalformedSourceEnd-MalformedSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailMalformedOffset
            LD   HL,(DiagnosticLine)
            LD   DE,3
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailMalformedLine
            LD   HL,(DiagnosticColumn)
            LD   DE,1
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailMalformedColumn
            LD   A,(SemanticBufferBase)
            OR   A
            JP   NZ,ProofFailMalformedOutput

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

ProofFailAcceptedCompile:
            LD   A,1
            JR   ProofFailed
ProofFailAcceptedDiagnostic:
            LD   A,2
            JR   ProofFailed
ProofFailAcceptedOperations:
            LD   A,3
            JR   ProofFailed
ProofFailMalformedAccepted:
            LD   A,4
            JR   ProofFailed
ProofFailMalformedCode:
            LD   A,5
            JR   ProofFailed
ProofFailMalformedPart:
            LD   A,6
            JR   ProofFailed
ProofFailMalformedOffset:
            LD   A,7
            JR   ProofFailed
ProofFailMalformedLine:
            LD   A,8
            JR   ProofFailed
ProofFailMalformedColumn:
            LD   A,9
            JR   ProofFailed
ProofFailMalformedOutput:
            LD   A,10
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ExpectedOperations:
            .db  4,SemanticLoadU8,"A",SemanticWriteOutputByte
            .db  SemanticPropagate,SemanticReturn

ProofStatus:
            .db  0
ProofCase:
            .db  0
ProofEnd:

            .end
