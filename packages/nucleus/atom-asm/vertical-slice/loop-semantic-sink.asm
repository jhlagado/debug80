; Checked semantic-operation buffer for the counted-loop and array slices.

%IF AggregateCallSlices
%ELSE
;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,HL
SMNTCSN1: ;@NUC-GLOBAL SemanticSinkReset PERMANENT SMNTCSN1
            LD   HL,SMNTCBFF+1
            LD   (SNKCRSR),HL
            XOR  A
            LD   (SNKOPRTN),A
            LD   (SMNTCBFF),A
            RET
%ENDIF

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
SMNTCSN2: ;@NUC-GLOBAL SemanticSinkPut PERMANENT SMNTCSN2
            LD   B,A
            LD   HL,(SNKCRSR)
            LD   DE,SMNTCBF0
            OR   A
            SBC  HL,DE
            ADD  HL,DE
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
%IF SegmentedOutput
            JR   CMPLRSTD
%ELSE
            JP   CMPLRSTD
%ENDIF

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
SMNTCSN5: ;@NUC-GLOBAL SemanticSinkOperation PERMANENT SMNTCSN5
            LD   B,A
            LD   A,(SNKOPRTN)
            CP   255
            JR   Z,SMNTCSN4
            LD   A,B
            CALL SMNTCSN2
            RET  C
            LD   HL,SNKOPRTN
            INC  (HL)
            XOR  A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
SMNTCSN6: ;@NUC-GLOBAL SemanticSinkFinish PERMANENT SMNTCSN6
            LD   A,(SNKOPRTN)
            LD   (SMNTCBFF),A
            OR   A
            RET
