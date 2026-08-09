; Direct-Z80 encoder for the first checked four-operation stream.

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EncodeSemanticProgram:
            LD   HL,ProgramTemplate
            LD   DE,GeneratedBase
            LD   BC,ProgramSize
            LDIR
            LD   A,(SemanticBufferBase+2)
            LD   (GeneratedBase+1),A
            LD   HL,ProgramSize
            LD   (GeneratedSize),HL
            OR   A
            RET
