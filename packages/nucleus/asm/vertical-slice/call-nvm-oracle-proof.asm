; Compile the recursive scalar routine to an NVM image for the host oracle.

            .include "memory-map.asmi"
            .include "loop-compiler-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "loop-tokenizer.asm"
            .include "loop-semantic-sink.asm"
            .include "loop-symbols.asm"
            .include "loop-parser.asm"
CompilerCommonCodeEnd:
NvmSinkCodeStart:
            .include "call-nvm-sink.asm"
NvmSinkCodeEnd:
CompilerCodeEnd:

CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
CallProofSource:
            .db "forward sub descend(value as u8) as u8",10
            .db "sub main() fails",10
            .db "    var result as u8 = descend(3)",10
            .db "    writeOutputByte(result) or fail",10
            .db "end",10
            .db "sub descend",10
            .db "    if value = 0",10
            .db "        return value",10
            .db "    end",10
            .db "    return descend(value - 1)",10
            .db "end",10
CallProofSourceEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   A,62
            LD   HL,CallProofSource
            LD   DE,CallProofSourceEnd
            CALL CompileSlice
            JR   C,ProofFailCompile
            CALL NvmEncodeCallProgram
            JR   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,CallNvmImageSize
            OR   A
            SBC  HL,DE
            JR   NZ,ProofFailSize
            LD   A,$A5
            LD   (ProofStatus),A
            HALT
ProofFailCompile:       LD A,1
                        JR ProofFailed
ProofFailEncode:        LD A,2
                        JR ProofFailed
ProofFailSize:          LD A,3
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT
ProofStatus:            .db 0
ProofCase:              .db 0
ProofEnd:
GeneratedCallNvmEnd     .equ GeneratedBase+CallNvmImageSize

            .end
