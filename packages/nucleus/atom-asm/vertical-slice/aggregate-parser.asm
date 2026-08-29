AGPRFLG EQU SYMBLRCR+SYMBLAGG

; Stage 6 aggregate layout and static-image construction.
;
; Types use one-byte IDs. 1..3 are the predefined scalar types; dynamic IDs
; index a bounded four-byte descriptor plus a retained word extent. Aggregate
; storage is allocated by top-level variables and aggregate constants.
; Initializer bytes are staged privately; the Z80 backend publishes them only
; after the complete source has succeeded.


;@ROUTINE IN A OUT A,HL CLOBBERS CARRY,ZERO,SIGN,PARITY,HALFCARRY,DE
AGGRGTTY: ;@NUC-GLOBAL AggregateTypeAddress PERMANENT AGGRGTTY
            SUB  AGGRGTFR
            LD   L,A
            LD   H,0
            ADD  HL,HL
            ADD  HL,HL
            LD   DE,AGGRGTT8
            ADD  HL,DE
            RET

;@ROUTINE IN A OUT A,HL CLOBBERS CARRY,ZERO,SIGN,PARITY,HALFCARRY,DE
AGGRGTEX: ;@NUC-GLOBAL AggregateExtentAddress PERMANENT AGGRGTEX
            SUB  AGGRGTFR
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,AGGRGTTF
            ADD  HL,DE
            RET

;@ROUTINE IN A OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE
AGGRGTGT: ;@NUC-GLOBAL AggregateGetExtent PERMANENT AGGRGTGT
            CP   AGGRGTFR
            JR   NC,.L00001
            LD   HL,1
            CP   AGGRGTTI
            JR   Z,.L00000
            OR   A
            RET
.L00000:
            INC  L
            OR   A
            RET
.L00001:
            CALL AGGRGTEX
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            OR   A
            RET

; Append the descriptor and extent in AggregateCandidate*. No structural
; lookup is performed, so this entry creates nominal record identity.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
AGGRGTAP: ;@NUC-GLOBAL AggregateAppendType PERMANENT AGGRGTAP
            LD   A,(AGGRGTT7)
            CP   AGGRGTTA
            JR   NC,AGGRGTT0
            ADD  A,AGGRGTFR
            CALL AGGRGTTY
            LD   D,H
            LD   E,L
            LD   HL,AGGRGTC9
            LD   BC,AGGRGTT9
            LDIR
            LD   A,(AGGRGTT7)
            ADD  A,AGGRGTFR
            LD   C,A
            CALL AGGRGTEX
            LD   DE,(AGGRGTCC)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            LD   HL,AGGRGTT7
            INC  (HL)
            LD   A,C
            OR   A
            RET
AGGRGTT0: ;@NUC-GLOBAL AggregateTypeCapacityFailure PERMANENT AGGRGTT0
            LD   A,DGNSTCT0
            JP   CMPLRSTD

; Intern a structural string or array descriptor. CandidateKind/Aux/Length and
; CandidateExtent must already be complete.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
AGGRGTIN: ;@NUC-GLOBAL AggregateInternType PERMANENT AGGRGTIN
            LD   A,(AGGRGTT7)
            OR   A
            JR   Z,AGGRGTAP
            LD   B,A
            LD   C,AGGRGTFR
.L00000:
            LD   A,C
            CALL AGGRGTTY
            LD   DE,AGGRGTC9
            PUSH BC
            LD   B,AGGRGTT9
.L00001:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,.L00002
            INC  DE
            INC  HL
            DJNZ .L00001
            POP  BC
            JR   .L00004
.L00002:
            POP  BC
.L00003:
            INC  C
            DJNZ .L00000
            JR   AGGRGTAP
.L00004:
            LD   A,C
            OR   A
            RET

; The first compiler admits one aggregate object up to the selected complete
; program-data region. HL is a nonzero mathematical extent.
;@ROUTINE IN HL OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
AGGRGTCH: ;@NUC-GLOBAL AggregateCheckExtentCapacity PERMANENT AGGRGTCH
            LD   A,H
%IF SegmentedOutput
            CP   4
            JR   C,.L00000
            JR   NZ,.L00001
            LD   A,L
            OR   A
            JR   NZ,.L00001
%ELSE
            OR   A
            JR   NZ,.L00001
%ENDIF
.L00000:
            OR   A
            RET
.L00001:
            LD   A,DGNSTCP1
            JP   CMPLRSTD

%IF SegmentedOutput
; The read-only image shares the same 1 KiB proof region as generated rodata,
; but exhaustion names the declaration class that consumed it.
;@ROUTINE IN HL OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
AGGRGTC0: ;@NUC-GLOBAL AggregateCheckReadOnlyCapacity PERMANENT AGGRGTC0
            LD   A,H
            CP   4
            JR   C,.L00000
            JR   NZ,.L00001
            LD   A,L
            OR   A
            JR   NZ,.L00001
.L00000:
            OR   A
            RET
.L00001:
            LD   A,DGNSTCRD
            JP   CMPLRSTD
%ENDIF

%IF HybridLL1Full
AGGRGTNS: ;@NUC-GLOBAL AggregateNestedArrayFailure PERMANENT AGGRGTNS
            POP  AF
AGGRGTT1: ;@NUC-GLOBAL AggregateTypeShapeFailure PERMANENT AGGRGTT1
            LD   A,DGNSTCT1
            JP   CMPLRSTD
AGGRGTPR: ;@NUC-GLOBAL AggregateProgramDataCapacityFailure PERMANENT AGGRGTPR
            LD   A,DGNSTCP1
            JP   CMPLRSTD
AGGRGTST: ;@NUC-GLOBAL AggregateStringCapacityFailure PERMANENT AGGRGTST
            LD   A,DGNSTCS0
            JP   CMPLRSTD
%ELSE
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
AGGRGTP0: ;@NUC-GLOBAL AggregateParseBound PERMANENT AGGRGTP0
            LD   A,SCLRTYP0
            CALL TYPDEXP3
            RET  C
            LD   D,A
            AND  SCLRMTCN
            JP   Z,AGGRGTT1
            LD   E,SCLRTYP0
            LD   A,D
            CALL TYPDCHC0
            RET  C
            LD   A,H
            OR   L
            JR   Z,AGGRGTT1
            PUSH HL
            LD   E,TKNRGHTB
            CALL PRSREXPC
            POP  HL
            RET

AGGRGTT1: ;@NUC-GLOBAL AggregateTypeShapeFailure PERMANENT AGGRGTT1
            LD   A,DGNSTCT1
            JP   CMPLRSTD

; Parse any admitted aggregate type. Bounds and complete extents are retained
; as words. Object allocation is still bounded by the selected program-data
; region, and exceeding that implementation capacity receives a capacity
; diagnostic rather than changing the source type.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
AGGRGTP1: ;@NUC-GLOBAL AggregateParseType PERMANENT AGGRGTP1
            CALL PRSRTK
            RET  C
            CP   TokenU8
            JR   Z,.L00000
            CP   TokenU16
            JR   Z,.L00001
            CP   TKNBLN
            JR   Z,.L00002
            CP   TKNSTRN0
            JR   Z,.L00003
            CP   TKNNM
            JR   NZ,AGGRGTT1
            CALL SYMBLLKP
            RET  C
            LD   D,A
            AND  AGPRFLG
            CP   SYMBLRCR
            JR   NZ,AGGRGTT1
            LD   A,C
            JR   .L00004
.L00000:
            LD   A,AGGRGTTH
            JR   .L00004
.L00001:
            LD   A,AGGRGTTI
            JR   .L00004
.L00002:
            LD   A,AGGRGTTJ
            JR   .L00004
.L00003:
            LD   E,TKNLFTBR
            CALL PRSREXPC
            RET  C
            CALL AGGRGTP0
            RET  C
            LD   A,H
            OR   A
            JP   NZ,AGGRGTST
            LD   A,L
            OR   A
            JP   Z,AGGRGTT1
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
            CALL AGGRGTIN
            RET  C
.L00004:
            LD   (AGGRGTCR),A
            CALL PRSRPK
            RET  C
            CP   TKNLFTBR
            JR   Z,.L00005
            LD   A,(AGGRGTCR)
            OR   A
            RET
.L00005:
            LD   A,(AGGRGTCR)
            CP   AGGRGTFR
            JR   C,AGGRGTAR
            PUSH AF
            CALL AGGRGTTY
            LD   A,(HL)
            CP   AGGRGTTO
            JR   Z,AGGRGTNS
            POP  AF
            JR   AGGRGTAR
AGGRGTNS: ;@NUC-GLOBAL AggregateNestedArrayFailure PERMANENT AGGRGTNS
            POP  AF
            JP   AGGRGTT1
AGGRGTAR: ;@NUC-GLOBAL AggregateArrayElementReady PERMANENT AGGRGTAR
            LD   (AGGRGTCA),A
            CALL PRSRTK
            RET  C
            CALL AGGRGTP0
            RET  C
            LD   (AGGRGTCB),HL
            LD   B,H
            LD   C,L
            LD   A,(AGGRGTCA)
            CALL AGGRGTGT
            LD   D,H
            LD   E,L
            LD   HL,0
.L00000:
            ADD  HL,DE
            JP   C,AGGRGTPR
            CALL AGGRGTCH
            RET  C
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,.L00000
            LD   (AGGRGTCC),HL
            LD   A,AGGRGTTO
            LD   (AGGRGTC9),A
            CALL AGGRGTIN
            RET  C
            LD   (AGGRGTCR),A
            CALL PRSRPK
            RET  C
            CP   TKNLFTBR
            JP   Z,AGGRGTT1
            LD   A,(AGGRGTCR)
            OR   A
            RET
AGGRGTPR: ;@NUC-GLOBAL AggregateProgramDataCapacityFailure PERMANENT AGGRGTPR
            LD   A,DGNSTCP1
            JP   CMPLRSTD
AGGRGTST: ;@NUC-GLOBAL AggregateStringCapacityFailure PERMANENT AGGRGTST
            LD   A,DGNSTCS0
            JP   CMPLRSTD
%ENDIF

;@ROUTINE IN A OUT A,HL CLOBBERS CARRY,ZERO,SIGN,PARITY,HALFCARRY,DE
AGGRGTFL: ;@NUC-GLOBAL AggregateFieldAddress PERMANENT AGGRGTFL
            LD   E,A
            LD   D,0
            LD   H,D
            LD   L,E
            ADD  HL,HL
            ADD  HL,DE
            ADD  HL,HL
            LD   DE,AGGRGTF3
            ADD  HL,DE
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
AGGRGTC1: ;@NUC-GLOBAL AggregateCheckFieldDuplicate PERMANENT AGGRGTC1
            LD   A,(AGGRGTC5)
            OR   A
            RET  Z
            LD   C,A
            LD   A,(AGGRGTC4)
.L00000:
            PUSH AF
            PUSH BC
            CALL AGGRGTFL
            CALL TKNNMRCR
            JR   C,.L00001
            POP  BC
            POP  AF
            INC  A
            DEC  C
            JR   NZ,.L00000
            OR   A
            RET
.L00001:
            POP  BC
            POP  AF
.L00002:
            JP   TYPDDPLC

%IF HybridLL1Full
AGGRGTRC: ;@NUC-GLOBAL AggregateRecordEmptyFailure PERMANENT AGGRGTRC
            LD   A,DGNSTCRC
            JP   CMPLRSTD
%ELSE
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
AGGRGTP2: ;@NUC-GLOBAL AggregateParseRecordAfterTake PERMANENT AGGRGTP2
            LD   E,TKNNM
            CALL PRSREXPC
            RET  C
            CALL TYPDRTND
            RET  C
            LD   A,(AGGRGTT7)
            CP   AGGRGTTA
            JP   NC,AGGRGTT0
            LD   A,(AGGRGTR6)
            CP   AGGRGTR9
            JP   NC,AGGRGTT0
            CALL PRSREXP0
            RET  C
            LD   A,(AGGRGTF2)
            LD   (AGGRGTC4),A
            XOR  A
            LD   (AGGRGTC5),A
            LD   H,A
            LD   L,A
            LD   (AGGRGTC6),HL
.L00000:
            CALL PRSRPK
            RET  C
            CP   TokenEnd
            JR   Z,.L00001
            CP   TKNNM
            JP   NZ,AGGRGTT1
            CALL PRSRTK
            RET  C
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
            PUSH HL
            CALL PRSREXP3
            POP  HL
            RET  C
            PUSH HL
            CALL AGGRGTP1
            POP  HL
            RET  C
            LD   B,A
            INC  HL
            LD   (HL),B
            INC  HL
            LD   DE,(AGGRGTC6)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            PUSH DE
            LD   A,B
            CALL AGGRGTGT
            POP  DE
            ADD  HL,DE
            JP   C,AGGRGTPR
            CALL AGGRGTCH
            RET  C
            LD   (AGGRGTC6),HL
            CALL PRSREXP0
            RET  C
            LD   HL,AGGRGTC5
            INC  (HL)
            JR   .L00000
.L00001:
            LD   A,(AGGRGTC5)
            OR   A
            JR   Z,AGGRGTRC
            CALL PRSRTK
            RET  C
            CALL PRSREXP0
            RET  C
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
%IF AggregateCallSlices
            JP   STG7PRST
%ELSE
            JP   TYPDPRS4
%ENDIF
AGGRGTRC: ;@NUC-GLOBAL AggregateRecordEmptyFailure PERMANENT AGGRGTRC
            LD   A,DGNSTCRC
            JP   CMPLRSTD
%ENDIF

AGGRGTI0: ;@NUC-GLOBAL AggregateInitializerCapacityFailure PERMANENT AGGRGTI0
            LD   A,DGNSTCI1
            JP   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
AGGRGTI1: ;@NUC-GLOBAL AggregateInitializerLeave PERMANENT AGGRGTI1
            LD   HL,AGGRGTI5
            DEC  (HL)
            OR   A
            RET

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
AGGRGTWR: ;@NUC-GLOBAL AggregateWriteByte PERMANENT AGGRGTWR
            LD   B,A
            LD   HL,(AGGRGTC7)
            LD   DE,AGGRGTI6
            ADD  HL,DE
            LD   A,B
            LD   (HL),A
            LD   HL,(AGGRGTC7)
            INC  HL
            LD   (AGGRGTC7),HL
            OR   A
            RET

; Decode the already tokenized string literal directly from resident source.
; B is the fixed capacity. The enclosing object is already zeroed, so the
; final cursor advances over padding without rewriting it.
;@ROUTINE IN B OUT A,B,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,C,D,DE,HL
AGGRGTDC: ;@NUC-GLOBAL AggregateDecodeString PERMANENT AGGRGTDC
            LD   A,(TKNLNGTH)
            LD   C,A
            PUSH BC
            CALL AGGRGTWR
            POP  BC
            RET  C
            LD   A,B
            SUB  C
            LD   B,A
            LD   HL,(TKNLXMPN)
            INC  HL
.L00000:
            LD   A,C
            OR   A
            JR   Z,.L00007
            LD   A,(HL)
            INC  HL
            CP   '\\'
            JR   NZ,.L00006
            LD   A,(HL)
            INC  HL
            CP   'x'
            JR   Z,.L00001
            CP   '0'
            JR   Z,.L00002
            CP   'n'
            JR   Z,.L00003
            CP   'r'
            JR   Z,.L00004
            CP   't'
            JR   Z,.L00005
            JR   .L00006
.L00001:
            LD   A,(HL)
            INC  HL
            CALL TKNISHXD
            ADD  A,A
            ADD  A,A
            ADD  A,A
            ADD  A,A
            LD   D,A
            LD   A,(HL)
            INC  HL
            CALL TKNISHXD
            OR   D
            JR   .L00006
.L00002:
            XOR  A
            JR   .L00006
.L00003:
            LD   A,10
            JR   .L00006
.L00004:
            LD   A,13
            JR   .L00006
.L00005:
            LD   A,9
.L00006:
            PUSH BC
            PUSH HL
            CALL AGGRGTWR
            POP  HL
            POP  BC
            RET  C
            DEC  C
            JR   .L00000
.L00007:
            LD   E,B
            LD   D,0
            INC  DE                      ; permanent terminator at capacity+1
            LD   HL,(AGGRGTC7)
            ADD  HL,DE
            LD   (AGGRGTC7),HL
            OR   A
            RET

AGGRGTI2: ;@NUC-GLOBAL AggregateInitializerShapeFailure PERMANENT AGGRGTI2
            LD   A,DGNSTCI2
            JP   CMPLRSTD
AGGRGTI3: ;@NUC-GLOBAL AggregateInitializerCountFailure PERMANENT AGGRGTI3
            LD   A,DGNSTCI3
            JP   CMPLRSTD

;@ROUTINE OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
AGGRGTPK: ;@NUC-GLOBAL AggregatePeekPreserveBC PERMANENT AGGRGTPK
            PUSH BC
            CALL PRSRPK
            POP  BC
            RET

;@ROUTINE OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
AGGRGTTK: ;@NUC-GLOBAL AggregateTakePreserveBC PERMANENT AGGRGTTK
            PUSH BC
            CALL PRSRTK
            POP  BC
            RET

;@ROUTINE IN A,BC,ZERO OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
AGGRGTE0: ;@NUC-GLOBAL AggregateExpectCommaPreserveBC PERMANENT AGGRGTE0
            JR   Z,AGGRGTI3
            CP   TKNCMM
            JR   NZ,AGGRGTI2
            JR   AGGRGTTK

; Parse one type-directed static initializer at the current image cursor.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
AGGRGTP3: ;@NUC-GLOBAL AggregateParseInitializer PERMANENT AGGRGTP3
            CP   AGGRGTFR
            JR   C,.L00000
            PUSH AF
            CALL AGGRGTTY
            LD   A,(HL)
            POP  DE
            LD   E,D
            LD   D,0
            CP   AGGRGTTN
            JR   Z,.L00002
            CP   AGGRGTTL
            JR   Z,.L00005
            CP   AGGRGTTO
            JP   Z,.L00008
            JR   AGGRGTI2

.L00000:
            LD   E,A
            PUSH DE
            CALL TYPDEXP3
            POP  DE
            RET  C
            CALL TYPDCHC0
            RET  C
            AND  SCLRMTCN
            JP   Z,TYPDTYPF
            LD   A,L
            PUSH DE
            PUSH HL
            CALL AGGRGTWR
            POP  HL
            POP  DE
            RET  C
            LD   A,E
            CP   AGGRGTTI
            JR   Z,.L00001
            OR   A
            RET
.L00001:
            LD   A,H
            JP   AGGRGTWR

.L00002:
            EX   DE,HL
            LD   A,L
            CALL AGGRGTTY
            INC  HL
            LD   B,(HL)
            PUSH BC
            LD   E,TKNSTRNG
            CALL PRSREXPC
            POP  BC
            RET  C
            LD   A,(TKNLNGTH)
            CP   B
            JR   C,.L00003
            JR   Z,.L00003
            LD   A,DGNSTCST
            JP   CMPLRSTD
.L00003:
            ; AggregateZeroCurrentObject already defined the complete object,
            ; so decoding need only overwrite the length and payload bytes.
            JP   AGGRGTDC

;@ROUTINE IN A,BC OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
.L00004:
            PUSH AF
            CALL AGGRGTPK
            POP  DE
            RET  C
            CP   D
            JP   NZ,AGGRGTI2
            CALL AGGRGTTK
            RET  C
            LD   A,(AGGRGTI5)
            CP   AGGRGTI8
            JP   NC,AGGRGTI0
            INC  A
            LD   (AGGRGTI5),A
            OR   A
            RET

.L00005:
            EX   DE,HL
            LD   A,L
            CALL AGGRGTTY
            INC  HL
            LD   A,(HL)
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,AGGRGTR7
            ADD  HL,DE
            LD   B,(HL)
            INC  HL
            LD   C,(HL)
            LD   A,TKNLFTPR
            CALL .L00004
            RET  C
.L00006:
            PUSH BC
            LD   A,B
            CALL AGGRGTFL
            INC  HL
            INC  HL
            INC  HL
            LD   A,(HL)
            CALL AGGRGTP3
            POP  BC
            RET  C
            INC  B
            DEC  C
            JR   Z,.L00007
            CALL AGGRGTPK
            RET  C
            CP   TKNRGHTP
            CALL AGGRGTE0
            RET  C
            JR   .L00006
.L00007:
            LD   BC,TKNRGHTP<<8|TKNRGHTB
            JR   .L0000B

.L00008:
            EX   DE,HL
            LD   A,L
            CALL AGGRGTTY
            INC  HL
            LD   C,(HL)
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            PUSH BC
            PUSH DE
            LD   A,TKNLFTBR
            CALL .L00004
            POP  DE
            POP  BC
            RET  C
.L00009:
            PUSH BC
            PUSH DE
            LD   A,C
            CALL AGGRGTP3
            POP  DE
            POP  BC
            RET  C
            DEC  DE
            LD   A,D
            OR   E
            JR   Z,.L0000A
            PUSH DE
            CALL AGGRGTPK
            POP  DE
            RET  C
            CP   TKNRGHTB
            PUSH DE
            CALL AGGRGTE0
            POP  DE
            RET  C
            JR   .L00009
.L0000A:
            LD   BC,TKNRGHTB<<8|TKNRGHTP

;@ROUTINE IN BC OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL,IX,IY
.L0000B:
            CALL AGGRGTPK
            RET  C
            CP   B
            JR   Z,.L0000C
            CP   C
            JP   Z,AGGRGTI2
            JP   AGGRGTI3
.L0000C:
            CALL PRSRTK
            RET  C
            JP   AGGRGTI1

; Zero exactly the candidate object's complete extent before applying an
; explicit initializer. This also defines every byte of a zero initializer.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
AGGRGTZR: ;@NUC-GLOBAL AggregateZeroCurrentObject PERMANENT AGGRGTZR
            LD   HL,(AGGRGTC7)
            LD   DE,AGGRGTI6
            ADD  HL,DE
            LD   BC,(AGGRGTC8)
.L00000:
            LD   A,B
            OR   C
            RET  Z
            XOR  A
            LD   (HL),A
            INC  HL
            DEC  BC
            JR   .L00000

; The current token is the program variable name.
%IF HybridLL1Full
%ELSE
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL,IX,IY
AGGRGTP4: ;@NUC-GLOBAL AggregateParseProgramAfterVar PERMANENT AGGRGTP4
            CALL TYPDRTND
            RET  C
            CALL PRSREXP3
            RET  C
            CALL AGGRGTP1
            RET  C
            LD   (AGGRGTCR),A
            CALL AGGRGTGT
            LD   (AGGRGTC8),HL
            LD   DE,(STTCIMGL)
            LD   (AGGRGTC7),DE
            ADD  HL,DE
            JP   C,AGGRGTPR
            LD   A,H
            OR   A
            JP   NZ,AGGRGTPR
            LD   (AGGRGTCD),HL
            CALL AGGRGTZR
            RET  C
            XOR  A
            LD   (AGGRGTI5),A
            LD   (AGGRGTHS),A
            CALL PRSRPK
            RET  C
            CP   TKNEQLS
            JR   NZ,.L00001
            CALL PRSRTK
            RET  C
            LD   HL,(STTCIMGL)
            LD   (AGGRGTC7),HL
            LD   A,(AGGRGTCR)
            LD   B,A
            PUSH BC
            CALL AGGRGTP3
            JR   C,.L00000
            POP  BC
            LD   A,1
            LD   (AGGRGTHS),A
            LD   A,B
            LD   (AGGRGTCR),A
            LD   HL,(AGGRGTC7)
            LD   DE,(AGGRGTCD)
            OR   A
            SBC  HL,DE
            JP   NZ,AGGRGTI3
            JR   .L00001
.L00000:
            POP  BC
            SCF
            RET
.L00001:
            CALL PRSREXP0
            RET  C
            LD   BC,(STTCIMGL)
            LD   A,(AGGRGTCR)
            CP   AGGRGTFR
            JR   C,.L00002
            LD   D,SYMBLIN0
            JR   .L00003
.L00002:
            OR   SYMBLCL0
            LD   D,A
.L00003:
            PUSH BC
            CALL TYPDPRPR
            POP  BC
            RET  C
            LD   A,(SYMBLCNT)
            LD   E,A
            LD   D,0
            LD   HL,AGGRGTSY
            ADD  HL,DE
            LD   A,(AGGRGTCR)
            LD   (HL),A
            CALL SYMBLCMM
            RET  C
            LD   HL,(AGGRGTCD)
            LD   (STTCIMGL),HL
            LD   A,L
            LD   (NXTPRGRM),A
%IF AggregateCallSlices
            JP   STG7PRST
%ELSE
            JP   TYPDPRS4
%ENDIF
%ENDIF

; Dedicated Stage 6 compile entry. Historical slices keep AggregateMode clear;
; this entry makes the complete static-image path authoritative.
%IF AggregateCallSlices
%ELSE
            ;@ROUTINE IN A,DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
CMPLAGG2: ;@NUC-GLOBAL CompileAggregateSlice PERMANENT CMPLAGG2
            CALL CMPLSLCI
            LD   A,1
            LD   (AGGRGTMD),A
%IF HybridLL1Full
            XOR  A
            LD   (STG7CRR1),A
            CALL HYBRDL3B
%ELSE
            CALL PRSRPRS2
%ENDIF
            RET  C
            JP   SMNTCSN6
%ENDIF
