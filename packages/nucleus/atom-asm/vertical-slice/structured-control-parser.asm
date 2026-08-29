SCPFMOD EQU CNTRLFR8-CNTRLFR7
SCPRFLG EQU SYMBLRCR+SYMBLAGG

; Bounded structured-control parser layered over typed scalar expressions.
; Parser frames live only during source checking. Z80 emission reuses their
; workspace after the complete semantic transcript has been published.


%IF HybridLL1Full
%ELSE
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
CNTRLRST: ;@NUC-GLOBAL ControlReset PERMANENT CNTRLRST
            XOR  A
            LD   (CNTRLDPT),A
%IF AggregateCallSlices
            RET
%ELSE
            LD   (CNTRLNXT),A
            RET
%ENDIF
%ENDIF

;@ROUTINE IN A OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
CNTRLFRB: ;@NUC-GLOBAL ControlFrameAddress PERMANENT CNTRLFRB
            LD   L,A
            LD   H,0
            ADD  HL,HL
            LD   E,L
            LD   D,H
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,DE
            LD   DE,CNTRLFRM
            ADD  HL,DE
            OR   A
            RET

; A is ControlKind*. Return the new frame base in HL.
;@ROUTINE IN A OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C
CNTRLPSH: ;@NUC-GLOBAL ControlPushFrame PERMANENT CNTRLPSH
            LD   B,A
            LD   A,(CNTRLDPT)
            CP   CNTRLFR1
            JR   NC,CNTRLCPC
            PUSH AF
            CALL CNTRLFRB
            POP  AF
            INC  A
            LD   (CNTRLDPT),A
            LD   (HL),B
            INC  HL
            LD   B,CNTRLFR0-1
            XOR  A
.L00000:
            LD   (HL),A
            INC  HL
            DJNZ .L00000
            LD   A,(CNTRLDPT)
            DEC  A
            CALL CNTRLFRB
            PUSH HL
            LD   DE,CNTRLFR7
            ADD  HL,DE
            LD   (HL),CNTRLNOC
            POP  HL
            OR   A
            RET
CNTRLCPC: ;@NUC-GLOBAL ControlCapacityFailure PERMANENT CNTRLCPC
            LD   A,DGNSTCCN
            JP   CMPLRSTD

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
CNTRLTPF: ;@NUC-GLOBAL ControlTopFrame PERMANENT CNTRLTPF
            LD   A,(CNTRLDPT)
            OR   A
            JR   Z,CNTRLLPF
            DEC  A
            JR   CNTRLFRB

;@ROUTINE IN B OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
CNTRLTP0: ;@NUC-GLOBAL ControlTopFrameField PERMANENT CNTRLTP0
            CALL CNTRLTPF
            RET  C
            LD   E,B
            LD   D,0
            ADD  HL,DE
            OR   A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
CNTRLPPF: ;@NUC-GLOBAL ControlPopFrame PERMANENT CNTRLPPF
            LD   HL,CNTRLDPT
            LD   A,(HL)
            OR   A
            JR   Z,CNTRLLPF
            DEC  (HL)
            XOR  A
            RET

;@ROUTINE IN B OUT A,C,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
CNTRLALL: ;@NUC-GLOBAL ControlAllocateInto PERMANENT CNTRLALL
            LD   A,(CNTRLNXT)
%IF AggregateCallSlices
            CP   STG7CNTR
%ELSE
            ; Ordinal 31 is the retained routine entry.
            CP   CNTRLRT2
%ENDIF
            JR   NC,CNTRLLBL
            LD   C,A
            INC  A
            LD   (CNTRLNXT),A
            CALL CNTRLTP0
            RET  C
            LD   (HL),C
            RET

%IF HybridLL1Full
;@ROUTINE OUT A,C,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B
CNTRLAL0: ;@NUC-GLOBAL ControlAllocateLabelA PERMANENT CNTRLAL0
            LD   B,CNTRLFR4
%IF TargetStreamingOutput
            JR   CNTRLALL
%ELSE
            JP   CNTRLALL
%ENDIF
%ENDIF

CNTRLLBL: ;@NUC-GLOBAL ControlLabelFailure PERMANENT CNTRLLBL
            LD   A,DGNSTCC0
            JP   CMPLRSTD
CNTRLLPF: ;@NUC-GLOBAL ControlLoopFailure PERMANENT CNTRLLPF
            LD   A,DGNSTCEM
            JP   CMPLRSTD

; Emit operation D followed by byte C.
;@ROUTINE IN C,D OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
CNTRLEMT: ;@NUC-GLOBAL ControlEmitOperationByte PERMANENT CNTRLEMT
            LD   A,D
            CALL SMNTCSN5
            RET  C
            LD   A,C
            JP   SMNTCSN2

;@ROUTINE IN C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,D,DE,HL
CNTRLEM0: ;@NUC-GLOBAL ControlEmitLabel PERMANENT CNTRLEM0
            LD   D,SMNTCCNT
            JR   CNTRLEMT
;@ROUTINE IN C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,D,DE,HL
CNTRLEM1: ;@NUC-GLOBAL ControlEmitBranchFalse PERMANENT CNTRLEM1
            LD   D,SMNTCBRN
            JR   CNTRLEMT
;@ROUTINE IN C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,D,DE,HL
CNTRLEM2: ;@NUC-GLOBAL ControlEmitJump PERMANENT CNTRLEM2
            LD   D,SMNTCJMP
            JR   CNTRLEMT

; Return the nearest enclosing while/for frame in HL.
;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C
CNTRLFND: ;@NUC-GLOBAL ControlFindLoop PERMANENT CNTRLFND
            LD   A,(CNTRLDPT)
            OR   A
            JR   Z,CNTRLLPF
.L00000:
            DEC  A
            PUSH AF
            CALL CNTRLFRB
            LD   A,(HL)
            CP   CNTRLKN0
            JR   Z,.L00001
            CP   CNTRLKN1
            JR   Z,.L00001
            POP  AF
            OR   A
            JR   NZ,.L00000
            JR   CNTRLLPF
.L00001:
            POP  AF
            OR   A
            RET

; C is a local byte offset. Reject a source write or nested counter reuse while
; that exact local is the counter of any active counted loop.
;@ROUTINE IN C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,D,DE,HL
CNTRLCHC: ;@NUC-GLOBAL ControlCheckActiveCounter PERMANENT CNTRLCHC
            LD   A,(CNTRLDPT)
            OR   A
            RET  Z
.L00000:
            DEC  A
            PUSH AF
            CALL CNTRLFRB
            LD   A,(HL)
            CP   CNTRLKN1
            JR   NZ,.L00001
            LD   DE,CNTRLFR7
            ADD  HL,DE
            LD   A,(HL)
            CP   C
            JR   Z,.L00002
.L00001:
            POP  AF
            OR   A
            JR   NZ,.L00000
            RET
.L00002:
            POP  AF
            LD   A,DGNSTCAC
            JP   CMPLRSTD

%IF HybridLL1Full
%ELSE
;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRDP: ;@NUC-GLOBAL StructuredParseBooleanHeader PERMANENT STRCTRDP
            LD   A,SCLRTYPB
            CALL TYPDEXP2
            RET  C
            LD   E,SCLRTYPB
            CALL TYPDCHC0
            RET  C
            JP   PRSREXP0

; Parse an if/elseif/else chain. TokenIf has already been consumed.
;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRD0: ;@NUC-GLOBAL StructuredParseIf PERMANENT STRCTRD0
            LD   A,CNTRLKND
            CALL CNTRLPSH
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLALL
            RET  C
            LD   B,CNTRLFR4
            CALL CNTRLALL
            RET  C
            LD   DE,CNTRLFR7-1
            ADD  HL,DE
            LD   (HL),1
.L00000:
            CALL STRCTRDP
            RET  C
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            CALL CNTRLEM1
            RET  C
            CALL TYPDPRSS
            RET  C
            CALL STRCTRDR
            RET  C
            CALL PRSRPK
            RET  C
            CP   TKNELSIF
            JR   Z,.L00001
            CP   TKNELS
            JR   Z,.L00002
            CP   TokenEnd
            JP   NZ,PRSREXPK
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
            JR   .L00003
.L00001:
            CALL .L00004
            RET  C
            LD   B,CNTRLFR4
            CALL CNTRLALL
            RET  C
            CALL PRSRTK
            RET  C
            JR   .L00000
.L00002:
            CALL .L00004
            RET  C
            CALL PRSRTK
            RET  C
            CALL PRSREXP0
            RET  C
            CALL TYPDPRSS
            RET  C
            CALL STRCTRDR
            RET  C
            LD   B,CNTRLFR8
            CALL CNTRLTP0
            LD   (HL),1
            CALL PRSRPK
            RET  C
            CP   TokenEnd
            JP   NZ,PRSREXPK
.L00003:
            CALL PRSRTK
            RET  C
            CALL PRSREXP0
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
            LD   B,CNTRLFR7
            CALL CNTRLTP0
            PUSH HL
            LD   A,(HL)
            POP  HL
            LD   DE,SCPFMOD
            ADD  HL,DE
            AND  (HL)
            XOR  1
            PUSH AF
            CALL CNTRLPPF
            POP  AF
            RET

;@ROUTINE OUT A,C,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B
.L00004:
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM2
            RET  C
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            JP   CNTRLEM0
%ENDIF

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B
STRCTRDR: ;@NUC-GLOBAL StructuredRecordIfClause PERMANENT STRCTRDR
            LD   A,(CNTRLSQN)
            OR   A
            RET  Z
            LD   B,CNTRLFR7
            CALL CNTRLTP0
            LD   (HL),0
            XOR  A
            RET

; TokenWhile has already been consumed.
%IF HybridLL1Full
%ELSE
;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRD1: ;@NUC-GLOBAL StructuredParseWhile PERMANENT STRCTRD1
            LD   A,CNTRLKN0
            CALL CNTRLPSH
            RET  C
            LD   B,CNTRLFR4
            CALL CNTRLALL
            RET  C
            INC  HL
            LD   (HL),C
            LD   B,CNTRLFR6
            CALL CNTRLALL
            RET  C
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
            CALL STRCTRDP
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM1
            RET  C
            CALL TYPDPRSS
            RET  C
            CALL PRSRPK
            RET  C
            CP   TokenEnd
            JP   NZ,PRSREXPK
            LD   B,CNTRLFR5
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM2
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
STRCTRDC: ;@NUC-GLOBAL StructuredCompleteLoop PERMANENT STRCTRDC
            CALL PRSRTK
            RET  C
            CALL PRSREXP0
            RET  C
            JP   CNTRLPPF

; Parse bare exit/continue. The token has already been consumed.
;@ROUTINE IN A OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRD2: ;@NUC-GLOBAL StructuredParseLoopTransfer PERMANENT STRCTRD2
            LD   (DCLRTNIN),A
            CALL CNTRLFND
            RET  C
            LD   DE,CNTRLFR6
            LD   A,(DCLRTNIN)
            CP   TKNEXT
            JR   Z,.L00000
            LD   DE,CNTRLFR5
.L00000:
            ADD  HL,DE
            LD   C,(HL)
            CALL CNTRLEM2
            RET  C
            JP   PRSREXP0
%ENDIF

; Parse one compile-time step constant. B returns mode bit 1 and DE magnitude.
;@ROUTINE OUT A,B,DE,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,C,HL
STRCTRD3: ;@NUC-GLOBAL StructuredParseStep PERMANENT STRCTRD3
            XOR  A
            LD   (EXPRSSNL),A
            CALL PRSRPK
            RET  C
            CP   TKNPLS
            JR   Z,.L00000
            CP   TKNMNS
            JR   NZ,.L00001
            LD   A,2
            LD   (EXPRSSNL),A
.L00000:
            CALL PRSRTK
            RET  C
.L00001:
            CALL PRSRTK
            RET  C
            CP   TKNNMBR
            JR   Z,.L00003
            CP   TKNNM
            JR   NZ,.L00005
%IF AggregateCallSlices
            CALL STG8MTCH
            JR   NC,.L00002
            CP   STG8PRDF
            JR   C,.L00005
            SUB  STG8PRDF-1
            LD   D,0
            LD   E,A
            JR   .L00004
.L00002:
%ENDIF
            CALL SYMBLLKP
            RET  C
            LD   D,A
            AND  SCPRFLG
            JR   NZ,.L00005
            LD   A,D
            AND  SYMBLCL3
            JR   NZ,.L00005
            LD   A,D
            AND  SCLRMTTY
            CP   SCLRTYPB
            JR   Z,.L00005
.L00003:
            LD   D,B
            LD   E,C
.L00004:
            LD   A,D
            OR   E
            JR   Z,.L00005
            LD   A,(EXPRSSNL)
            LD   B,A
            OR   A
            RET
.L00005:
            LD   A,DGNSTCL0
            JP   CMPLRSTD

; TokenFor has already been consumed.
%IF HybridLL1Full
%ELSE
;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRD4: ;@NUC-GLOBAL StructuredParseFor PERMANENT STRCTRD4
            LD   E,TKNNM
            CALL PRSREXPC
            RET  C
            LD   HL,(TKNSTRTO)
            LD   (EXPRSSNC),HL
            CALL SYMBLLKP
            RET  C
            LD   (DCLRTNIN),A
            LD   (DCLRTNPY),BC
            LD   D,A
            AND  SYMBLCL3
            CP   SYMBLCL1
            JP   NZ,STRCTRD5
            LD   A,D
            AND  SCLRMTTY
            CP   SCLRTYPB
            JP   Z,STRCTRD5
            CALL CNTRLCHC
            RET  C
            CALL PRSREXP6
            RET  C
            LD   A,(DCLRTNIN)
            AND  SCLRMTTY
            CALL TYPDEXP2
            RET  C
            LD   D,A
            LD   A,(DCLRTNIN)
            AND  SCLRMTTY
            LD   E,A
            LD   A,D
            CALL TYPDCHC0
            RET  C
            CALL PRSRTK
            RET  C
            CP   TokenTo
            LD   B,1
            JR   Z,.L00000
            CP   TKNUNTL
            JP   NZ,STRCTRD5
            LD   B,0
.L00000:
            PUSH BC
            LD   A,SCLRTYP0
            CALL TYPDEXP2
            POP  BC
            RET  C
            PUSH BC
            LD   E,SCLRTYP0
            CALL TYPDCHC0
            POP  BC
            RET  C
            LD   DE,1
            PUSH BC
            PUSH DE
            CALL PRSRPK
            POP  DE
            POP  BC
            RET  C
            CP   TKNSTP
            JR   NZ,.L00001
            PUSH BC
            CALL PRSRTK
            POP  BC
            RET  C
            PUSH BC
            CALL STRCTRD3
            LD   A,B
            POP  BC
            RET  C
            OR   B
            LD   B,A
.L00001:
            PUSH BC
            PUSH DE
            CALL PRSREXP0
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   A,CNTRLKN1
            CALL CNTRLPSH
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   B,CNTRLFR4
            CALL CNTRLALL
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   B,CNTRLFR5
            CALL CNTRLALL
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   B,CNTRLFR6
            CALL CNTRLALL
            POP  DE
            POP  BC
            RET  C
            PUSH DE
            CALL CNTRLTPF
            POP  DE
            PUSH HL
            INC  HL
            INC  HL
            INC  HL
            INC  HL
            LD   A,(DCLRTNPY)
            LD   (HL),A
            INC  HL
            LD   A,(DCLRTNIN)
            AND  SCLRMTTY
            CP   SCLRTYP0
            LD   A,B
            JR   NZ,.L00002
            SET  2,A
.L00002:
            LD   (HL),A
            INC  HL
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   DE,(EXPRSSNC)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            POP  HL
            CALL STRCTRD6
            RET  C
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
            CALL STRCTRD7
            RET  C
            CALL TYPDPRSS
            RET  C
            CALL PRSRPK
            RET  C
            CP   TokenEnd
            JP   NZ,PRSREXPK
            LD   B,CNTRLFR5
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
            CALL STRCTRD9
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
            LD   A,SMNTCFRC
            CALL SMNTCSN5
            RET  C
            JP   STRCTRDC
%ENDIF
STRCTRD5: ;@NUC-GLOBAL StructuredCounterFailure PERMANENT STRCTRD5
            LD   A,DGNSTCLP
            JP   CMPLRSTD

; Emit the fixed-width counted-loop records from the current frame.
;@ROUTINE IN A,HL OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRDE: ;@NUC-GLOBAL StructuredEmitForPrefix PERMANENT STRCTRDE
            PUSH HL
            CALL SMNTCSN5
            POP  HL
            RET  C
            LD   DE,CNTRLFR7
            ADD  HL,DE
            LD   A,(HL)
            PUSH HL
            CALL SMNTCSN2
            POP  HL
            RET  C
            INC  HL
            RET

;@ROUTINE IN HL OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRD6: ;@NUC-GLOBAL StructuredEmitForSetup PERMANENT STRCTRD6
            LD   A,SMNTCFRS
            CALL STRCTRDE
            RET  C
            LD   A,(HL)
            JP   SMNTCSN2

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRD7: ;@NUC-GLOBAL StructuredEmitForTest PERMANENT STRCTRD7
            CALL CNTRLTPF
            LD   A,SMNTCFRT
            CALL STRCTRDE
            RET  C
            LD   A,(HL)                  ; mode
            PUSH HL
            CALL SMNTCSN2
            POP  HL
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   A,(HL)                  ; exit label
            JP   SMNTCSN2
STRCTRD8: ;@NUC-GLOBAL StructuredEmitFrameBytes PERMANENT STRCTRD8
            LD   A,(HL)
            PUSH BC
            PUSH HL
            CALL SMNTCSN2
            POP  HL
            POP  BC
            RET  C
            INC  HL
            DJNZ STRCTRD8
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
STRCTRD9: ;@NUC-GLOBAL StructuredEmitForNext PERMANENT STRCTRD9
            CALL CNTRLTPF
            PUSH HL
            LD   A,SMNTCFRN
            CALL SMNTCSN5
            POP  HL
            RET  C
            LD   DE,CNTRLFR4
            ADD  HL,DE
            LD   A,(HL)                  ; test label
            PUSH HL
            CALL SMNTCSN2
            POP  HL
            RET  C
            INC  HL                     ; continue label
            INC  HL                     ; exit label
            LD   A,(HL)
            PUSH HL
            CALL SMNTCSN2
            POP  HL
            RET  C
            INC  HL                     ; counter
            LD   B,6                    ; counter, mode, step, trap offset
            JR   STRCTRD8
