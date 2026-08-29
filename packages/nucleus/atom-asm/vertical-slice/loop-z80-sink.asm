%IF AggregateCallSlices
%IF TargetStreamingOutput
%ELSE
LZBKRO EQU BCKPBS+(GNRTDRO0-GNRTDBS)
LZSCEL EQU SGMNTCDE+SGMNTEN1
LZSREB EQU SGMNTRO0+SGMNTEN0
LZSDEL EQU SGMNTDTE+SGMNTEN1
LZSBEB EQU SGMNTBS0+SGMNTEN0
LZIXB1 EQU 1
LZIXL1 EQU 3
LZIXEB EQU 0
LZIXEL EQU 2
%ENDIF
%ENDIF

%IF TargetStreamingOutput
LZTNUM EQU TRPNMBR-STTBS
LZTROU EQU TRPRTN-STTBS
LZTOFF EQU TRPOFFST-STTBS
LZRUNS EQU RunState-STTBS
LZTERR EQU TRPERRR-STTBS
%ENDIF

; Streaming direct-Z80 encoder for the counted-loop semantic stream.

%IF AggregateCallSlices
%IF TargetStreamingOutput
%ELSE
%ENDIF
%ENDIF

%IF TargetStreamingOutput
%ENDIF

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
EmitByte:
%IF TargetStreamingOutput
            LD   B,A
            LD   HL,(EMTLMT)
            LD   A,H
            OR   L
            JP   Z,TRGTCPCT
            DEC  HL
            LD   (EMTLMT),HL
            LD   HL,(EMTCRSR)
            PUSH BC
            LD   A,(TRGTOTPT)
            LD   C,A
            LD   A,B
            PUSH HL
            CALL TRGTSNKI
            POP  HL
            POP  BC
            JP   C,TRGTOTP1
            INC  HL
            LD   (EMTCRSR),HL
            OR   A
            RET
%ELSE
            LD   B,A
            LD   HL,(EMTCRSR)
            LD   DE,(EMTLMT)
            OR   A
            SBC  HL,DE
            ADD  HL,DE
            JP   Z,SMNTCSN4
.L00000:
            LD   A,B
            LD   (HL),A
            INC  HL
            LD   (EMTCRSR),HL
            OR   A
            RET
%ENDIF
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EmitWord:
            LD   C,H
            LD   A,L
            CALL EmitByte
            RET  C
            LD   A,C
            JR   EmitByte

; Copy B retained opcode bytes. Shared fixed sequences are cheaper as data
; once two or more encoder paths need four or more emitted bytes.
;@ROUTINE IN B,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTBYTS: ;@NUC-GLOBAL EmitBytes PERMANENT EMTBYTS
%IF TargetStreamingOutput
            PUSH BC
            LD   C,B
            LD   B,0
            CALL EMTBLCK
            POP  BC
            RET
%ELSE
            LD   A,(HL)
            INC  HL
            PUSH BC
            PUSH HL
            CALL EmitByte
            POP  HL
            POP  BC
            RET  C
            DJNZ EMTBYTS
            OR   A
            RET
%ENDIF

%IF TargetStreamingOutput
; Copy the complete BC-byte region through the checked output sink.
;@ROUTINE IN BC,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTBLCK: ;@NUC-GLOBAL EmitBlock PERMANENT EMTBLCK
            LD   A,B
            OR   C
            RET  Z
            LD   A,(HL)
            INC  HL
            PUSH BC
            PUSH HL
            CALL EmitByte
            POP  HL
            POP  BC
            RET  C
            DEC  BC
            JR   EMTBLCK
%ENDIF

;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTEGHT: ;@NUC-GLOBAL EmitEight PERMANENT EMTEGHT
            LD   B,8
            JR   EmitGo
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EmitFive:
            LD   B,5
            JR   EmitGo
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EmitFour:
            LD   B,4
            JR   EmitGo
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTTHR: ;@NUC-GLOBAL EmitThree PERMANENT EMTTHR
            LD   B,3
            JR   EmitGo
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EmitPair:
            LD   B,2
;@ROUTINE IN B,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EmitGo:
            JR   EMTBYTS

; Patch one Z80 relative displacement. DE is the operand and HL the target.
;@ROUTINE IN DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
PTCHRLTV: ;@NUC-GLOBAL PatchRelative PERMANENT PTCHRLTV
            LD   (EMTPTCHA),DE
            INC  DE
            OR   A
            SBC  HL,DE
            LD   C,L
            LD   A,C
            ADD  A,A
            SBC  A,A
            CP   H
            JR   NZ,.L00001
.L00000:
%IF TargetStreamingOutput
            LD   B,C
            LD   HL,(EMTPTCHA)
            LD   A,(TRGTOTPT)
            LD   C,A
            LD   A,B
            CALL TRGTSNKP
            JP   C,TRGTOTP1
            OR   A
            RET
%ELSE
            LD   DE,(EMTPTCHA)
            LD   A,C
            LD   (DE),A
            OR   A
            RET
%ENDIF
.L00001:
            LD   A,DGNSTCFX
            JP   CMPLRSTD

%IF TargetStreamingOutput
%ELSE
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
BGNPRGRM: ;@NUC-GLOBAL BeginProgram PERMANENT BGNPRGRM
            LD   (EMTLMT),HL
            LD   BC,(GNRTDSZ)
            LD   (PBLSHDSZ),BC
            LD   A,B
            OR   C
            JR   Z,.L00000
            LD   HL,GNRTDBS
            LD   DE,BCKPBS
            LDIR
.L00000:
            LD   HL,GNRTDBS
            LD   (EMTCRSR),HL
            OR   A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
ABRTPRGR: ;@NUC-GLOBAL AbortProgram PERMANENT ABRTPRGR
            LD   BC,(PBLSHDSZ)
            LD   A,B
            OR   C
            JR   Z,.L00000
            LD   HL,BCKPBS
            LD   DE,GNRTDBS
            LDIR
.L00000:
            LD   HL,(PBLSHDSZ)
            LD   (GNRTDSZ),HL
            SCF
            RET
%ENDIF

%IF AggregateCallSlices
%IF TargetStreamingOutput
%ELSE
; Initialize the fixed adapter table, retain all previously published segment
; sizes, and back up both image-bearing segments before tentative emission.
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
BGNSGMNT: ;@NUC-GLOBAL BeginSegmentedProgram PERMANENT BGNSGMNT
            PUSH HL
            LD   HL,GNRTDSZ
            LD   DE,PBLSHDSZ
            LD   BC,8
            LDIR
            LD   BC,(GNRTDSZ)
            LD   HL,GNRTDCDB
            LD   DE,BCKPBS
            CALL SGMNTCPY
            LD   BC,(GNRTDROD)
            LD   HL,GNRTDRO0
            LD   DE,LZBKRO
            CALL SGMNTCPY
            LD   HL,.L00000
            LD   DE,SGMNTTBL
            LD   BC,SGMNTENT*SGMNTCPC
            LDIR
            POP  HL
            LD   (LZSCEL),HL

            CALL VLDTSGMN
            RET  C
            XOR  A
            RET

.L00000:
            DW GNRTDCDB,GNRTDCDL
            DW GNRTDRO0,GNRTDRO1
            DW PRGRMDTB,PRGRMDTL
            DW PRGRMBS0,PRGRMBS1

;@ROUTINE IN BC,DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
SGMNTCPY: ;@NUC-GLOBAL SegmentCopyIfAny PERMANENT SGMNTCPY
            LD   A,B
            OR   C
            RET  Z
            LDIR
            OR   A
            RET

; Only the two image-bearing segments are selectable by the byte emitter. A is
; an internal SegmentCode/SegmentRoData ordinal supplied at the two call sites.
; Their current cursors remain cached in EmitCursor/EmitLimit and are written
; back to the bounded table at each segment switch and at publication.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
SLCTOTPT: ;@NUC-GLOBAL SelectOutputSegment PERMANENT SLCTOTPT
            OR   A
            JR   NZ,.L00000
            LD   DE,(EMTCRSR)
            LD   (SGMNTRO1),DE
            LD   HL,SGMNTCDE
            JR   .L00001
.L00000:
            LD   HL,SGMNTRO0
.L00001:
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            LD   (EMTCRSR),DE
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            LD   (EMTLMT),DE
            OR   A
            RET

; The adapter owns two ordered ROM-image segments and two ordered RAM
; segments. Reject malformed or overlapping target maps before one byte can
; be published.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
VLDTSGMN: ;@NUC-GLOBAL ValidateSegmentTable PERMANENT VLDTSGMN
            LD   IX,SGMNTTBL
            LD   B,SGMNTCPC
.L00000:
            LD   L,(IX+LZIXEB)
            LD   H,(IX+LZIXB1)
            LD   E,(IX+LZIXEL)
            LD   D,(IX+LZIXL1)
            OR   A
            SBC  HL,DE
            JR   NC,.L00003
            LD   DE,SGMNTENT
            ADD  IX,DE
            DJNZ .L00000
            LD   HL,(LZSCEL)
            LD   DE,(LZSREB)
            CALL .L00001
            RET  C
            LD   HL,(LZSDEL)
            LD   DE,(LZSBEB)
;@ROUTINE IN DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
.L00001:
            OR   A
            SBC  HL,DE
            JR   C,.L00002
            RET  Z
            JR   .L00003
.L00002:
            OR   A
            RET
.L00003:
            LD   A,DGNSTCOT
            JP   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
ABRTSGMN: ;@NUC-GLOBAL AbortSegmentedProgram PERMANENT ABRTSGMN
            LD   BC,(PBLSHDSZ)
            LD   HL,BCKPBS
            LD   DE,GNRTDCDB
            CALL SGMNTCPY
            LD   BC,(PBLSHDRO)
            LD   HL,LZBKRO
            LD   DE,GNRTDRO0
            CALL SGMNTCPY
            LD   HL,PBLSHDSZ
            LD   DE,GNRTDSZ
            LD   BC,8
            LDIR
            SCF
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
FNSHSGMN: ;@NUC-GLOBAL FinishSegmentedProgram PERMANENT FNSHSGMN
            LD   HL,(EMTCRSR)
            LD   DE,GNRTDCDB
            OR   A
            SBC  HL,DE
            LD   (GNRTDSZ),HL
            LD   HL,(SGMNTRO1)
            LD   DE,GNRTDRO0
            OR   A
            SBC  HL,DE
            LD   (GNRTDROD),HL
            LD   HL,(STTCIMGL)
            LD   (GNRTDDTS),HL
            LD   HL,(PRGRMBSS)
            LD   (GNRTDBSS),HL
            OR   A
            RET
%ENDIF
%ENDIF

%IF LegacyEncoders
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDLPPR: ;@NUC-GLOBAL EncodeLoopProgram PERMANENT ENCDLPPR
            CALL ENCDLPP0
            JR   ENCDPRGR
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDCLLP: ;@NUC-GLOBAL EncodeCallProgram PERMANENT ENCDCLLP
            CALL ENCDCLL0
            JR   ENCDPRGR
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
.L00000:
            CALL ENCDEXPR
            JR   ENCDPRGR
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDARRY: ;@NUC-GLOBAL EncodeArrayProgram PERMANENT ENCDARRY
            LD   HL,GNRTDLMT
            JR   ENCDARR0
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDARR0: ;@NUC-GLOBAL EncodeArrayProgramWithinLimit PERMANENT ENCDARR0
            CALL ENCDARR1
ENCDPRGR: ;@NUC-GLOBAL EncodeProgramResult PERMANENT ENCDPRGR
            RET  NC
            JP   ABRTPRGR

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDLPP0: ;@NUC-GLOBAL EncodeLoopProgramBody PERMANENT ENCDLPP0
            LD   HL,GNRTDLMT
            CALL BGNPRGRM

            LD   A,(SMNTCBFF+2)
            CALL EMTLDDMM
            RET  C
            LD   A,(SMNTCBFF+4)
            CALL EMTLDDMM
            RET  C

            LD   HL,(EMTCRSR)
            LD   (EMTLPHD),HL
            LD   A,$7A
            CALL EmitByte
            RET  C
            LD   A,(SMNTCBFF+5)
            CALL EMTCMPRI
            RET  C
            CALL EMTJRNCP
            RET  C
            LD   (EMTEXTFX),DE

            LD   A,(SMNTCBFF+7)
            CALL EMTLDAMM
            RET  C
            LD   HL,WRTOTPTB
            CALL EmitCall
            RET  C
            LD   A,$38
            CALL EMTRLTVP
            RET  C
            LD   (EMTFLRFX),DE
            LD   A,$7A
            CALL EmitByte
            RET  C
            LD   A,(SMNTCBFF+5)
            DEC  A
            CALL EMTCMPRI
            RET  C
            CALL EMTJRNCP
            RET  C
            LD   (EMTUPDTE),DE
            LD   A,$14
            CALL EmitByte
            RET  C
            CALL EMTJRPLC
            RET  C
            LD   HL,(EMTLPHD)
            CALL PTCHRLTV
            RET  C

            LD   DE,(EMTEXTFX)
            CALL PTCHHR
            RET  C
            LD   DE,(EMTUPDTE)
            CALL PTCHHR
            RET  C
            CALL EMTSCCSS
            RET  C

            LD   DE,(EMTFLRFX)
            CALL PTCHHR
            RET  C
            LD   HL,LPFLROFF
            CALL EMTLDHL
            RET  C
            CALL EMTUNHND
            RET  C
            CALL EMTTRPEN
            RET  C

            JP   FNSHPRGR
%ENDIF

; Small instruction emitters shared by the direct back end. Multiple entry
; points share the opcode-plus-operand tails rather than repeating them in
; every semantic operation.
;@ROUTINE IN A,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTOPCDW: ;@NUC-GLOBAL EmitOpcodeWord PERMANENT EMTOPCDW
            PUSH HL
            CALL EmitByte
            POP  HL
            RET  C
%IF TargetStreamingOutput
            JR   EmitWord
%ELSE
            JP   EmitWord
%ENDIF

;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EmitCall:
            LD   A,$CD
            JR   EMTOPCDW

;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTLDHL: ;@NUC-GLOBAL EmitLoadHl PERMANENT EMTLDHL
            LD   A,$21
            JR   EMTOPCDW

;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTLDBCI: ;@NUC-GLOBAL EmitLoadBcImmediate PERMANENT EMTLDBCI
            LD   A,$01
            JR   EMTOPCDW

;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTSTRA: ;@NUC-GLOBAL EmitStoreA PERMANENT EMTSTRA
            LD   A,$32
            JR   EMTOPCDW

%IF TargetStreamingOutput
; Emit LD (state-base+DE),A through the target-linked writable-state address.
;@ROUTINE IN DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTSTRTR: ;@NUC-GLOBAL EmitStoreTargetStateA PERMANENT EMTSTRTR
            CALL TRGTSTTA
            JR   EMTSTRA
%ENDIF

;@ROUTINE IN A,C OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
EMTOPCDB: ;@NUC-GLOBAL EmitOpcodeByte PERMANENT EMTOPCDB
            CALL EmitByte
            RET  C
            LD   A,C
            JP   EmitByte

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTLDAMM: ;@NUC-GLOBAL EmitLoadAImmediate PERMANENT EMTLDAMM
            LD   C,A
            LD   A,$3E
            JR   EMTOPCDB

%IF LegacyEncoders
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTLDDMM: ;@NUC-GLOBAL EmitLoadDImmediate PERMANENT EMTLDDMM
            LD   C,A
            LD   A,$16
            JP   EMTOPCDB

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTCMPRI: ;@NUC-GLOBAL EmitCompareImmediate PERMANENT EMTCMPRI
            LD   C,A
            LD   A,$FE
            JP   EMTOPCDB
%ENDIF

%IF LegacyEncoders
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTLDSCL: ;@NUC-GLOBAL EmitLoadScalar PERMANENT EMTLDSCL
            LD   HL,SCLRSLT
            LD   A,$3A
            JP   EMTOPCDW

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTRSTRA: ;@NUC-GLOBAL EmitRestoreAfterCall PERMANENT EMTRSTRA
            LD   A,$F5
            CALL EmitByte
            RET  C
            LD   HL,ACTVTNPP
            CALL EmitCall
            RET  C
            LD   A,$F1
            JP   EmitByte
%ENDIF

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTSCCSS: ;@NUC-GLOBAL EmitSuccessReturn PERMANENT EMTSCCSS
            LD   A,RNSCCDD
            JR   EMTRNEND

; At runtime A carries the trap number and HL carries the source offset.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTTRPEN: ;@NUC-GLOBAL EmitTrapEnding PERMANENT EMTTRPEN
%IF TargetStreamingOutput
            LD   DE,LZTNUM
            CALL EMTSTRTR
%ELSE
            LD   HL,TRPNMBR
            CALL EMTSTRA
%ENDIF
            RET  C
            LD   A,$AF
            CALL EmitByte
            RET  C
%IF TargetStreamingOutput
            LD   DE,LZTROU
            CALL EMTSTRTR
%ELSE
            LD   HL,TRPRTN
            CALL EMTSTRA
%ENDIF
            RET  C
%IF TargetStreamingOutput
            LD   DE,LZTOFF
            CALL TRGTSTTA
%ELSE
            LD   HL,TRPOFFST
%ENDIF
            LD   A,$22
            CALL EMTOPCDW
            RET  C
            LD   A,RNTRPPD
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTRNEND: ;@NUC-GLOBAL EmitRunEnding PERMANENT EMTRNEND
            CALL EMTLDAMM
            RET  C
%IF TargetStreamingOutput
            LD   DE,LZRUNS
            CALL EMTSTRTR
%ELSE
            LD   HL,RunState
            CALL EMTSTRA
%ENDIF
            RET  C
%IF TargetStreamingOutput
            LD   A,(TRGTDSCC)
            LD   D,A
            LD   A,(TRGTOTPT)
            CP   D
            JR   Z,.L00000
            LD   A,D
            CALL EMTLDAMM
            RET  C
            LD   HL,(TRGTTRMN)
            CALL EMTLDHL
            RET  C
            LD   A,10                     ; far-jump vector ordinal
            JP   EMTTRGT0
.L00000:
            LD   HL,(TRGTTRMN)
            LD   A,$C3
            JR   EMTOPCDW
%ELSE
            LD   A,$C9
            JP   EmitByte
%ENDIF

; At runtime A carries an unhandled error and HL the failing source offset.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTUNHND: ;@NUC-GLOBAL EmitUnhandledTrapPrefix PERMANENT EMTUNHND
%IF TargetStreamingOutput
            LD   DE,LZTERR
            CALL EMTSTRTR
%ELSE
            LD   HL,TRPERRR
            CALL EMTSTRA
%ENDIF
            RET  C
            LD   A,6
            JR   EMTLDAMM

;@ROUTINE OUT A,CARRY,ZERO,DE CLOBBERS SIGN,PARITY,HALFCARRY,B,HL
EMTJRPLC: ;@NUC-GLOBAL EmitJrPlaceholder PERMANENT EMTJRPLC
            LD   A,$18
            JR   EMTRLTVP
;@ROUTINE OUT A,CARRY,ZERO,DE CLOBBERS SIGN,PARITY,HALFCARRY,B,HL
EMTJRNCP: ;@NUC-GLOBAL EmitJrNcPlaceholder PERMANENT EMTJRNCP
            LD   A,$30
;@ROUTINE IN A OUT A,CARRY,ZERO,DE CLOBBERS SIGN,PARITY,HALFCARRY,B,HL
EMTRLTVP: ;@NUC-GLOBAL EmitRelativePlaceholder PERMANENT EMTRLTVP
            CALL EmitByte
            RET  C
            LD   HL,(EMTCRSR)
            PUSH HL
            XOR  A
            CALL EmitByte
            POP  DE
            RET

%IF LegacyEncoders
;@ROUTINE OUT A,CARRY,ZERO,DE CLOBBERS SIGN,PARITY,HALFCARRY,B,HL
EMTJRCPL: ;@NUC-GLOBAL EmitJrCPlaceholder PERMANENT EMTJRCPL
            LD   A,$38
            JP   EMTRLTVP
%ENDIF

;@ROUTINE IN DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
PTCHWRD: ;@NUC-GLOBAL PatchWord PERMANENT PTCHWRD
%IF TargetStreamingOutput
            PUSH BC
            LD   A,(TRGTOTPT)
            LD   C,A
            CALL TRGTSNK5
            POP  BC
            JP   C,TRGTOTP1
            OR   A
            RET
%ELSE
            LD   A,L
            LD   (DE),A
            INC  DE
            LD   A,H
            LD   (DE),A
            OR   A
            RET
%ENDIF

; Patch a stored displacement to the current output position.
;@ROUTINE IN DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
PTCHHR: ;@NUC-GLOBAL PatchHere PERMANENT PTCHHR
            LD   HL,(EMTCRSR)
            JP   PTCHRLTV

%IF TargetStreamingOutput
%ELSE
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
FNSHPRGR: ;@NUC-GLOBAL FinishProgram PERMANENT FNSHPRGR
            LD   HL,(EMTCRSR)
            LD   DE,GNRTDBS
            OR   A
            SBC  HL,DE
            LD   (GNRTDSZ),HL
            OR   A
            RET
%ENDIF

; Read one operand from the checked semantic transcript. The operation count
; bounds dispatch; individual handlers know the fixed width of their operands.
CLLBCKND: ;@NUC-GLOBAL CallBackendStart PERMANENT CLLBCKND
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
NXTSMNTC: ;@NUC-GLOBAL NextSemanticByte PERMANENT NXTSMNTC
            LD   HL,(SMNTCRDC)
            LD   A,(HL)
            INC  HL
            LD   (SMNTCRDC),HL
            OR   A
            RET

;@ROUTINE OUT A,DE,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
RDSMNTCW: ;@NUC-GLOBAL ReadSemanticWord PERMANENT RDSMNTCW
            CALL NXTSMNTC
            LD   E,A
            CALL NXTSMNTC
            LD   D,A
            RET

; Dense ordinal dispatcher for the first non-positional backend. A pushed
; continuation turns the Z80's JP (HL) into a compact indirect call. This
; entry is post-parse only: SemanticSinkFinish must have published the complete
; transcript before emitter scratch overlays the retained forward signature.
%IF LegacyEncoders
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
DSPTCHCL: ;@NUC-GLOBAL DispatchCallOperations PERMANENT DSPTCHCL
            LD   HL,SMNTCBFF+1
            LD   (SMNTCRDC),HL
            LD   A,(SMNTCBFF)
            OR   A
            RET  Z
            LD   B,A
.L00000:
            PUSH BC
            CALL NXTSMNTC
            SUB  SMNTCCL0
            CP   CLLOPRTN
            JR   NC,.L00002
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,.L00003
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            LD   DE,.L00001
            PUSH DE
            JP   (HL)
.L00001:
            POP  BC
            RET  C
            DJNZ .L00000
            OR   A
            RET
.L00002:
            POP  BC
            LD   A,DGNSTCSN
            JP   CMPLRSTD

.L00003:
            DW .L00004
            DW .L00005
            DW .L00006
            DW .L00007
            DW .L00008
            DW .L00009
            DW .L0000A
            DW .L0000B
CLLOPRTN EQU 8 ;@NUC-GLOBAL CallOperationCount PERMANENT CLLOPRTN

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
.L00004:
            CALL NXTSMNTC
            CALL NXTSMNTC
            CALL EMTLDAMM
            RET  C
            LD   HL,ACTVTNPS
            CALL EmitCall
            RET  C
            CALL EMTJRCPL
            RET  C
            LD   (EMTEXTFX),DE
            LD   A,$CD
            CALL EmitByte
            RET  C
            LD   HL,(EMTCRSR)
            LD   (EMTRTNCL),HL
            LD   HL,0
            CALL EmitWord
            RET  C
            CALL EMTRSTRA
            RET  C
            LD   DE,(EMTEXTFX)
            CALL PTCHHR
            RET  C
            CALL EMTJRCPL
            RET  C
            LD   (EMTUPDTE),DE
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
.L00005:
            LD   HL,WRTOTPTB
            CALL EmitCall
            RET  C
            CALL EMTJRCPL
            RET  C
            LD   (EMTFLRFX),DE
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
.L00006:
            CALL NXTSMNTC
            LD   HL,(EMTCRSR)
            LD   (EMTRTNAD),HL
            LD   DE,(EMTRTNCL)
            JP   PTCHWRD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
.L00007:
            CALL NXTSMNTC
            CALL EMTLDSCL
            RET  C
            LD   A,$B7
            CALL EmitByte
            RET  C
            LD   A,$20
            CALL EMTRLTVP
            RET  C
            LD   (EMTIFFXP),DE
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
.L00008:
            CALL EMTLDSCL
            RET  C
            LD   A,$C9
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
.L00009:
            LD   DE,(EMTIFFXP)
            JP   PTCHHR

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
.L0000A:
            CALL NXTSMNTC
            CALL NXTSMNTC
            LD   C,A
            PUSH BC
            CALL EMTLDSCL
            POP  BC
            RET  C
            LD   A,$D6
            CALL EMTOPCDB
            RET  C
            LD   HL,ACTVTNPS
            CALL EmitCall
            RET  C
            LD   A,$D8
            CALL EmitByte
            RET  C
            LD   HL,(EMTRTNAD)
            CALL EmitCall
            RET  C
            CALL EMTRSTRA
            RET  C
            LD   A,$C9
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
.L0000B:
            LD   HL,(EMTRTNAD)
            LD   A,H
            OR   L
            RET  NZ
            CALL EMTSCCSS
            RET  C
            LD   DE,(EMTUPDTE)
            CALL PTCHHR
            RET  C
            LD   HL,CLLCPCTY
            CALL EMTLDHL
            RET  C
            CALL EMTTRPEN
            RET  C
            LD   DE,(EMTFLRFX)
            CALL PTCHHR
            RET  C
            LD   HL,CLLFLROF
            CALL EMTLDHL
            RET  C
            CALL EMTUNHND
            RET  C
            JP   EMTTRPEN

; Compile the routine slice from its variable-width semantic stream.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDCLL0: ;@NUC-GLOBAL EncodeCallProgramBody PERMANENT ENCDCLL0
            LD   HL,GNRTDLMT
            CALL BGNPRGRM
            LD   HL,0
            LD   (EMTRTNAD),HL
            CALL DSPTCHCL
            RET  C
            JP   FNSHPRGR
CLLBCKN0: ;@NUC-GLOBAL CallBackendEnd PERMANENT CLLBCKN0
%ENDIF

; Dense postfix-expression backend. Program data follows an initial JP, so its
; address is known before the code entry is patched. Scalar locals use an IX
; frame and therefore remain per activation; the evaluation stack lies below
; that frame and is empty at every statement boundary.
%IF LegacyEncoders
EXPRSSNF: ;@NUC-GLOBAL ExpressionBackendStart PERMANENT EXPRSSNF
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
DSPTCHEX: ;@NUC-GLOBAL DispatchExpressionOperations PERMANENT DSPTCHEX
            LD   HL,SMNTCBFF+1
            LD   (SMNTCRDC),HL
            LD   A,(SMNTCBFF)
            OR   A
            RET  Z
            LD   B,A
.L00000:
            PUSH BC
            CALL NXTSMNTC
            SUB  SMNTCDFN
            CP   EXPRSSNG
            JR   NC,.L00002
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,.L00003
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            LD   DE,.L00001
            PUSH DE
            JP   (HL)
.L00001:
            POP  BC
            RET  C
            DJNZ .L00000
            OR   A
            RET
.L00002:
            POP  BC
            LD   A,DGNSTCSN
            JP   CMPLRSTD

.L00003:
            DW EXPRSSNI
            DW EXPRSSNJ
            DW EXPRSSNK
            DW EXPRSSNM
            DW EXPRSSNQ
            DW EXPRSSNT
            DW EXPRSSNU
            DW EXPRSSNW
            DW EXPRSSNX
            DW EXPRSSNY
            DW EXPRSSNZ
            DW EXPRSS11
EXPRSSNG EQU 12 ;@NUC-GLOBAL ExpressionOperationCount PERMANENT EXPRSSNG
%ENDIF

;@ROUTINE OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,E,IX,IY
EXPRSSNH: ;@NUC-GLOBAL ExpressionProgramAddress PERMANENT EXPRSSNH
%IF AggregateCallSlices
            CALL RDSMNTCW
%IF TargetStreamingOutput
            BIT  7,D
            JR   Z,.L00000
            RES  7,D
            LD   HL,(TRGTBSSB)
            JR   .L00001
.L00000:
            LD   HL,(TRGTCNT4)
.L00001:
            ADD  HL,DE
            OR   A
            RET
%ELSE
            LD   H,D
            LD   L,E
            OR   A
            RET
%ENDIF
%ELSE
            CALL NXTSMNTC
            LD   E,A
            LD   D,0
            LD   HL,GNRTDBS+3
            ADD  HL,DE
            RET
%ENDIF

%IF LegacyEncoders
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
EXPRSSNI: ;@NUC-GLOBAL ExpressionDefineProgram PERMANENT EXPRSSNI
            CALL NXTSMNTC
            CALL NXTSMNTC
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EXPRSSNJ: ;@NUC-GLOBAL ExpressionBeginMain PERMANENT EXPRSSNJ
            LD   DE,(EMTDTFXP)
            LD   HL,(EMTCRSR)
            CALL PTCHWRD
            LD   HL,EXPRSS12
            JP   EMTEGHT

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
EXPRSSNK: ;@NUC-GLOBAL ExpressionDeclareLocal PERMANENT EXPRSSNK
            CALL NXTSMNTC
            LD   A,$3B
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EXPRSSNM: ;@NUC-GLOBAL ExpressionLiteral PERMANENT EXPRSSNM
            CALL NXTSMNTC
            CALL EMTLDAMM
            RET  C
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
EXPRSSNN: ;@NUC-GLOBAL ExpressionPushA PERMANENT EXPRSSNN
            LD   A,$F5
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
EXPRSSNQ: ;@NUC-GLOBAL ExpressionLoadProgram PERMANENT EXPRSSNQ
            CALL NXTSMNTC
            CALL EXPRSSNH
            LD   A,$3A
            CALL EMTOPCDW
            RET  C
            JP   EXPRSSNN

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EXPRSSNT: ;@NUC-GLOBAL ExpressionLoadLocal PERMANENT EXPRSSNT
            CALL NXTSMNTC
            CPL
            LD   C,A
            LD   A,$DD
            CALL EmitByte
            RET  C
            LD   A,$7E
            CALL EMTOPCDB
            RET  C
            JP   EXPRSSNN

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EXPRSSNU: ;@NUC-GLOBAL ExpressionMultiply PERMANENT EXPRSSNU
            LD   A,$C1
            CALL EmitByte
            RET  C
            LD   A,$F1
            CALL EmitByte
            RET  C
            LD   HL,MLTPLYU8
            CALL EmitCall
            RET  C
            LD   A,$F5
            JP   EmitByte

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
EXPRSSNW: ;@NUC-GLOBAL ExpressionAdd PERMANENT EXPRSSNW
            LD   HL,EXPRSS13
            JP   EmitFour

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
EXPRSSNX: ;@NUC-GLOBAL ExpressionStoreProgram PERMANENT EXPRSSNX
            CALL NXTSMNTC
            CALL EXPRSSNH
            PUSH HL
            LD   A,$F1
            CALL EmitByte
            POP  HL
            RET  C
            LD   A,$32
            JP   EMTOPCDW

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EXPRSSNY: ;@NUC-GLOBAL ExpressionStoreLocal PERMANENT EXPRSSNY
            CALL NXTSMNTC
            CPL
            LD   C,A
            LD   A,$F1
            CALL EmitByte
            RET  C
            LD   A,$DD
            CALL EmitByte
            RET  C
            LD   A,$77
            JP   EMTOPCDB

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EXPRSSNZ: ;@NUC-GLOBAL ExpressionWrite PERMANENT EXPRSSNZ
            CALL NXTSMNTC
            LD   C,A
            CALL NXTSMNTC
            LD   H,A
            LD   L,C
            LD   (EMTLPHD),HL
            CALL NXTSMNTC
            CALL RDSMNTCW
            CALL RDSMNTCW
            LD   A,$F1
            CALL EmitByte
            RET  C
            LD   HL,WRTOTPTB
            CALL EmitCall
            RET  C
            CALL EMTJRCPL
            RET  C
            LD   (EMTFLRFX),DE
            RET
%ENDIF

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
EXPRSS10: ;@NUC-GLOBAL ExpressionRestoreFrame PERMANENT EXPRSS10
            LD   HL,EXPRSS14
            JP   EmitFour

%IF LegacyEncoders
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EXPRSS11: ;@NUC-GLOBAL ExpressionEndMain PERMANENT EXPRSS11
            CALL EXPRSS10
            RET  C
            CALL EMTSCCSS
            RET  C
            LD   DE,(EMTFLRFX)
            CALL PTCHHR
            RET  C
            CALL EXPRSS10
            RET  C
            LD   HL,(EMTLPHD)
            CALL EMTLDHL
            RET  C
            CALL EMTUNHND
            RET  C
            JP   EMTTRPEN

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDEXPR: ;@NUC-GLOBAL EncodeExpressionProgramBody PERMANENT ENCDEXPR
            LD   HL,GNRTDLMT
            CALL BGNPRGRM
            LD   A,$C3
            CALL EmitByte
            RET  C
            LD   HL,(EMTCRSR)
            LD   (EMTDTFXP),HL
            LD   HL,0
            CALL EmitWord
            RET  C
            CALL DSPTCHEX
            RET  C
            JP   FNSHPRGR
%ENDIF
EXPRSS12: ;@NUC-GLOBAL ExpressionFrameBytes PERMANENT EXPRSS12
            DB $DD,$E5,$DD,$21,$00,$00,$DD,$39
%IF LegacyEncoders
EXPRSS13: ;@NUC-GLOBAL ExpressionAddBytes PERMANENT EXPRSS13
            DB $C1,$F1,$80,$F5
%ENDIF
EXPRSS14: ;@NUC-GLOBAL ExpressionRestoreBytes PERMANENT EXPRSS14
            DB $DD,$F9,$DD,$E1
%IF LegacyEncoders
EXPRSS15: ;@NUC-GLOBAL ExpressionBackendEnd PERMANENT EXPRSS15

; Default entry and proof-only bounded entry for the checked-array program.
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ENCDARR1: ;@NUC-GLOBAL EncodeArrayProgramBody PERMANENT ENCDARR1
            CALL BGNPRGRM

            LD   HL,RDINPTBY
            CALL EmitCall
            RET  C
            CALL EMTJRNCP
            RET  C
            LD   (EMTEXTFX),DE
            LD   HL,ARRYINPT
            CALL EMTLDHL
            RET  C
            CALL EMTJRPLC
            RET  C
            LD   (EMTFLRFX),DE

            LD   DE,(EMTEXTFX)
            CALL PTCHHR
            RET  C
            LD   A,(SMNTCBFF+2)
            CALL EMTCMPRI
            RET  C
            CALL EMTJRNCP
            RET  C
            LD   (EMTUPDTE),DE
            LD   A,$5F
            CALL EmitByte
            RET  C
            XOR  A
            CALL EMTLDDMM
            RET  C
            LD   A,$21
            CALL EmitByte
            RET  C
            LD   HL,(EMTCRSR)
            LD   (EMTDTFXP),HL
            LD   HL,0
            CALL EmitWord
            RET  C
            LD   A,$19
            CALL EmitByte
            RET  C
            LD   A,$7E
            CALL EmitByte
            RET  C
            LD   HL,WRTOTPTB
            CALL EmitCall
            RET  C
            CALL EMTJRNCP
            RET  C
            LD   (EMTLPHD),DE
            LD   HL,ARRYOTPT
            CALL EMTLDHL
            RET  C
            CALL EMTJRPLC
            RET  C
            LD   (EMTCDSTR),DE

            LD   DE,(EMTLPHD)
            CALL PTCHHR
            RET  C
            CALL EMTSCCSS
            RET  C

            LD   DE,(EMTUPDTE)
            CALL PTCHHR
            RET  C
            LD   HL,ARRYBNDS
            CALL EMTLDHL
            RET  C
            LD   A,$AF
            CALL EmitByte
            RET  C
            LD   HL,TRPERRR
            CALL EMTSTRA
            RET  C
            LD   A,1
            CALL EMTLDAMM
            RET  C
            CALL EMTJRPLC
            RET  C
            LD   (EMTEXTFX),DE

            LD   DE,(EMTFLRFX)
            CALL PTCHHR
            RET  C
            LD   DE,(EMTCDSTR)
            CALL PTCHHR
            RET  C
            CALL EMTUNHND
            RET  C
            LD   DE,(EMTEXTFX)
            CALL PTCHHR
            RET  C
            CALL EMTTRPEN
            RET  C

            LD   HL,(EMTCRSR)
            LD   DE,(EMTDTFXP)
            CALL PTCHWRD
            LD   HL,SMNTCBFF+3
            LD   C,4
.L00000:
            LD   A,(HL)
            PUSH HL
            CALL EmitByte
            POP  HL
            RET  C
            INC  HL
            DEC  C
            JR   NZ,.L00000
            JP   FNSHPRGR
%ENDIF
