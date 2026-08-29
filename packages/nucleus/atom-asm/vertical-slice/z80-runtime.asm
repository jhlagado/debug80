; Minimal direct-Z80 runtime and target-independent output service adapter.

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,HL
Reset:
            XOR  A
            LD   (TRPNMBR),A
            LD   (TRPRTN),A
            LD   (TRPERRR),A
            LD   (SRVCOTPT),A
            LD   (SRVCOTP2),A
            LD   HL,0
            LD   (TRPOFFST),HL
            LD   A,RunReady
            LD   (RunState),A
            OR   A
            RET

; Input A is the byte. Carry returns a recoverable failure, with A as its code.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B
WRTOTPTB: ;@NUC-GLOBAL WriteOutputByte PERMANENT WRTOTPTB
            LD   B,A
            LD   A,(SRVCFRCF)
            OR   A
            JR   NZ,WRTOTPT0
            LD   A,B
            LD   (SRVCOTP2),A
            LD   A,1
            LD   (SRVCOTPT),A
            XOR  A
            RET
WRTOTPT0: ;@NUC-GLOBAL WriteOutputByteFailure PERMANENT WRTOTPT0
            LD   A,3
            SCF
            RET
