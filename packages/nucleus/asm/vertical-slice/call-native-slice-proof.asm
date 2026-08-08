; Compile and execute one forward-declared recursive scalar value routine.

            .include "memory-map.asmi"
            .include "loop-compiler-state.asmi"
            .include "loop-native-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
SourceAdapterCodeStart:
            .include "source-adapter.asm"
SourceAdapterCodeEnd:
TokenizerCodeStart:
            .include "loop-tokenizer.asm"
TokenizerCodeEnd:
SemanticSinkCodeStart:
            .include "loop-semantic-sink.asm"
SemanticSinkCodeEnd:
ParserCodeStart:
            .include "loop-parser.asm"
ParserCodeEnd:
CompilerCommonCodeEnd:
NativeSinkCodeStart:
            .include "loop-native-sink.asm"
NativeSinkCodeEnd:
CompilerCodeEnd:

CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
CallProofSource:
            .db "forward sub descend(value as u8) as u8",10
            .db 10
            .db "sub main() fails",10
            .db "    var result as u8 = descend(3)",10
            .db "    writeOutputByte(result) or fail",10
            .db "end",10
            .db 10
            .db "sub descend",10
            .db "    if value = 0",10
            .db "        return value",10
            .db "    end",10
            .db "    return descend(value - 1)",10
            .db "end",10
CallProofSourceEnd:

BadCompletionSource:
            .db "forward sub descend(value as u8) as u8",10
            .db "sub main() fails",10
            .db "    var result as u8 = descend(3)",10
            .db "    writeOutputByte(result) or fail",10
            .db "end",10
            .db "sub "
BadCompletionName:
            .db "descent",10
            .db "    return descend(value - 1)",10
            .db "end",10
BadCompletionSourceEnd:

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
            LD   A,60
            LD   HL,CallProofSource
            LD   DE,CallProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            LD   A,(SemanticBufferBase)
            CP   9
            JP   NZ,ProofFailOperations
            CALL NativeEncodeCallProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,NativeCallProgramSize
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailSize

            CALL NativeReset
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunSucceeded
            JP   NZ,ProofFailSuccessState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailSuccessOutput
            LD   A,(ServiceOutputBase)
            OR   A
            JP   NZ,ProofFailSuccessByte
            LD   A,(NativeActivationDepth)
            OR   A
            JP   NZ,ProofFailSuccessActivation

            CALL NativeReset
            LD   A,3
            LD   (NativeActivationLimit),A
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunTrapped
            JP   NZ,ProofFailCapacityState
            LD   A,(NativeTrapNumber)
            CP   5
            JP   NZ,ProofFailCapacityTrap
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailCapacityOutput
            LD   A,(NativeActivationDepth)
            OR   A
            JP   NZ,ProofFailCapacityActivation

            LD   A,61
            LD   HL,BadCompletionSource
            LD   DE,BadCompletionSourceEnd
            CALL CompileSlice
            JP   NC,ProofFailBadAccepted
            LD   A,(DiagnosticCode)
            CP   DiagnosticForwardMismatch
            JP   NZ,ProofFailBadCode
            LD   HL,(DiagnosticOffset)
            LD   DE,BadCompletionName-BadCompletionSource
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailBadPosition

            ; Leave the complete successful program available to host tests.
            LD   A,60
            LD   HL,CallProofSource
            LD   DE,CallProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            CALL NativeEncodeCallProgram
            JP   C,ProofFailEncode

            LD   A,$A5
            LD   (ProofStatus),A
            HALT

ProofFailCompile:             LD A,1
                              JR ProofFailed
ProofFailOperations:          LD A,2
                              JR ProofFailed
ProofFailEncode:              LD A,3
                              JR ProofFailed
ProofFailSize:                LD A,15
                              JR ProofFailed
ProofFailSuccessState:        LD A,4
                              JR ProofFailed
ProofFailSuccessOutput:       LD A,5
                              JR ProofFailed
ProofFailSuccessByte:         LD A,6
                              JR ProofFailed
ProofFailSuccessActivation:   LD A,7
                              JR ProofFailed
ProofFailCapacityState:       LD A,8
                              JR ProofFailed
ProofFailCapacityTrap:        LD A,9
                              JR ProofFailed
ProofFailCapacityOutput:      LD A,10
                              JR ProofFailed
ProofFailCapacityActivation:  LD A,11
                              JR ProofFailed
ProofFailBadAccepted:         LD A,12
                              JR ProofFailed
ProofFailBadCode:             LD A,13
                              JR ProofFailed
ProofFailBadPosition:         LD A,14
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ProofStatus:            .db 0
ProofCase:              .db 0
ProofEnd:

            .end
