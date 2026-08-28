; Compile and execute the first Nucleus source program as direct Z80 code.

            .include "memory-map.asmi"
            .include "compiler-state.asmi"
            .include "z80-state.asmi"

AggregateCallSlices .equ 0

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "tokenizer.asm"
            .include "semantic-sink.asm"
            .include "parser.asm"
CompilerCommonCodeEnd:
SinkCodeStart:
            .include "z80-sink.asm"
SinkCodeEnd:
CompilerCodeEnd:

CompilerImmutableStart:
KeywordSub:
            .db  "sub"
KeywordFails:
            .db  "fails"
KeywordElse:
            .db  "else"
KeywordFail:
            .db  "fail"
KeywordEnd:
            .db  "end"
NameMain:
            .db  "main"
NameWriteOutputByte:
            .db  "writeOutputByte"
ProgramTemplate:
            .db  $3E,$00
            .db  $CD
            .dw  WriteOutputByte
            .db  $38,$06
            .db  $3E,RunSucceeded,$32
            .dw  RunState
            .db  $C9
            .db  $32
            .dw  TrapError
            .db  $AF,$32
            .dw  TrapRoutine
            .db  $21
            .dw  FailureOffset
            .db  $22
            .dw  TrapOffset
            .db  $3E,$06,$32
            .dw  TrapNumber
            .db  $3E,RunTrapped,$32
            .dw  RunState
            .db  $C9
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
ProofSource:
            .db  "sub main() fails",10
            .db  "    writeOutputByte('A') else fail",10
            .db  "end",10
ProofSourceEnd:

            .org TargetRuntimeBase
RuntimeCodeStart:
            .include "z80-runtime.asm"
RuntimeCodeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   (ServiceForceFailure),A

            LD   A,7
            LD   HL,ProofSource
            LD   DE,ProofSourceEnd
            CALL CompileVerticalSlice
            JP   C,ProofFailCompile
            CALL EncodeSemanticProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,ProgramSize
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailSize

            CALL Reset
            XOR  A
            LD   (ServiceForceFailure),A
            CALL GeneratedBase
            LD   A,(RunState)
            CP   RunSucceeded
            JP   NZ,ProofFailRunSuccess
            LD   A,(ServiceOutputLength)
            CP   1
            JP   NZ,ProofFailOutputLength
            LD   A,(ServiceOutputByte)
            CP   "A"
            JP   NZ,ProofFailOutputByte
            LD   (ProofSuccessOutput),A

            CALL Reset
            LD   A,1
            LD   (ServiceForceFailure),A
            CALL GeneratedBase
            LD   A,(RunState)
            CP   RunTrapped
            JP   NZ,ProofFailTrapState
            LD   A,(ServiceOutputLength)
            OR   A
            JP   NZ,ProofFailAtomicOutput
            LD   A,(TrapNumber)
            CP   6
            JP   NZ,ProofFailTrapNumber
            LD   A,(TrapRoutine)
            OR   A
            JP   NZ,ProofFailTrapRoutine
            LD   HL,(TrapOffset)
            LD   DE,FailureOffset
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailTrapOffset
            LD   A,(TrapError)
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
