; Bounded exact-name table for the first general scalar slice.

%IF AggregateCallSlices
%ELSE
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
SYMBLRST: ;@NUC-GLOBAL SymbolReset PERMANENT SYMBLRST
            XOR  A
            LD   (SYMBLCNT),A
            LD   (NXTLCLSL),A
            LD   (NXTPRGRM),A
            RET
%ENDIF

; Compare the current NAME token with committed entries. Carry returns a
; matching entry in HL. The provisional entry at SymbolCount is invisible.
;@ROUTINE OUT A,CARRY,ZERO,HL CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE
SYMBLFND: ;@NUC-GLOBAL SymbolFindCurrent PERMANENT SYMBLFND
            LD   A,(SYMBLCNT)
            OR   A
            RET  Z
            LD   C,A
            LD   HL,SYMBLTBL
.L00000:
            CALL TKNNMRCR
            RET  C
            LD   DE,SYMBLENT
            ADD  HL,DE
            DEC  C
            JR   NZ,.L00000
            OR   A
            RET

; Compatibility entry for the older slices: D is class/type information and E
; is a byte-sized payload. New typed declarations call the word entry below.
%IF LegacyCompilerSlices
;@ROUTINE IN D,E OUT A,CARRY,ZERO,HL CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE
SYMBLPRP: ;@NUC-GLOBAL SymbolPrepareCurrent PERMANENT SYMBLPRP
            LD   B,0
            LD   C,E
%ENDIF
;@ROUTINE IN D,BC OUT A,CARRY,ZERO,HL CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE
SYMBLPR0: ;@NUC-GLOBAL SymbolPrepareCurrentWord PERMANENT SYMBLPR0
            PUSH BC
            PUSH DE
            CALL SYMBLFND
            POP  DE
            POP  BC
            JP   C,TYPDDPLC
            LD   A,(SYMBLCNT)
            CP   SYMBLCPC
            JR   NC,.L00000
            PUSH BC
            LD   C,A
            LD   B,0
            LD   H,0
            LD   L,C
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,BC
            ADD  HL,BC
            LD   BC,SYMBLTBL
            ADD  HL,BC
            CALL TKNRTNNM
            INC  HL
            LD   (HL),D
            INC  HL
            POP  BC
            LD   (HL),C
            INC  HL
            LD   (HL),B
            OR   A
            RET
.L00000:
            LD   A,DGNSTCSY
            JR   CMPLRSTD

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
SYMBLCMM: ;@NUC-GLOBAL SymbolCommit PERMANENT SYMBLCMM
            LD   HL,SYMBLCNT
            INC  (HL)
            XOR  A
            RET

; Return the current name's class/type in A and word payload in BC.
;@ROUTINE OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
SYMBLLKP: ;@NUC-GLOBAL SymbolLookupCurrent PERMANENT SYMBLLKP
            CALL SYMBLFND
            JR   NC,SYMBLLK0
            INC  HL
            INC  HL
            INC  HL
            LD   A,(HL)
            INC  HL
            LD   C,(HL)
            INC  HL
            LD   B,(HL)
            OR   A
            RET
SYMBLLK0: ;@NUC-GLOBAL SymbolLookupMissing PERMANENT SYMBLLK0
            LD   A,DGNSTCUN
