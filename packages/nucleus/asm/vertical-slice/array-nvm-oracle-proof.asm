; Compile the initialized-array source to an NVM image for the host oracle.

            .include "memory-map.asmi"
            .include "loop-compiler-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
            .include "source-adapter.asm"
            .include "loop-tokenizer.asm"
            .include "loop-semantic-sink.asm"
            .include "loop-parser.asm"
CompilerCommonCodeEnd:
NvmSinkCodeStart:
            .include "loop-nvm-sink.asm"
NvmSinkCodeEnd:
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

ArrayNvmHeaderTemplate:
            .db $4E,$56,$4D,$31,$00,$01,$00,$01
            .db $20,$00,$59,$00,$01,$00,$10,$80
            .db $20,$00,$28,$00,$0A,$00,$32,$00
            .db $27,$00,$04,$00,$04,$00,$01,$00
            .db $00,$00,$27,$00,$00,$05,$02,$00
NvmEncoderHeaderTemplate .equ ArrayNvmHeaderTemplate
NvmCodeOffset           .equ 50
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

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofCase),A
            LD   (ProofStatus),A
            LD   A,50
            LD   HL,ArrayProofSource
            LD   DE,ArrayProofSourceEnd
            CALL CompileSlice
            JP   C,ProofFailCompile
            CALL NvmEncodeArrayProgram
            JP   C,ProofFailEncode
            LD   HL,(GeneratedSize)
            LD   DE,ArrayNvmImageSize
            OR   A
            SBC  HL,DE
            JP   NZ,ProofFailSize
            LD   HL,GeneratedBase+46
            LD   DE,ExpectedArrayBytes
            LD   B,4
            CALL ProofCompareBytes
            JP   C,ProofFailStaticData
            LD   A,$A5
            LD   (ProofStatus),A
            HALT

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

ProofFailCompile:       LD A,1
                        JR ProofFailed
ProofFailEncode:        LD A,2
                        JR ProofFailed
ProofFailSize:          LD A,3
                        JR ProofFailed
ProofFailStaticData:    LD A,4
ProofFailed:
            LD   (ProofCase),A
            LD   A,$E0
            LD   (ProofStatus),A
            HALT

ExpectedArrayBytes:     .db 65,66,67,68
ProofStatus:            .db 0
ProofCase:              .db 0
ProofEnd:

ArrayNvmImageSize       .equ 89
GeneratedArrayNvmEnd    .equ GeneratedBase+ArrayNvmImageSize

            .end
