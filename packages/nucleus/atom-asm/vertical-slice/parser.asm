; Predictive parser and fixed semantic checks for the first complete program.

; Store the first diagnostic at the current token start. Carry denotes failure.
;@ROUTINE IN A OUT A,CARRY CLOBBERS ZERO,SIGN,PARITY,HALFCARRY,HL
CMPLRSTD: ;@NUC-GLOBAL CompilerSetDiagnostic PERMANENT CMPLRSTD
            LD   (DGNSTCCD),A
            LD   A,(SRCPRTID)
            LD   (DGNSTCP0),A
            LD   HL,(TKNSTRTO)
            LD   (DGNSTCOF),HL
            LD   HL,(TKNSTRTL)
            LD   (DGNSTCLN),HL
            LD   HL,(TKNSTRTC)
            LD   (DGNSTCCL),HL
            SCF
            RET

; D is the diagnostic code and E the expected token ordinal.
;@ROUTINE IN DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
PRSREXPC: ;@NUC-GLOBAL ParserExpect PERMANENT PRSREXPC
            PUSH DE
            CALL TKNZRNXT
            POP  DE
            RET  C
            CP   E
            RET  Z
            LD   A,D
            JP   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
PRSREXPQ: ;@NUC-GLOBAL ParserExpectMain PERMANENT PRSREXPQ
            LD   D,DGNSTCE0
            LD   E,TKNNM
            CALL PRSREXPC
            RET  C
            LD   HL,NameMain
            LD   B,4
            CALL TKNNMEQL
            JR   NC,.L00000
            OR   A
            RET
.L00000:
            LD   A,DGNSTCE0
            JP   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
PRSREXPI: ;@NUC-GLOBAL ParserExpectWrite PERMANENT PRSREXPI
            LD   D,DGNSTCE5
            LD   E,TKNNM
            CALL PRSREXPC
            RET  C
            LD   HL,NMWRTOTP
            LD   B,15
            CALL TKNNMEQL
            JR   NC,.L00000
            OR   A
            RET
.L00000:
            LD   A,DGNSTCE5
            JP   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
PRSRPRS2: ;@NUC-GLOBAL ParserParseProgram PERMANENT PRSRPRS2
            LD   D,DGNSTCEX
            LD   E,TokenSub
            CALL PRSREXPC
            RET  C
            CALL PRSREXPQ
            RET  C
            LD   D,DGNSTCE1
            LD   E,TKNLFTPR
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE2
            LD   E,TKNRGHTP
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE3
            LD   E,TKNFLS
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE4
            LD   E,TKNNWLN
            CALL PRSREXPC
            RET  C

            CALL PRSREXPI
            RET  C
            LD   D,DGNSTCE1
            LD   E,TKNLFTPR
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE6
            LD   E,TKNCHRCT
            CALL PRSREXPC
            RET  C
            LD   A,(TKNVL)
            LD   (PRSDOTPT),A
            LD   D,DGNSTCE2
            LD   E,TKNRGHTP
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE7
            LD   E,TKNELS
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE8
            LD   E,TKNFL
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE4
            LD   E,TKNNWLN
            CALL PRSREXPC
            RET  C

            LD   D,DGNSTCE9
            LD   E,TokenEnd
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCE4
            LD   E,TKNNWLN
            CALL PRSREXPC
            RET  C
            LD   D,DGNSTCEA
            LD   E,TokenEof
            CALL PRSREXPC
            RET  C
            LD   A,(PRSDOTPT)
            OR   A
            RET

; A is the stable source-part identity; HL..DE is the half-open byte range.
;@ROUTINE IN A,DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
CMPLVRTC: ;@NUC-GLOBAL CompileVerticalSlice PERMANENT CMPLVRTC
            CALL SRCINTLZ
            XOR  A
            LD   (DGNSTCCD),A
            LD   (DGNSTCP0),A
            CALL SMNTCSN1
            CALL PRSRPRS2
            RET  C
            CALL SMNTCSN7
            RET
