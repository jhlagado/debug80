ACZTOFF EQU 3
ACZCLMO EQU 43
ACZRLSO EQU 68
ACZARRY EQU 77
ACZMULW EQU 182
ACZAGGR EQU 115
ACZSLEN EQU 85
ACZSIDX EQU 95

; Stage 7 direct-Z80 lowering for opaque aggregate carriers. Every source
; scalar and alias carrier occupies one canonical word on the evaluation
; stack; declared storage widths remain unchanged.


;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX
STG7BGNR: ;@NUC-GLOBAL Stage7BeginRoutine PERMANENT STG7BGNR
            CALL NXTSMNTC
            LD   C,A
            CALL NXTSMNTC     ; retained parameter count
%IF TargetStreamingOutput
            CALL NXTSMNTC     ; target bank
            PUSH BC
            CALL TRGTSLCT
            POP  BC
            RET  C
%ENDIF
STG7DFNR: ;@NUC-GLOBAL Stage7DefineRoutineFrame PERMANENT STG7DFNR
            CALL STRCTR1J
            RET  C
            LD   HL,EXPRSS12
            JP   EMTEGHT

; Operands are exact type, negative-frame byte offset, and positive caller
; displacement. The prologue copies one canonical argument into this
; activation before any body statement runs.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7BNDP: ;@NUC-GLOBAL Stage7BindParameter PERMANENT STG7BNDP
            CALL NXTSMNTC
            LD   (STG7PTHT),A
            CALL NXTSMNTC
            CPL
            LD   (STG7PTHO),A       ; -(destination + 1)
            CALL NXTSMNTC
            LD   (STG7ARGM),A    ; positive source displacement
            LD   A,(STG7PTHT)
            CP   AGGRGTFR
            JR   NC,.L00000
            CP   SCLRTYP0
            JR   Z,.L00000
            LD   A,$3B                      ; DEC SP
            CALL EmitByte
            RET  C
            LD   HL,STG7LDIX
            CALL .L00001
            RET  C
            LD   HL,STG7STR3
            JR   .L00002
.L00000:
            LD   HL,STG7DCSP
            CALL   EmitPair
            RET  C
            LD   HL,STG7LDIX
            CALL .L00001
            RET  C
            LD   HL,STG7LDI3
            CALL EmitPair
            RET  C
            LD   A,(STG7ARGM)
            INC  A
            CALL EmitByte
            RET  C
            LD   HL,STG7STR3
            CALL .L00002
            RET  C
            LD   HL,STG7STR4
            CALL EmitPair
            RET  C
            LD   A,(STG7PTHO)
            DEC  A
            JP   EmitByte

;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
.L00001:
            CALL EmitPair
            RET  C
            LD   A,(STG7ARGM)
            JP   EmitByte

;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
.L00002:
            CALL EmitPair
            RET  C
            LD   A,(STG7PTHO)
            JP   EmitByte

; Emit a bounds trap after a target helper has returned carry. The branch
; around the trap is patched before normal lowering continues.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7BNDS: ;@NUC-GLOBAL Stage7BoundsGuard PERMANENT STG7BNDS
            CALL EMTJRNCP
            RET  C
            LD   (EMTFLRFX),DE
            LD   HL,(STG7CLLO)
            LD   A,1
            CALL TYPDEMT7
            RET  C
            LD   DE,(EMTFLRFX)
            JP   PTCHHR

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
STG7RDCL: ;@NUC-GLOBAL Stage7ReadCallOffset PERMANENT STG7RDCL
            CALL RDSMNTCW
            LD   (STG7CLLO),DE
            RET

; Retain the source position of a propagated failure. The root wrapper uses
; the last propagation site when failure finally leaves callable main.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
STG8EMT3: ;@NUC-GLOBAL Stage8EmitFailureOffset PERMANENT STG8EMT3
            LD   HL,(STG7CLLO)
            CALL EMTLDHL
            RET  C
%IF TargetStreamingOutput
            LD   DE,ACZTOFF
            CALL TRGTSTTA
%ELSE
            LD   HL,TRPOFFST
%ENDIF
            LD   A,$22                    ; LD (nn),HL
            JP   EMTOPCDW

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG7CLL: ;@NUC-GLOBAL Stage7Call PERMANENT STG7CLL
            CALL NXTSMNTC
            LD   (STG7CLLL),A
            AND  STG8CLLB
            JR   NZ,.L00000
            CALL NXTSMNTC
            LD   (STG7ARG0),A
            CALL NXTSMNTC
            LD   (STG7CLLR),A
            CALL NXTSMNTC
            LD   (STG8EMTC),A
            JR   .L00001
.L00000:
            LD   A,(STG7CLLL)
            AND  STG8SRV8
            RLCA
            RLCA
            RLCA
            LD   (STG7CLLR),A
.L00001:
            CALL STG7RDCL
            LD   DE,STG8EMT1
            LD   B,3
.L00002:
            CALL NXTSMNTC          ; mode, handler, retained carriers
            LD   (DE),A
            INC  DE
            DJNZ .L00002
            LD   A,(STG7CLLL)
            AND  STG8CLLB
            JP   NZ,STG8INVK
%IF TargetStreamingOutput
            LD   DE,ACZCLMO
            CALL TYPDEMT5
%ELSE
            LD   HL,ACTVTNCL
            CALL TYPDEMTF
%ENDIF
            RET  C
            LD   (EMTEXTFX),DE
            LD   HL,(STG7CLLO)
            LD   A,5
            CALL TYPDEMT7
            RET  C
            LD   DE,(EMTEXTFX)
            CALL PTCHHR
            RET  C
            LD   A,(STG7CLLL)
            AND  STG8CLL5
            LD   C,A
%IF TargetStreamingOutput
            CALL .L00003
%ELSE
            LD   A,$CD
            CALL STRCTR1H
%ENDIF
            RET  C
            LD   A,(STG8EMTC)
            AND  STG7RTN5
            JR   NZ,.L00005
%IF TargetStreamingOutput
            LD   DE,ACZRLSO
            CALL EMTRNTMC
%ELSE
            LD   HL,ACTVTNRL
            CALL EmitCall
%ENDIF
            RET  C
            JR   STG8CLL8

%IF TargetStreamingOutput
; Emit an ordinary local CALL when the target routine shares the current bank.
; A cross-bank call supplies destination bank A and address HL to vector 9;
; the adapter switches, calls, restores the caller bank, and preserves the
; ordinary source-routine result/failure ABI.
;@ROUTINE IN C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
.L00003:
            LD   A,(STG8EMTC)
            CALL TRGTUNPC
            LD   D,A
            LD   A,(TRGTOTPT)
            CP   D
            JR   NZ,.L00004
            LD   A,$CD
            JP   STRCTR1H
.L00004:
            PUSH BC
            PUSH DE
            LD   C,D
            LD   A,$3E                    ; LD A,destination bank
            CALL EMTOPCDB
            POP  DE
            POP  BC
            RET  C
            LD   A,$21                    ; LD HL,target address
            CALL STRCTR1G
            RET  C
            LD   A,9                      ; far-call vector ordinal
            JP   EMTTRGTV
%ENDIF
.L00005:
            LD   A,$F5                    ; PUSH AF result discriminant/code
            CALL EmitByte
            RET  C
%IF TargetStreamingOutput
            LD   DE,ACZRLSO
            CALL EMTRNTMC
%ELSE
            LD   HL,ACTVTNRL
            CALL EmitCall
%ENDIF
            RET  C
            LD   A,$F1                    ; POP AF
            CALL EmitByte
            RET  C
STG8CLL7: ;@NUC-GLOBAL Stage8CallableFailable PERMANENT STG8CLL7
            CALL EMTJRNCP
            RET  C
            LD   (EMTEXTFX),DE
            CALL STG8EMT4
            RET  C
.L00000:
            LD   DE,(EMTEXTFX)
            CALL PTCHHR
            RET  C
STG8CLL8: ;@NUC-GLOBAL Stage8CallableSuccess PERMANENT STG8CLL8
            LD   A,(STG7ARG0)
            LD   C,A
            CALL STG8DSCR
            RET  C
            LD   A,(STG7CLLR)
            OR   A
            RET  Z
            LD   A,(STG7CLLL)
            AND  STG8CLL4
            RET  Z
            LD   A,(STG7CLLL)
            AND  STG8CLLB
            JR   NZ,.L00000
            LD   A,$E5                    ; PUSH HL result carrier
            JP   EmitByte
.L00000:
            LD   HL,STG8ERRR
            JP   EmitFour

;@ROUTINE IN C OUT A,C,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,D,DE,HL
STG8DSCR: ;@NUC-GLOBAL Stage8DiscardCarriers PERMANENT STG8DSCR
            LD   A,C
            OR   A
            RET  Z
.L00000:
            LD   A,$D1                    ; POP DE carrier
            CALL EmitByte
            RET  C
            DEC  C
            JR   STG8DSCR

STG7RTRN EQU TYPDRTRN ;@NUC-GLOBAL Stage7ReturnAggregate PERMANENT STG7RTRN

; Failable completion uses carry plus A privately: carry clear denotes success;
; carry set carries one u8 error code in A. Source code cannot inspect this ABI.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG8FLRT: ;@NUC-GLOBAL Stage8FailRoutine PERMANENT STG8FLRT
            CALL STG7RDCL
            CALL STG8EMT3
            RET  C
            LD   HL,STG8PPER
            CALL   EmitPair
            RET  C
            JR   STG8FLRR

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG8FLMN: ;@NUC-GLOBAL Stage8FailMain PERMANENT STG8FLMN
            CALL STG7RDCL
            LD   HL,STG8PPER
            CALL   EmitPair
            RET  C
            LD   HL,(STG7CLLO)
            CALL EMTLDHL
            RET  C
            CALL EMTUNHND
            RET  C
            JP   TYPDEMT6

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG8RTRN: ;@NUC-GLOBAL Stage8ReturnSuccess PERMANENT STG8RTRN
            CALL TYPDEMT3           ; result carrier
            RET  C
            JR   STG8SCCS

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG8ENDF: ;@NUC-GLOBAL Stage8EndFailableRoutine PERMANENT STG8ENDF
            CALL NXTSMNTC
            OR   A
            RET  NZ
STG8SCCS: ;@NUC-GLOBAL Stage8SuccessTail PERMANENT STG8SCCS
            CALL EXPRSS10
            RET  C
            LD   HL,STG8SCC0
            JP   EmitPair

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG8SKPH: ;@NUC-GLOBAL Stage8SkipHandler PERMANENT STG8SKPH
            CALL NXTSMNTC
            LD   C,A
            LD   A,$C3
            JP   STRCTR1H

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG8BGNH: ;@NUC-GLOBAL Stage8BeginHandler PERMANENT STG8BGNH
            CALL NXTSMNTC
            LD   C,A
            CALL STRCTR1J
            RET  C
            CALL NXTSMNTC
            LD   (STG8EMTC),A
            LD   HL,STG8ERRR
            CALL EmitFour
            RET  C
            LD   A,(STG8EMTC)
            AND  SYMBLCL3
            CP   SYMBLCL0
            JP   Z,TYPDSTRP
            JP   TYPDSTRL

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG8ENDH: ;@NUC-GLOBAL Stage8EndHandler PERMANENT STG8ENDH
            CALL NXTSMNTC
            LD   C,A
            JP   STRCTR1J

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG8EMT4: ;@NUC-GLOBAL Stage8EmitFailureOutcome PERMANENT STG8EMT4
            LD   A,(STG8EMT1)
            OR   A
            JP   Z,TYPDINTR
            CP   STG8CLL3
            JR   Z,STG8FLRH
            CALL STG8EMT3
            RET  C
STG8FLRR: ;@NUC-GLOBAL Stage8FailureReturnTail PERMANENT STG8FLRR
            CALL EXPRSS10
            RET  C
            LD   HL,STG8FLR0
            JP   EmitPair
STG8FLRH: ;@NUC-GLOBAL Stage8FailureHandle PERMANENT STG8FLRH
            LD   A,$4F                    ; LD C,A error code
            CALL EmitByte
            RET  C
            LD   A,(STG7ARG0)
            LD   HL,STG8EMT2
            ADD  A,(HL)
            LD   C,A
            CALL STG8DSCR
            RET  C
            LD   A,$79                    ; LD A,C
            CALL EmitByte
            RET  C
            LD   A,(STG8EMTH)
            LD   C,A
            LD   A,$C3
            JP   STRCTR1H

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG8INVK: ;@NUC-GLOBAL Stage8InvokeService PERMANENT STG8INVK
            LD   A,(STG7CLLL)
            AND  STG8SRV6
            JR   Z,.L00001
            CP   STG8SRV7
            JR   Z,.L00000
            LD   HL,STG8PPER   ; POP HL / LD A,L
            CALL EmitPair
            RET  C
            JR   .L00001
.L00000:
            CALL TYPDEMT3           ; offset
            RET  C
.L00001:
            LD   A,(STG7CLLL)
            AND  STG8CLL6
%IF TargetStreamingOutput
            CALL EMTTRGTV
%ELSE
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,.L00002
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            CALL EmitCall
%ENDIF
            RET  C
            XOR  A
            LD   (STG7ARG0),A
            JP   STG8CLL7

%IF TargetStreamingOutput
%ELSE
.L00002:
            DW RDINPTBY
            DW WRTOTPTB
            DW RDSTRGBY
            DW RWNDSTRG
            DW WRTSTRGB
            DW SKSTRGOT
%ENDIF

; Startup is a terminal wrapper around main's ordinary callable body. The
; source body therefore has the same frame, return, recursion, and failure ABI
; as every other result-free routine; only this wrapper converts final failure
; into unhandled-error and final success into host completion.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG8BGNC: ;@NUC-GLOBAL Stage8BeginCallableMain PERMANENT STG8BGNC
            CALL NXTSMNTC
            LD   (STG8EMTC),A
%IF TargetStreamingOutput
            CALL NXTSMNTC
            CALL TRGTSLCT
            RET  C
%ENDIF
            CALL TYPDBGNP
            RET  C
            LD   C,STG7MNLB
            LD   A,$CD
            CALL STRCTR1H
            RET  C
            LD   A,(STG8EMTC)
            AND  STG7RTN5
            JR   Z,.L00000
            CALL EMTJRNCP
            RET  C
            LD   (EMTEXTFX),DE
%IF TargetStreamingOutput
            LD   A,$F5                    ; PUSH AF
            CALL EmitByte
            RET  C
            LD   DE,ACZTOFF
            CALL TRGTSTTA
            LD   A,$2A                    ; LD HL,(nn)
            CALL EMTOPCDW
            RET  C
            LD   A,$F1                    ; POP AF
            CALL EmitByte
%ELSE
            LD   HL,STG8RLDF
            CALL EmitFive
%ENDIF
            RET  C
            CALL EMTUNHND
            RET  C
            CALL TYPDEMT6
            RET  C
            LD   DE,(EMTEXTFX)
            CALL PTCHHR
            RET  C
.L00000:
            CALL TYPDRST1
            RET  C
            CALL EMTSCCSS
            RET  C
            LD   C,STG7MNLB
            JP   STG7DFNR

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7ENDR: ;@NUC-GLOBAL Stage7EndRoutine PERMANENT STG7ENDR
            CALL NXTSMNTC
            OR   A
            RET  NZ
            CALL EXPRSS10
            RET  C
            LD   A,$C9
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG7LDPR: ;@NUC-GLOBAL Stage7LoadProgramAlias PERMANENT STG7LDPR
            CALL EXPRSSNH
            JR   STG7LDAL

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG7LDRD: ;@NUC-GLOBAL Stage7LoadReadOnlyAlias PERMANENT STG7LDRD
            CALL RDSMNTCW
%IF TargetStreamingOutput
            LD   HL,(TRGTCRR2)
            ADD  HL,DE
%ELSE
            LD   HL,(STTCIMGL)
            ADD  HL,DE
            LD   DE,GNRTDRO0
            ADD  HL,DE
%ENDIF
STG7LDAL: ;@NUC-GLOBAL Stage7LoadAliasReady PERMANENT STG7LDAL
            LD   A,$21                    ; LD HL,nn
            JP   TYPDEMT2

STG7LDP0 EQU TYPDLDL1 ;@NUC-GLOBAL Stage7LoadParameterAlias PERMANENT STG7LDP0

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7SLCT: ;@NUC-GLOBAL Stage7SelectField PERMANENT STG7SLCT
            CALL RDSMNTCW
            LD   (STG7PTHO),DE
            LD   HL,STG7PPHL
            CALL   EmitPair
            RET  C
            LD   HL,(STG7PTHO)
            CALL EmitWord
            RET  C
            LD   HL,STG7ADDD
            JP   EmitPair

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7SLC0: ;@NUC-GLOBAL Stage7SelectIndex PERMANENT STG7SLC0
            CALL RDSMNTCW
            LD   (STG7PTHO),DE     ; length
            CALL STG7RDEX ; stride and source position
            LD   HL,STG7PPIN
            CALL   EmitPair
            RET  C
            LD   HL,(STG7PTHO)
            CALL EMTLDBCI
            RET  C
%IF TargetStreamingOutput
            LD   DE,ACZARRY
            CALL EMTRNTMC
%ELSE
            LD   HL,CHCKARRY
            CALL EmitCall
%ENDIF
            RET  C
            CALL STG7BNDS
            RET  C
            LD   A,$E5                    ; retain base
            CALL EmitByte
            RET  C
            LD   HL,(STG7PTHE)
            LD   A,$21                    ; LD HL,nn stride
            CALL EMTOPCDW
            RET  C
%IF TargetStreamingOutput
            LD   DE,ACZMULW
            CALL EMTRNTMC
%ELSE
            LD   HL,MLTPLYU1
            CALL EmitCall
%ENDIF
            RET  C
            LD   HL,STG7PPDD
            JP   EMTTHR

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7LDIN: ;@NUC-GLOBAL Stage7LoadIndirect8 PERMANENT STG7LDIN
            LD   HL,STG7LDI1
            LD   B,6
            JP   EMTBYTS
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7LDI0: ;@NUC-GLOBAL Stage7LoadIndirect16 PERMANENT STG7LDI0
            LD   HL,STG7LDI2
            JP   EmitFive
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7STRI: ;@NUC-GLOBAL Stage7StoreIndirect8 PERMANENT STG7STRI
            LD   HL,STG7STR5
            JP   EMTTHR
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7STR0: ;@NUC-GLOBAL Stage7StoreIndirect16 PERMANENT STG7STR0
            LD   HL,STG7STR2
            JP   EmitFive

; Both full-region calls complete before LDIR is emitted. A failed first or
; second check reaches bounds with the destination still untouched.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STG7CPYA: ;@NUC-GLOBAL Stage7CopyAggregate PERMANENT STG7CPYA
            CALL STG7RDEX
            LD   HL,STG7CPYP
            CALL   EmitFour
            RET  C
            CALL STG7EMTR
            RET  C
            CALL STG7PRS4
            RET  C
            LD   HL,STG7CPYF
            CALL   EmitPair
            RET  C
            LD   HL,(STG7PTHE)
            CALL EMTLDBCI
            RET  C
            LD   HL,STG7LDR
            JP   EmitPair

;@ROUTINE OUT A,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
STG7RDEX: ;@NUC-GLOBAL Stage7ReadExtentAndOffset PERMANENT STG7RDEX
            CALL RDSMNTCW
            LD   (STG7PTHE),DE
            JP   STG7RDCL

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7PRS4: ;@NUC-GLOBAL Stage7PreserveCarrierRegion PERMANENT STG7PRS4
            CALL TYPDEMT3           ; source
            RET  C
            LD   A,$E5                    ; retain source
            CALL EmitByte
            RET  C

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7EMTR: ;@NUC-GLOBAL Stage7EmitRegionCheck PERMANENT STG7EMTR
%IF TargetStreamingOutput
            LD   DE,(TRGTCRR2)
            CALL EMTLDDEI
            RET  C
            LD   HL,(TRGTCRR1)
            PUSH HL
            LD   A,$FD
            CALL EmitByte
            POP  HL
            RET  C
            LD   A,$21
            CALL EMTOPCDW
            RET  C
            LD   HL,(STG7PTHE)
            CALL EMTLDBCI
            RET  C
            LD   DE,ACZAGGR
            CALL EMTRNTMC
%ELSE
            LD   DE,PRGRMDTR
            CALL EMTLDDEI
            RET  C
            LD   HL,(STG7PTHE)
            CALL EMTLDBCI
            RET  C
            LD   HL,CHCKAGGR
            CALL EmitCall
%ENDIF
            RET  C
            JP   STG7BNDS

;@ROUTINE OUT A,DE,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
STG7RDST: ;@NUC-GLOBAL Stage7ReadStringExtent PERMANENT STG7RDST
            CALL NXTSMNTC
            LD   (STG7ARG0),A
            LD   L,A
            LD   H,0
            INC  HL
            INC  HL
            LD   (STG7PTHE),HL
            JP   STG7RDCL

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7STRN: ;@NUC-GLOBAL Stage7StringLength PERMANENT STG7STRN
            CALL STG7RDST
            CALL STG7PRS4
            RET  C
            CALL TYPDEMT3           ; carrier
            RET  C
%IF TargetStreamingOutput
            LD   DE,ACZSLEN
%ELSE
            LD   HL,CHCKSTRN
%ENDIF
            JR   STG7EMTS

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STG7STR1: ;@NUC-GLOBAL Stage7StringIndex PERMANENT STG7STR1
            CALL STG7RDST
            LD   HL,STG7PPIN
            CALL   EmitPair
            RET  C
            LD   HL,STG7PSHD
            CALL   EmitPair
            RET  C
            CALL STG7EMTR
            RET  C
            LD   HL,STG7CPYF
            CALL   EmitPair
            RET  C
%IF TargetStreamingOutput
            LD   DE,ACZSIDX
%ELSE
            LD   HL,CHCKSTR0
%ENDIF

%IF TargetStreamingOutput
;@ROUTINE IN DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
%ELSE
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
%ENDIF
STG7EMTS: ;@NUC-GLOBAL Stage7EmitStringCheck PERMANENT STG7EMTS
%IF TargetStreamingOutput
            PUSH DE
%ELSE
            PUSH HL
%ENDIF
            LD   A,(STG7ARG0)
            LD   C,A
            LD   A,$0E                    ; LD C,n capacity
            CALL EMTOPCDB
%IF TargetStreamingOutput
            POP  DE
%ELSE
            POP  HL
%ENDIF
            RET  C
%IF TargetStreamingOutput
            CALL EMTRNTMC
%ELSE
            CALL EmitCall
%ENDIF
            RET  C
            CALL STG7BNDS
            RET  C
            LD   A,$E5
            JP   EmitByte

STG7PPHL:        DB $E1,$11 ;@NUC-GLOBAL Stage7PopHLLoadDE PERMANENT STG7PPHL
.L00000:     DB $06
STG7OFFS:      DB $5F,$16,$00,$19,$E5 ;@NUC-GLOBAL Stage7OffsetAddress PERMANENT STG7OFFS
STG7LDI2:DB $E1,$5E,$23,$56,$D5 ;@NUC-GLOBAL Stage7LoadIndirect16Bytes PERMANENT STG7LDI2
STG7STR2:DB $D1,$E1,$73,$23,$72 ;@NUC-GLOBAL Stage7StoreIndirect16Bytes PERMANENT STG7STR2
STG7CPYF:         DB $E1,$D1 ;@NUC-GLOBAL Stage7CopyFinish PERMANENT STG7CPYF
STG7PPDD:       DB $D1,$19,$E5 ;@NUC-GLOBAL Stage7PopDEAddPush PERMANENT STG7PPDD
STG7PSHD:           DB $D5,$E5 ;@NUC-GLOBAL Stage7PushDEHL PERMANENT STG7PSHD
STG7LDR                EQU SGMNTDCP ;@NUC-GLOBAL Stage7LDIR PERMANENT STG7LDR

STG7ADDD           EQU STG7OFFS+3 ;@NUC-GLOBAL Stage7AddDEPush PERMANENT STG7ADDD
STG7STR5 EQU STG7STR2 ;@NUC-GLOBAL Stage7StoreIndirect8Bytes PERMANENT STG7STR5
STG8FLR0: DB $37,$C9       ;@NUC-GLOBAL Stage8FailureReturnBytes PERMANENT STG8FLR0; SCF / RET
STG8SCC0: DB $B7,$C9       ;@NUC-GLOBAL Stage8SuccessReturnBytes PERMANENT STG8SCC0; OR A / RET
%IF TargetStreamingOutput
%ELSE
STG8RLDF: ;@NUC-GLOBAL Stage8ReloadFailureOffsetBytes PERMANENT STG8RLDF
            DB $F5,$2A                   ; PUSH AF / LD HL,(nn)
            DW TRPOFFST
            DB $F1                       ; POP AF
%ENDIF
