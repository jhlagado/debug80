            %INCLUDE "nucleus-runtime-identity.asmi"

%IF RuntimeProofServices
LRTSTSZ EQU StateEnd-TRPNMBR
LRTSISZ EQU SRVCINPT-SRVCFLRC
LRTSOSZ EQU SRVCSTTE-SRVCSTR4
%ENDIF

; Direct-Z80 runtime and bounded output adapter for the counted-loop slice.


%IF RuntimeProofServices

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,B,C,HL
Reset:
            XOR  A
            LD   HL,TRPNMBR
            LD   B,LRTSTSZ
            CALL .L00000
            LD   A,ACTVTNCP
            LD   (ACTVTNLM),A
            XOR  A
            LD   HL,SRVCFLRC
            LD   B,LRTSISZ
            CALL .L00000
            LD   (SRVCINP0),A
            LD   (SRVCINP1),A
            LD   (SRVCSTR0),A
            LD   (SRVCSTR1),A
            LD   HL,SRVCSTR4
            LD   B,LRTSOSZ
            CALL .L00000
            LD   A,RunReady
            LD   (RunState),A
            OR   A
            RET

;@ROUTINE IN A,B,HL OUT B,HL CLOBBERS ZERO,SIGN,PARITY,HALFCARRY
.L00000:
            LD   (HL),A
            INC  HL
            DJNZ .L00000
            RET
%ENDIF

; Begin one scalar activation atomically. A is the copied u8 argument. The
; packed arena stores exactly the overwritten byte; Z80 CALL/RET carries the
; Z80 return address separately. Carry reports activation-capacity with
; trap number 5 and leaves depth, arena, and the active scalar unchanged.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,HL
ACTVTNPS: ;@NUC-GLOBAL ActivationPush PERMANENT ACTVTNPS
            LD   B,A
            CALL ACTVTNCL
            RET  C
            LD   A,(SCLRSLT)
            PUSH BC
            LD   B,0
            LD   HL,ACTVTNAR
            ADD  HL,BC
            POP  BC
            LD   (HL),A
            LD   A,B
            LD   (SCLRSLT),A
            XOR  A
            RET

; Pop one successful scalar activation. The result is preserved by the
; generated caller while this helper restores its previous scalar byte.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,HL
ACTVTNPP: ;@NUC-GLOBAL ActivationPop PERMANENT ACTVTNPP
            LD   A,(ACTVTNDP)
            DEC  A
            LD   (ACTVTNDP),A
            LD   C,A
            LD   B,0
            LD   HL,ACTVTNAR
            ADD  HL,BC
            LD   A,(HL)
            LD   (SCLRSLT),A
            XOR  A
            RET

; The integrated typed-call path keeps parameters and locals in each Z80
; stack frame. These helpers therefore account only for bounded active depth;
; they preserve HL so a checked argument or returned carrier can cross them.
;@ROUTINE OUT A,C,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
ACTVTNCL: ;@NUC-GLOBAL ActivationClaim PERMANENT ACTVTNCL
            LD   A,(ACTVTNDP)
            LD   C,A
            LD   A,(ACTVTNLM)
            CP   C
            JR   Z,.L00000
            LD   A,C
            CP   ACTVTNCP
            JR   NC,.L00000
            INC  A
            LD   (ACTVTNDP),A
            XOR  A
            RET
.L00000:
            LD   A,5
            SCF
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
ACTVTNRL: ;@NUC-GLOBAL ActivationRelease PERMANENT ACTVTNRL
            LD   A,(ACTVTNDP)
            DEC  A
            LD   (ACTVTNDP),A
            XOR  A
            RET

%IF AggregateCallSlices
; Carry reports an out-of-domain u16 index. BC is the retained word length and
; DE is the canonical index carrier.
;@ROUTINE IN BC,DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
CHCKARRY: ;@NUC-GLOBAL CheckArrayIndex PERMANENT CHCKARRY
            LD   A,E
            SUB  C
            LD   A,D
            SBC  A,B
            JR   NC,AGGRGTBN
.L00000:
            OR   A
            RET

; C is the declared capacity and HL a bounded-string carrier. On success HL is
; the canonical current length. A corrupted length above capacity is rejected.
;@ROUTINE IN C,HL OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,C
CHCKSTRN: ;@NUC-GLOBAL CheckStringLength PERMANENT CHCKSTRN
            INC  C
            LD   A,(HL)
            CP   C
            JR   NC,AGGRGTBN
.L00000:
            LD   L,A
            LD   H,0
            OR   A
            RET

; C is the declared capacity, HL a bounded-string carrier, and DE the canonical
; index. On success HL is the addressed payload byte; no byte is read before
; the length invariant and logical-index checks.
;@ROUTINE IN C,DE,HL OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE
CHCKSTR0: ;@NUC-GLOBAL CheckStringIndex PERMANENT CHCKSTR0
            LD   A,D
            OR   A
            JR   NZ,AGGRGTBN
            LD   A,(HL)
            LD   B,A
            INC  C
            CP   C
            JR   NC,AGGRGTBN
.L00000:
            LD   A,B
            CP   E
            JR   C,AGGRGTBN
            JR   Z,AGGRGTBN
            INC  HL
            ADD  HL,DE
            OR   A
            RET

%IF RuntimeProofServices
%IF TargetStreamingOutput
%ELSE
; Historical proof ABI using the supplied exclusive data end.
;@ROUTINE IN BC,DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL,IY
CHCKAGGR: ;@NUC-GLOBAL CheckAggregateRegion PERMANENT CHCKAGGR
            PUSH DE
            POP  IY
%IF AggregateCallSlices
            PUSH HL
            LD   DE,PRGRMDTB
            CALL CHCKAGG0
            POP  HL
            RET  NC
            LD   DE,GNRTDRO0
            LD   IY,GNRTDRO1
%ELSE
            LD   DE,GNRTDBS+3
%ENDIF
            JP   CHCKAGG0
%ENDIF

;@ROUTINE IN BC,DE,HL,IY OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
CHCKAGG0: ;@NUC-GLOBAL CheckAggregateRegionOne PERMANENT CHCKAGG0
            OR   A
            SBC  HL,DE
            JR   C,CHCKAGG1
            ADD  HL,DE
            ADD  HL,BC
            JR   C,CHCKAGG1
            PUSH IY
            POP  DE
            OR   A
            SBC  HL,DE
            JR   C,CHCKAGG2
            JR   Z,CHCKAGG2
%ELSE
; Target-linked ABI: DE/IY carry the bank-local read-only base/capacity. The
; writable base/capacity is part of the common linked context. Capacities
; preserve a legal nonempty region ending at mathematical $10000.
;@ROUTINE IN BC,DE,HL,IY OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL,IY
CHCKAGGR: ;@NUC-GLOBAL CheckAggregateRegion PERMANENT CHCKAGGR
            PUSH DE
            PUSH IY
            PUSH HL
            LD   DE,PRGRMDTB
            LD   IY,PRGRMDT0
            CALL CHCKAGG0
            POP  HL
            POP  IY
            POP  DE
            RET  NC
            JR   CHCKAGG0

;@ROUTINE IN BC,DE,HL,IY OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
CHCKAGG0: ;@NUC-GLOBAL CheckAggregateRegionOne PERMANENT CHCKAGG0
            OR   A
            SBC  HL,DE
            JR   C,CHCKAGG1
            ADD  HL,BC
            JR   C,CHCKAGG1
            PUSH IY
            POP  DE
            OR   A
            SBC  HL,DE
            JR   C,CHCKAGG2
            JR   Z,CHCKAGG2
%ENDIF
CHCKAGG1: ;@NUC-GLOBAL CheckAggregateRegionFailure PERMANENT CHCKAGG1
            SCF
            RET
CHCKAGG2: ;@NUC-GLOBAL CheckAggregateRegionSuccess PERMANENT CHCKAGG2
            OR   A
            RET

AGGRGTBN: ;@NUC-GLOBAL AggregateBoundsFailure PERMANENT AGGRGTBN
            SCF
            RET

%IF AggregateCallSlices
; Clear one complete BSS segment before main. BC is a nonzero published size
; and HL is the fixed target-adapter base.
;@ROUTINE IN BC,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,D,HL
INTLZBSS: ;@NUC-GLOBAL InitializeBss PERMANENT INTLZBSS
            LD   A,B
            OR   C
            RET  Z
            LD   D,0
.L00000:
            LD   (HL),D
            INC  HL
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,.L00000
            OR   A
            RET
%ENDIF
%ENDIF

; Unsigned low-byte multiplication for generated expression code. A and B are
; the operands; the result wraps modulo 256 exactly as MUL8 requires.
;@ROUTINE IN A,B OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C
MLTPLYU8: ;@NUC-GLOBAL MultiplyU8 PERMANENT MLTPLYU8
            LD   C,A
            XOR  A
            INC  B
.L00000:
            DEC  B
            RET  Z
            ADD  A,C
            JR   .L00000

; Full-width multiplication for typed generated expressions. Small nonzero
; powers of two shift directly; the general sixteen-round path returns the low
; sixteen bits, matching u16 wraparound.
;@ROUTINE IN DE,HL OUT HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,BC,DE
MLTPLYU1: ;@NUC-GLOBAL MultiplyU16 PERMANENT MLTPLYU1
            LD   A,D
            OR   A
            JR   NZ,.L00002
            LD   A,E
            OR   A
            JR   Z,.L00002
            DEC  A
            AND  E
            JR   NZ,.L00002
            LD   A,E
.L00000:
            SRL  A
            JR   Z,.L00001
            ADD  HL,HL
            JR   .L00000
.L00001:
            OR   A
            RET
.L00002:
            LD   BC,0
            LD   A,16
.L00003:
            SRL  D
            RR   E
            JR   NC,.L00004
            PUSH HL
            ADD  HL,BC
            LD   B,H
            LD   C,L
            POP  HL
.L00004:
            ADD  HL,HL
            DEC  A
            JR   NZ,.L00003
            LD   H,B
            LD   L,C
            OR   A
            RET

; Unsigned quotient. Carry reports a zero divisor without producing a value.
;@ROUTINE IN DE,HL OUT HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,BC,DE
DVDU16: ;@NUC-GLOBAL DivideU16 PERMANENT DVDU16
            CALL DVDU16CR
            RET  C
            LD   H,B
            LD   L,C
            OR   A
            RET

;@ROUTINE IN DE,HL OUT HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,BC,DE
MDLU16: ;@NUC-GLOBAL ModuloU16 PERMANENT MDLU16
            JR   DVDU16CR

;@ROUTINE IN DE,HL OUT BC,DE,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A
DVDU16CR: ;@NUC-GLOBAL DivideU16Core PERMANENT DVDU16CR
            LD   A,D
            OR   E
            JR   Z,.L00005
            LD   A,D
            OR   A
            JR   NZ,.L00002
            LD   A,E
            DEC  A
            AND  E
            JR   NZ,.L00002
            LD   A,E
            DEC  A
            AND  L
            LD   D,A
            LD   A,E
.L00000:
            SRL  A
            JR   Z,.L00001
            SRL  H
            RR   L
            JR   .L00000
.L00001:
            LD   B,H
            LD   C,L
            LD   L,D
            LD   H,0
            OR   A
            RET
.L00002:
            LD   BC,0
.L00003:
            OR   A
            SBC  HL,DE
            JR   C,.L00004
            INC  BC
            JR   .L00003
.L00004:
            ADD  HL,DE
            OR   A
            RET
.L00005:
            SCF
            RET

; A selects Comparison*. Both integer widths and booleans use canonical u16
; carriers here; the parser has already restricted Boolean relations to =/<>.
;@ROUTINE IN A,DE,HL OUT HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,BC,DE
CMPRU16: ;@NUC-GLOBAL CompareU16 PERMANENT CMPRU16
            LD   B,A
            OR   A
            SBC  HL,DE
            PUSH AF
            POP  DE
            LD   A,B
            CP   CMPRSNEQ
            JR   Z,.L00001
            CP   CMPRSNNT
            JR   Z,.L00002
            CP   CMPRSNLS
            JR   Z,.L00003
            CP   CMPRSNL0
            JR   Z,.L00004
            CP   CMPRSNGR
            JR   Z,.L00005
.L00000:
            PUSH DE
            POP  AF
            JR   NC,.L00006
            JR   .L00007
.L00001:
            PUSH DE
            POP  AF
            JR   Z,.L00006
            JR   .L00007
.L00002:
            PUSH DE
            POP  AF
            JR   NZ,.L00006
            JR   .L00007
.L00003:
            PUSH DE
            POP  AF
            JR   C,.L00006
            JR   .L00007
.L00004:
            PUSH DE
            POP  AF
            JR   C,.L00006
            JR   Z,.L00006
            JR   .L00007
.L00005:
            PUSH DE
            POP  AF
            JR   C,.L00007
            JR   Z,.L00007
.L00006:
            LD   HL,1
            OR   A
            RET
.L00007:
            LD   HL,0
            OR   A
            RET

%IF RuntimeProofServices
; Carry returns endOfInput, a configured input failure, or success in A.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,HL
RDINPTBY: ;@NUC-GLOBAL ReadInputByte PERMANENT RDINPTBY
            LD   C,2
            LD   HL,SRVCINPT
            JR   RDSRVCBY

; Bulk input shares the same length/cursor/failure/buffer record shape. Its
; configured failure is normalized to the stable storageFailure code in C.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,HL
RDSTRGBY: ;@NUC-GLOBAL ReadStorageByte PERMANENT RDSTRGBY
            LD   C,4
            LD   HL,SRVCSTRG
            JR   RDSRVCBY
;@ROUTINE IN C,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,HL
RDSRVCBY: ;@NUC-GLOBAL ReadServiceByte PERMANENT RDSRVCBY
            INC  HL
            INC  HL
            LD   A,(HL)
            OR   A
            JR   Z,.L00000
            LD   A,C
            SCF
            RET
.L00000:
            DEC  HL
            DEC  HL
            LD   A,(HL)
            INC  HL
            LD   C,(HL)
            CP   C
            JR   Z,.L00001
            PUSH HL
            INC  HL
            INC  HL
            LD   B,0
            ADD  HL,BC
            LD   A,(HL)
            LD   B,A
            INC  C
            LD   A,C
            POP  HL
            LD   (HL),A
            LD   A,B
            OR   A
            RET
.L00001:
            LD   A,1
            SCF
            RET

; Input A is the byte. Carry returns a recoverable outputFailure code.
; D is preserved because this slice allocates its scalar counter there.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,E,HL
WRTOTPTB: ;@NUC-GLOBAL WriteOutputByte PERMANENT WRTOTPTB
            LD   E,A
            LD   A,(SRVCCLLC)
            INC  A
            LD   (SRVCCLLC),A
            LD   C,A
            LD   A,(SRVCFLRC)
            OR   A
            JR   Z,.L00000
            CP   C
            JR   Z,WRTOTPT0
.L00000:
            LD   A,(SRVCOTPT)
            CP   SRVCOTP1
            JR   NC,WRTOTPT0
            LD   C,A
            LD   B,0
            LD   HL,SRVCOTP0
            ADD  HL,BC
            LD   A,E
            LD   (HL),A
            LD   A,(SRVCOTPT)
            INC  A
            LD   (SRVCOTPT),A
            XOR  A
            RET
WRTOTPT0: ;@NUC-GLOBAL WriteOutputByteFailure PERMANENT WRTOTPT0
            LD   A,3
            SCF
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
RWNDSTRG: ;@NUC-GLOBAL RewindStorageInput PERMANENT RWNDSTRG
            LD   A,(SRVCSTR1)
            OR   A
            JR   NZ,STRGFLR
            LD   (SRVCSTR0),A
            RET

; Input A is written at the current bulk-output cursor. Every check precedes
; the first cursor, length, or output-byte mutation.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,HL
WRTSTRGB: ;@NUC-GLOBAL WriteStorageByte PERMANENT WRTSTRGB
            LD   D,A
            LD   A,(SRVCSTR6)
            OR   A
            JR   NZ,STRGFLR
            LD   A,(SRVCSTR5)
            LD   C,A
            LD   A,(SRVCSTR4)
            CP   C
            JR   C,STRGFLR
            JR   NZ,.L00000
            LD   A,C
            CP   SRVCSTR8
            JR   NC,STRGFLR
            INC  A
            LD   (SRVCSTR4),A
.L00000:
            LD   B,0
            LD   HL,SRVCSTR7
            ADD  HL,BC
            LD   (HL),D
            INC  C
            LD   A,C
            LD   (SRVCSTR5),A
            XOR  A
            RET

; Input HL is an unsigned offset. Only existing positions and the exact end
; are admitted; failure leaves the cursor unchanged.
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
SKSTRGOT: ;@NUC-GLOBAL SeekStorageOutput PERMANENT SKSTRGOT
            LD   A,H
            OR   A
            JR   NZ,STRGFLR
            LD   A,(SRVCSTR6)
            OR   A
            JR   NZ,STRGFLR
            LD   A,(SRVCSTR4)
            CP   L
            JR   C,STRGFLR
            LD   A,L
            LD   (SRVCSTR5),A
            OR   A
            RET

STRGFLR: ;@NUC-GLOBAL StorageFailure PERMANENT STRGFLR
            LD   A,4
            SCF
            RET
%ENDIF
