; Compile, validate, and execute the counted-loop source through NVM.

            .include "memory-map.asmi"
            .include "loop-compiler-state.asmi"
            .include "loop-nvm-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "loop-tokenizer.asm"
            .include "loop-semantic-sink.asm"
            .include "loop-symbols.asm"
            .include "loop-parser.asm"
CompilerCommonCodeEnd:
NvmSinkCodeStart:
            .include "loop-nvm-sink.asm"
NvmSinkCodeEnd:
CompilerCodeEnd:

CompilerImmutableStart:
            .include "loop-keywords.asmi"

NvmEncoderHeaderTemplate:
            .db $4E,$56,$4D,$31,$00,$01,$00,$01
            .db $20,$00,$60,$00,$01,$00,$10,$80
            .db $20,$00,$28,$00,$02,$00,$2A,$00
            .db $36,$00,$00,$00,$04,$00,$01,$00
            .db $00,$00,$36,$00,$00,$06,$02,$00
            .db $00,$00
ArrayNvmHeaderTemplate  .equ NvmEncoderHeaderTemplate
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
LoopProofSource:
            .db "sub main() fails",10
            .db "    var index as u8 = 0",10
            .db "    for index = 0 until 3",10
            .db "        writeOutputByte('A') or fail",10
            .db "    end",10
            .db "end",10
LoopProofSourceEnd:

ZeroLoopProofSource:
            .db "sub main() fails",10
            .db "    var index as u8 = 0",10
            .db "    for index = 0 until 0",10
            .db "        writeOutputByte('A') or fail",10
            .db "    end",10
            .db "end",10
ZeroLoopProofSourceEnd:

            .org TargetRuntimeBase
NvmRuntimeCodeStart:
            .include "loop-nvm-runtime.asm"
NvmRuntimeCodeEnd:
NvmRuntimeImmutableStart:
NvmValidationTemplate:
            .db $4E,$56,$4D,$31,$00,$01,$00,$01
            .db $20,$00,$60,$00,$01,$00,$10,$80
            .db $20,$00,$28,$00,$02,$00,$2A,$00
            .db $36,$00,$00,$00,$04,$00,$01,$00
            .db $00,$00,$36,$00,$00,$06,$02,$00
            .db $00,$00
            .db $01,$00,$00
            .db $01,$00,$00
            .db $01,$03,$01
            .db $01,$01,$02
            .db $01,$02,$05
            .db $2A,$00,$01,$03
            .db $09,$03,$31,$00
            .db $01,"A",$04
            .db $04,$04,$00
            .db $51,$01
            .db $0B,$32,$00
            .db $2A,$00,$05,$03
            .db $09,$03,$31,$00
            .db $10,$00,$02,$00
            .db $08,$0F,$00
            .db $52,$06,$04,$54,$04
NvmRuntimeImmutableEnd:
NvmRuntimeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   (ServiceFailureCall),A

            LD   A,20
            LD   HL,LoopProofSource
            LD   DE,LoopProofSourceEnd
            CALL CompileLoopSlice
            JP   C,ProofFailCompile
            CALL NvmEncodeLoopProgram
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
            LD   (ServiceFailureCall),A
            CALL NvmRun
            LD   A,(NvmRunState)
            CP   NvmRunSucceeded
            JP   NZ,ProofFailRunSuccess
            LD   A,(ServiceOutputLength)
            CP   3
            JP   NZ,ProofFailOutputLength
            LD   HL,ServiceOutputBase
            LD   B,3
ProofCheckSuccessOutput:
            LD   A,(HL)
            CP   "A"
            JP   NZ,ProofFailOutputByte
            INC  HL
            DJNZ ProofCheckSuccessOutput
            LD   A,(NvmSlots)
            CP   2
            JP   NZ,ProofFailFinalCounter

            LD   HL,GeneratedBase
            LD   DE,GeneratedBase+NvmImageSize
            CALL NvmLoad
            JP   C,ProofFailLoadFailure
            LD   A,2
            LD   (ServiceFailureCall),A
            CALL NvmRun
            LD   A,(NvmRunState)
            CP   NvmRunTrapped
            JP   NZ,ProofFailTrapState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailFailureOutput
            LD   A,(ServiceOutputBase)
            CP   "A"
            JP   NZ,ProofFailFailureOutput
            LD   A,(NvmTrapNumber)
            CP   6
            JP   NZ,ProofFailTrapNumber
            LD   HL,(NvmTrapOffset)
            LD   DE,52
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailTrapOffset
            LD   A,(NvmTrapError)
            CP   3
            JP   NZ,ProofFailTrapError

            LD   A,21
            LD   HL,ZeroLoopProofSource
            LD   DE,ZeroLoopProofSourceEnd
            CALL CompileLoopSlice
            JP   C,ProofFailZeroCompile
            CALL NvmEncodeLoopProgram
            JP   C,ProofFailZeroEncode
            LD   HL,GeneratedBase
            LD   DE,GeneratedBase+NvmImageSize
            CALL NvmLoad
            JP   C,ProofFailZeroLoad
            XOR  A
            LD   (ServiceFailureCall),A
            CALL NvmRun
            LD   A,(NvmRunState)
            CP   NvmRunSucceeded
            JP   NZ,ProofFailZeroRun
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailZeroOutput

            ; Leave the normal image in generated output for the host oracle.
            LD   A,20
            LD   HL,LoopProofSource
            LD   DE,LoopProofSourceEnd
            CALL CompileLoopSlice
            JP   C,ProofFailCompile
            CALL NvmEncodeLoopProgram
            JP   C,ProofFailEncode

            LD   A,$A5
            LD   (ProofStatus),A
            HALT

ProofFailCompile:       LD A,1
                        JR ProofFailed
ProofFailEncode:        LD A,2
                        JR ProofFailed
ProofFailSize:          LD A,3
                        JR ProofFailed
ProofFailLoadSuccess:   LD A,4
                        JR ProofFailed
ProofFailRunSuccess:    LD A,5
                        JR ProofFailed
ProofFailOutputLength:  LD A,6
                        JR ProofFailed
ProofFailOutputByte:    LD A,7
                        JR ProofFailed
ProofFailFinalCounter:  LD A,8
                        JR ProofFailed
ProofFailLoadFailure:   LD A,9
                        JR ProofFailed
ProofFailTrapState:     LD A,10
                        JR ProofFailed
ProofFailFailureOutput: LD A,11
                        JR ProofFailed
ProofFailTrapNumber:    LD A,12
                        JR ProofFailed
ProofFailTrapOffset:    LD A,13
                        JR ProofFailed
ProofFailTrapError:     LD A,14
                        JR ProofFailed
ProofFailZeroCompile:   LD A,15
                        JR ProofFailed
ProofFailZeroEncode:    LD A,16
                        JR ProofFailed
ProofFailZeroLoad:      LD A,17
                        JR ProofFailed
ProofFailZeroRun:       LD A,18
                        JR ProofFailed
ProofFailZeroOutput:    LD A,19
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ProofStatus:            .db 0
ProofCase:              .db 0
ProofEnd:

            .end
