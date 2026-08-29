H1RCFLG EQU SYMBLRCR+SYMBLAGG
H1AGCST EQU SYMBLAGG+SYMBLCLS
H1MTMSK EQU SCLRMTCN+SCLRMTTY
H1MCBL EQU SCLRMTCN+SCLRTYPB
H1CFCOF EQU CNTRLFR7-CNTRLFR4

; Explicit semantic actions for the complete Stage 7 packed LL(1) grammar.
; These routines never select grammar productions. They consume only retained
; expression/type-directed external islands declared by the generated grammar.

; Aggregate initializer staging is dead while a routine body is parsed, so
; the for/flow action scratch safely reuses its first thirteen bytes.
HYBRDLL1       EQU AGGRGTI6 ;@NUC-GLOBAL HybridLL1ForMode PERMANENT HYBRDLL1
HYBRDLL0       EQU HYBRDLL1+1 ;@NUC-GLOBAL HybridLL1ForStep PERMANENT HYBRDLL0
HYBRDLL2     EQU HYBRDLL0+2 ;@NUC-GLOBAL HybridLL1ForOffset PERMANENT HYBRDLL2
HYBRDLL3 EQU HYBRDLL2+2 ;@NUC-GLOBAL HybridLL1FlowStackBase PERMANENT HYBRDLL3
HYBRDLL4 EQU HYBRDLL3+CNTRLFR1 ;@NUC-GLOBAL HybridLL1ActionStateEnd PERMANENT HYBRDLL4


; --------------------------------------------------------- retained parsers

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDLL5: ;@NUC-GLOBAL HybridLL1ConstantExpression PERMANENT HYBRDLL5
            LD   A,SCLRTYPE
            CALL TYPDEXP3
            JR   HYBRDLL7

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDLL6: ;@NUC-GLOBAL HybridLL1RuntimeExpression PERMANENT HYBRDLL6
            LD   A,(EXPRSSNE)
            CALL TYPDEXP2
HYBRDLL7: ;@NUC-GLOBAL HybridLL1SaveExpressionResult PERMANENT HYBRDLL7
            RET  C
            LD   (EXPRSSNR),A
            LD   (EXPRSSN4),HL
            OR   A
            RET

;@ROUTINE OUT A,B,DE,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,C,HL
HYBRDLL8: ;@NUC-GLOBAL HybridLL1StepConstant PERMANENT HYBRDLL8
            CALL STRCTRD3
            RET  C
            LD   A,(HYBRDLL1)
            OR   B
            LD   (HYBRDLL1),A
            LD   (HYBRDLL0),DE
            OR   A
            RET

; The declared type has already selected the initializer shape. This external
; island retains the recursive, type-directed aggregate initializer machinery.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
HYBRDLL9: ;@NUC-GLOBAL HybridLL1StaticInitializer PERMANENT HYBRDLL9
            LD   A,(DCLRTNIN)
            LD   B,A
            PUSH BC
            CALL AGGRGTP3
            POP  BC
            RET  C
            LD   A,B
            LD   (DCLRTNIN),A
            OR   A
            RET

HYBRDLLA: ;@NUC-GLOBAL HybridLL1StrayClause PERMANENT HYBRDLLA
            LD   A,DGNSTCE9
            JP   CMPLRSTD

; --------------------------------------------------------------- type actions

; A is the logical action ordinal for the contiguous u8/u16/Boolean family.
HYBRDLLB: ;@NUC-GLOBAL HybridLL1SetScalarTypeAction PERMANENT HYBRDLLB
            SUB  HYBRDL3R-1
HYBRDLLC: ;@NUC-GLOBAL HybridLL1SetCurrentType PERMANENT HYBRDLLC
            LD   (AGGRGTCR),A
            OR   A
            RET

;@ROUTINE OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL,IX,IY
HYBRDLLD: ;@NUC-GLOBAL HybridLL1ResolveRecordType PERMANENT HYBRDLLD
            CALL SYMBLLKP
            RET  C
            LD   D,A
            LD   (DCLRTNIN),A
            LD   (DCLRTNPY),BC
            AND  H1RCFLG
            CP   SYMBLRCR
            JP   NZ,AGGRGTT1
            LD   A,C
            JR   HYBRDLLC

HYBRDLLE: ;@NUC-GLOBAL HybridLL1BeginTypeBound PERMANENT HYBRDLLE
HYBRDLLF: ;@NUC-GLOBAL HybridLL1ExpectU16 PERMANENT HYBRDLLF
            LD   A,SCLRTYP0
            JP   HYBRDLLL

; Return the checked, positive, byte-sized constant bound in HL.
;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,IX,IY
HYBRDLLG: ;@NUC-GLOBAL HybridLL1CheckedBound PERMANENT HYBRDLLG
            LD   A,(EXPRSSNR)
            LD   D,A
            AND  SCLRMTCN
            JP   Z,AGGRGTT1
            LD   E,SCLRTYP0
            LD   A,D
            CALL TYPDCHC0
            RET  C
            LD   HL,(EXPRSSN4)
            LD   A,H
            OR   L
            JP   Z,AGGRGTT1
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
HYBRDLLH: ;@NUC-GLOBAL HybridLL1MakeStringType PERMANENT HYBRDLLH
            CALL HYBRDLLG
            RET  C
            LD   A,H
            OR   A
            JP   NZ,AGGRGTST
            LD   A,L
            CP   254
            JP   NC,AGGRGTST
            LD   A,L
            LD   (AGGRGTCA),A
            LD   (AGGRGTCB),HL
            LD   A,AGGRGTTN
            LD   (AGGRGTC9),A
            INC  HL
            INC  HL
            LD   (AGGRGTCC),HL
HYBRDLLI: ;@NUC-GLOBAL HybridLL1InternCurrentType PERMANENT HYBRDLLI
            CALL AGGRGTIN
            RET  C
            JR   HYBRDLLC

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
HYBRDLLJ: ;@NUC-GLOBAL HybridLL1MakeArrayType PERMANENT HYBRDLLJ
            LD   A,(AGGRGTCR)
            CP   AGGRGTFR
            JR   C,.L00000
            PUSH AF
            CALL AGGRGTTY
            LD   A,(HL)
            CP   AGGRGTTO
            JP   Z,AGGRGTNS
            POP  AF
.L00000:
            LD   (AGGRGTCA),A
            CALL HYBRDLLG
            RET  C
            LD   (AGGRGTCB),HL
            LD   B,H
            LD   C,L
            LD   A,(AGGRGTCA)
            CALL AGGRGTGT
            LD   D,H
            LD   E,L
            LD   HL,0
.L00001:
            ADD  HL,DE
            JP   C,AGGRGTPR
            CALL AGGRGTCH
            RET  C
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,.L00001
            LD   (AGGRGTCC),HL
            LD   A,AGGRGTTO
            LD   (AGGRGTC9),A
            JR   HYBRDLLI

; --------------------------------------------------------- scalar constants

HYBRDLLK EQU TYPDRTND ;@NUC-GLOBAL HybridLL1RetainDeclarationName PERMANENT HYBRDLLK

HYBRDLLL: ;@NUC-GLOBAL HybridLL1SaveExpectedType PERMANENT HYBRDLLL
            LD   (EXPRSSNE),A
            OR   A
            RET

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,IX,IY
HYBRDLLM: ;@NUC-GLOBAL HybridLL1FinishConstantExpression PERMANENT HYBRDLLM
            LD   HL,(EXPRSSN4)
            LD   A,(EXPRSSNR)
            LD   D,A
            AND  SCLRMTCN
            JP   Z,TYPDTYPF
            LD   A,D
            AND  SCLRMTTY
            CP   SCLRTYPB
            LD   A,SCLRTYPE
            JR   NZ,.L00000
            LD   A,SCLRTYPB
.L00000:
            LD   (DCLRTNIN),A
            LD   HL,(EXPRSSN4)
            LD   (DCLRTNPY),HL
            OR   A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDLLN: ;@NUC-GLOBAL HybridLL1CommitConstant PERMANENT HYBRDLLN
            LD   A,(DCLRTNIN)
            OR   SYMBLCLS
            LD   D,A
            LD   BC,(DCLRTNPY)
            CALL TYPDPRPR
            RET  C
            JP   SYMBLCMM

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDLLO: ;@NUC-GLOBAL HybridLL1CommitAggregateConstant PERMANENT HYBRDLLO
%IF TargetStreamingOutput
            CALL TRGTCRRN
            LD   (DCLRTNIN),A
            CALL TRGTBNKR
            PUSH HL
            LD   C,(HL)
            INC  HL
            LD   B,(HL)
            LD   (DCLRTNPY),BC
            LD   HL,(AGGRGTC8)
            ADD  HL,BC
            LD   E,L
            LD   D,H
            POP  HL
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   A,(DCLRTNIN)
            RLCA
            RLCA
            RLCA
            RLCA
            OR   H1AGCST
            LD   (DCLRTNIN),A
%ENDIF
            LD   BC,(RDONLYIM)
            LD   D,H1AGCST
%IF TargetStreamingOutput
            LD   A,(DCLRTNIN)
            LD   D,A
            LD   BC,(DCLRTNPY)
%ENDIF
            CALL TYPDPRPR
            RET  C
            LD   BC,(RDONLYIM)
            LD   HL,(AGGRGTC8)
            ADD  HL,BC
            LD   DE,(STTCIMGL)
            ADD  HL,DE
            CALL AGGRGTC0
            RET  C
            OR   A
            SBC  HL,DE
            LD   (RDONLYIM),HL
            LD   HL,STTCIMGB
            ADD  HL,DE
            ADD  HL,BC
            EX   DE,HL
            LD   HL,AGGRGTI6
            LD   BC,(AGGRGTC8)
            LDIR
            LD   A,(SYMBLCNT)
            LD   E,A
            LD   D,0
            LD   HL,AGGRGTSY
            ADD  HL,DE
            LD   A,(AGGRGTCR)
            LD   (HL),A
            JP   SYMBLCMM

HYBRDLLP EQU TYPDRTN0 ;@NUC-GLOBAL HybridLL1BeginAssert PERMANENT HYBRDLLP

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDLLQ: ;@NUC-GLOBAL HybridLL1CommitAssert PERMANENT HYBRDLLQ
            CALL HYBRDL13
            LD   A,(EXPRSSNR)
            AND  H1MTMSK
            CP   H1MCBL
            JR   NZ,.L00000
            LD   A,(EXPRSSN4)
            OR   A
            RET  NZ
            LD   A,DGNSTCAS
            JP   CMPLRSTD
.L00000:
            LD   A,DGNSTCTY
            JP   CMPLRSTD

; ------------------------------------------------------ program declarations

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
HYBRDLLR: ;@NUC-GLOBAL HybridLL1SaveProgramType PERMANENT HYBRDLLR
            LD   A,(AGGRGTCR)
HYBRDLLS: ;@NUC-GLOBAL HybridLL1SaveObjectType PERMANENT HYBRDLLS
            LD   (DCLRTNIN),A
            CALL AGGRGTGT
            LD   (AGGRGTC8),HL
            LD   (AGGRGTCD),HL
            LD   HL,0
            LD   (AGGRGTC7),HL
            CALL AGGRGTZR
            RET  C
            XOR  A
            LD   (AGGRGTI5),A
            LD   (AGGRGTHS),A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
HYBRDLLT: ;@NUC-GLOBAL HybridLL1SaveAggregateConstantType PERMANENT HYBRDLLT
            LD   A,(AGGRGTCR)
            CP   AGGRGTFR
            JP   C,TYPDTYPF
            JR   HYBRDLLS

HYBRDLLU: ;@NUC-GLOBAL HybridLL1FinishProgramInitializer PERMANENT HYBRDLLU
            LD   A,1
            LD   (AGGRGTHS),A
            LD   HL,(AGGRGTC7)
            LD   DE,(AGGRGTCD)
            OR   A
            SBC  HL,DE
            JP   NZ,AGGRGTI3
            OR   A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDLLV: ;@NUC-GLOBAL HybridLL1CommitProgramVariable PERMANENT HYBRDLLV
            LD   A,(AGGRGTHS)
            OR   A
            JR   Z,.L00000
            JR   .L00004
.L00000:
            JR   .L00006
.L00001:
            PUSH BC
            LD   A,(DCLRTNIN)
            CP   AGGRGTFR
            JR   C,.L00002
            LD   D,SYMBLIN0
            JR   .L00003
.L00002:
            OR   SYMBLCL0
            LD   D,A
.L00003:
            CALL TYPDPRPR
            POP  BC
            RET  C
            LD   A,(SYMBLCNT)
            LD   E,A
            LD   D,0
            LD   HL,AGGRGTSY
            ADD  HL,DE
            LD   A,(DCLRTNIN)
            LD   (HL),A
            CALL SYMBLCMM
            RET  C
            OR   A
            RET

; Return the absolute target address of one initialized program object in BC.
; The complete prepared bytes are appended to the rodata-backed data image.
.L00004:
            LD   DE,(STTCIMGL)
            CALL .L00007
            RET  C
            PUSH HL
            LD   DE,(RDONLYIM)
            ADD  HL,DE
            CALL AGGRGTCH
            POP  HL
            RET  C
            LD   (STTCIMGL),HL
            LD   BC,(RDONLYIM)
            LD   A,B
            OR   C
            JR   Z,.L00005
            LD   HL,STTCIMGB
            LD   DE,(AGGRGTC7)
            ADD  HL,DE
            ADD  HL,BC
            DEC  HL
            LD   DE,(AGGRGTC8)
            PUSH HL
            ADD  HL,DE
            EX   DE,HL
            POP  HL
            LDDR
.L00005:
            LD   A,(DCLRTNIN)
            CALL AGGRGTGT
            LD   B,H
            LD   C,L
            LD   HL,AGGRGTI6
            LD   DE,(AGGRGTC7)
            PUSH HL
            LD   HL,STTCIMGB
            ADD  HL,DE
            EX   DE,HL
            POP  HL
            LDIR
            LD   BC,(AGGRGTC7)
%IF TargetStreamingOutput
            ; Target transcripts retain a segment-relative offset. Bit 15 is
            ; clear for initialized data and set for BSS.
%ELSE
            LD   HL,PRGRMDTB
            ADD  HL,BC
            LD   B,H
            LD   C,L
%ENDIF
            OR   A
            JR   .L00001

; Return the absolute target address of one default-initialized object in BC.
.L00006:
            LD   DE,(PRGRMBSS)
            CALL .L00007
            RET  C
            LD   (PRGRMBSS),HL
            LD   B,D
            LD   C,E
%IF TargetStreamingOutput
            SET  7,B
%ELSE
            LD   HL,PRGRMBS0
            ADD  HL,BC
            LD   B,H
            LD   C,L
%ENDIF
            OR   A
            JP   .L00001

; Add the current object extent to the selected segment length in DE. Return
; the old offset in DE and the checked mathematical end in HL.
;@ROUTINE IN DE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
.L00007:
            LD   (AGGRGTC7),DE
            LD   A,(DCLRTNIN)
            CALL AGGRGTGT
            LD   DE,(AGGRGTC7)
            ADD  HL,DE
.L00008:
; Initialized data and BSS use the same exact 1 KiB extent rule and diagnostic
; as complete aggregate objects.
            JP   AGGRGTCH

; ---------------------------------------------------------- record metadata

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
HYBRDLLW: ;@NUC-GLOBAL HybridLL1BeginRecord PERMANENT HYBRDLLW
            CALL TYPDRTND
            RET  C
            LD   A,(AGGRGTT7)
            CP   AGGRGTTA
            JP   NC,AGGRGTT0
            LD   A,(AGGRGTR6)
            CP   AGGRGTR9
            JP   NC,AGGRGTT0
            LD   A,(AGGRGTF2)
            LD   (AGGRGTC4),A
            XOR  A
            LD   (AGGRGTC5),A
            LD   H,A
            LD   L,A
            LD   (AGGRGTC6),HL
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
HYBRDLLX: ;@NUC-GLOBAL HybridLL1BeginRecordField PERMANENT HYBRDLLX
            CALL AGGRGTC1
            RET  C
            LD   A,(AGGRGTF2)
            LD   B,A
            LD   A,(AGGRGTC5)
            ADD  A,B
            CP   AGGRGTF5
            JP   NC,AGGRGTT0
            PUSH AF
            CALL AGGRGTFL
            CALL TKNRTNNM
            POP  AF
            OR   A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
HYBRDLLY: ;@NUC-GLOBAL HybridLL1CommitRecordField PERMANENT HYBRDLLY
            LD   A,(AGGRGTF2)
            LD   B,A
            LD   A,(AGGRGTC5)
            ADD  A,B
            CALL AGGRGTFL
            INC  HL
            INC  HL
            INC  HL
            LD   A,(AGGRGTCR)
            LD   (HL),A
            INC  HL
            LD   DE,(AGGRGTC6)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   A,(AGGRGTCR)
            PUSH DE
            CALL AGGRGTGT
            POP  DE
            ADD  HL,DE
            JP   C,AGGRGTPR
            CALL AGGRGTCH
            RET  C
            LD   (AGGRGTC6),HL
            LD   HL,AGGRGTC5
            INC  (HL)
            XOR  A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDLLZ: ;@NUC-GLOBAL HybridLL1CommitRecord PERMANENT HYBRDLLZ
            LD   A,(AGGRGTC5)
            OR   A
            JP   Z,AGGRGTRC
            LD   A,AGGRGTTL
            LD   (AGGRGTC9),A
            LD   A,(AGGRGTR6)
            LD   (AGGRGTCA),A
            LD   HL,0
            LD   (AGGRGTCB),HL
            LD   HL,(AGGRGTC6)
            LD   (AGGRGTCC),HL
            CALL AGGRGTAP
            RET  C
            LD   (AGGRGTCR),A
            LD   A,(AGGRGTR6)
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,AGGRGTR7
            ADD  HL,DE
            LD   A,(AGGRGTC4)
            LD   (HL),A
            INC  HL
            LD   A,(AGGRGTC5)
            LD   (HL),A
            LD   D,SYMBLINF
            LD   A,(AGGRGTCR)
            LD   C,A
            LD   B,0
            CALL TYPDPRPR
            RET  C
            CALL SYMBLCMM
            RET  C
            LD   A,(AGGRGTC5)
            LD   HL,AGGRGTF2
            ADD  A,(HL)
            LD   (HL),A
            LD   HL,AGGRGTR6
            INC  (HL)
            XOR  A
            RET

; ----------------------------------------------------- Stage 7 routines/main

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
HYBRDL10: ;@NUC-GLOBAL HybridLL1RequireBeforeMain PERMANENT HYBRDL10
            LD   A,(STG7CRR1)
            INC  A
            RET  NZ
            LD   A,DGNSTCEA
            JP   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
HYBRDL11: ;@NUC-GLOBAL HybridLL1RequireMain PERMANENT HYBRDL11
            LD   A,(STG7CRR1)
            INC  A
            JR   Z,.L00000
            LD   A,(STG8FRWR)
            AND  STG8RTNI
            JR   NZ,.L00003
            JR   .L00002
.L00000:
            LD   A,(STG7RTNC)
            LD   B,A
            XOR  A
            LD   C,A
.L00001:
            LD   A,B
            OR   A
            RET  Z
            LD   A,C
            CALL STG7RTNA
            LD   DE,STG7RTNF
            ADD  HL,DE
            LD   A,(HL)
            AND  STG8RTNI
            JR   NZ,.L00003
            INC  C
            DEC  B
            JR   .L00001
.L00002:
            LD   A,DGNSTCEC
            JP   CMPLRSTD
.L00003:
            LD   A,DGNSTCF0
            JP   CMPLRSTD

; The grammar deliberately treats the lexeme `main` as the same NAME token as
; ordinary routine names. This action is the one semantic discriminator.
;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL12: ;@NUC-GLOBAL HybridLL1RetainSubName PERMANENT HYBRDL12
            JP   TYPDRTN0

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDL13: ;@NUC-GLOBAL HybridLL1RestoreSubName PERMANENT HYBRDL13
            CALL TYPDRSTR
            LD   HL,DCLRTNN1
            LD   DE,TKNSTRTO
            CALL CMPLRCPY
            OR   A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDL14: ;@NUC-GLOBAL HybridLL1ResetParametersAndResult PERMANENT HYBRDL14
            XOR  A
            LD   (STG7CRR4),A
            LD   (STG7CRR2),A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
HYBRDL15: ;@NUC-GLOBAL HybridLL1BeginSub PERMANENT HYBRDL15
            CALL HYBRDL13
            CALL HYBRDL10
            RET  C
            CALL TYPDNMEQ
            JR   C,.L00000
            LD   A,(STG7RTNC)
            CP   STG7RTN0
            JR   NC,.L00001
            CALL STG7RJCT
            RET  C
            LD   A,(STG7RTNC)
            LD   (STG7CRR1),A
            CALL STG7RTNA
            CALL TKNRTNNM
            INC  HL
            LD   A,(STG7PRM0)
            LD   (HL),A
            LD   (STG7CRR3),A
            CALL HYBRDL14
%IF TargetStreamingOutput
            CALL TRGTPCKC
%ENDIF
            LD   (STG7CRR5),A
            RET
.L00000:
%IF TargetStreamingOutput
            CALL TRGTRQRE
            RET  C
%ENDIF
            LD   A,(STG8FRWR)
            AND  STG8RTNI
            JP   NZ,TYPDDPLC
            CALL STG7RJCT
            RET  C
            LD   A,$FF
            LD   (STG7CRR1),A
            CALL HYBRDL14
            LD   A,STG7RTNM
%IF TargetStreamingOutput
            CALL TRGTPCKC
%ENDIF
            LD   (STG7CRR5),A
            RET
.L00001:
            LD   A,DGNSTCRT
            JP   CMPLRSTD

; A forward uses the ordinary signature builder, then publishes that sole
; signature without opening a body or emitting code.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
HYBRDL16: ;@NUC-GLOBAL HybridLL1BeginForward PERMANENT HYBRDL16
            CALL HYBRDL15
            RET  C
            LD   A,(STG7CRR5)
            OR   STG8RTNI
            LD   (STG7CRR5),A
            OR   A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
HYBRDL17: ;@NUC-GLOBAL HybridLL1CommitForward PERMANENT HYBRDL17
            LD   A,(STG7CRR1)
            INC  A
            JR   Z,.L00000
            DEC  A
            CALL HYBRDL1G
            XOR  A
            RET
.L00000:
            LD   A,(STG7CRR5)
            LD   (STG8FRWR),A
            XOR  A
            LD   (STG7CRR1),A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
HYBRDL18: ;@NUC-GLOBAL HybridLL1RetainParameter PERMANENT HYBRDL18
            LD   A,(STG7CRR1)
            INC  A
            JR   Z,.L00000
            CALL STG7CHC0
            RET  C
            LD   HL,DCLRTNNM
            CALL TKNRTNNM
            OR   A
            RET
.L00000:
            LD   A,DGNSTCE2
            JP   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
HYBRDL19: ;@NUC-GLOBAL HybridLL1CommitParameter PERMANENT HYBRDL19
            CALL TYPDRSTR
            LD   A,(AGGRGTCR)
            JP   STG7APPN

HYBRDL1A: ;@NUC-GLOBAL HybridLL1AllowSubResult PERMANENT HYBRDL1A
            LD   A,(STG7CRR1)
            INC  A
            JR   Z,HYBRDL1D
            RET

HYBRDL1B: ;@NUC-GLOBAL HybridLL1SaveSubResult PERMANENT HYBRDL1B
            LD   A,(AGGRGTCR)
            LD   (STG7CRR2),A
            OR   A
            RET

HYBRDL1C: ;@NUC-GLOBAL HybridLL1MarkSubFails PERMANENT HYBRDL1C
            LD   A,(STG7CRR5)
            OR   STG7RTN5
            LD   (STG7CRR5),A
            OR   A
            RET
HYBRDL1D: ;@NUC-GLOBAL HybridLL1SubSignatureLineFailure PERMANENT HYBRDL1D
            LD   A,DGNSTCE4
            JP   CMPLRSTD

; Open the abbreviated body of one exact incomplete forward and recover its
; sole stored signature, including the original parameter spellings.
;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL1E: ;@NUC-GLOBAL HybridLL1BeginForwardBody PERMANENT HYBRDL1E
            CALL HYBRDL13
            CALL HYBRDL10
            RET  C
            CALL TYPDNMEQ
            JR   C,.L00001
            CALL STG7FNDR
            JR   NZ,.L00002
            LD   (STG7CRR1),A
            CALL STG7RTNA
            LD   DE,STG7RTNP
            ADD  HL,DE
            LD   A,(HL)
            LD   (STG7CRR3),A
            INC  HL
            LD   A,(HL)
            LD   (STG7CRR4),A
            INC  HL
            LD   A,(HL)
            LD   (STG7CRR2),A
            INC  HL
            LD   A,(HL)
            LD   (STG7CLLL),A
            INC  HL
            LD   A,(HL)
            BIT  2,A
            JP   Z,TYPDDPLC
%IF TargetStreamingOutput
            LD   D,A
            PUSH AF
            PUSH HL
            CALL TRGTRQRC
            JR   C,.L00000
            POP  HL
            POP  AF
%ENDIF
            AND  $FB
            LD   (HL),A
            LD   (STG7CRR5),A
            JR   HYBRDL1I
%IF TargetStreamingOutput
.L00000:
            POP  HL
            POP  AF
            SCF
            RET
%ENDIF
.L00001:
%IF TargetStreamingOutput
            CALL TRGTRQRE
            RET  C
%ENDIF
            LD   A,(STG8FRWR)
            BIT  2,A
            JR   Z,.L00002
            AND  $FB
            LD   (STG7CRR5),A
            LD   (STG8FRWR),A
            CALL HYBRDL14
            DEC  A
            LD   (STG7CRR1),A
            JP   HYBRDL1J
.L00002:
            LD   A,DGNSTCUN
            JP   CMPLRSTD

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL1F: ;@NUC-GLOBAL HybridLL1BeginSubBody PERMANENT HYBRDL1F
            LD   A,(STG7CRR1)
            INC  A
            JP   Z,HYBRDL1J
            DEC  A
            CALL HYBRDL1G
            JR   HYBRDL1I

;@ROUTINE IN A OUT A,BC,DE,HL CLOBBERS CARRY,ZERO,SIGN,PARITY,HALFCARRY
HYBRDL1G: ;@NUC-GLOBAL HybridLL1PublishRoutine PERMANENT HYBRDL1G
            CALL STG7RTNA
            LD   DE,STG7RTN3
            ADD  HL,DE
            LD   A,(STG7CRR4)
            LD   (HL),A
            INC  HL
            LD   A,(STG7CRR2)
            LD   (HL),A
            INC  HL
            LD   A,(STG7CRR1)
            ADD  A,STG7RTN4
            LD   (HL),A
            LD   (STG7CLLL),A
            INC  HL
            LD   A,(STG7CRR5)
            LD   (HL),A
            LD   HL,STG7RTNC
            INC  (HL)
            RET
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDL1H: ;@NUC-GLOBAL HybridLL1SaveGlobalsResetLocals PERMANENT HYBRDL1H
            LD   A,(SYMBLCNT)
            LD   (STG7GLBL),A
            XOR  A
            LD   (NXTLCLSL),A
            LD   (CNTRLDPT),A
            RET
HYBRDL1I: ;@NUC-GLOBAL HybridLL1OpenRoutineBody PERMANENT HYBRDL1I
            CALL HYBRDL1H
            LD   A,(STG7CRR2)
            OR   A
            LD   A,CNTRLRT1
            JR   NZ,.L00000
            XOR  A
.L00000:
            LD   (CNTRLRTN),A
            LD   A,(STG7CRR2)
            LD   (CNTRLRSL),A
            LD   A,1
            LD   (CNTRLSQN),A
            LD   A,SMNTCBGN
            CALL SMNTCSN5
            RET  C
            LD   A,(STG7CLLL)
            CALL SMNTCSN2
            RET  C
            LD   A,(STG7CRR4)
            CALL SMNTCSN2
            RET  C
%IF TargetStreamingOutput
            LD   A,(STG7CRR5)
            CALL TRGTUNPC
            CALL SMNTCSN2
            RET  C
            LD   A,(STG7CRR4)
%ENDIF
            LD   B,A
            LD   A,(STG7CRR3)
            LD   D,A
            XOR  A
            LD   E,A
.L00001:
            LD   A,B
            OR   A
            RET  Z
            DEC  A
            ADD  A,A
            ADD  A,4
            LD   C,A
            LD   A,D
            PUSH DE
            PUSH BC
            CALL STG7INST
            POP  BC
            POP  DE
            RET  C
            INC  D
            INC  E
            DEC  B
            JR   .L00001

HYBRDL1J: ;@NUC-GLOBAL HybridLL1BeginMainBody PERMANENT HYBRDL1J
            LD   A,(STG7CRR5)
            LD   (STG8FRWR),A
            LD   A,SMNTCBG1
            CALL SMNTCSN5
            RET  C
            LD   A,(STG7CRR5)
            CALL SMNTCSN2
            RET  C
%IF TargetStreamingOutput
            LD   A,(STG7CRR5)
            CALL TRGTUNPC
            CALL SMNTCSN2
            RET  C
%ENDIF
            CALL HYBRDL1H
            LD   (STG7CRR2),A
            LD   (CNTRLRTN),A

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDL1K: ;@NUC-GLOBAL HybridLL1SetFallsThrough PERMANENT HYBRDL1K
            LD   A,1
            LD   (CNTRLSQN),A
            OR   A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL1L: ;@NUC-GLOBAL HybridLL1EndSub PERMANENT HYBRDL1L
            LD   A,(STG7CRR1)
            INC  A
            JR   Z,HYBRDL1N
            LD   A,(STG7CRR2)
            OR   A
            JR   Z,.L00000
            LD   A,(CNTRLSQN)
            OR   A
            JP   NZ,TYPDRTNF
.L00000:
            CALL HYBRDL1M
            RET  C
            LD   A,(STG7CRR2)
            CALL SMNTCSN2
            RET  C
            LD   A,(STG7GLBL)
            LD   (SYMBLCNT),A
            XOR  A
            LD   (NXTLCLSL),A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
HYBRDL1M: ;@NUC-GLOBAL HybridLL1EmitRoutineEnd PERMANENT HYBRDL1M
            LD   A,(STG7CRR5)
            AND  STG7RTN5
            LD   A,SMNTCEND
            JR   Z,.L00000
            LD   A,SMNTCEN0
.L00000:
            JP   SMNTCSN5
HYBRDL1N: ;@NUC-GLOBAL HybridLL1EndMainBody PERMANENT HYBRDL1N
            CALL HYBRDL1M
            RET  C
            XOR  A
            JP   SMNTCSN2

; ------------------------------------------------------ recoverable failure

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
HYBRDL1O: ;@NUC-GLOBAL HybridLL1BeginFail PERMANENT HYBRDL1O
            LD   A,(STG7CRR5)
            AND  STG7RTN5
            JR   Z,HYBRDL1S
            LD   HL,(TKNSTRTO)
            LD   (STG8FLRO),HL
            LD   A,SCLRTYPU
            JP   HYBRDLLL

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL1P: ;@NUC-GLOBAL HybridLL1CommitFail PERMANENT HYBRDL1P
            LD   E,SCLRTYPU
            CALL HYBRDL1R
            RET  C
            LD   A,SMNTCFLR
.L00000:
            CALL SMNTCSN5
            RET  C
            LD   HL,(STG8FLRO)
            PUSH HL
            LD   A,L
            CALL SMNTCSN2
            POP  HL
            RET  C
            LD   A,H
            CALL SMNTCSN2
            RET  C
HYBRDL1Q: ;@NUC-GLOBAL HybridLL1NoFallthrough PERMANENT HYBRDL1Q
            XOR  A
            LD   (CNTRLSQN),A
            RET

; Validate one scalar fail/return value and reject an unconsumed nested
; recoverable failure.
;@ROUTINE IN E OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,IX,IY
HYBRDL1R: ;@NUC-GLOBAL HybridLL1CheckFailureResult PERMANENT HYBRDL1R
            LD   A,(EXPRSSNR)
            LD   HL,(EXPRSSN4)
            CALL TYPDCHC0
            RET  C
            JP   STG8RQRN
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
HYBRDL1S: ;@NUC-GLOBAL HybridLL1FailureContext PERMANENT HYBRDL1S
            LD   A,DGNSTCFL
            JP   CMPLRSTD

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
; Both callers have already observed a nonzero Stage8DirectFailable. The
; generic entry checks the token; the selected entry reuses its caller's peek.
STG8CNSM: ;@NUC-GLOBAL Stage8ConsumePropagation PERMANENT STG8CNSM
            CALL PRSRPK
            RET  C
            CP   TKNELS
            JR   NZ,HYBRDL1S
STG8CNS0: ;@NUC-GLOBAL Stage8ConsumePropagationSelected PERMANENT STG8CNS0
            LD   A,(STG7CRR5)
            AND  STG7RTN5
            JR   Z,HYBRDL1S
            CALL PRSRTK
            RET  C
            LD   E,TKNFL
            CALL PRSREXPC
            RET  C
            CALL PRSRPK
            RET  C
            CP   TKNHNDL
            JR   Z,HYBRDL1S
            CP   TKNELS
            JR   Z,HYBRDL1S
            LD   A,STG8CLL1
.L00000:
            LD   HL,(STG8CLLM)
            LD   (HL),A
            INC  HL
            INC  HL
            LD   A,(STG8RTND)
            LD   (HL),A
STG8CLRP: ;@NUC-GLOBAL Stage8ClearPendingFailure PERMANENT STG8CLRP
            XOR  A
            LD   (STG8DRCT),A
            LD   (STG8RTND),A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
STG8SLCT: ;@NUC-GLOBAL Stage8SelectFailureConsumer PERMANENT STG8SLCT
            LD   A,(STG8DRCT)
            OR   A
            JR   NZ,.L00000
            LD   (STG8RTND),A
            CALL PRSRPK
            RET  C
            CP   TKNELS
            JR   Z,HYBRDL1S
            CP   TKNHNDL
            JR   Z,HYBRDL1S
            OR   A
            RET
.L00000:
            CALL PRSRPK
            RET  C
            CP   TKNELS
            JR   Z,STG8CNS0
            CP   TKNHNDL
            JR   NZ,HYBRDL1S
            LD   B,CNTRLKN2
            CALL HYBRDL2B
            RET  C
            CALL CNTRLAL0
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLALL
            RET  C
            LD   HL,(STG8CLLM)
            LD   (HL),STG8CLL3
            LD   B,CNTRLFR4
            CALL CNTRLTP0
            LD   C,(HL)
            LD   HL,(STG8CLLM)
            INC  HL
            LD   (HL),C
            INC  HL
            LD   A,(STG8RTND)
            LD   (HL),A
            JR   STG8CLRP

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL1T: ;@NUC-GLOBAL HybridLL1LookupDeclaration PERMANENT HYBRDL1T
            CALL SYMBLLKP
            RET  C
            LD   (DCLRTNIN),A
            LD   (DCLRTNPY),BC
            LD   D,A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL1U: ;@NUC-GLOBAL HybridLL1BeginHandle PERMANENT HYBRDL1U
            CALL HYBRDL1T
            RET  C
            CALL TYPDRQRS
            RET  C
            JP   Z,TYPDTYPF
            CP   SYMBLCL1
            JR   NZ,.L00000
            CALL CNTRLCHC
            RET  C
.L00000:
            CALL TYPDDCLR
            CP   SCLRTYPU
            JP   NZ,TYPDTYPF
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            LD   A,SMNTCSKP
            CALL STG8EMTO
            RET  C
            LD   B,CNTRLFR4
            CALL CNTRLTP0
            LD   C,(HL)
            LD   A,SMNTCBG0
            CALL STG8EMTO
            RET  C
            LD   A,(DCLRTNIN)
            CALL SMNTCSN2
            RET  C
            AND  SYMBLCL3
            CP   SYMBLCL0
            LD   HL,(DCLRTNPY)
            JR   Z,.L00001
            LD   A,L
            CALL SMNTCSN2
            JR   .L00002
.L00001:
            CALL STG7EMTW
.L00002:
            RET  C
            JP   HYBRDL1K

;@ROUTINE IN A,C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
STG8EMTO: ;@NUC-GLOBAL Stage8EmitOperationLabel PERMANENT STG8EMTO
            CALL SMNTCSN5
            RET  C
            LD   A,C
            JP   SMNTCSN2

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL1V: ;@NUC-GLOBAL HybridLL1EndHandle PERMANENT HYBRDL1V
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            LD   A,SMNTCEN1
            CALL STG8EMTO
            RET  C
            LD   A,1
            JP   HYBRDL2E

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
STG8RQRN: ;@NUC-GLOBAL Stage8RequireNoPendingFailure PERMANENT STG8RQRN
            LD   A,(STG8DRCT)
            OR   A
            RET  Z
            JP   HYBRDL1S

; ------------------------------------------------------------- local scalars

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDL1W: ;@NUC-GLOBAL HybridLL1SaveLocalType PERMANENT HYBRDL1W
            LD   A,(AGGRGTCR)
            OR   SYMBLCL1
            LD   (DCLRTNIN),A
            LD   A,(NXTLCLSL)
            LD   C,A
            LD   B,0
            LD   (DCLRTNPY),BC
            PUSH BC
            LD   A,(DCLRTNIN)
            LD   D,A
            CALL TYPDPRPR
            POP  BC
            RET  C
            CALL TYPDDCLR
            CALL TYPDEMTL
HYBRDL1X: ;@NUC-GLOBAL HybridLL1SetLocalExpectedType PERMANENT HYBRDL1X
            RET  C
            CALL TYPDDCLR
            JP   HYBRDLLL

HYBRDL1Y: ;@NUC-GLOBAL HybridLL1BeginLocalInitializer PERMANENT HYBRDL1Y
            CALL TYPDDCLR
            JP   HYBRDLLL

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
HYBRDL1Z: ;@NUC-GLOBAL HybridLL1DefaultLocalInitializer PERMANENT HYBRDL1Z
            LD   A,1
            LD   (EXPRSSN2),A
            LD   A,SMNTCLT0
            CALL TYPDEMTO
            RET  C
            LD   HL,0
            CALL TYPDEMTW
            RET  C
            CALL TYPDDCLR
            OR   SCLRMTCN
            LD   (EXPRSSNR),A
            LD   HL,0
            LD   (EXPRSSN4),HL
            OR   A
            RET

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,IX,IY
HYBRDL20: ;@NUC-GLOBAL HybridLL1FinishLocalInitializer PERMANENT HYBRDL20
            CALL HYBRDL21
            RET  C
            LD   A,(STG8DRCT)
            OR   A
            JP   NZ,STG8CNSM
            CALL PRSRPK
            RET  C
            CP   TKNELS
            JP   Z,HYBRDL1S
            OR   A
            RET

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,IX,IY
HYBRDL21: ;@NUC-GLOBAL HybridLL1ValidateDeclarationExpression PERMANENT HYBRDL21
            CALL TYPDDCLR
            LD   E,A

;@ROUTINE IN E OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,IX,IY
HYBRDL22: ;@NUC-GLOBAL HybridLL1CheckExpressionAssignable PERMANENT HYBRDL22
            LD   HL,(EXPRSSN4)
            LD   A,(EXPRSSNR)
            JP   TYPDCHC0

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL23: ;@NUC-GLOBAL HybridLL1CommitLocal PERMANENT HYBRDL23
            LD   A,(DCLRTNIN)
            LD   D,A
            LD   A,(DCLRTNPY)
            LD   C,A
            CALL TYPDEMT3
            RET  C
            CALL SYMBLCMM
            RET  C
            CALL TYPDDCLR
            CALL TYPDTYPW
            LD   HL,NXTLCLSL
            ADD  A,(HL)
            LD   (HL),A
            OR   A
            RET

; ------------------------------------------------------------ simple statements

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL24: ;@NUC-GLOBAL HybridLL1NameStatement PERMANENT HYBRDL24
            CALL PRSRTK
            RET  C
            LD   HL,(TKNSTRTO)
            LD   (EXPRSSNC),HL
            LD   (STG7CLLO),HL
            CALL STG8MTCH
            JR   NC,.L00000
            CP   STG8PRDF
            JP   NC,TYPDTYPF
            LD   C,0
            CALL STG8PRSS
            RET  C
            JP   STG8SLCT
.L00000:
            CALL STG7FNDR
            JR   NZ,.L00001
            LD   C,0
            CALL STG7PRSC
            RET  C
            JP   STG8SLCT
.L00001:
            CALL HYBRDL1T
            RET  C
            AND  SYMBLAGG
            JP   NZ,STG7PRS3
            LD   A,D
            CALL TYPDRQRS
            RET  C
            CP   SYMBLCL1
            JR   NZ,.L00002
            CALL CNTRLCHC
            RET  C
.L00002:
            LD   A,D
            AND  SYMBLCL3
            JP   Z,TYPDTYPF
            CALL PRSREXP6
            RET  C
            CALL TYPDDCLR
            CALL TYPDEXP2
            RET  C
            LD   D,A
            CALL TYPDDCLR
            LD   E,A
            LD   A,D
            CALL TYPDCHC0
            RET  C
            CALL STG8SLCT
            RET  C
            LD   BC,(DCLRTNPY)
            LD   A,(DCLRTNIN)
            LD   D,A
            JP   TYPDEMT3
HYBRDL25: ;@NUC-GLOBAL HybridLL1BeginReturnValue PERMANENT HYBRDL25
            LD   A,(STG7CRR2)
            OR   A
            RET  Z
            CP   AGGRGTFR
            RET  NC
            JP   HYBRDLLL

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL26: ;@NUC-GLOBAL HybridLL1ReturnValue PERMANENT HYBRDL26
            LD   A,(STG7CRR2)
            OR   A
            JP   Z,TYPDRTNF
            CP   AGGRGTFR
            JR   NC,.L00000
            CALL TYPDEXP2
            JP   HYBRDLL7
.L00000:
            CALL STG7PRSA
            RET  C
            LD   (STG7PTHT),A
            OR   A
            RET

HYBRDL27: ;@NUC-GLOBAL HybridLL1CommitReturn PERMANENT HYBRDL27
            LD   A,(STG7CRR2)
            OR   A
            JP   Z,TYPDRTNF
            CP   AGGRGTFR
            JR   NC,.L00001
            LD   E,A
            CALL HYBRDL1R
            RET  C
            LD   A,(STG7CRR5)
            AND  STG7RTN5
            LD   A,SMNTCRT5
            JR   Z,.L00000
            LD   A,SMNTCRT0
.L00000:
            CALL SMNTCSN5
            RET  C
            JR   HYBRDL28
.L00001:
            LD   D,A
            LD   A,(STG7PTHT)
            CP   D
            JP   NZ,TYPDTYPF
            CALL STG8RQRN
            RET  C
            LD   A,(STG7CRR5)
            AND  STG7RTN5
            LD   A,SMNTCRTR
            JR   Z,.L00002
            LD   A,SMNTCRT1
.L00002:
            CALL SMNTCSN5
            RET  C
HYBRDL28: ;@NUC-GLOBAL HybridLL1ReturnCommitted PERMANENT HYBRDL28
            JP   HYBRDL1Q

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL29: ;@NUC-GLOBAL HybridLL1CommitBareReturn PERMANENT HYBRDL29
            LD   A,(STG7CRR2)
            OR   A
            JP   NZ,TYPDRTNF
            CALL HYBRDL1M
            RET  C
            XOR  A
            CALL SMNTCSN2
            RET  C
            JR   HYBRDL28

; A is the logical action ordinal. The two ordinals and tokens are contiguous.
HYBRDL2A: ;@NUC-GLOBAL HybridLL1EmitTransferAction PERMANENT HYBRDL2A
            DEC  A
.L00000:
            LD   (DCLRTNIN),A
            CALL CNTRLFND
            RET  C
            LD   DE,CNTRLFR6
            LD   A,(DCLRTNIN)
            CP   TKNEXT
            JR   Z,.L00001
            LD   DE,CNTRLFR5
.L00001:
            ADD  HL,DE
            LD   C,(HL)
            JP   CNTRLEM2

; ---------------------------------------------------------- structured flow

; Save the enclosing statement sequence's fallthrough bit, then push the
; control-frame kind supplied in B.
;@ROUTINE IN B OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C
HYBRDL2B: ;@NUC-GLOBAL HybridLL1PushFlowFrame PERMANENT HYBRDL2B
            LD   A,(CNTRLDPT)
            CP   CNTRLFR1
            JP   NC,CNTRLCPC
            CALL HYBRDL2C
            LD   A,(CNTRLSQN)
            LD   (HL),A
            LD   A,B
            JP   CNTRLPSH

;@ROUTINE OUT A,DE,HL CLOBBERS CARRY,ZERO,SIGN,PARITY,HALFCARRY
HYBRDL2C: ;@NUC-GLOBAL HybridLL1FlowAddress PERMANENT HYBRDL2C
            LD   A,(CNTRLDPT)
            LD   E,A
            LD   D,0
            LD   HL,HYBRDLL3
            ADD  HL,DE
            RET

; The frame has already been popped. Restore its enclosing sequence bit.
;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C
HYBRDL2D: ;@NUC-GLOBAL HybridLL1RestoreFlow PERMANENT HYBRDL2D
            CALL HYBRDL2C
            LD   A,(HL)
            LD   (CNTRLSQN),A
            OR   A
            RET

; A is the completed compound statement's fallthrough bit.
;@ROUTINE IN A OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C
HYBRDL2E: ;@NUC-GLOBAL HybridLL1CombineFlow PERMANENT HYBRDL2E
            LD   B,A
            CALL CNTRLPPF
            RET  C
            CALL HYBRDL2C
            LD   A,(HL)
            AND  B
            LD   (CNTRLSQN),A
            OR   A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2F: ;@NUC-GLOBAL HybridLL1CheckBooleanResult PERMANENT HYBRDL2F
            LD   E,SCLRTYPB
HYBRDL2G: ;@NUC-GLOBAL HybridLL1CheckTypedResult PERMANENT HYBRDL2G
            CALL STG8RQRN
            RET  C
            JP   HYBRDL22

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2H: ;@NUC-GLOBAL HybridLL1BeginIf PERMANENT HYBRDL2H
            LD   B,CNTRLKND
            CALL HYBRDL2B
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLALL
            RET  C
            CALL CNTRLAL0
            RET  C
            LD   DE,H1CFCOF
            ADD  HL,DE
            LD   (HL),1
HYBRDL2I: ;@NUC-GLOBAL HybridLL1ExpectBoolean PERMANENT HYBRDL2I
            LD   A,SCLRTYPB
            JP   HYBRDLLL

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2J: ;@NUC-GLOBAL HybridLL1BeginIfBody PERMANENT HYBRDL2J
            CALL HYBRDL2F
            RET  C
            LD   B,CNTRLFR4

;@ROUTINE IN B OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2K: ;@NUC-GLOBAL HybridLL1BeginConditionBody PERMANENT HYBRDL2K
            CALL CNTRLTP0
            RET  C
            LD   C,(HL)
            CALL CNTRLEM1
HYBRDL2L: ;@NUC-GLOBAL HybridLL1CheckedSetFallsThrough PERMANENT HYBRDL2L
            RET  C
            JP   HYBRDL1K

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2M: ;@NUC-GLOBAL HybridLL1BeginBranchClause PERMANENT HYBRDL2M
            CALL STRCTRDR
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM2
            RET  C
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            JP   CNTRLEM0

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2N: ;@NUC-GLOBAL HybridLL1BeginElseIf PERMANENT HYBRDL2N
            CALL HYBRDL2M
            RET  C
            CALL CNTRLAL0
            RET  C
            JR   HYBRDL2I

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2O: ;@NUC-GLOBAL HybridLL1BeginElse PERMANENT HYBRDL2O
            CALL HYBRDL2M
            JR   HYBRDL2L

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C
HYBRDL2P: ;@NUC-GLOBAL HybridLL1FinishElse PERMANENT HYBRDL2P
            CALL STRCTRDR
            RET  C
            LD   B,CNTRLFR8
            CALL CNTRLTP0
            LD   (HL),1
            XOR  A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2Q: ;@NUC-GLOBAL HybridLL1FinishIfClauses PERMANENT HYBRDL2Q
            CALL STRCTRDR
            RET  C
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            JP   CNTRLEM0

; B selects a field in the active control frame. All callers have already
; established that frame; the helper preserves their existing precondition.
;@ROUTINE IN B OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2R: ;@NUC-GLOBAL HybridLL1EmitFrameLabel PERMANENT HYBRDL2R
            CALL CNTRLTP0
            LD   C,(HL)
            JP   CNTRLEM0

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2S: ;@NUC-GLOBAL HybridLL1EndIf PERMANENT HYBRDL2S
            LD   B,CNTRLFR6
            CALL HYBRDL2R
            RET  C
            CALL CNTRLTPF
            PUSH HL
            LD   DE,CNTRLFR7
            ADD  HL,DE
            LD   A,(HL)
            POP  HL
            LD   DE,CNTRLFR8
            ADD  HL,DE
            AND  (HL)
            XOR  1
            JP   HYBRDL2E

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2T: ;@NUC-GLOBAL HybridLL1BeginWhile PERMANENT HYBRDL2T
            LD   B,CNTRLKN0
            CALL HYBRDL2B
            RET  C
            CALL CNTRLAL0
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
            JP   HYBRDL2I

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2U: ;@NUC-GLOBAL HybridLL1BeginWhileBody PERMANENT HYBRDL2U
            CALL HYBRDL2F
            RET  C
            LD   B,CNTRLFR6
            JP   HYBRDL2K

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2V: ;@NUC-GLOBAL HybridLL1EndWhile PERMANENT HYBRDL2V
            LD   B,CNTRLFR5
            CALL CNTRLTP0
            LD   C,(HL)
            CALL CNTRLEM2
            RET  C
            LD   B,CNTRLFR6
            CALL HYBRDL2R
            RET  C
HYBRDL2W: ;@NUC-GLOBAL HybridLL1PopAndRestoreFlow PERMANENT HYBRDL2W
            CALL CNTRLPPF
            RET  C
            JP   HYBRDL2D

; -------------------------------------------------------------- counted loop

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL2X: ;@NUC-GLOBAL HybridLL1BeginFor PERMANENT HYBRDL2X
            LD   HL,(TKNSTRTO)
            LD   (HYBRDLL2),HL
            CALL HYBRDL1T
            RET  C
            AND  SYMBLCL3
            CP   SYMBLCL1
            JP   NZ,STRCTRD5
            LD   A,D
            AND  SCLRMTTY
            CP   SCLRTYPB
            JP   Z,STRCTRD5
            CALL CNTRLCHC
            JP   HYBRDL1X

.L00000:
            CALL HYBRDL21
            RET  C
            JP   STG8RQRN

; A is the logical action ordinal for the contiguous to/until family.
HYBRDL2Y: ;@NUC-GLOBAL HybridLL1SelectForBoundAction PERMANENT HYBRDL2Y
            AND  1
.L00000:
            LD   (HYBRDLL1),A
            CALL HYBRDL20
            RET  C
            JP   HYBRDLLF

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,IX,IY
HYBRDL2Z: ;@NUC-GLOBAL HybridLL1CheckForBound PERMANENT HYBRDL2Z
            LD   E,SCLRTYP0
            JP   HYBRDL2G

HYBRDL30 EQU HYBRDL2Z ;@NUC-GLOBAL HybridLL1SaveForStep PERMANENT HYBRDL30

HYBRDL31: ;@NUC-GLOBAL HybridLL1DefaultForStep PERMANENT HYBRDL31
            CALL HYBRDL2Z
            RET  C
            LD   DE,1
            LD   (HYBRDLL0),DE
            XOR  A
            RET

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL32: ;@NUC-GLOBAL HybridLL1BeginForBody PERMANENT HYBRDL32
            LD   B,CNTRLKN1
            CALL HYBRDL2B
            RET  C
            CALL CNTRLAL0
            RET  C
            LD   B,CNTRLFR5
            CALL CNTRLALL
            RET  C
            LD   B,CNTRLFR6
            CALL CNTRLALL
            RET  C
            LD   B,CNTRLFR7
            CALL CNTRLTP0
            LD   A,(DCLRTNPY)
            LD   (HL),A
            INC  HL
            CALL TYPDDCLR
            CP   SCLRTYP0
            LD   A,(HYBRDLL1)
            JR   NZ,.L00000
            SET  2,A
.L00000:
            LD   (HL),A
            INC  HL
            LD   DE,(HYBRDLL0)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   DE,(HYBRDLL2)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            CALL CNTRLTPF
            CALL STRCTRD6
            RET  C
            CALL CNTRLTPF
            INC  HL
            LD   C,(HL)
            CALL CNTRLEM0
            RET  C
            CALL STRCTRD7
            JP   HYBRDL2L

;@ROUTINE OUT A,BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,IX,IY
HYBRDL33: ;@NUC-GLOBAL HybridLL1EndFor PERMANENT HYBRDL33
            LD   B,CNTRLFR5
            CALL HYBRDL2R
            RET  C
            CALL STRCTRD9
            RET  C
            LD   B,CNTRLFR6
            CALL HYBRDL2R
            RET  C
            LD   A,SMNTCFRC
            CALL SMNTCSN5
            RET  C
            JP   HYBRDL2W
HYBRDL34: ;@NUC-GLOBAL HybridLL1ActionsEnd PERMANENT HYBRDL34
