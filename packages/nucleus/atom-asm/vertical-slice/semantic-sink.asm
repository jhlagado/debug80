; Checked semantic-operation transcript used by the direct-Z80 encoders. The
; leading byte is the operation count.

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,HL
SMNTCSN1: ;@NUC-GLOBAL SemanticSinkReset PERMANENT SMNTCSN1
            LD   HL,SMNTCBFF+1
            LD   (SNKCRSR),HL
            XOR  A
            LD   (SNKOPRTN),A
            LD   (SMNTCBFF),A
            RET

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
SMNTCSN2: ;@NUC-GLOBAL SemanticSinkPut PERMANENT SMNTCSN2
            LD   B,A
            LD   HL,(SNKCRSR)
            LD   DE,SMNTCBF0
            LD   A,H
            CP   D
            JR   NZ,SMNTCSN3
            LD   A,L
            CP   E
            JR   Z,SMNTCSN4
SMNTCSN3: ;@NUC-GLOBAL SemanticSinkPutRoom PERMANENT SMNTCSN3
            LD   A,B
            LD   (HL),A
            INC  HL
            LD   (SNKCRSR),HL
            OR   A
            RET
SMNTCSN4: ;@NUC-GLOBAL SemanticSinkPutFull PERMANENT SMNTCSN4
            LD   A,DGNSTCSN
            JP   CMPLRSTD

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
SMNTCSN7: ;@NUC-GLOBAL SemanticSinkEmitProgram PERMANENT SMNTCSN7
            LD   C,A
            LD   A,SMNTCLDU
            CALL SMNTCSN2
            RET  C
            LD   A,C
            CALL SMNTCSN2
            RET  C
            LD   A,SMNTCWRT
            CALL SMNTCSN2
            RET  C
            LD   A,SMNTCPRP
            CALL SMNTCSN2
            RET  C
            LD   A,SMNTCRT2
            CALL SMNTCSN2
            RET  C
            LD   A,4
            LD   (SNKOPRTN),A
            LD   (SMNTCBFF),A
            OR   A
            RET
