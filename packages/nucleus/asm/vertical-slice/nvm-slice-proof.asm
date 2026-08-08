; Compile the fixed source to NVM, validate and execute it, then repeat with a
; forced output-service failure and prove the unhandled-error trap record.

            .include "memory-map.asmi"
            .include "compiler-state.asmi"
            .include "nvm-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "tokenizer.asm"
            .include "semantic-sink.asm"
            .include "parser.asm"
CompilerCommonCodeEnd:
NvmSinkCodeStart:
            .include "nvm-sink.asm"
NvmSinkCodeEnd:
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
NvmEncoderImageTemplate:
            .db  $4E,$56,$4D,$31,$00,$01,$00,$01
            .db  $20,$00,$3A,$00,$01,$00,$10,$80
            .db  $20,$00,$28,$00,$02,$00,$2A,$00
            .db  $10,$00,$00,$00,$04,$00,$01,$00
            .db  $00,$00,$10,$00,$00,$01,$02,$00
            .db  $00,$00
            .db  $01,$00,$00,$04,$00,$00,$51,$01
            .db  $0B,$0C,$00,$52,$06,$00,$54,$00
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
NvmProofSource:
            .db  "sub main() fails",10
            .db  "    writeOutputByte('A') or fail",10
            .db  "end",10
NvmProofSourceEnd:

            .org TargetRuntimeBase
NvmRuntimeCodeStart:
            .include "nvm-runtime.asm"
NvmRuntimeCodeEnd:
NvmRuntimeImmutableStart:
NvmValidationPrefix:
            .db  $4E,$56,$4D,$31,$00,$01,$00,$01
            .db  $20,$00,$3A,$00,$01,$00,$10,$80
            .db  $20,$00,$28,$00,$02,$00,$2A,$00
            .db  $10,$00,$00,$00,$04,$00,$01,$00
            .db  $00,$00,$10,$00,$00,$01,$02,$00
            .db  $00,$00,$01
NvmValidationSuffix:
            .db  $00,$04,$00,$00,$51,$01,$0B,$0C
            .db  $00,$52,$06,$00,$54,$00
NvmRuntimeImmutableEnd:
NvmRuntimeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   (ServiceForceFailure),A

            LD   A,7
            LD   HL,NvmProofSource
            LD   DE,NvmProofSourceEnd
            CALL CompileVerticalSlice
            JP   C,ProofFailCompile
            CALL NvmEncodeSemanticProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,NvmImageSize
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailSize

            LD   HL,GeneratedBase
            LD   DE,GeneratedBase+NvmImageSize
            CALL NvmLoad
            JP   C,ProofFailLoadSuccess
            XOR  A
            LD   (ServiceForceFailure),A
            CALL NvmRun
            LD   A,(NvmRunState)
            CP   NvmRunSucceeded
            JP   NZ,ProofFailRunSuccess
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailOutputLength
            LD   A,(ServiceOutputByte)
            CP   "A"
            JP   NZ,ProofFailOutputByte
            LD   (ProofSuccessOutput),A

            LD   HL,GeneratedBase
            LD   DE,GeneratedBase+NvmImageSize
            CALL NvmLoad
            JP   C,ProofFailLoadFailure
            LD   A,1
            LD   (ServiceForceFailure),A
            CALL NvmRun
            LD   A,(NvmRunState)
            CP   NvmRunTrapped
            JP   NZ,ProofFailTrapState
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailAtomicOutput
            LD   A,(NvmTrapNumber)
            CP   6
            JP   NZ,ProofFailTrapNumber
            LD   A,(NvmTrapRoutine)
            OR   A
            JP   NZ,ProofFailTrapRoutine
            LD   HL,(NvmTrapOffset)
            LD   DE,14
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailTrapOffset
            LD   A,(NvmTrapError)
            CP   3
            JP   NZ,ProofFailTrapError

            XOR  A
            LD   (GeneratedBase),A
            LD   HL,GeneratedBase
            LD   DE,GeneratedBase+NvmImageSize
            CALL NvmLoad
            JP   NC,ProofFailMalformedImage
            LD   A,$4E
            LD   (GeneratedBase),A
            LD   A,(NvmRunState)
            CP   NvmRunTrapped
            JP   NZ,ProofFailAtomicLoad
            LD   A,(NvmTrapError)
            CP   3
            JP   NZ,ProofFailAtomicLoad

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
ProofFailLoadSuccess:
            LD   A,4
            JR   ProofFailed
ProofFailRunSuccess:
            LD   A,5
            JR   ProofFailed
ProofFailOutputLength:
            LD   A,6
            JR   ProofFailed
ProofFailOutputByte:
            LD   A,7
            JR   ProofFailed
ProofFailLoadFailure:
            LD   A,8
            JR   ProofFailed
ProofFailTrapState:
            LD   A,9
            JR   ProofFailed
ProofFailAtomicOutput:
            LD   A,10
            JR   ProofFailed
ProofFailTrapNumber:
            LD   A,11
            JR   ProofFailed
ProofFailTrapRoutine:
            LD   A,12
            JR   ProofFailed
ProofFailTrapOffset:
            LD   A,13
            JR   ProofFailed
ProofFailTrapError:
            LD   A,14
            JR   ProofFailed
ProofFailMalformedImage:
            LD   A,15
            JR   ProofFailed
ProofFailAtomicLoad:
            LD   A,16
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
