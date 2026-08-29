AGZCLMS EQU SYMBLAGG+SYMBLCL3
AGZCNS2 EQU SYMBLAGG+SYMBLCLS

; Aggregate Z80 publisher. The complete checked initialized-data and constant
; image is emitted after
; the initial JP and before main's first instruction. TypedBeginMain
; patches the JP operand to the first code byte, so source execution cannot
; observe initialization in progress.


%IF TargetStreamingOutput
; Emit every aggregate constant exactly once in declaration order. Symbols
; retain per-bank offsets, while IY walks the single declaration-ordered
; compiler backing image. Switching banks never replays source or semantics.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
TRGTEMTB: ;@NUC-GLOBAL TargetEmitBankedAggregateConstants PERMANENT TRGTEMTB
            LD   A,(SYMBLCNT)
            OR   A
            RET  Z
            LD   B,A
            LD   C,0
            LD   IX,SYMBLTBL
            LD   IY,STTCIMGB
            LD   DE,(STTCIMGL)
            ADD  IY,DE
.L00000:
            LD   A,(IX+3)
            LD   D,A
            AND  AGZCLMS
            CP   AGZCNS2
            JR   NZ,.L00002
            LD   A,D
            CALL TRGTUNPC
            PUSH BC
            CALL TRGTSLCT
            POP  BC
            RET  C
            LD   H,0
            LD   L,C
            LD   DE,AGGRGTSY
            ADD  HL,DE
            LD   A,(HL)
            CALL AGGRGTGT
            EX   DE,HL
.L00001:
            LD   A,D
            OR   E
            JR   Z,.L00002
            LD   A,(IY+0)
            INC  IY
            PUSH BC
            PUSH DE
            CALL EmitByte
            POP  DE
            POP  BC
            RET  C
            DEC  DE
            JR   .L00001
.L00002:
            LD   DE,SYMBLENT
            ADD  IX,DE
            INC  C
            DJNZ .L00000
            OR   A
            RET
%ENDIF

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
ENCDAGGR: ;@NUC-GLOBAL EncodeAggregateProgram PERMANENT ENCDAGGR
%IF TargetStreamingOutput
            LD   IX,(TRGTDSCA)
            CALL BGNTRGTF
            JP   C,ABRTTRGT
%ELSE
%IF AggregateCallSlices
            LD   HL,GNRTDCDL
%ELSE
            LD   HL,GNRTDLMT
%ENDIF
%ENDIF
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
ENCDAGG0: ;@NUC-GLOBAL EncodeAggregateProgramWithinLimit PERMANENT ENCDAGG0
%IF TargetStreamingOutput
            LD   A,(TRGTDSCB)
            CP   1
            JR   NZ,AGGRGTDS
            ; BeginTargetFlatProgram already selected the first read-only byte.
            LD   A,(TRGTLYTM)
            OR   A
            JR   Z,.L00000
            LD   HL,(EMTCRSR)
            CALL TRGTEMT1
            JP   C,AGGRGTAB
            JR   .L00001
.L00000:
            LD   HL,STTCIMGB
            LD   DE,(STTCIMGL)
            ADD  HL,DE
            LD   BC,(RDONLYIM)
            JR   .L00002
.L00001:
%ELSE
%IF AggregateCallSlices
            CALL BGNSGMNT
            JP   C,ABRTSGMN
            LD   A,SGMNTROD
            CALL SLCTOTPT
%ELSE
            CALL ENCDPRG0
            JP   C,ABRTPRGR
%ENDIF
%ENDIF
%IF SegmentedOutput
            LD   HL,(RDONLYIM)
            LD   BC,(STTCIMGL)
            ADD  HL,BC
            LD   B,H
            LD   C,L
            LD   HL,STTCIMGB
%ELSE
            LD   HL,STTCIMGB
            LD   BC,(STTCIMGL)
%ENDIF
%IF TargetStreamingOutput
.L00002:
            CALL EMTBLCK
            JP   C,AGGRGTAB
%ELSE
            LD   A,B
            OR   C
            JR   Z,AGGRGTDS
.L00003:
            LD   A,(HL)
            INC  HL
            PUSH BC
            PUSH HL
            CALL EmitByte
            POP  HL
            POP  BC
            JP   C,AGGRGTAB
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,.L00003
%ENDIF
AGGRGTDS: ;@NUC-GLOBAL AggregateDispatch PERMANENT AGGRGTDS
%IF TargetStreamingOutput
            LD   A,(TRGTDSCB)
            CP   1
            JR   NZ,.L00000
            LD   HL,(EMTCRSR)
            LD   (TRGTCDBS),HL
            LD   A,(TRGTLYTM)
            OR   A
            JR   NZ,.L00000
            LD   HL,(TRGTCDCP)
            LD   (EMTLMT),HL
.L00000:
            LD   A,(TRGTDSCB)
            CP   1
            JR   NZ,.L00001
            LD   HL,(TRGTCNT6)
            LD   (TRGTCRR2),HL
            LD   HL,(TRGTCNT7)
            LD   (TRGTCRR1),HL
.L00001:
%ELSE
%IF AggregateCallSlices
            LD   A,SGMNTCD
            CALL SLCTOTPT
            CALL ENCDSGMN
            JP   C,ABRTSGMN
%ENDIF
%ENDIF
            CALL TYPDDSPT
            JP   C,AGGRGTAB
%IF TargetStreamingOutput
            JP   FNSHTRGT
%ELSE
%IF AggregateCallSlices
            JP   FNSHSGMN
%ELSE
            JP   FNSHPRGR
%ENDIF
%ENDIF

%IF TargetStreamingOutput
AGGRGTAB EQU ABRTTRGT ;@NUC-GLOBAL AggregateAbortProgram PERMANENT AGGRGTAB
%ELSE
%IF AggregateCallSlices
AGGRGTAB EQU ABRTSGMN ;@NUC-GLOBAL AggregateAbortProgram PERMANENT AGGRGTAB
%ELSE
AGGRGTAB EQU ABRTPRGR ;@NUC-GLOBAL AggregateAbortProgram PERMANENT AGGRGTAB
%ENDIF
%ENDIF
