; Compile and execute the initialized-array source as direct Z80 code.

            .include "memory-map.asmi"
            .include "loop-compiler-state.asmi"
            .include "loop-native-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "loop-tokenizer.asm"
            .include "loop-semantic-sink.asm"
            .include "loop-parser.asm"
CompilerCommonCodeEnd:
NativeSinkCodeStart:
            .include "loop-native-sink.asm"
NativeSinkCodeEnd:
CompilerCodeEnd:

CompilerImmutableStart:
KeywordSub:             .db "sub"
KeywordFails:           .db "fails"
KeywordOr:              .db "or"
KeywordFail:            .db "fail"
KeywordEnd:             .db "end"
KeywordVar:             .db "var"
KeywordAs:              .db "as"
KeywordU8:              .db "u8"
KeywordFor:             .db "for"
KeywordUntil:           .db "until"
NameMain:               .db "main"
NameIndex:              .db "index"
NameBytes:              .db "bytes"
NameReadInputByte:      .db "readInputByte"
NameWriteOutputByte:    .db "writeOutputByte"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
ArrayProofSource:
            .db "var bytes as u8[4] = [65, 66, 67, 68]",10
            .db 10
            .db "sub main() fails",10
            .db "    var index as u8 = readInputByte() or fail",10
            .db "    writeOutputByte(bytes[index]) or fail",10
            .db "end",10
ArrayProofSourceEnd:

BadArraySource:
            .db "var bytes as u8[4] = [65, 66 "
BadArrayValue:
            .db "67, 68]",10
            .db "sub main() fails",10
            .db "    var index as u8 = readInputByte() or fail",10
            .db "    writeOutputByte(bytes[index]) or fail",10
            .db "end",10
BadArraySourceEnd:

            .org TargetRuntimeBase
NativeRuntimeCodeStart:
            .include "loop-native-runtime.asm"
NativeRuntimeCodeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   (ServiceInputFailure),A
            LD   (ServiceFailureCall),A

            LD   A,40
            LD   HL,ArrayProofSource
            LD   DE,ArrayProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            LD   HL,SemanticBufferBase
            LD   DE,ExpectedArrayOperations
            LD   B,14
            CALL ProofCompareBytes
            JP   C,ProofFailOperations
            CALL NativeEncodeArrayProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,NativeArrayProgramSize
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailSize
            LD   HL,GeneratedArrayEnd-4
            LD   DE,ExpectedArrayBytes
            LD   B,4
            CALL ProofCompareBytes
            JP   C,ProofFailStaticData

            CALL ProofConfigureSuccessInput
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunSucceeded
            JP   NZ,ProofFailSuccessState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailSuccessOutput
            LD   A,(ServiceOutputBase)
            CP   "B"
            JP   NZ,ProofFailSuccessByte
            LD   A,(ServiceInputCursor)
            CP   1
            JP   NZ,ProofFailSuccessInput

            CALL ProofConfigureBoundsInput
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunTrapped
            JP   NZ,ProofFailBoundsState
            LD   A,(NativeTrapNumber)
            CP   1
            JP   NZ,ProofFailBoundsTrap
            LD   HL,(NativeTrapOffset)
            LD   DE,NativeArrayBoundsOffset
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBoundsOffset
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailBoundsOutput
            LD   A,(ServiceInputCursor)
            CP   1
            JP   NZ,ProofFailBoundsInput

            CALL ProofConfigureNoInput
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunTrapped
            JP   NZ,ProofFailInputState
            LD   A,(NativeTrapNumber)
            CP   6
            JP   NZ,ProofFailInputTrap
            LD   A,(NativeTrapError)
            CP   1
            JP   NZ,ProofFailInputError
            LD   HL,(NativeTrapOffset)
            LD   DE,NativeArrayInputFailureOffset
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailInputOffset
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailInputOutput
            LD   A,(ServiceInputCursor)
            OR   A
            JP   NZ,ProofFailInputCursor

            CALL ProofConfigureOutputFailure
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunTrapped
            JP   NZ,ProofFailOutputState
            LD   A,(NativeTrapNumber)
            CP   6
            JP   NZ,ProofFailOutputTrap
            LD   A,(NativeTrapError)
            CP   3
            JP   NZ,ProofFailOutputError
            LD   HL,(NativeTrapOffset)
            LD   DE,NativeArrayOutputFailureOffset
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailOutputOffset
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailOutputAtomic

            LD   A,41
            LD   HL,BadArraySource
            LD   DE,BadArraySourceEnd
            CALL CompileSlice
            JP   NC,ProofFailBadAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticExpectedComma
            JP   NZ,ProofFailBadCode
            LD   HL,(DiagnosticOffset)
            LD   DE,BadArrayValue-BadArraySource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBadPosition
            LD   HL,(DiagnosticLine)
            LD   DE,1
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBadPosition
            LD   HL,(DiagnosticColumn)
            LD   DE,BadArrayValue-BadArraySource+1
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBadPosition

            LD   A,40
            LD   HL,ArrayProofSource
            LD   DE,ArrayProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            LD   A,$5A
            LD   (NativeRunState),A
            LD   HL,GeneratedBase+10
            CALL NativeEncodeArrayProgramWithinLimit
            JP   NC,ProofFailCapacityAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticSinkCapacity
            JP   NZ,ProofFailCapacityCode
            LD   HL,(GeneratedSize)
            LD   A,H
            OR   L
            JP   NZ,ProofFailCapacityPublished
            LD   A,(NativeRunState)
            CP   $5A
            JP   NZ,ProofFailCapacityState

            ; Leave the complete native program available for host inspection.
            LD   A,40
            LD   HL,ArrayProofSource
            LD   DE,ArrayProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            CALL NativeEncodeArrayProgram
            JP   C,ProofFailEncode

            LD   A,$A5
            LD   (ProofStatus),A
            HALT

.routine out carry,zero clobbers sign,parity,halfCarry,A,B,C,HL
ProofConfigureSuccessInput:
            CALL NativeReset
            XOR  A
            LD   (ServiceInputFailure),A
            LD   (ServiceFailureCall),A
            INC  A
            LD   (ServiceInputLength),A
            LD   (ServiceInputBase),A
            RET

.routine out carry,zero clobbers sign,parity,halfCarry,A,B,C,HL
ProofConfigureBoundsInput:
            CALL NativeReset
            XOR  A
            LD   (ServiceInputFailure),A
            LD   (ServiceFailureCall),A
            INC  A
            LD   (ServiceInputLength),A
            LD   A,4
            LD   (ServiceInputBase),A
            RET

.routine out carry,zero clobbers sign,parity,halfCarry,A,B,C,HL
ProofConfigureNoInput:
            CALL NativeReset
            XOR  A
            LD   (ServiceInputFailure),A
            LD   (ServiceFailureCall),A
            LD   (ServiceInputLength),A
            RET

.routine out carry,zero clobbers sign,parity,halfCarry,A,B,C,HL
ProofConfigureOutputFailure:
            CALL NativeReset
            XOR  A
            LD   (ServiceInputFailure),A
            INC  A
            LD   (ServiceFailureCall),A
            LD   (ServiceInputLength),A
            LD   A,2
            LD   (ServiceInputBase),A
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

ProofFailCompile:           LD A,1
                            JR ProofFailed
ProofFailOperations:        LD A,2
                            JR ProofFailed
ProofFailEncode:            LD A,3
                            JR ProofFailed
ProofFailSize:              LD A,4
                            JR ProofFailed
ProofFailStaticData:        LD A,5
                            JR ProofFailed
ProofFailSuccessState:      LD A,6
                            JR ProofFailed
ProofFailSuccessOutput:     LD A,7
                            JR ProofFailed
ProofFailSuccessInput:      LD A,8
                            JR ProofFailed
ProofFailBoundsState:       LD A,9
                            JR ProofFailed
ProofFailBoundsTrap:        LD A,10
                            JR ProofFailed
ProofFailBoundsOffset:      LD A,11
                            JR ProofFailed
ProofFailBoundsOutput:      LD A,12
                            JR ProofFailed
ProofFailBoundsInput:       LD A,13
                            JR ProofFailed
ProofFailInputState:        LD A,14
                            JR ProofFailed
ProofFailInputTrap:         LD A,15
                            JR ProofFailed
ProofFailInputError:        LD A,16
                            JR ProofFailed
ProofFailInputOffset:       LD A,17
                            JR ProofFailed
ProofFailInputOutput:       LD A,18
                            JR ProofFailed
ProofFailInputCursor:       LD A,19
                            JR ProofFailed
ProofFailOutputState:       LD A,20
                            JR ProofFailed
ProofFailOutputTrap:        LD A,21
                            JR ProofFailed
ProofFailOutputError:       LD A,22
                            JR ProofFailed
ProofFailOutputOffset:      LD A,23
                            JR ProofFailed
ProofFailOutputAtomic:      LD A,24
                            JR ProofFailed
ProofFailBadAccepted:       LD A,25
                            JR ProofFailed
ProofFailBadCode:           LD A,26
                            JR ProofFailed
ProofFailBadPosition:       LD A,27
                            JR ProofFailed
ProofFailCapacityAccepted:  LD A,28
                            JR ProofFailed
ProofFailCapacityCode:      LD A,29
                            JR ProofFailed
ProofFailCapacityPublished: LD A,30
                            JR ProofFailed
ProofFailCapacityState:     LD A,31
                            JR ProofFailed
ProofFailSuccessByte:       LD A,32
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ExpectedArrayOperations:
            .db 8,SemanticStaticU8Array,4,65,66,67,68
            .db SemanticReadInputByte,SemanticPropagate,SemanticStoreResultU8
            .db SemanticLoadArrayU8,SemanticWriteOutputU8
            .db SemanticPropagate,SemanticReturn
ExpectedArrayBytes:     .db 65,66,67,68
ProofStatus:            .db 0
ProofCase:              .db 0
ProofEnd:

            .end
