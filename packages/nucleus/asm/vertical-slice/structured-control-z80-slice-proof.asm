; Prove typed if/elseif/else, while, counted for, and loop transfers end to end.

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
StructuredSinkStart:
            .include "typed-expression-z80.asm"
StructuredSinkEnd:
SinkCodeEnd:
CompilerCodeEnd:
CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
StructuredAcceptedSource:
            .db "var out as u8 = 0",10
            .db "var finalI as u8 = 0",10
            .db "var finalJ as u16 = 0",10
            .db "forward sub descend(value as u8) as u8",10
            .db "sub main() fails",10
            .db "    var i as u8 = 0",10
            .db "    var j as u16 = 0",10
            .db "    if false",10
            .db "        out = 99",10
            .db "    elseif true",10
            .db "        out = 1",10
            .db "    else",10
            .db "        out = 98",10
            .db "    end",10
            .db "    while out < 3",10
            .db "        out = out + 1",10
            .db "    end",10
            .db "    for i = 0 until 4",10
            .db "        if i = 1",10
            .db "            continue",10
            .db "        end",10
            .db "        if i = 3",10
            .db "            exit",10
            .db "        end",10
            .db "        out = out + i",10
            .db "    end",10
            .db "    for j = 3 to 0 step -1",10
            .db "        out = out + 1",10
            .db "    end",10
            .db "    finalI = i",10
            .db "    finalJ = j",10
            .db "    out = out + descend(3)",10
            .db "    writeOutputByte(out) or fail",10
            .db "end",10
            .db "sub descend",10
            .db "    if value = 0",10
            .db "        return value",10
            .db "    end",10
            .db "    return "
StructuredAcceptedRecursiveCall:
            .db "descend(value - 1)",10
            .db "end",10
StructuredAcceptedSourceEnd:

StructuredRangeSource:
            .db "var out as u8 = 0",10
            .db "var snapshot as u8 = 0",10
            .db "sub main() fails",10
            .db "    var i as u8 = 0",10
            .db "    for "
StructuredRangeCounter:
            .db "i = 250 to 300 step 10",10
            .db "        out = out + 1",10
            .db "        snapshot = i",10
            .db "    end",10
            .db "end",10
StructuredRangeSourceEnd:

StructuredActiveCounterSource:
            .db "var dummy as u8 = 0",10
            .db "sub main() fails",10
            .db "    var i as u8 = 0",10
            .db "    for i = 0 until 2",10
            .db "        "
StructuredActiveCounterName:
            .db "i = i + 1",10
            .db "    end",10
            .db "end",10
StructuredActiveCounterSourceEnd:

StructuredExitOutsideSource:
            .db "var dummy as u8 = 0",10
            .db "sub main() fails",10
            .db "    "
StructuredExitOutsidePoint:
            .db "exit",10
            .db "end",10
StructuredExitOutsideSourceEnd:

StructuredZeroStepSource:
            .db "var dummy as u8 = 0",10
            .db "sub main() fails",10
            .db "    var i as u8 = 0",10
            .db "    for i = 0 until 2 step "
StructuredZeroStepPoint:
            .db "0",10
            .db "    end",10
            .db "end",10
StructuredZeroStepSourceEnd:

StructuredBooleanFlowSource:
            .db "var flag as boolean = false",10
            .db "forward sub choose(value as boolean) as boolean",10
            .db "sub main() fails",10
            .db "    flag = choose(false)",10
            .db "end",10
            .db "sub choose",10
            .db "    if value",10
            .db "        return false",10
            .db "    else",10
            .db "        return true",10
            .db "    end",10
            .db "    value = false",10
            .db "end",10
StructuredBooleanFlowSourceEnd:

StructuredStrayElseSource:
            .db "sub main() fails",10
StructuredStrayElsePoint:
            .db "else",10
StructuredStrayElseSourceEnd:
StructuredStrayElseIfSource:
            .db "sub main() fails",10
StructuredStrayElseIfPoint:
            .db "elseif true",10
StructuredStrayElseIfSourceEnd:

StructuredSecondForwardSource:
            .db "forward sub first(value as u8) as u8",10
            .db "forward sub "
StructuredSecondForwardPoint:
            .db "second(value as u8) as u8",10
StructuredSecondForwardSourceEnd:
StructuredProgramForwardSource:
            .db "var clash as u8 = 0",10
            .db "forward sub "
StructuredProgramForwardPoint:
            .db "clash(value as u8) as u8",10
StructuredProgramForwardSourceEnd:
StructuredLocalForwardSource:
            .db "forward sub work(value as u8) as u8",10
            .db "sub main() fails",10
            .db "    var "
StructuredLocalForwardPoint:
            .db "work as u8 = 0",10
StructuredLocalForwardSourceEnd:
StructuredMainForwardSource:
            .db "forward sub "
StructuredMainForwardPoint:
            .db "main(value as u8) as u8",10
StructuredMainForwardSourceEnd:
StructuredParameterForwardSource:
            .db "forward sub same("
StructuredParameterForwardPoint:
            .db "same as u8) as u8",10
StructuredParameterForwardSourceEnd:

StructuredProgramMainSource:
            .db "var "
StructuredProgramMainPoint:
            .db "main as u8 = 0",10
StructuredProgramMainSourceEnd:
StructuredLocalMainSource:
            .db "sub main() fails",10
            .db "    var "
StructuredLocalMainPoint:
            .db "main as u8 = 0",10
StructuredLocalMainSourceEnd:
StructuredParameterMainSource:
            .db "forward sub work("
StructuredParameterMainPoint:
            .db "main as u8) as u8",10
StructuredParameterMainSourceEnd:

            .org SpareBase
StructuredLabelCapacitySource:
            .db "sub main() fails",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    if true",10,"    end",10
            .db "    "
StructuredLabelCapacityPoint:
            .db "if true",10,"    end",10
            .db "end",10
StructuredLabelCapacitySourceEnd:

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

            LD   A,110
            LD   HL,StructuredAcceptedSource
            LD   DE,StructuredAcceptedSourceEnd
            CALL CompileSlice
            JP   C,ProofFailAcceptedCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailAcceptedEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailAcceptedFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailAcceptedState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailAcceptedOutput
            LD   A,(ServiceOutputBase)
            LD   (AcceptedObservedOutput),A
            ; The harness independently checks the observed byte while this
            ; proof continues to discriminate storage and final counters.
            LD   A,(GeneratedBase+3)
            LD   (AcceptedObservedStore),A
            LD   A,(GeneratedBase+4)
            LD   (AcceptedObservedCounter),A
            LD   HL,(GeneratedBase+5)
            LD   (AcceptedObservedDescending),HL
            LD   HL,(GeneratedSize)
            LD   (StructuredGeneratedSize),HL

            ; A failed Z80-emission transaction must leave the published
            ; program byte-for-byte runnable.
            LD   A,(GeneratedBase)
            LD   (AtomicObservedByte),A
            LD   HL,GeneratedBase+1
            CALL BeginProgram
            XOR  A
            CALL EmitByte
            JP   C,ProofFailAtomicSetup
            CALL EmitByte
            JP   NC,ProofFailAtomicAccepted
            CALL AbortProgram
            LD   A,(GeneratedBase)
            LD   B,A
            LD   A,(AtomicObservedByte)
            CP   B
            JP   NZ,ProofFailAtomicByte
            LD   HL,(GeneratedSize)
            LD   DE,(StructuredGeneratedSize)
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailAtomicSize

            ; The same program must unwind a capacity trap from recursive
            ; routine depth back to the outer machine frame.
            CALL Reset
            LD   A,3
            LD   (ActivationLimit),A
            CALL ProofCallGenerated
            JP   C,ProofFailCapacityFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailCapacityState
            LD   A,(TrapNumber)
            CP   5
            JP   NZ,ProofFailCapacityNumber
            LD   A,(ActivationDepth)
            OR   A
            JP   NZ,ProofFailCapacityDepth
            LD   HL,(TrapOffset)
            LD   DE,StructuredAcceptedRecursiveCall-StructuredAcceptedSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailCapacityOffset

            LD   A,111
            LD   HL,StructuredRangeSource
            LD   DE,StructuredRangeSourceEnd
            CALL CompileSlice
            JP   C,ProofFailRangeCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailRangeEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailRangeFrame
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailRangeState
            LD   A,(TrapNumber)
            CP   4
            JP   NZ,ProofFailRangeNumber
            LD   HL,(TrapOffset)
            LD   DE,StructuredRangeCounter-StructuredRangeSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailRangeOffset
            LD   A,(GeneratedBase+3)
            LD   (RangeObservedEffect),A
            LD   A,(GeneratedBase+4)
            LD   (RangeObservedAtomic),A

            LD   A,112
            LD   HL,StructuredActiveCounterSource
            LD   DE,StructuredActiveCounterSourceEnd
            LD   B,DiagnosticActiveCounter
            LD   IX,StructuredActiveCounterName-StructuredActiveCounterSource
            CALL ProofExpectDiagnostic
            LD   A,(DiagnosticCode)
            LD   (ActiveObservedDiagnostic),A
            LD   HL,(DiagnosticOffset)
            LD   (ActiveObservedOffset),HL

            LD   A,113
            LD   HL,StructuredExitOutsideSource
            LD   DE,StructuredExitOutsideSourceEnd
            LD   B,DiagnosticExpectedLoop
            LD   IX,StructuredExitOutsidePoint-StructuredExitOutsideSource
            CALL ProofExpectDiagnostic
            LD   A,(DiagnosticCode)
            LD   (ExitObservedDiagnostic),A
            LD   HL,(DiagnosticOffset)
            LD   (ExitObservedOffset),HL

            LD   A,114
            LD   HL,StructuredZeroStepSource
            LD   DE,StructuredZeroStepSourceEnd
            LD   B,DiagnosticLoopStep
            LD   IX,StructuredZeroStepPoint-StructuredZeroStepSource
            CALL ProofExpectDiagnostic
            LD   A,(DiagnosticCode)
            LD   (StepObservedDiagnostic),A
            LD   HL,(DiagnosticOffset)
            LD   (StepObservedOffset),HL

            LD   A,115
            LD   HL,StructuredBooleanFlowSource
            LD   DE,StructuredBooleanFlowSourceEnd
            CALL CompileSlice
            JP   C,ProofFailBooleanFlowCompile
            CALL EncodeTypedExpressionProgram
            JP   C,ProofFailBooleanFlowEncode
            CALL Reset
            CALL ProofCallGenerated
            JP   C,ProofFailBooleanFlowFrame
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailBooleanFlowState
            LD   A,(GeneratedBase+3)
            CP   1
            JP   NZ,ProofFailBooleanFlowValue

            LD   A,116
            LD   HL,StructuredStrayElseSource
            LD   DE,StructuredStrayElseSourceEnd
            LD   B,DiagnosticExpectedEnd
            LD   IX,StructuredStrayElsePoint-StructuredStrayElseSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailStrayElse
            LD   A,117
            LD   HL,StructuredStrayElseIfSource
            LD   DE,StructuredStrayElseIfSourceEnd
            LD   B,DiagnosticExpectedEnd
            LD   IX,StructuredStrayElseIfPoint-StructuredStrayElseIfSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailStrayElseIf

            LD   A,118
            LD   HL,StructuredSecondForwardSource
            LD   DE,StructuredSecondForwardSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredSecondForwardPoint-StructuredSecondForwardSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailSecondForward
            LD   A,119
            LD   HL,StructuredProgramForwardSource
            LD   DE,StructuredProgramForwardSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredProgramForwardPoint-StructuredProgramForwardSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailProgramForward
            LD   A,120
            LD   HL,StructuredLocalForwardSource
            LD   DE,StructuredLocalForwardSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredLocalForwardPoint-StructuredLocalForwardSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailLocalForward
            LD   A,121
            LD   HL,StructuredMainForwardSource
            LD   DE,StructuredMainForwardSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredMainForwardPoint-StructuredMainForwardSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailMainForward
            LD   A,122
            LD   HL,StructuredParameterForwardSource
            LD   DE,StructuredParameterForwardSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredParameterForwardPoint-StructuredParameterForwardSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailParameterForward
            LD   A,124
            LD   HL,StructuredProgramMainSource
            LD   DE,StructuredProgramMainSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredProgramMainPoint-StructuredProgramMainSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailProgramMain
            LD   A,125
            LD   HL,StructuredLocalMainSource
            LD   DE,StructuredLocalMainSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredLocalMainPoint-StructuredLocalMainSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailLocalMain
            LD   A,126
            LD   HL,StructuredParameterMainSource
            LD   DE,StructuredParameterMainSourceEnd
            LD   B,DiagnosticDuplicateName
            LD   IX,StructuredParameterMainPoint-StructuredParameterMainSource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailParameterMain
            LD   A,123
            LD   HL,StructuredLabelCapacitySource
            LD   DE,StructuredLabelCapacitySourceEnd
            LD   B,DiagnosticControlLabelCapacity
            LD   IX,StructuredLabelCapacityPoint-StructuredLabelCapacitySource
            CALL ProofExpectDiagnostic
            JP   C,ProofFailLabelCapacity

            LD   A,$A5
            LD   (ProofStatus),A
            HALT

; A part, HL..DE source, B diagnostic, IX expected offset.
.routine in A,B,DE,HL,IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IY
ProofExpectDiagnostic:
            PUSH BC
            PUSH IX
            CALL CompileSlice
            POP  IX
            POP  BC
            RET  NC
            LD   A,(DiagnosticCode)
            CP   B
            JR   NZ,ProofExpectedDiagnosticNo
            LD   HL,(DiagnosticOffset)
            PUSH IX
            POP  DE
            OR   A
            SBC  HL,DE
            RET  Z
ProofExpectedDiagnosticNo:
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

ProofFailAcceptedCompile:     LD A,1
                              JP ProofFailed
ProofFailAcceptedEncode:      LD A,2
                              JP ProofFailed
ProofFailAcceptedFrame:       LD A,3
                              JP ProofFailed
ProofFailAcceptedState:       LD A,4
                              JP ProofFailed
ProofFailAcceptedOutput:      LD A,5
                              JP ProofFailed
ProofFailAcceptedValue:       LD A,6
                              JP ProofFailed
ProofFailAcceptedStore:       LD A,7
                              JP ProofFailed
ProofFailAcceptedCounter:     LD A,8
                              JP ProofFailed
ProofFailAcceptedDescending:  LD A,9
                              JP ProofFailed
ProofFailedNear:              JP ProofFailed
ProofFailCapacityFrame:       LD A,21
                              JR ProofFailedNear
ProofFailCapacityState:       LD A,22
                              JR ProofFailedNear
ProofFailCapacityNumber:      LD A,23
                              JR ProofFailedNear
ProofFailCapacityDepth:       LD A,24
                              JR ProofFailedNear
ProofFailCapacityOffset:      LD A,25
                              JR ProofFailedNear
ProofFailRangeCompile:        LD A,10
                              JR ProofFailedNear
ProofFailRangeEncode:         LD A,11
                              JR ProofFailedNear
ProofFailRangeFrame:          LD A,12
                              JR ProofFailedNear
ProofFailRangeState:          LD A,13
                              JR ProofFailedNear
ProofFailRangeNumber:         LD A,14
                              JR ProofFailedNear
ProofFailRangeOffset:         LD A,15
                              JR ProofFailedNear
ProofFailRangeEffect:         LD A,16
                              JR ProofFailedNear
ProofFailRangeAtomic:         LD A,17
                              JR ProofFailedNear
ProofFailActiveCounter:       LD A,18
                              JR ProofFailedNear
ProofFailExitOutside:         LD A,19
                              JR ProofFailedNear
ProofFailZeroStep:            LD A,20
                              JR ProofFailedNear
ProofFailAtomicSetup:         LD A,26
                              JR ProofFailedNear
ProofFailAtomicAccepted:      LD A,27
                              JR ProofFailedNear
ProofFailAtomicByte:          LD A,28
                              JR ProofFailedNear
ProofFailAtomicSize:          LD A,29
                              JR ProofFailedNear
ProofFailBooleanFlowCompile:  LD A,30
                              JR ProofFailedNear
ProofFailBooleanFlowEncode:   LD A,31
                              JR ProofFailedNear
ProofFailBooleanFlowFrame:    LD A,32
                              JR ProofFailedNear
ProofFailBooleanFlowState:    LD A,33
                              JR ProofFailedNear
ProofFailBooleanFlowValue:    LD A,34
                              JR ProofFailedNear
ProofFailStrayElse:           LD A,35
                              JR ProofFailedNear
ProofFailStrayElseIf:         LD A,36
                              JR ProofFailedNear
ProofFailSecondForward:       LD A,37
                              JR ProofFailedNear
ProofFailProgramForward:      LD A,38
                              JR ProofFailedNear
ProofFailLocalForward:        LD A,39
                              JR ProofFailedNear
ProofFailMainForward:         LD A,40
                              JR ProofFailedNear
ProofFailParameterForward:    LD A,41
                              JR ProofFailed
ProofFailLabelCapacity:       LD A,42
                              JR ProofFailed
ProofFailProgramMain:         LD A,43
                              JR ProofFailed
ProofFailLocalMain:           LD A,44
                              JR ProofFailed
ProofFailParameterMain:       LD A,45
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ProofExpectedSP:              .dw 0
StructuredGeneratedSize:     .dw 0
AcceptedObservedOutput:      .db 0
AcceptedObservedStore:       .db 0
AcceptedObservedCounter:     .db 0
AcceptedObservedDescending:  .dw 0
RangeObservedEffect:         .db 0
RangeObservedAtomic:         .db 0
ActiveObservedDiagnostic:    .db 0
ActiveObservedOffset:        .dw 0
ExitObservedDiagnostic:      .db 0
ExitObservedOffset:          .dw 0
StepObservedDiagnostic:      .db 0
StepObservedOffset:          .dw 0
AtomicObservedByte:          .db 0
ProofStatus:                  .db 0
ProofCase:                    .db 0
GeneratedTypedEnd            .equ GeneratedBase+715
ProofEnd:
            .end
