; Memory-backed implementation of the ordered source-byte adapter.

;@ROUTINE IN A,DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
SRCINTLZ: ;@NUC-GLOBAL SourceInitialize PERMANENT SRCINTLZ
            LD   (SRCPRTID),A
            LD   (SRCCRSR),HL
            EX   DE,HL
            LD   (SRCEND),HL
            LD   HL,0
            LD   (SRCOFFST),HL
            INC  HL
            LD   (SRCLN),HL
            LD   (SRCCLMN),HL
            XOR  A
            LD   (SRCLNHST),A
            LD   (SRCDLMTR),A
            RET

%IF AggregateCallSlices
; A is a bounded part count and HL points to five-byte descriptors containing
; stable identity, source start, and source end. The source and descriptors
; remain resident until compilation finishes.
;@ROUTINE IN A,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
SRCINTL0: ;@NUC-GLOBAL SourceInitializeParts PERMANENT SRCINTL0
            DEC  A
            CP   SRCPRTCP
            JR   NC,.L00000
            LD   (SRCPRTSR),A
            XOR  A
            LD   (SRCPRTPN),A
            JR   SRCLDPRT
.L00000:
            XOR  A
            LD   H,A
            LD   L,A
            LD   D,A
            LD   E,A
            CALL SRCINTLZ
            CALL TKNRCRDS
            LD   A,DGNSTCSR
            JP   CMPLRSTD

; Load the descriptor at HL and retain the address of the following one.
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
SRCLDPRT: ;@NUC-GLOBAL SourceLoadPart PERMANENT SRCLDPRT
            LD   A,(HL)
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            PUSH DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   (SRCPRTDS),HL
            POP  HL
            JR   SRCINTLZ
%ENDIF

; Return the current source byte in A. Carry denotes the separate EOF event.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
SRCPK: ;@NUC-GLOBAL SourcePeek PERMANENT SRCPK
            LD   HL,(SRCCRSR)
            LD   DE,(SRCEND)
            OR   A
            SBC  HL,DE
            ADD  HL,DE
            JR   NZ,.L00000
            SCF
            RET
.L00000:
            LD   A,(HL)
            OR   A
            RET

; Consume one byte and advance byte offset and byte column. Newline handling
; is separate because LF and CRLF each advance the logical line only once.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE,HL
SRCTK: ;@NUC-GLOBAL SourceTake PERMANENT SRCTK
            PUSH BC
            CALL SRCPK
            JR   C,.L00000
            LD   B,A
            LD   HL,(SRCCRSR)
            INC  HL
            LD   (SRCCRSR),HL
            LD   HL,(SRCOFFST)
            INC  HL
            LD   (SRCOFFST),HL
            LD   HL,(SRCCLMN)
            INC  HL
            LD   (SRCCLMN),HL
            LD   A,B
            POP  BC
            OR   A
            RET
.L00000:
            POP  BC
            SCF
            RET

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,HL
SRCFNSHL: ;@NUC-GLOBAL SourceFinishLine PERMANENT SRCFNSHL
            LD   HL,(SRCLN)
            INC  HL
            LD   (SRCLN),HL
            LD   HL,1
            LD   (SRCCLMN),HL
            OR   A
            RET
