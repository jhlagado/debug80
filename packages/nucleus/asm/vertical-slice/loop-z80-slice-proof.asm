; Compile and execute the counted-loop source as direct Z80 code.

            .include "memory-map.asmi"
SegmentedOutput .equ 0
            .include "loop-compiler-state.asmi"
            .include "loop-z80-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
LegacyCompilerSlices .equ 1
AggregateCallSlices  .equ 0
            .include "source-adapter.asm"
            .include "loop-tokenizer.asm"
            .include "loop-semantic-sink.asm"
            .include "loop-symbols.asm"
            .include "loop-parser.asm"
CompilerCommonCodeEnd:
SinkCodeStart:
LegacyEncoders .equ 1
            .include "loop-z80-sink.asm"
SinkCodeEnd:
CompilerCodeEnd:

CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
LoopProofSource:
            .db "sub main() fails",10
            .db "    var index as u8 = 0",10
            .db "    for index = 0 until 3",10
            .db "        writeOutputByte('A') else fail",10
            .db "    end",10
            .db "end",10
LoopProofSourceEnd:

ZeroLoopProofSource:
            .db "sub main() fails",10
            .db "    var index as u8 = 0",10
            .db "    for index = 0 until 0",10
            .db "        writeOutputByte('A') else fail",10
            .db "    end",10
            .db "end",10
ZeroLoopProofSourceEnd:

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

            LD   A,30
            LD   HL,LoopProofSource
            LD   DE,LoopProofSourceEnd
            CALL CompileLoopSlice
            JP   C,ProofFailCompile
            CALL EncodeLoopProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,ProgramSize
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailSize

            CALL Reset
            XOR  A
            LD   (ServiceFailureCall),A
            CALL GeneratedBase
            LD   A,D
            CP   2
            JP   NZ,ProofFailFinalCounter
            LD   A,(RunState)
            CP   RunSucceeded
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

            CALL Reset
            LD   A,2
            LD   (ServiceFailureCall),A
            CALL GeneratedBase
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailTrapState
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailFailureOutput
            LD   A,(ServiceOutputBase)
            CP   "A"
            JP   NZ,ProofFailFailureOutput
            LD   A,(TrapNumber)
            CP   6
            JP   NZ,ProofFailTrapNumber
            LD   HL,(TrapOffset)
            LD   DE,LoopFailureOffset
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailTrapOffset
            LD   A,(TrapError)
            CP   3
            JP   NZ,ProofFailTrapError

            LD   A,31
            LD   HL,ZeroLoopProofSource
            LD   DE,ZeroLoopProofSourceEnd
            CALL CompileLoopSlice
            JP   C,ProofFailZeroCompile
            CALL EncodeLoopProgram
            JP   C,ProofFailZeroEncode
            CALL Reset
            XOR  A
            LD   (ServiceFailureCall),A
            CALL GeneratedBase
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailZeroRun
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailZeroOutput

            ; Leave the normal direct program in generated output for inspection.
            LD   A,30
            LD   HL,LoopProofSource
            LD   DE,LoopProofSourceEnd
            CALL CompileLoopSlice
            JP   C,ProofFailCompile
            CALL EncodeLoopProgram
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
ProofFailRunSuccess:    LD A,4
                        JR ProofFailed
ProofFailOutputLength:  LD A,5
                        JR ProofFailed
ProofFailOutputByte:    LD A,6
                        JR ProofFailed
ProofFailFinalCounter:  LD A,7
                        JR ProofFailed
ProofFailTrapState:     LD A,8
                        JR ProofFailed
ProofFailFailureOutput: LD A,9
                        JR ProofFailed
ProofFailTrapNumber:    LD A,10
                        JR ProofFailed
ProofFailTrapOffset:    LD A,11
                        JR ProofFailed
ProofFailTrapError:     LD A,12
                        JR ProofFailed
ProofFailZeroCompile:   LD A,13
                        JR ProofFailed
ProofFailZeroEncode:    LD A,14
                        JR ProofFailed
ProofFailZeroRun:       LD A,15
                        JR ProofFailed
ProofFailZeroOutput:    LD A,16
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ProofStatus:            .db 0
ProofCase:              .db 0
ProofEnd:

            .end
