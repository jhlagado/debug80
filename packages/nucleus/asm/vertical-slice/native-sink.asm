; Direct-Z80 encoder for the first checked four-operation stream.

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NativeEncodeSemanticProgram:
            LD   HL,NativeProgramTemplate
            LD   DE,GeneratedBase
            LD   BC,NativeProgramSize
            LDIR
            LD   A,(SemanticBufferBase+2)
            LD   (GeneratedBase+1),A
            LD   HL,NativeProgramSize
            LD   (GeneratedSize),HL
            OR   A
            RET
