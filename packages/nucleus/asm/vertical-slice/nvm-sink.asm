; NVM encoder for the four semantic operations admitted by the first slice.

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NvmEncodeSemanticProgram:
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
