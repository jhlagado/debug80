; Prove Stage 6 packed aggregate layouts and atomic static-image publication.

            .include "memory-map.asmi"
SegmentedOutput .equ 0
            .include "loop-compiler-state.asmi"
            .include "loop-z80-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
LegacyCompilerSlices .equ 0
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
            .include "aggregate-z80.asm"
TypedSinkCodeEnd:
SinkCodeEnd:
CompilerCodeEnd:
CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
AggregateAcceptedSource:
            .db "record Pixel",10
            .db "r as u8",10
            .db "g as u8",10
            .db "b as u8",10
            .db "end",10
            .db "record Entry",10
            .db "id as u16",10
            .db "color as Pixel",10
            .db "label as string[4]",10
            .db "samples as u8[3]",10
            .db "end",10
            .db "var zero as Entry",10
            .db "var one as Entry = (513,(1,2,3),\"A\\xAf\",[4,5,6])",10
            .db "var many as Entry[2] = ["
            .db "(1,(7,8,9),\"xy\",[10,11,12]),"
            .db "(2,(13,14,15),\"\",[16,17,18])]",10
            .db "sub main() fails",10
            .db "end",10
AggregateAcceptedSourceEnd:

AggregateCountSource:
            .db "record Pair",10,"left as u8",10,"right as u8",10,"end",10
            .db "var bad as Pair = (1)",10
AggregateCountPoint:
            .db "sub main() fails",10,"end",10
AggregateCountSourceEnd:

AggregateShapeSource:
            .db "record Pair",10,"left as u8",10,"right as u8",10,"end",10
            .db "var bad as Pair = [1,2]",10
AggregateShapeSourceEnd:

AggregateTooManySource:
            .db "record Pair",10,"left as u8",10,"right as u8",10,"end",10
            .db "var bad as Pair = (1,2,3)",10
AggregateTooManySourceEnd:

AggregateCloseShapeSource:
            .db "record Pair",10,"left as u8",10,"right as u8",10,"end",10
            .db "var bad as Pair = (1,2]",10
AggregateCloseShapeSourceEnd:

AggregateTypeSource:
            .db "var bad as u8 = true",10
AggregateTypeSourceEnd:

AggregateRecordNameScalarSource:
            .db "record R",10,"v as u8",10,"end",10
            .db "sub main() fails",10
            .db "writeOutputByte(R) or fail",10
            .db "end",10
AggregateRecordNameScalarSourceEnd:

AggregateObjectScalarSource:
            .db "record R",10,"v as u8",10,"end",10
            .db "var item as R",10
            .db "sub main() fails",10
            .db "writeOutputByte(item) or fail",10
            .db "end",10
AggregateObjectScalarSourceEnd:

AggregateObjectAssignmentSource:
            .db "record R",10,"v as u8",10,"end",10
            .db "var item as R",10
            .db "sub main() fails",10
            .db "item = 1",10
            .db "end",10
AggregateObjectAssignmentSourceEnd:

AggregateRecordStepSource:
            .db "record R",10,"v as u8",10,"end",10
            .db "sub main() fails",10
            .db "var i as u8 = 0",10
            .db "for i = 0 until 10 step "
AggregateRecordStepPoint:
            .db "R",10
            .db "end",10,"end",10
AggregateRecordStepSourceEnd:

AggregateDuplicateFieldSource:
            .db "record R",10,"first as u8",10
AggregateDuplicateFieldPoint:
            .db "first as u16",10,"end",10
AggregateDuplicateFieldSourceEnd:

AggregateStringLengthSource:
            .db "var bad as string[2] = \"abc\"",10
AggregateStringLengthSourceEnd:

AggregateBooleanSource:
            .db "record Flags",10
            .db "off as boolean",10,"enabled as boolean",10,"end",10
            .db "var flags as Flags = (false,true)",10
            .db "sub main() fails",10,"end",10
AggregateBooleanSourceEnd:

AggregateIdentitySource:
            .db "record A",10,"x as u8",10,"end",10
            .db "record B",10,"x as u8",10,"end",10
            .db "var first as u8[2]",10
            .db "var second as u8[2]",10
            .db "sub main() fails",10,"end",10
AggregateIdentitySourceEnd:

AggregateMalformedEscapeSource:
            .db "var bad as string[1] = \"\\q\"",10
AggregateMalformedEscapeSourceEnd:

AggregateStringExtentCapacitySource:
            .db "var bad as string[25"
AggregateStringExtentCapacityDigit:
            .db "4"
AggregateStringExtentCapacityPoint:
            .db "]",10
AggregateStringExtentCapacitySourceEnd:

AggregateEmptyRecordSource:
            .db "record Empty",10,"end",10
AggregateEmptyRecordSourceEnd:

AggregateRecordCapacitySource:
            .db "record R1",10,"v as u8",10,"end",10
            .db "record R2",10,"v as u8",10,"end",10
            .db "record R3",10,"v as u8",10,"end",10
            .db "record R4",10,"v as u8",10,"end",10
            .db "record R5",10,"v as u8",10,"end",10
            .db "record R6",10,"v as u8",10,"end",10
AggregateRecordCapacitySourceEnd:

AggregateFieldCapacitySource:
            .db "record Wide",10
            .db "a as u8",10,"b as u8",10,"c as u8",10
            .db "d as u8",10,"e as u8",10,"f as u8",10
            .db "g as u8",10,"h as u8",10,"i as u8",10
            .db "j as u8",10,"k as u8",10,"l as u8",10
            .db "m as u8",10,"end",10
AggregateFieldCapacitySourceEnd:

AggregateMetadataSource:
            .db "record Wide",10
            .db "a as string[1]",10,"b as string[2]",10
            .db "c as string[3]",10,"d as string[4]",10
            .db "e as string[5]",10,"f as string[6]",10
            .db "g as string[7]",10,"h as string[8]",10
AggregateMetadataPoint:
            .db "i as string[9]",10,"end",10
AggregateMetadataSourceEnd:

AggregateDepthSource:
            .db "record R1",10,"v as u8",10,"end",10
            .db "record R2",10,"v as R1",10,"end",10
            .db "record R3",10,"v as R2",10,"end",10
            .db "record R4",10,"v as R3",10,"end",10
            .db "record R5",10,"v as R4",10,"end",10
            .db "var deep as R5 = (((((1)))))",10
AggregateDepthSourceEnd:

AggregateElementCapacityAcceptedSource:
            .db "var items as u8[31] = ["
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]",10
            .db "sub main() fails",10,"end",10
AggregateElementCapacityAcceptedSourceEnd:

AggregateElementCapacityRejectedSource:
            .db "var items as u8[32] = ["
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,"
            .db "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]",10
            .db "sub main() fails",10,"end",10
AggregateElementCapacityRejectedSourceEnd:

AggregateDataCapacitySource:
            .db "var a as u8[255]",10
            .db "var b as u8"
AggregateDataCapacityPoint:
            .db 10
AggregateDataCapacitySourceEnd:

AggregateTypeExtentCapacitySource:
            .db "var huge as u16[128]",10
AggregateTypeExtentCapacitySourceEnd:

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
            LD   A,130
            LD   HL,AggregateAcceptedSource
            LD   DE,AggregateAcceptedSourceEnd
            CALL CompileAggregateSlice
            JP   C,ProofFailAcceptedCompile
            LD   A,(StaticImageLength)
            CP   AggregateExpectedImageEnd-AggregateExpectedImage
            JP   NZ,ProofFailStaticLength
            LD   HL,StaticImageBase
            LD   DE,AggregateExpectedImage
            LD   B,AggregateExpectedImageEnd-AggregateExpectedImage
            CALL ProofCompareBytes
            JP   C,ProofFailStaticBytes
            ; Pixel offsets 0,1,2 and Entry offsets 0,2,5,11.
            LD   A,(AggregateFieldTableBase+AggregateFieldOffset)
            OR   A
            JP   NZ,ProofFailLayout
            LD   A,(AggregateFieldTableBase+AggregateFieldEntrySize+AggregateFieldOffset)
            CP   1
            JP   NZ,ProofFailLayout
            LD   A,(AggregateFieldTableBase+AggregateFieldEntrySize*2+AggregateFieldOffset)
            CP   2
            JP   NZ,ProofFailLayout
            LD   A,(AggregateFieldTableBase+AggregateFieldEntrySize*3+AggregateFieldOffset)
            OR   A
            JP   NZ,ProofFailLayout
            LD   A,(AggregateFieldTableBase+AggregateFieldEntrySize*4+AggregateFieldOffset)
            CP   2
            JP   NZ,ProofFailLayout
            LD   A,(AggregateFieldTableBase+AggregateFieldEntrySize*5+AggregateFieldOffset)
            CP   5
            JP   NZ,ProofFailLayout
            LD   A,(AggregateFieldTableBase+AggregateFieldEntrySize*6+AggregateFieldOffset)
            CP   11
            JP   NZ,ProofFailLayout
            LD   A,(AggregateTypeCount)
            CP   5
            JP   NZ,ProofFailLayout
            LD   A,(AggregateRecordCount)
            CP   2
            JP   NZ,ProofFailLayout
            LD   A,(AggregateFieldCount)
            CP   7
            JP   NZ,ProofFailLayout
            LD   A,(AggregateSymbolTypeBase+2)
            CP   7
            JP   NZ,ProofFailLayout
            LD   A,(AggregateSymbolTypeBase+3)
            CP   7
            JP   NZ,ProofFailLayout
            LD   A,(AggregateSymbolTypeBase+4)
            CP   8
            JP   NZ,ProofFailLayout
            LD   A,(SymbolTableBase+SymbolEntrySize*2+3)
            CP   SymbolInfoAggregateProgram
            JP   NZ,ProofFailLayout
            LD   HL,(SymbolTableBase+SymbolEntrySize*2+4)
            LD   A,H
            OR   L
            JP   NZ,ProofFailLayout
            LD   HL,(SymbolTableBase+SymbolEntrySize*3+4)
            LD   DE,14
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailLayout
            LD   HL,(SymbolTableBase+SymbolEntrySize*4+4)
            LD   DE,28
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailLayout
            CALL EncodeAggregateProgram
            JP   C,ProofFailAcceptedEncode
            LD   HL,GeneratedBase+3
            LD   DE,AggregateExpectedImage
            LD   B,AggregateExpectedImageEnd-AggregateExpectedImage
            CALL ProofCompareBytes
            JP   C,ProofFailPublishedBytes
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailRunState

            ; Force a failure during the static-image copy. The transactional
            ; publisher must restore the complete prior image and size. Change
            ; the first source byte so a missing rollback cannot pass by
            ; rewriting the same bytes that were already published.
            LD   HL,(GeneratedSize)
            LD   (AggregateSavedSize),HL
            LD   A,$5A
            LD   (StaticImageBase),A
            LD   HL,GeneratedBase+12
            CALL EncodeAggregateProgramWithinLimit
            JR   C,AggregateAtomicFailedAsExpected
            XOR  A
            LD   (StaticImageBase),A
            JP   ProofFailAtomicAccepted
AggregateAtomicFailedAsExpected:
            XOR  A
            LD   (StaticImageBase),A
            LD   HL,(GeneratedSize)
            LD   DE,(AggregateSavedSize)
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailAtomicSize
            LD   HL,(AggregateSavedSize)
            LD   A,H
            OR   A
            JP   NZ,ProofFailAtomicSize
            LD   B,L
            LD   HL,GeneratedBase
            LD   DE,BackupBase
            CALL ProofCompareBytes
            JP   C,ProofFailAtomicBytes

            LD   A,151
            LD   HL,AggregateBooleanSource
            LD   DE,AggregateBooleanSourceEnd
            CALL CompileAggregateSlice
            JP   C,ProofFailBoolean
            LD   A,(StaticImageLength)
            CP   2
            JP   NZ,ProofFailBoolean
            LD   A,(StaticImageBase)
            OR   A
            JP   NZ,ProofFailBoolean
            LD   A,(StaticImageBase+1)
            CP   1
            JP   NZ,ProofFailBoolean

            LD   A,152
            LD   HL,AggregateIdentitySource
            LD   DE,AggregateIdentitySourceEnd
            CALL CompileAggregateSlice
            JP   C,ProofFailIdentity
            LD   A,(SymbolTableBase+4)
            CP   4
            JP   NZ,ProofFailIdentity
            LD   A,(SymbolTableBase+SymbolEntrySize+4)
            CP   5
            JP   NZ,ProofFailIdentity
            LD   A,(AggregateSymbolTypeBase+2)
            CP   6
            JP   NZ,ProofFailIdentity
            LD   A,(AggregateSymbolTypeBase+3)
            CP   6
            JP   NZ,ProofFailIdentity
            LD   A,(AggregateTypeCount)
            CP   3
            JP   NZ,ProofFailIdentity
            LD   A,(AggregateRecordCount)
            CP   2
            JP   NZ,ProofFailIdentity
            LD   HL,GeneratedBase+3
            LD   DE,AggregateExpectedImage
            LD   B,AggregateExpectedImageEnd-AggregateExpectedImage
            CALL ProofCompareBytes
            JP   C,ProofFailAtomicBytes

            LD   A,131
            LD   HL,AggregateCountSource
            LD   DE,AggregateCountSourceEnd
            LD   B,DiagnosticInitializerCount
            CALL ProofExpectDiagnostic
            JP   C,ProofFailCount
            LD   A,132
            LD   HL,AggregateShapeSource
            LD   DE,AggregateShapeSourceEnd
            LD   B,DiagnosticInitializerShape
            CALL ProofExpectDiagnostic
            JP   C,ProofFailShape
            LD   A,137
            LD   HL,AggregateTooManySource
            LD   DE,AggregateTooManySourceEnd
            LD   B,DiagnosticInitializerCount
            CALL ProofExpectDiagnostic
            JP   C,ProofFailTooMany
            LD   A,138
            LD   HL,AggregateCloseShapeSource
            LD   DE,AggregateCloseShapeSourceEnd
            LD   B,DiagnosticInitializerShape
            CALL ProofExpectDiagnostic
            JP   C,ProofFailCloseShape
            LD   A,139
            LD   HL,AggregateTypeSource
            LD   DE,AggregateTypeSourceEnd
            LD   B,DiagnosticTypeMismatch
            CALL ProofExpectDiagnostic
            JP   C,ProofFailType
            LD   A,140
            LD   HL,AggregateRecordNameScalarSource
            LD   DE,AggregateRecordNameScalarSourceEnd
            LD   B,DiagnosticTypeMismatch
            CALL ProofExpectDiagnostic
            JP   C,ProofFailRecordScalar
            LD   A,141
            LD   HL,AggregateObjectScalarSource
            LD   DE,AggregateObjectScalarSourceEnd
            LD   B,DiagnosticTypeMismatch
            CALL ProofExpectDiagnostic
            JP   C,ProofFailObjectScalar
            LD   A,142
            LD   HL,AggregateObjectAssignmentSource
            LD   DE,AggregateObjectAssignmentSourceEnd
            LD   B,DiagnosticTypeMismatch
            CALL ProofExpectDiagnostic
            JP   C,ProofFailObjectAssignment
            LD   A,145
            LD   HL,AggregateRecordStepSource
            LD   DE,AggregateRecordStepSourceEnd
            LD   B,DiagnosticLoopStep
            CALL ProofExpectDiagnostic
            JP   C,ProofFailRecordStep
            LD   HL,(DiagnosticOffset)
            LD   DE,AggregateRecordStepPoint-AggregateRecordStepSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailRecordStep
            LD   A,143
            LD   HL,AggregateDuplicateFieldSource
            LD   DE,AggregateDuplicateFieldSourceEnd
            LD   B,DiagnosticDuplicateName
            CALL ProofExpectDiagnostic
            JP   C,ProofFailDuplicateField
            LD   HL,(DiagnosticOffset)
            LD   DE,AggregateDuplicateFieldPoint-AggregateDuplicateFieldSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailDuplicateField
            LD   A,133
            LD   HL,AggregateStringLengthSource
            LD   DE,AggregateStringLengthSourceEnd
            LD   B,DiagnosticStringLength
            CALL ProofExpectDiagnostic
            JP   C,ProofFailStringLength
            LD   A,153
            LD   HL,AggregateMalformedEscapeSource
            LD   DE,AggregateMalformedEscapeSourceEnd
            LD   B,DiagnosticLexical
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMalformedEscape
            LD   A,154
            LD   HL,AggregateStringExtentCapacitySource
            LD   DE,AggregateStringExtentCapacitySourceEnd
            LD   B,DiagnosticStringCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailStringExtentCapacity
            LD   HL,(DiagnosticOffset)
            LD   DE,AggregateStringExtentCapacityPoint-AggregateStringExtentCapacitySource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringExtentCapacity
            LD   A,'5'
            LD   (AggregateStringExtentCapacityDigit),A
            LD   A,156
            LD   HL,AggregateStringExtentCapacitySource
            LD   DE,AggregateStringExtentCapacitySourceEnd
            LD   B,DiagnosticStringCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailStringExtentCapacity
            LD   HL,(DiagnosticOffset)
            LD   DE,AggregateStringExtentCapacityPoint-AggregateStringExtentCapacitySource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringExtentCapacity
            LD   A,155
            LD   HL,AggregateSealedStringBoundarySource
            LD   DE,AggregateSealedStringBoundarySourceEnd
            CALL CompileAggregateSlice
            JP   C,ProofFailStringExtentCapacity
            LD   HL,(StaticImageLength)
            LD   DE,255
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailStringExtentCapacity
            LD   HL,StaticImageBase
            LD   BC,255
AggregateSealedStringZeroLoop:
            LD   A,(HL)
            OR   A
            JP   NZ,ProofFailStringExtentCapacity
            INC  HL
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,AggregateSealedStringZeroLoop
            LD   A,148
            LD   HL,AggregateEmptyRecordSource
            LD   DE,AggregateEmptyRecordSourceEnd
            LD   B,DiagnosticRecordEmpty
            CALL ProofExpectDiagnostic
            JP   C,ProofFailEmptyRecord
            LD   A,149
            LD   HL,AggregateRecordCapacitySource
            LD   DE,AggregateRecordCapacitySourceEnd
            LD   B,DiagnosticTypeMetadataCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailRecordCapacity
            LD   A,150
            LD   HL,AggregateFieldCapacitySource
            LD   DE,AggregateFieldCapacitySourceEnd
            LD   B,DiagnosticTypeMetadataCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailFieldCapacity
            LD   A,134
            LD   HL,AggregateMetadataSource
            LD   DE,AggregateMetadataSourceEnd
            LD   B,DiagnosticTypeMetadataCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMetadata
            LD   A,135
            LD   HL,AggregateDepthSource
            LD   DE,AggregateDepthSourceEnd
            LD   B,DiagnosticInitializerCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailDepth
            LD   A,146
            LD   HL,AggregateElementCapacityAcceptedSource
            LD   DE,AggregateElementCapacityAcceptedSourceEnd
            CALL CompileAggregateSlice
            JP   C,ProofFailElementBoundary
            LD   A,147
            LD   HL,AggregateElementCapacityRejectedSource
            LD   DE,AggregateElementCapacityRejectedSourceEnd
            CALL CompileAggregateSlice
            JP   C,ProofFailElementBoundary
            LD   A,136
            LD   HL,AggregateDataCapacitySource
            LD   DE,AggregateDataCapacitySourceEnd
            LD   B,DiagnosticProgramDataCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailDataCapacity
            LD   HL,(DiagnosticOffset)
            LD   DE,AggregateDataCapacityPoint-AggregateDataCapacitySource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailDataCapacity
            LD   A,144
            LD   HL,AggregateTypeExtentCapacitySource
            LD   DE,AggregateTypeExtentCapacitySourceEnd
            LD   B,DiagnosticProgramDataCapacity
            CALL ProofExpectDiagnostic
            JP   C,ProofFailTypeExtentCapacity

            LD   A,$A5
            LD   (ProofStatus),A
            HALT

.routine in A,B,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectDiagnostic:
            PUSH BC
            CALL CompileAggregateSlice
            POP  BC
            RET  NC
            LD   A,(DiagnosticCode)
            CP   B
            RET  Z
            SCF
            RET

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

ProofFailAcceptedCompile: LD A,1
                           JP ProofFailed
ProofFailStaticLength:    LD A,2
                           JP ProofFailed
ProofFailStaticBytes:     LD A,3
                           JP ProofFailed
ProofFailLayout:          LD A,4
                           JP ProofFailed
ProofFailAcceptedEncode:  LD A,5
                           JP ProofFailed
ProofFailPublishedBytes:  LD A,6
                           JP ProofFailed
ProofFailFrame:           LD A,7
                           JP ProofFailed
ProofFailRunState:        LD A,8
                           JP ProofFailed
ProofFailAtomicAccepted:  LD A,9
                           JP ProofFailed
ProofFailAtomicSize:      LD A,10
                           JP ProofFailed
ProofFailAtomicBytes:     LD A,11
                           JP ProofFailed
ProofFailCount:           LD A,12
                           JP ProofFailed
ProofFailShape:           LD A,13
                           JP ProofFailed
ProofFailStringLength:    LD A,14
                           JP ProofFailed
ProofFailMetadata:        LD A,15
                           JP ProofFailed
ProofFailDepth:           LD A,16
                           JP ProofFailed
ProofFailDataCapacity:    LD A,17
                           JP ProofFailed
ProofFailTooMany:          LD A,18
                           JP ProofFailed
ProofFailCloseShape:       LD A,19
                           JP ProofFailed
ProofFailType:             LD A,20
                           JP ProofFailed
ProofFailRecordScalar:     LD A,21
                           JP ProofFailed
ProofFailObjectScalar:     LD A,22
                           JP ProofFailed
ProofFailObjectAssignment: LD A,23
                           JP ProofFailed
ProofFailRecordStep:       LD A,26
                           JP ProofFailed
ProofFailElementBoundary:  LD A,27
                           JP ProofFailed
ProofFailEmptyRecord:      LD A,28
                           JP ProofFailed
ProofFailRecordCapacity:   LD A,29
                           JP ProofFailed
ProofFailFieldCapacity:    LD A,30
                           JP ProofFailed
ProofFailBoolean:          LD A,31
                           JP ProofFailed
ProofFailIdentity:         LD A,32
                           JP ProofFailed
ProofFailMalformedEscape:  LD A,33
                           JP ProofFailed
ProofFailStringExtentCapacity: LD A,34
                           JP ProofFailed
ProofFailDuplicateField:   LD A,24
                           JP ProofFailed
ProofFailTypeExtentCapacity: LD A,25
ProofFailed:
            LD   (ProofCase),A
            HALT

ProofExpectedSP:       .dw 0
AggregateSavedSize:   .dw 0
ProofStatus:           .db 0
ProofCase:             .db 0
AggregateExpectedImage:
            ; zero Entry
            .db 0,0,0,0,0,0,0,0,0,0,0,0,0,0
            ; one Entry
            .db 1,2,1,2,3,2,65,175,0,0,0,4,5,6
            ; many[0]
            .db 1,0,7,8,9,2,120,121,0,0,0,10,11,12
            ; many[1]
            .db 2,0,13,14,15,0,0,0,0,0,0,16,17,18
AggregateExpectedImageEnd:
AggregateSealedStringBoundarySource:
            .db "var full as string[253]",10
            .db "sub main() fails",10,"end",10
AggregateSealedStringBoundarySourceEnd:
ProofEnd:
