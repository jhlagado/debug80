; Post-parse absolute-label and structured-loop lowering. All generated branch
; operands are compiler-private absolute words and are resolved before the
; generated program is published.

EMTCNTR7      EQU EMTCDSTR ;@NUC-GLOBAL EmitControlCounter PERMANENT EMTCNTR7
EMTCNTR8         EQU EMTCDSTR+1 ;@NUC-GLOBAL EmitControlMode PERMANENT EMTCNTR8
EMTCNTR9         EQU EMTLPHD ;@NUC-GLOBAL EmitControlStep PERMANENT EMTCNTR9
EMTCNTRA   EQU EMTEXTFX ;@NUC-GLOBAL EmitControlTrapOffset PERMANENT EMTCNTRA
EMTCNTRB    EQU EMTFLRFX ;@NUC-GLOBAL EmitControlTestLabel PERMANENT EMTCNTRB
EMTCNTRC    EQU EMTFLRFX+1 ;@NUC-GLOBAL EmitControlExitLabel PERMANENT EMTCNTRC

; C is a label ordinal and DE is the address of a generated word operand.
%IF TargetStreamingOutput
; Bit 7 distinguishes a cross-bank address operand. Bits 5..6 retain the site
; bank and bits 0..4 retain the globally unique label ordinal.
%ENDIF
;@ROUTINE IN C,DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1F: ;@NUC-GLOBAL StructuredRecordFixup PERMANENT STRCTR1F
            LD   A,C
%IF TargetStreamingOutput
            AND  $1F
%ENDIF
            CP   EMTCNTR1
            JP   NC,CNTRLLBL
            LD   A,(EMTCNTRL)
            CP   EMTCNTR5
            JR   NC,.L00000
            PUSH BC
            LD   L,A
            LD   H,0
            ADD  A,A
            ADD  A,L
            LD   L,A
            LD   H,0
            LD   BC,EMTCNTR3
            ADD  HL,BC
            POP  BC
%IF TargetStreamingOutput
            LD   A,(TRGTOTPT)
            RLCA
            RLCA
            RLCA
            RLCA
            RLCA
            OR   C
            LD   (HL),A
%ELSE
            LD   (HL),C
%ENDIF
            INC  HL
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   HL,EMTCNTRL
            INC  (HL)
            XOR  A
            RET
.L00000:
            LD   A,DGNSTCC1
            JP   CMPLRSTD

; Emit opcode A with a zero word operand and retain that operand for label C.
%IF TargetStreamingOutput
;@ROUTINE IN A,C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1G: ;@NUC-GLOBAL StructuredEmitFarFixup PERMANENT STRCTR1G
            SET  7,C
%ENDIF
;@ROUTINE IN A,C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1H: ;@NUC-GLOBAL StructuredEmitFixup PERMANENT STRCTR1H
            PUSH BC
            CALL EmitByte
            POP  BC
            RET  C
            LD   DE,(EMTCRSR)
            PUSH BC
            PUSH DE
            LD   HL,0
            CALL EmitWord
            POP  DE
            POP  BC
            RET  C
            JR   STRCTR1F

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1I: ;@NUC-GLOBAL StructuredLabel PERMANENT STRCTR1I
            CALL NXTSMNTC
            LD   C,A
;@ROUTINE IN C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1J: ;@NUC-GLOBAL StructuredDefineLabel PERMANENT STRCTR1J
            LD   A,C
            CP   EMTCNTR1
            JP   NC,CNTRLLBL
            LD   B,0
            LD   HL,EMTCNTR0
            ADD  HL,BC
            LD   A,(HL)
            OR   A
            JP   NZ,TYPDINTR
%IF TargetStreamingOutput
            LD   A,(TRGTOTPT)
            INC  A
            LD   (HL),A
%ELSE
            LD   (HL),1
%ENDIF
            LD   L,C
            LD   H,0
            ADD  HL,HL
            LD   BC,EMTCNTR2
            ADD  HL,BC
            LD   DE,(EMTCRSR)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            XOR  A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1K: ;@NUC-GLOBAL StructuredBranchFalse PERMANENT STRCTR1K
            CALL NXTSMNTC
            LD   C,A
            PUSH BC
            LD   HL,TYPDBGN0
            CALL   EMTTHR
            POP  BC
            RET  C
            LD   A,$CA                    ; JP Z,nn
            JR   STRCTR1H

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1L: ;@NUC-GLOBAL StructuredJump PERMANENT STRCTR1L
            CALL NXTSMNTC
            LD   C,A
            LD   A,$C3                    ; JP nn
            JR   STRCTR1H

; Resolve every retained absolute operand after all label locations are known.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STRCTR1M: ;@NUC-GLOBAL StructuredResolveFixups PERMANENT STRCTR1M
%IF TargetStreamingOutput
            CALL TRGTSVOT
            RET  C
%ENDIF
            LD   A,(EMTCNTRL)
            OR   A
            RET  Z
            LD   B,A
            LD   IX,EMTCNTR3
.L00000:
            LD   C,(IX+0)
%IF TargetStreamingOutput
            LD   A,C
            RLCA
            RLCA
            RLCA
            AND  $03
%ENDIF
            LD   E,(IX+1)
            LD   D,(IX+2)
%IF TargetStreamingOutput
            PUSH BC
            PUSH DE
            LD   E,A
            LD   D,C
            LD   A,C
            AND  $1F
            LD   C,A
            LD   A,E
            LD   (TRGTOTPT),A
%ENDIF
            LD   A,C
%IF TargetStreamingOutput
%ELSE
            CP   EMTCNTR1
            JR   NC,.L00003
            PUSH BC
            PUSH DE
%ENDIF
            LD   B,0
            LD   HL,EMTCNTR0
            ADD  HL,BC
            LD   A,(HL)
            OR   A
            JR   Z,.L00002
%IF TargetStreamingOutput
            DEC  A
            BIT  7,D
            JR   NZ,.L00001
            CP   E
            JR   NZ,.L00002
.L00001:
%ENDIF
            LD   H,0
            LD   L,C
            ADD  HL,HL
            LD   BC,EMTCNTR2
            ADD  HL,BC
            LD   C,(HL)
            INC  HL
            LD   H,(HL)
            LD   L,C
            POP  DE
            CALL PTCHWRD
            POP  BC
            RET  C
            INC  IX
            INC  IX
            INC  IX
            DJNZ .L00000
%IF TargetStreamingOutput
            LD   A,TRGTOTP0
            LD   (TRGTOTPT),A
%ENDIF
            XOR  A
            RET
.L00002:
            POP  DE
            POP  BC
.L00003:
            JP   TYPDINTR

; Emit a local load into HL without pushing a new expression carrier.
; C is the byte offset, A bit 2 selects u16.
;@ROUTINE IN A,C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1N: ;@NUC-GLOBAL StructuredLoadCounter PERMANENT STRCTR1N
            LD   D,A
            LD   A,C
            CPL
            LD   C,A
            PUSH BC
            PUSH DE
            LD   HL,TYPDLDL2
            CALL   EmitPair
            POP  DE
            POP  BC
            RET  C
            LD   A,C
            PUSH DE
            CALL EmitByte
            POP  DE
            RET  C
            BIT  2,D
            JR   NZ,.L00000
            LD   HL,TYPDZRH0
            JP   EmitPair
.L00000:
            DEC  C
            PUSH BC
            LD   HL,TYPDLDL3
            CALL   EmitPair
            POP  BC
            RET  C
            LD   A,C
            JP   EmitByte

; Store HL to counter byte offset C; A bit 2 selects u16.
;@ROUTINE IN A,C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1O: ;@NUC-GLOBAL StructuredStoreCounter PERMANENT STRCTR1O
            LD   D,A
            LD   A,C
            CPL
            LD   C,A
            PUSH BC
            PUSH DE
            LD   HL,TYPDSTR2
            CALL   EmitPair
            POP  DE
            POP  BC
            RET  C
            LD   A,C
            PUSH BC
            PUSH DE
            CALL EmitByte
            POP  DE
            POP  BC
            RET  C
            BIT  2,D
            RET  Z
            DEC  C
            PUSH BC
            LD   HL,TYPDSTR3
            CALL   EmitPair
            POP  BC
            RET  C
            LD   A,C
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
STRCTR1P: ;@NUC-GLOBAL StructuredForSetup PERMANENT STRCTR1P
            CALL NXTSMNTC
            LD   C,A
            CALL NXTSMNTC
            LD   B,A
            PUSH BC
            LD   HL,TYPDPPO0
            CALL   EmitPair
            POP  BC
            RET  C
            LD   A,B
            CALL STRCTR1O
            RET  C
            LD   A,$D5                    ; PUSH DE, retained bound
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STRCTR1Q: ;@NUC-GLOBAL StructuredForTest PERMANENT STRCTR1Q
            CALL NXTSMNTC
            LD   C,A                      ; counter
            CALL NXTSMNTC
            LD   B,A                      ; mode
            CALL NXTSMNTC
            LD   D,A                      ; exit label
            LD   (EMTCNTRC),A
            PUSH BC
            PUSH DE
            LD   HL,STRCTR1V
            CALL   EmitPair
            POP  DE
            POP  BC
            RET  C
            PUSH BC
            PUSH DE
            LD   A,B
            CALL STRCTR1N
            POP  DE
            POP  BC
            RET  C
            BIT  1,B
            JR   NZ,.L00000
            BIT  0,B
            LD   A,CMPRSNLS
            JR   Z,.L00001
            LD   A,CMPRSNL0
            JR   .L00001
.L00000:
            BIT  0,B
            LD   A,CMPRSNGR
            JR   Z,.L00001
            LD   A,CMPRSNG0
.L00001:
            CALL TYPDEMTC
            RET  C
            LD   A,(EMTCNTRC)
            LD   C,A
            LD   HL,TYPDBG1
            CALL   EmitPair
            RET  C
            LD   A,$CA
            JP   STRCTR1H

;@ROUTINE IN DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
EMTLDDEI: ;@NUC-GLOBAL EmitLoadDeImmediate PERMANENT EMTLDDEI
            LD   A,$11                    ; LD DE,nn
            PUSH DE
            CALL EmitByte
            POP  DE
            RET  C
            LD   H,D
            LD   L,E
            JP   EmitWord

; Read and retain the fixed-width ForNext operands in emitter scratch.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
STRCTR1R: ;@NUC-GLOBAL StructuredForNext PERMANENT STRCTR1R
            CALL NXTSMNTC
            LD   (EMTCNTRB),A
            CALL NXTSMNTC
            LD   (EMTCNTRC),A
            CALL NXTSMNTC
            LD   (EMTCNTR7),A
            CALL NXTSMNTC
            LD   (EMTCNTR8),A
            CALL RDSMNTCW
            LD   (EMTCNTR9),DE
            CALL RDSMNTCW
            LD   (EMTCNTRA),DE
            XOR  A
            LD   HL,STRCTR1V
            CALL   EmitPair
            RET  C
            LD   A,(EMTCNTR7)
            LD   C,A
            LD   A,(EMTCNTR8)
            CALL STRCTR1N
            RET  C
            LD   A,$E5                    ; preserve current counter
            CALL EmitByte
            RET  C
            LD   A,(EMTCNTR8)
            BIT  1,A
            JR   NZ,.L00000
            LD   A,$EB                    ; EX DE,HL => bound-current
            CALL EmitByte
            RET  C
.L00000:
            LD   HL,STRCTR1X
            CALL   EMTTHR
            RET  C
            LD   DE,(EMTCNTR9)
            CALL EMTLDDEI
            RET  C
            LD   A,(EMTCNTR8)
            AND  1
            LD   A,CMPRSNLS
            JR   NZ,.L00001
            ; until exits when distance <= step; to exits when distance < step.
            LD   A,(EMTCNTR8)
            BIT  0,A
            LD   A,CMPRSNLS
            JR   NZ,.L00001
            LD   A,CMPRSNL0
.L00001:
            CALL TYPDEMTC
            RET  C
            LD   HL,STRCTR1Y
            CALL   EMTTHR
            RET  C
            LD   A,(EMTCNTRC)
            LD   C,A
            LD   A,$C2                    ; JP NZ,exit cleanup
            CALL STRCTR1H
            RET  C
            LD   DE,(EMTCNTR9)
            CALL EMTLDDEI
            RET  C
            LD   A,(EMTCNTR8)
            BIT  1,A
            JR   NZ,.L00002
            LD   A,$19                    ; ADD HL,DE
            CALL EmitByte
            JR   .L00003
.L00002:
            LD   HL,STRCTR1X
            CALL   EMTTHR
.L00003:
            RET  C
            LD   A,(EMTCNTR8)
            BIT  2,A
            JR   NZ,.L00004
            BIT  1,A
            JR   NZ,.L00004
            LD   HL,TYPDTSTH
            CALL   EmitPair
            RET  C
            LD   A,$CA                    ; JP Z,fit
            CALL EmitByte
            RET  C
            LD   HL,(EMTCRSR)
            LD   (EMTUPDTE),HL
            LD   HL,0
            CALL EmitWord
            RET  C
            LD   HL,(EMTCNTRA)
            LD   A,4
            CALL TYPDEMTA
            RET  C
            LD   DE,(EMTUPDTE)
            LD   HL,(EMTCRSR)
            CALL PTCHWRD
.L00004:
            LD   A,(EMTCNTR7)
            LD   C,A
            LD   A,(EMTCNTR8)
            CALL STRCTR1O
            RET  C
            LD   A,(EMTCNTRB)
            LD   C,A
            LD   A,$C3
            JP   STRCTR1H

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
STRCTR1S: ;@NUC-GLOBAL StructuredForCleanup PERMANENT STRCTR1S
            LD   A,$D1                    ; POP DE, discard retained bound
            JP   EmitByte

STRCTR1V:         DB $D1,$D5 ;@NUC-GLOBAL StructuredBoundPeek PERMANENT STRCTR1V
STRCTR1X:        DB $B7,$ED,$52 ;@NUC-GLOBAL StructuredSubtractDE PERMANENT STRCTR1X
STRCTR1Y: DB $7D,$B7,$E1 ;@NUC-GLOBAL StructuredTestThenPopCurrent PERMANENT STRCTR1Y
