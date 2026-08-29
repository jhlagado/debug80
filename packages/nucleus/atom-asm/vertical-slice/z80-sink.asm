; Direct-Z80 encoder for the first checked four-operation stream.

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
ENCDSMNT: ;@NUC-GLOBAL EncodeSemanticProgram PERMANENT ENCDSMNT
            LD   HL,PRGRMTMP
            LD   DE,GNRTDBS
            LD   BC,PRGRMSZ
            LDIR
            LD   A,(SMNTCBFF+2)
            LD   (GNRTDBS+1),A
            LD   HL,PRGRMSZ
            LD   (GNRTDSZ),HL
            OR   A
            RET
