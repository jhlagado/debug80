; Compile and execute the first Nucleus source program as direct Z80 code.

            .include "memory-map.asmi"
            .include "compiler-state.asmi"
            .include "native-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "tokenizer.asm"
            .include "semantic-sink.asm"
            .include "parser.asm"
CompilerCommonCodeEnd:
NativeSinkCodeStart:
            .include "native-sink.asm"
NativeSinkCodeEnd:
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
NativeProgramTemplate:
            .db  $3E,$00
            .db  $CD
            .dw  NativeWriteOutputByte
            .db  $38,$06
            .db  $3E,NativeRunSucceeded,$32
            .dw  NativeRunState
            .db  $C9
            .db  $32
            .dw  NativeTrapError
            .db  $AF,$32
            .dw  NativeTrapRoutine
            .db  $21
            .dw  NativeFailureOffset
            .db  $22
            .dw  NativeTrapOffset
            .db  $3E,$06,$32
            .dw  NativeTrapNumber
            .db  $3E,NativeRunTrapped,$32
            .dw  NativeRunState
            .db  $C9
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
NativeProofSource:
            .db  "sub main() fails",10
            .db  "    writeOutputByte('A') or fail",10
            .db  "end",10
NativeProofSourceEnd:

            .org TargetRuntimeBase
NativeRuntimeCodeStart:
            .include "native-runtime.asm"
NativeRuntimeCodeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   (ServiceForceFailure),A

            LD   A,7
            LD   HL,NativeProofSource
            LD   DE,NativeProofSourceEnd
            CALL CompileVerticalSlice
            JP   C,ProofFailCompile
            CALL NativeEncodeSemanticProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,NativeProgramSize
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailSize

            CALL NativeReset
            XOR  A
            LD   (ServiceForceFailure),A
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunSucceeded
            JP   NZ,ProofFailRunSuccess
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailOutputLength
            LD   A,(ServiceOutputByte)
            CP   "A"
            JP   NZ,ProofFailOutputByte
            LD   (ProofSuccessOutput),A

            CALL NativeReset
            LD   A,1
            LD   (ServiceForceFailure),A
            CALL GeneratedBase
            LD   A,(NativeRunState)
            CP   NativeRunTrapped
            JP   NZ,ProofFailTrapState
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailAtomicOutput
            LD   A,(NativeTrapNumber)
            CP   6
            JP   NZ,ProofFailTrapNumber
            LD   A,(NativeTrapRoutine)
            OR   A
            JP   NZ,ProofFailTrapRoutine
            LD   HL,(NativeTrapOffset)
            LD   DE,NativeFailureOffset
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailTrapOffset
            LD   A,(NativeTrapError)
            CP   3
            JP   NZ,ProofFailTrapError

            LD   A,$A5
            LD   (ProofStatus),A
            HALT

ProofFailCompile:
            LD   A,1
            JR   ProofFailed
ProofFailEncode:
            LD   A,2
            JR   ProofFailed
ProofFailSize:
            LD   A,3
            JR   ProofFailed
ProofFailRunSuccess:
            LD   A,4
            JR   ProofFailed
ProofFailOutputLength:
            LD   A,5
            JR   ProofFailed
ProofFailOutputByte:
            LD   A,6
            JR   ProofFailed
ProofFailTrapState:
            LD   A,7
            JR   ProofFailed
ProofFailAtomicOutput:
            LD   A,8
            JR   ProofFailed
ProofFailTrapNumber:
            LD   A,9
            JR   ProofFailed
ProofFailTrapRoutine:
            LD   A,10
            JR   ProofFailed
ProofFailTrapOffset:
            LD   A,11
            JR   ProofFailed
ProofFailTrapError:
            LD   A,12
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ProofStatus:
            .db  0
ProofCase:
            .db  0
ProofSuccessOutput:
            .db  0
ProofEnd:

            .end
