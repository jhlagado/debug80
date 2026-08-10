; Compile and execute the exact Chapter 21 conformance corpus through the
; production packed LL(1) compiler and direct-Z80 backend.

            .include "memory-map.asmi"
            .include "loop-compiler-state.asmi"
            .include "aggregate-call-state.asmi"
            .include "loop-z80-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
LegacyCompilerSlices .equ 0
AggregateCallSlices  .equ 1
Stage7LL1            .equ 1
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

            .org TargetRuntimeBase
RuntimeCodeStart:
            .include "loop-z80-runtime.asm"
RuntimeCodeEnd:

            .org $B000
CorpusSourceStart:
Chapter21_1Part1:
            .db "record Cell",10
            .db "    value as u8",10
            .db "end",10
            .db 10
            .db "var template as Cell = (1)",10
            .db "var cells as Cell[4] = [(0), (0), (0), (0)]",10
            .db 10
Chapter21_1Part1End:
Chapter21_1Part2:
            .db "sub cellAt(index as u8) as Cell",10
            .db "    return cells[index]",10
            .db "end",10
            .db 10
            .db "sub setCell(cell as Cell, value as u8)",10
            .db "    cell.value = value",10
            .db "end",10
            .db 10
            .db "sub main()",10
            .db "    var index as u8",10
            .db "    var code as u8",10
            .db 10
            .db "    for index = 0 until 4",10
            .db "        cells[index] = template",10
            .db "        setCell(template, index + 1)",10
            .db "    end",10
            .db 10
            .db "    cells[0].value = cellAt(0).value",10
            .db "    if cells[0].value = 1",10
            .db "        writeOutputByte('Y')",10
            .db "        on error code",10
            .db "            return",10
            .db "        end",10
            .db "    elseif cells[0].value = 0",10
            .db "        writeOutputByte('N')",10
            .db "        on error code",10
            .db "            return",10
            .db "        end",10
            .db "    end",10
            .db "end",10
Chapter21_1Part2End:
Chapter21_1Descriptors:
            .db 1
            .dw Chapter21_1Part1,Chapter21_1Part1End
            .db 2
            .dw Chapter21_1Part2,Chapter21_1Part2End

Chapter21_2Source:
            .db "const badByte = 10",10
            .db 10
            .db "sub checkedByte() as u8 fails",10
            .db "    var value as u8 = readInputByte() or fail",10
            .db "    if value = 0",10
            .db "        fail badByte",10
            .db "    end",10
            .db "    return value",10
            .db "end",10
            .db 10
            .db "sub emitByte() fails",10
            .db "    var value as u8 = checkedByte() or fail",10
            .db "    writeOutputByte(value) or fail",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    emitByte() or fail",10
            .db "end",10
Chapter21_2SourceEnd:

Chapter21_3Source:
            .db "forward sub odd(value as u16) as boolean",10
            .db 10
            .db "sub even(value as u16) as boolean",10
            .db "    if value = 0",10
            .db "        return true",10
            .db "    end",10
            .db "    return odd(value - 1)",10
            .db "end",10
            .db 10
            .db "sub odd",10
            .db "    if value = 0",10
            .db "        return false",10
            .db "    end",10
            .db "    return even(value - 1)",10
            .db "end",10
            .db 10
            .db "sub main()",10
            .db "    var index as u16",10
            .db "    var code as u8",10
            .db 10
            .db "    for index = 0 to 5",10
            .db "        if odd(index)",10
            .db "            continue",10
            .db "        elseif index = 4",10
            .db "            exit",10
            .db "        end",10
            .db "    end",10
            .db 10
            .db "    writeOutputByte(u8(index))",10
            .db "    on error code",10
            .db "        return",10
            .db "    end",10
            .db "end",10
Chapter21_3SourceEnd:

Chapter21_4Source:
            .db "var text as string[4] = \"A\\0B\"",10
            .db "var snapshot as string[4]",10
            .db 10
            .db "sub textAlias() as string[4]",10
            .db "    return text",10
            .db "end",10
            .db 10
            .db "sub mutate(value as string[4])",10
            .db "    value[1] = 'Z'",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    snapshot = textAlias()",10
            .db 10
            .db "    if snapshot.length = 3 and snapshot[1] = 0",10
            .db "        mutate(textAlias())",10
            .db "    end",10
            .db 10
            .db "    if text[1] = 'Z' and snapshot[1] = 0",10
            .db "        writeOutputByte('Y') or fail",10
            .db "    end",10
            .db "end",10
Chapter21_4SourceEnd:

Chapter21_5Source:
            .db "sub emitMarker() fails",10
            .db "    writeOutputByte('R') or fail",10
            .db "end",10
            .db 10
            .db "sub relayMarker() fails",10
            .db "    return emitMarker() or fail",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    relayMarker() or fail",10
            .db "end",10
Chapter21_5SourceEnd:

Chapter21_6Source:
            .db "const sampleFailure = 7",10
            .db 10
            .db "sub alwaysFails() as u8 fails",10
            .db "    fail sampleFailure",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    var code as u8",10
            .db 10
            .db "    code = alwaysFails()",10
            .db "    on error code",10
            .db "        writeOutputByte(code) or fail",10
            .db "        return",10
            .db "    end",10
            .db 10
            .db "    writeOutputByte(0) or fail",10
            .db "end",10
Chapter21_6SourceEnd:

Chapter21_7Source:
            .db "sub main() fails",10
            .db "    writeStorageByte('A') or fail",10
            .db "    writeStorageByte('B') or fail",10
            .db "    seekStorageOutput(0) or fail",10
            .db "    writeStorageByte('Z') or fail",10
            .db "end",10
Chapter21_7SourceEnd:

Chapter21_8Source:
            .db "sub main()",10
            .db "    var index as u8",10
            .db 10
            .db "    for index = 250 to 300 step 10",10
            .db "        exit",10
            .db "    end",10
            .db "end",10
Chapter21_8SourceEnd:

Chapter21_9BoundsSource:
            .db "var bytes as u8[2]",10
            .db 10
            .db "sub main() fails",10
            .db "    var index as u8 = readInputByte() or fail",10
            .db "    bytes"
Chapter21_9BoundsPoint:
            .db "[index] = 1",10
            .db "end",10
Chapter21_9BoundsSourceEnd:

Chapter21_9DivideSource:
            .db "sub divide(value as u16, divisor as u16) as u16",10
            .db "    return value "
Chapter21_9DividePoint:
            .db "/ divisor",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    var divisor as u16 = readInputByte() or fail",10
            .db "    var result as u16 = divide(8, divisor)",10
            .db "end",10
Chapter21_9DivideSourceEnd:

Chapter21_12Source:
            .db "forward sub render(Player as u8) as u8",10
            .db 10
            .db "var player as u8 = 1",10
            .db "var PLAYER as u8 = 2",10
            .db 10
            .db "sub render",10
            .db "    return Player + player + PLAYER",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    writeOutputByte(render(3)) or fail",10
            .db "end",10
Chapter21_12SourceEnd:

Chapter21_13Source:
            .db "record Counter",10
            .db "    value as u8",10
            .db "end",10
            .db 10
            .db "var source as Counter = (1)",10
            .db "var destination as Counter",10
            .db 10
            .db "sub copyAndIncrement(input as Counter, output as Counter)",10
            .db "    output = input",10
            .db "    output.value = output.value + 1",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    copyAndIncrement(source, destination)",10
            .db "    if source.value = 1 and destination.value = 2",10
            .db "        writeOutputByte('Y') or fail",10
            .db "    end",10
            .db "end",10
Chapter21_13SourceEnd:

Chapter21_14Source:
            .db "record Sample",10
            .db "    value as u8",10
            .db "end",10
            .db 10
            .db "var samples as Sample[2] = [(3), (7)]",10
            .db 10
            .db "sub select(items as Sample[2], index as u8) as Sample",10
            .db "    return items[index]",10
            .db "end",10
            .db 10
            .db "sub forwardSelection(items as Sample[2], index as u8) as Sample",10
            .db "    return select(items, index)",10
            .db "end",10
            .db 10
            .db "sub replace(item as Sample, value as u8)",10
            .db "    item.value = value",10
            .db "end",10
            .db 10
            .db "sub main() fails",10
            .db "    replace(forwardSelection(samples, 1), 9)",10
            .db "    if samples[1].value = 9",10
            .db "        writeOutputByte('Y') or fail",10
            .db "    end",10
            .db "end",10
Chapter21_14SourceEnd:

Chapter21_15Source:
            .db "const sharedValue = 200",10
            .db "const enabled = true",10
            .db "var byteUse as u8 = sharedValue",10
            .db "var wordUse as u16 = sharedValue",10
            .db 10
            .db "sub main() fails",10
            .db "    if enabled and byteUse = 200 and wordUse = 200",10
            .db "        writeOutputByte('Y') or fail",10
            .db "    end",10
            .db "end",10
Chapter21_15SourceEnd:

Chapter21_16Source:
            .db "const hexMask = $FF",10
            .db "const binaryMask = %10110000",10
            .db "const hexMaximum = $ffff",10
            .db "const binaryMaximum = %1111111111111111",10
            .db 10
            .db "sub main() fails",10
            .db "    if hexMask = 255 and binaryMask = 176 and hexMaximum = 65535 and binaryMaximum = 65535",10
            .db "        writeOutputByte(binaryMask) or fail",10
            .db "    end",10
            .db "end",10
Chapter21_16SourceEnd:

Chapter21_17Source:
            .db "const folded = 3 xor 1 or 1",10
            .db "var byteValue as u8 = $a5",10
            .db "var wordValue as u16 = $f0f0",10
            .db 10
            .db "sub main() fails",10
            .db "    byteValue = byteValue xor $ff",10
            .db "    wordValue = wordValue xor $ffff",10
            .db "    if folded = 3 and byteValue = $5a and wordValue = $0f0f",10
            .db "        writeOutputByte(byteValue) or fail",10
            .db "    end",10
            .db "end",10
Chapter21_17SourceEnd:

Chapter21_17BooleanSource:
            .db "sub main()",10
            .db "    if true "
Chapter21_17BooleanPoint:
            .db "xor false",10
            .db "    end",10
            .db "end",10
Chapter21_17BooleanSourceEnd:

Chapter21_10UnconsumedSource:
            .db "sub readOne() as u8 fails",10
            .db "    return readInputByte() or fail",10
            .db "end",10
            .db 10
            .db "sub main()",10
            .db "    var value as u8",10
            .db "    value = readOne()"
Chapter21_10UnconsumedPoint:
            .db 10
            .db "end",10
Chapter21_10UnconsumedSourceEnd:

Chapter21_10NominalSource:
            .db "record LeftCell",10
            .db "    value as u8",10
            .db "end",10
            .db 10
            .db "record RightCell",10
            .db "    value as u8",10
            .db "end",10
            .db 10
            .db "var left as LeftCell",10
            .db "var right as RightCell",10
            .db 10
            .db "sub main()",10
            .db "    left = "
Chapter21_10NominalPoint:
            .db "right",10
            .db "end",10
Chapter21_10NominalSourceEnd:

Chapter21_10InitializerSource:
            .db "record Color",10
            .db "    red as u8",10
            .db "    green as u8",10
            .db "    blue as u8",10
            .db "end",10
            .db 10
            .db "var color as Color = (1, 2"
Chapter21_10InitializerPoint:
            .db ")",10
            .db 10
            .db "sub main()",10
            .db "end",10
Chapter21_10InitializerSourceEnd:

Chapter21_10AggregateLocalSource:
            .db "record Cell",10
            .db "    value as u8",10
            .db "end",10
            .db 10
            .db "var cell as Cell",10
            .db 10
            .db "sub cellAlias() as Cell",10
            .db "    return cell",10
            .db "end",10
            .db 10
            .db "sub main()",10
            .db "    var held as "
Chapter21_10AggregateLocalPoint:
            .db "Cell = cellAlias()",10
            .db "end",10
Chapter21_10AggregateLocalSourceEnd:

Chapter21_10RoutineFlowSource:
            .db "sub choose(flag as boolean) as u8",10
            .db "    if flag",10
            .db "        return 1",10
            .db "    end",10
Chapter21_10RoutineFlowPoint:
            .db "end",10
            .db 10
            .db "sub main()",10
            .db "end",10
Chapter21_10RoutineFlowSourceEnd:

Chapter21_10LaterSource:
            .db "sub main()",10
            .db "    "
Chapter21_10LaterPoint:
            .db "later()",10
            .db "end",10
            .db 10
            .db "sub later()",10
            .db "end",10
Chapter21_10LaterSourceEnd:

Chapter21_10MainSignatureSource:
            .db "sub main("
Chapter21_10MainSignaturePoint:
            .db "argument as u8)",10
            .db "end",10
Chapter21_10MainSignatureSourceEnd:

Chapter21_10ActiveCounterSource:
            .db "sub main()",10
            .db "    var index as u8",10
            .db 10
            .db "    for index = 0 until 4",10
Chapter21_10ActiveCounterPoint:
            .db "        "
Chapter21_10ActiveCounterName:
            .db "index = index + 1",10
            .db "    end",10
            .db "end",10
Chapter21_10ActiveCounterSourceEnd:

Chapter21_10ExactUseSource:
            .db "const Big = 300",10
            .db "var x as u8",10
            .db 10
            .db "sub main()",10
            .db "    x = "
Chapter21_10ExactUsePoint:
            .db "Big",10
            .db "end",10
Chapter21_10ExactUseSourceEnd:

Chapter21_10ExactNestedSource:
            .db "const Big = 300",10
            .db "var x as u8",10
            .db 10
            .db "sub main()",10
            .db "    x = ("
Chapter21_10ExactNestedPoint:
            .db "Big + 1)",10
            .db "end",10
Chapter21_10ExactNestedSourceEnd:

Chapter21_10BooleanAsIntegerSource:
            .db "const flag = true",10
            .db "var x as u8",10
            .db "sub main()",10
            .db "    x = flag"
Chapter21_10BooleanAsIntegerPoint:
            .db 10,"end",10
Chapter21_10BooleanAsIntegerSourceEnd:

Chapter21_10IntegerAsBooleanSource:
            .db "const value = 1",10
            .db "var flag as boolean",10
            .db "sub main()",10
            .db "    flag = value"
Chapter21_10IntegerAsBooleanPoint:
            .db 10,"end",10
Chapter21_10IntegerAsBooleanSourceEnd:

Chapter21_10HexSource:
            .db "const value = "
Chapter21_10HexPoint:
            .db "$10000",10
            .db 10
            .db "sub main()",10
            .db "end",10
Chapter21_10HexSourceEnd:

Chapter21_10BinarySource:
            .db "const value = "
Chapter21_10BinaryPoint:
            .db "%10000000000000000",10
            .db 10
            .db "sub main()",10
            .db "end",10
Chapter21_10BinarySourceEnd:

Chapter21_11BadPart2:
            .db "sub cellAt(index as u8) as Cell",10
            .db "    return cells[index]",10
            .db "end",10
            .db 10
            .db "sub setCell(cell as Cell, value as u8)",10
            .db "    cell.value = value",10
            .db "end",10
            .db 10
            .db "sub main()",10
            .db "    var index as u8",10
            .db "    var code as u8",10
Chapter21_11BadPoint:
            .db "    missing = 1",10
            .db "end",10
Chapter21_11BadPart2End:
Chapter21_11BadDescriptors:
            .db 1
            .dw Chapter21_1Part1,Chapter21_1Part1End
            .db 2
            .dw Chapter21_11BadPart2,Chapter21_11BadPart2End

; This split omits a physical line ending at the first part boundary. The
; adapter must synthesize exactly one logical NEWLINE before entering part 42.
Chapter21BoundaryPart1:
            .db "var value as u8 = 1"
Chapter21BoundaryPart1End:
Chapter21BoundaryPart2:
            .db "sub main() fails",10
            .db "    writeOutputByte(value) or fail",10
            .db "end",10
Chapter21BoundaryPart2End:
Chapter21BoundaryDescriptors:
            .db 41
            .dw Chapter21BoundaryPart1,Chapter21BoundaryPart1End
            .db 42
            .dw Chapter21BoundaryPart2,Chapter21BoundaryPart2End

; Eight ordered parts are the implementation capacity boundary. Seven blank
; declarations precede the final complete main routine.
Chapter21BlankPart:
            .db 10
Chapter21BlankPartEnd:
Chapter21CapacityProgram:
            .db "sub main()",10
            .db "end",10
Chapter21CapacityProgramEnd:
Chapter21CapacityDescriptors:
            .db 61
            .dw Chapter21BlankPart,Chapter21BlankPartEnd
            .db 62
            .dw Chapter21BlankPart,Chapter21BlankPartEnd
            .db 63
            .dw Chapter21BlankPart,Chapter21BlankPartEnd
            .db 64
            .dw Chapter21BlankPart,Chapter21BlankPartEnd
            .db 65
            .dw Chapter21BlankPart,Chapter21BlankPartEnd
            .db 66
            .dw Chapter21BlankPart,Chapter21BlankPartEnd
            .db 67
            .dw Chapter21BlankPart,Chapter21BlankPartEnd
Chapter21SingleDescriptor:
            .db 68
            .dw Chapter21CapacityProgram,Chapter21CapacityProgramEnd

Chapter21OpenDelimiterPart1:
            .db "sub main("
Chapter21OpenDelimiterPart1End:
Chapter21OpenDelimiterPart2:
            .db ")",10
            .db "end",10
Chapter21OpenDelimiterPart2End:
Chapter21OpenDelimiterDescriptors:
            .db 71
            .dw Chapter21OpenDelimiterPart1,Chapter21OpenDelimiterPart1End
            .db 72
            .dw Chapter21OpenDelimiterPart2,Chapter21OpenDelimiterPart2End
CorpusSourceEnd:

            .org $D000
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofStatus),A
            LD   (ProofCase),A
            LD   (ProofMaxGenerated),A
            LD   (ProofMaxGenerated+1),A

            LD   A,2
            LD   HL,Chapter21_1Descriptors
            CALL CompileAggregateCallParts
            JP   C,ProofCompileFailure
            CALL EncodeAggregateProgram
            JP   C,ProofEncodeFailure
            CALL ProofUpdateMaxGenerated
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofRunFailure
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofRunFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofRunFailure
            LD   A,(ServiceOutputBase)
            CP   "Y"
            JP   NZ,ProofRunFailure
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofRunFailure

            LD   A,2
            LD   (ProofCase),A
            LD   A,12
            LD   HL,Chapter21_2Source
            LD   DE,Chapter21_2SourceEnd
            CALL ProofBuildSingle
            JP   C,ProofFailed
            CALL ProofResetServices
            LD   A,1
            LD   (ServiceInputLength),A
            LD   A,"A"
            LD   (ServiceInputBase),A
            CALL ProofCallGenerated
            JP   C,ProofFailed
            LD   A,"A"
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,3
            LD   (ProofCase),A
            LD   A,13
            LD   HL,Chapter21_3Source
            LD   DE,Chapter21_3SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,4
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,4
            LD   (ProofCase),A
            LD   A,14
            LD   HL,Chapter21_4Source
            LD   DE,Chapter21_4SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,"Y"
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,5
            LD   (ProofCase),A
            LD   A,15
            LD   HL,Chapter21_5Source
            LD   DE,Chapter21_5SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,"R"
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,6
            LD   (ProofCase),A
            LD   A,16
            LD   HL,Chapter21_6Source
            LD   DE,Chapter21_6SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,7
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,7
            LD   (ProofCase),A
            LD   A,17
            LD   HL,Chapter21_7Source
            LD   DE,Chapter21_7SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            CALL ProofCheckSuccessNoOutput
            JP   C,ProofFailed
            LD   A,(ServiceStorageOutputLength)
            CP   2
            JP   NZ,ProofFailed
            LD   A,(ServiceStorageOutputCursor)
            CP   1
            JP   NZ,ProofFailed
            LD   A,(ServiceStorageOutputBase)
            CP   "Z"
            JP   NZ,ProofFailed
            LD   A,(ServiceStorageOutputBase+1)
            CP   "B"
            JP   NZ,ProofFailed

            LD   A,8
            LD   (ProofCase),A
            LD   A,18
            LD   HL,Chapter21_8Source
            LD   DE,Chapter21_8SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            CALL ProofCheckSuccessNoOutput
            JP   C,ProofFailed

            LD   A,9
            LD   (ProofCase),A
            LD   A,19
            LD   HL,Chapter21_9BoundsSource
            LD   DE,Chapter21_9BoundsSourceEnd
            CALL ProofBuildSingle
            JP   C,ProofFailed
            CALL ProofResetServices
            LD   A,1
            LD   (ServiceInputLength),A
            LD   A,2
            LD   (ServiceInputBase),A
            CALL ProofCallGenerated
            JP   C,ProofFailed
            LD   A,1
            LD   BC,Chapter21_9BoundsPoint-Chapter21_9BoundsSource
            CALL ProofCheckTrap
            JP   C,ProofFailed

            LD   A,10
            LD   (ProofCase),A
            LD   A,20
            LD   HL,Chapter21_9DivideSource
            LD   DE,Chapter21_9DivideSourceEnd
            CALL ProofBuildSingle
            JP   C,ProofFailed
            CALL ProofResetServices
            LD   A,1
            LD   (ServiceInputLength),A
            XOR  A
            LD   (ServiceInputBase),A
            CALL ProofCallGenerated
            JP   C,ProofFailed
            LD   A,3
            LD   BC,Chapter21_9DividePoint-Chapter21_9DivideSource
            CALL ProofCheckTrap
            JP   C,ProofFailed

            LD   A,21
            LD   (ProofCase),A
            LD   A,51
            LD   B,DiagnosticFailureContext
            LD   IX,Chapter21_10UnconsumedPoint+1-Chapter21_10UnconsumedSource
            LD   HL,Chapter21_10UnconsumedSource
            LD   DE,Chapter21_10UnconsumedSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,22
            LD   (ProofCase),A
            LD   A,52
            LD   B,DiagnosticTypeMismatch
            LD   IX,Chapter21_10NominalPoint+5-Chapter21_10NominalSource
            LD   HL,Chapter21_10NominalSource
            LD   DE,Chapter21_10NominalSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,23
            LD   (ProofCase),A
            LD   A,53
            LD   B,DiagnosticInitializerCount
            LD   IX,Chapter21_10InitializerPoint-Chapter21_10InitializerSource
            LD   HL,Chapter21_10InitializerSource
            LD   DE,Chapter21_10InitializerSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,24
            LD   (ProofCase),A
            LD   A,54
            LD   B,DiagnosticExpectedType
            LD   IX,Chapter21_10AggregateLocalPoint-Chapter21_10AggregateLocalSource
            LD   HL,Chapter21_10AggregateLocalSource
            LD   DE,Chapter21_10AggregateLocalSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,25
            LD   (ProofCase),A
            LD   A,55
            LD   B,DiagnosticRoutineFlow
            LD   IX,Chapter21_10RoutineFlowPoint+3-Chapter21_10RoutineFlowSource
            LD   HL,Chapter21_10RoutineFlowSource
            LD   DE,Chapter21_10RoutineFlowSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,26
            LD   (ProofCase),A
            LD   A,56
            LD   B,DiagnosticUnknownName
            LD   IX,Chapter21_10LaterPoint-Chapter21_10LaterSource
            LD   HL,Chapter21_10LaterSource
            LD   DE,Chapter21_10LaterSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,27
            LD   (ProofCase),A
            LD   A,57
            LD   B,DiagnosticExpectedRight
            LD   IX,Chapter21_10MainSignaturePoint-Chapter21_10MainSignatureSource
            LD   HL,Chapter21_10MainSignatureSource
            LD   DE,Chapter21_10MainSignatureSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,28
            LD   (ProofCase),A
            LD   A,58
            LD   B,DiagnosticActiveCounter
            LD   IX,Chapter21_10ActiveCounterName-Chapter21_10ActiveCounterSource
            LD   HL,Chapter21_10ActiveCounterSource
            LD   DE,Chapter21_10ActiveCounterSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,60
            LD   (ProofCase),A
            LD   A,69
            LD   B,DiagnosticIntegerRange
            LD   IX,Chapter21_10ExactUsePoint-Chapter21_10ExactUseSource
            LD   HL,Chapter21_10ExactUseSource
            LD   DE,Chapter21_10ExactUseSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed
            LD   HL,(DiagnosticLine)
            LD   DE,5
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailed
            LD   HL,(DiagnosticColumn)
            LD   DE,9
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailed

            LD   A,61
            LD   (ProofCase),A
            LD   A,70
            LD   B,DiagnosticIntegerRange
            LD   IX,Chapter21_10ExactNestedPoint-Chapter21_10ExactNestedSource
            LD   HL,Chapter21_10ExactNestedSource
            LD   DE,Chapter21_10ExactNestedSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed
            LD   HL,(DiagnosticLine)
            LD   DE,5
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailed
            LD   HL,(DiagnosticColumn)
            LD   DE,10
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailed

            LD   A,62
            LD   (ProofCase),A
            LD   A,71
            LD   B,DiagnosticTypeMismatch
            LD   IX,Chapter21_10BooleanAsIntegerPoint-Chapter21_10BooleanAsIntegerSource
            LD   HL,Chapter21_10BooleanAsIntegerSource
            LD   DE,Chapter21_10BooleanAsIntegerSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,63
            LD   (ProofCase),A
            LD   A,72
            LD   B,DiagnosticTypeMismatch
            LD   IX,Chapter21_10IntegerAsBooleanPoint-Chapter21_10IntegerAsBooleanSource
            LD   HL,Chapter21_10IntegerAsBooleanSource
            LD   DE,Chapter21_10IntegerAsBooleanSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,29
            LD   (ProofCase),A
            LD   A,59
            LD   B,DiagnosticLexical
            LD   IX,Chapter21_10HexPoint-Chapter21_10HexSource
            LD   HL,Chapter21_10HexSource
            LD   DE,Chapter21_10HexSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,64
            LD   (ProofCase),A
            LD   A,73
            LD   B,DiagnosticLexical
            LD   IX,Chapter21_10BinaryPoint-Chapter21_10BinarySource
            LD   HL,Chapter21_10BinarySource
            LD   DE,Chapter21_10BinarySourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,30
            LD   (ProofCase),A
            LD   A,2
            LD   B,DiagnosticUnknownName
            LD   C,2
            LD   IX,Chapter21_11BadPoint+4-Chapter21_11BadPart2
            LD   HL,Chapter21_11BadDescriptors
            CALL ProofExpectDiagnosticParts
            JP   C,ProofFailed
            LD   HL,(DiagnosticLine)
            LD   DE,12
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailed
            LD   HL,(DiagnosticColumn)
            LD   DE,5
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailed

            LD   A,31
            LD   (ProofCase),A
            LD   A,2
            LD   HL,Chapter21BoundaryDescriptors
            CALL CompileAggregateCallParts
            JP   C,ProofFailed
            CALL EncodeAggregateProgram
            JP   C,ProofFailed
            CALL ProofUpdateMaxGenerated
            CALL ProofResetServices
            CALL ProofCallGenerated
            JP   C,ProofFailed
            LD   A,1
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,32
            LD   (ProofCase),A
            LD   A,8
            LD   HL,Chapter21CapacityDescriptors
            CALL CompileAggregateCallParts
            JP   C,ProofFailed
            CALL EncodeAggregateProgram
            JP   C,ProofFailed
            CALL ProofUpdateMaxGenerated
            CALL ProofResetServices
            CALL ProofCallGenerated
            JP   C,ProofFailed
            CALL ProofCheckSuccessNoOutput
            JP   C,ProofFailed

            LD   A,33
            LD   (ProofCase),A
            LD   A,9
            LD   B,DiagnosticSourcePartCapacity
            LD   C,0
            LD   IX,0
            LD   HL,Chapter21CapacityDescriptors
            CALL ProofExpectDiagnosticParts
            JP   C,ProofFailed

            LD   A,36
            LD   (ProofCase),A
            LD   A,1
            LD   HL,Chapter21SingleDescriptor
            CALL CompileAggregateCallParts
            JP   C,ProofFailed
            CALL EncodeAggregateProgram
            JP   C,ProofFailed
            CALL ProofUpdateMaxGenerated
            CALL ProofResetServices
            CALL ProofCallGenerated
            JP   C,ProofFailed
            CALL ProofCheckSuccessNoOutput
            JP   C,ProofFailed

            LD   A,34
            LD   (ProofCase),A
            LD   A,2
            LD   B,DiagnosticLexical
            LD   C,71
            LD   IX,Chapter21OpenDelimiterPart1End-Chapter21OpenDelimiterPart1
            LD   HL,Chapter21OpenDelimiterDescriptors
            CALL ProofExpectDiagnosticParts
            JP   C,ProofFailed

            LD   A,35
            LD   (ProofCase),A
            LD   A,2
            LD   HL,Chapter21BoundaryDescriptors
            CALL CompileAggregateCallParts
            JP   C,ProofFailed
            CALL EncodeAggregateProgram
            JP   C,ProofFailed
            CALL ProofUpdateMaxGenerated
            CALL ProofResetServices
            CALL ProofCallGenerated
            JP   C,ProofFailed
            LD   A,1
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,12
            LD   (ProofCase),A
            LD   A,22
            LD   HL,Chapter21_12Source
            LD   DE,Chapter21_12SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,6
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,13
            LD   (ProofCase),A
            LD   A,23
            LD   HL,Chapter21_13Source
            LD   DE,Chapter21_13SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,"Y"
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,14
            LD   (ProofCase),A
            LD   A,24
            LD   HL,Chapter21_14Source
            LD   DE,Chapter21_14SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,"Y"
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,15
            LD   (ProofCase),A
            LD   A,25
            LD   HL,Chapter21_15Source
            LD   DE,Chapter21_15SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,"Y"
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,65
            LD   (ProofCase),A
            LD   A,74
            LD   HL,Chapter21_16Source
            LD   DE,Chapter21_16SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,176
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,66
            LD   (ProofCase),A
            LD   A,75
            LD   HL,Chapter21_17Source
            LD   DE,Chapter21_17SourceEnd
            CALL ProofRunSingle
            JP   C,ProofFailed
            LD   A,$5A
            CALL ProofCheckOutput
            JP   C,ProofFailed

            LD   A,67
            LD   (ProofCase),A
            LD   A,76
            LD   B,DiagnosticTypeMismatch
            LD   IX,Chapter21_17BooleanPoint-Chapter21_17BooleanSource
            LD   HL,Chapter21_17BooleanSource
            LD   DE,Chapter21_17BooleanSourceEnd
            CALL ProofExpectDiagnosticSingle
            JP   C,ProofFailed

            LD   A,$A5
            LD   (ProofStatus),A
            XOR  A
            LD   (ProofCase),A
            HALT

.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofBuildSingle:
            CALL CompileAggregateCallSlice
            RET  C
            CALL EncodeAggregateProgram
            RET  C
            JR   ProofUpdateMaxGenerated

.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofRunSingle:
            CALL ProofBuildSingle
            RET  C
            CALL ProofResetServices
            JP   ProofCallGenerated

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
ProofUpdateMaxGenerated:
            LD   HL,(GeneratedSize)
            LD   DE,(ProofMaxGenerated)
            OR   A
            SBC  HL,DE
            JR   C,ProofUpdateMaxDone
            JR   Z,ProofUpdateMaxDone
            LD   HL,(GeneratedSize)
            LD   (ProofMaxGenerated),HL
ProofUpdateMaxDone:
            XOR  A
            RET

.routine in A,B,DE,HL,IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectDiagnosticSingle:
            LD   (ProofExpectedPart),A
            LD   A,B
            LD   (ProofExpectedDiagnostic),A
            PUSH IX
            POP  BC
            LD   (ProofExpectedOffset),BC
            LD   A,(ProofExpectedPart)
            CALL CompileAggregateCallSlice
            JR   NC,ProofDiagnosticFailure
            JR   ProofCheckDiagnostic

.routine in A,B,C,HL,IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
ProofExpectDiagnosticParts:
            LD   (ProofPartCount),A
            LD   A,B
            LD   (ProofExpectedDiagnostic),A
            LD   A,C
            LD   (ProofExpectedPart),A
            PUSH IX
            POP  BC
            LD   (ProofExpectedOffset),BC
            LD   A,(ProofPartCount)
            CALL CompileAggregateCallParts
            JR   NC,ProofDiagnosticFailure
ProofCheckDiagnostic:
            LD   A,(ProofExpectedDiagnostic)
            LD   HL,DiagnosticCode
            CP   (HL)
            JR   NZ,ProofDiagnosticFailure
            LD   A,(ProofExpectedPart)
            LD   HL,DiagnosticPartId
            CP   (HL)
            JR   NZ,ProofDiagnosticFailure
            LD   HL,(DiagnosticOffset)
            LD   DE,(ProofExpectedOffset)
            OR   A
            SBC  HL,DE
            RET  Z
ProofDiagnosticFailure:
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,HL
ProofResetServices:
            CALL Reset
            XOR  A
            LD   (ServiceInputLength),A
            LD   (ServiceStorageInputLength),A
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,HL
ProofCheckOutput:
            LD   B,A
            LD   A,(RunState)
            CP   RunSucceeded
            JR   NZ,ProofCheckFailure
            LD   A,(ServiceOutputLength)
            CP   1
            JR   NZ,ProofCheckFailure
            LD   A,(ServiceOutputBase)
            CP   B
            JR   NZ,ProofCheckFailure
            LD   A,(ActivationDepth)
            OR   A
            RET  Z
ProofCheckFailure:
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,HL
ProofCheckSuccessNoOutput:
            LD   A,(RunState)
            CP   RunSucceeded
            JR   NZ,ProofCheckFailure
            LD   A,(ServiceOutputLength)
            OR   A
            JR   NZ,ProofCheckFailure
            LD   A,(ActivationDepth)
            OR   A
            RET  Z
            SCF
            RET

.routine in A,BC out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
ProofCheckTrap:
            LD   (ProofExpectedTrap),A
            LD   (ProofExpectedOffset),BC
            LD   A,(RunState)
            CP   RunTrapped
            JR   NZ,ProofCheckFailure
            LD   A,(ProofExpectedTrap)
            LD   HL,TrapNumber
            CP   (HL)
            JR   NZ,ProofCheckFailure
            LD   HL,(TrapOffset)
            LD   DE,(ProofExpectedOffset)
            OR   A
            SBC  HL,DE
            JR   NZ,ProofCheckFailure
            LD   A,(ActivationDepth)
            OR   A
            RET  Z
            SCF
            RET

; Generated code must restore the root SP and IX on every terminal path.
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
            JR   NZ,ProofCallGeneratedFailure
            LD   HL,0
            ADD  HL,SP
            LD   DE,(ProofExpectedSP)
            OR   A
            SBC  HL,DE
            RET  Z
ProofCallGeneratedFailure:
            SCF
            RET

ProofCompileFailure: LD A,1
                     JR ProofFailed
ProofEncodeFailure:  LD A,2
                     JR ProofFailed
ProofRunFailure:     LD A,3
ProofFailed:
            LD   (ProofCase),A
            HALT

ProofExpectedSP: .dw 0
ProofExpectedOffset: .dw 0
ProofExpectedTrap: .db 0
ProofMaxGenerated: .dw 0
ProofExpectedDiagnostic: .db 0
ProofExpectedPart: .db 0
ProofPartCount: .db 0
ProofStatus:     .db 0
ProofCase:       .db 0
ProofEnd:
