; NVM encoder for the four semantic operations admitted by the first slice.

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NvmEncodeSemanticProgram:
            LD   A,(SemanticBufferBase)
            CP   4
            JR   NZ,NvmEncodeBadStream
            LD   A,(SemanticBufferBase+1)
            CP   SemanticLoadU8
            JR   NZ,NvmEncodeBadStream
            LD   A,(SemanticBufferBase+3)
            CP   SemanticWriteOutputByte
            JR   NZ,NvmEncodeBadStream
            LD   A,(SemanticBufferBase+4)
            CP   SemanticPropagate
            JR   NZ,NvmEncodeBadStream
            LD   A,(SemanticBufferBase+5)
            CP   SemanticReturn
            JR   NZ,NvmEncodeBadStream

            LD   HL,NvmEncoderImageTemplate
            LD   DE,GeneratedBase
            LD   BC,NvmImageSize
            LDIR
            LD   A,(SemanticBufferBase+2)
            LD   (GeneratedBase+NvmCodeOffset+1),A
            LD   HL,NvmImageSize
            LD   (GeneratedSize),HL
            OR   A
            RET
NvmEncodeBadStream:
            LD   A,DiagnosticSinkCapacity
            JP   CompilerSetDiagnostic
