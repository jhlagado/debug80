; Tokenizer subset for the scalar-local, counted-loop, and array proofs.

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,DE,HL
TKNRCRDS: ;@NUC-GLOBAL TokenRecordStart PERMANENT TKNRCRDS
            LD   HL,(SRCOFFST)
            LD   (TKNSTRTO),HL
            LD   HL,(SRCLN)
            LD   (TKNSTRTL),HL
            LD   HL,(SRCCLMN)
            LD   (TKNSTRTC),HL
            LD   HL,(SRCCRSR)
            LD   (TKNLXMPN),HL
            RET

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D
TKNFNSH: ;@NUC-GLOBAL TokenFinish PERMANENT TKNFNSH
            LD   D,A
            LD   A,1
            LD   (SRCLNHST),A
            LD   A,D
            OR   A
            RET

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,DE,HL
TKNLXCLF: ;@NUC-GLOBAL TokenLexicalFailure PERMANENT TKNLXCLF
            LD   A,DGNSTCLX
            JP   CMPLRSTD

;@ROUTINE IN A OUT A,CARRY CLOBBERS ZERO,SIGN,PARITY,HALFCARRY,C
TKNISLTT: ;@NUC-GLOBAL TokenIsLetter PERMANENT TKNISLTT
            LD   C,A
            OR   $20
            SUB  'a'
            CP   26
            LD   A,C
            RET

;@ROUTINE IN A OUT A,CARRY CLOBBERS ZERO,SIGN,PARITY,HALFCARRY,C
TKNISNMB: ;@NUC-GLOBAL TokenIsNameByte PERMANENT TKNISNMB
            CALL TKNISLTT
            RET  C
            CP   '0'
            JR   C,TKNISNM0
            CP   '9'+1
            JR   C,TKNISNM1
TKNISNM0: ;@NUC-GLOBAL TokenIsNameByteUnderscore PERMANENT TKNISNM0
            CP   '_'
            JR   Z,TKNISNM1
            OR   A
            RET
TKNISNM1: ;@NUC-GLOBAL TokenIsNameByteYes PERMANENT TKNISNM1
            SCF
            RET

;@ROUTINE IN B,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
TKNNMEQL: ;@NUC-GLOBAL TokenNameEquals PERMANENT TKNNMEQL
            LD   A,(TKNLNGTH)
            CP   B
            JR   NZ,TKNNMEQ1
            LD   DE,(TKNLXMPN)
TKNNMEQ0: ;@NUC-GLOBAL TokenNameEqualsLoop PERMANENT TKNNMEQ0
            LD   A,(DE)
            CP   (HL)
            JR   NZ,TKNNMEQ1
            INC  DE
            INC  HL
            DJNZ TKNNMEQ0
            SCF
            RET
TKNNMEQ1: ;@NUC-GLOBAL TokenNameEqualsNo PERMANENT TKNNMEQ1
            OR   A
            RET

; Compare the current NAME token with the retained name record at HL. The
; record begins with a pointer word followed by a one-byte length.
;@ROUTINE IN BC,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,DE
TKNNMRCR: ;@NUC-GLOBAL TokenNameRecordEquals PERMANENT TKNNMRCR
            PUSH BC
            PUSH HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   A,(HL)
            LD   B,A
            EX   DE,HL
            CALL TKNNMEQL
            POP  HL
            POP  BC
            RET

; Store the current NAME token's pointer and length in the three-byte record
; at HL. HL returns at the length byte, matching the former inline sequences.
;@ROUTINE IN HL OUT A,BC,HL CLOBBERS CARRY,ZERO,SIGN,PARITY,HALFCARRY
TKNRTNNM: ;@NUC-GLOBAL TokenRetainNameAtHL PERMANENT TKNRTNNM
            LD   BC,(TKNLXMPN)
            LD   (HL),C
            INC  HL
            LD   (HL),B
            INC  HL
            LD   A,(TKNLNGTH)
            LD   (HL),A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
TKNSCNNM: ;@NUC-GLOBAL TokenScanName PERMANENT TKNSCNNM
            LD   B,0
TKNSCNN0: ;@NUC-GLOBAL TokenScanNameLoop PERMANENT TKNSCNN0
            CALL SRCPK
            JR   C,TKNSCNN1
            CALL TKNISNMB
            JR   NC,TKNSCNN1
            CALL SRCTK
            INC  B
            JR   Z,TKNLXCLF
            JR   TKNSCNN0
TKNSCNN1: ;@NUC-GLOBAL TokenScanNameDone PERMANENT TKNSCNN1
            LD   A,B
            LD   (TKNLNGTH),A
            LD   HL,KYWRDTBL
            LD   C,KYWRDCNT
.L00000:
            LD   B,(HL)
            INC  HL
            LD   A,(TKNLNGTH)
            CP   B
            JR   NZ,.L00002
            LD   DE,(TKNLXMPN)
.L00001:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,.L00002
            INC  DE
            INC  HL
            DJNZ .L00001
            LD   A,(HL)
            JP   TKNFNSH
.L00002:
            LD   E,B
            LD   D,0
            ADD  HL,DE
            INC  HL
            DEC  C
            JR   NZ,.L00000
            LD   A,TKNNM
            JP   TKNFNSH

; Scan one or more decimal digits and reject a value above 65535. BC carries
; the exact unsigned literal payload to the predictive parser.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
TKNSCNN2: ;@NUC-GLOBAL TokenScanNumber PERMANENT TKNSCNN2
            LD   HL,0
.L00000:
            PUSH HL
            CALL SRCPK
            POP  HL
            JR   C,TKNSCNN4
            CP   '0'
            JR   C,TKNSCNN3
            CP   '9'+1
            JR   NC,TKNSCNN3
            SUB  '0'
            LD   C,A
            LD   A,H
            CP   $19
            JR   C,.L00001
            JR   NZ,TKNSCNC0
            LD   A,L
            CP   $99
            JR   C,.L00001
            JR   NZ,TKNSCNC0
            LD   A,C
            CP   6
            JR   NC,TKNSCNC0
.L00001:
            LD   D,0
            LD   E,C
            ADD  HL,HL
            LD   B,H
            LD   C,L
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,BC
            ADD  HL,DE
            PUSH HL
            CALL SRCTK
            POP  HL
            JR   .L00000
TKNSCNN3: ;@NUC-GLOBAL TokenScanNumberDone PERMANENT TKNSCNN3
            ; An integer token cannot be followed immediately by a name byte.
            ; Reject forms such as 0x2a and 12u8 as one malformed number rather
            ; than exposing a misleading number/name token pair to the parser.
            CALL TKNISNMB
            JP   C,TKNLXCLF
TKNSCNN4: ;@NUC-GLOBAL TokenScanNumberEof PERMANENT TKNSCNN4
            LD   B,H
            LD   C,L
            LD   A,TKNNMBR
            JP   TKNFNSH

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
TKNSCNCH: ;@NUC-GLOBAL TokenScanCharacter PERMANENT TKNSCNCH
            CALL SRCTK
            JR   C,TKNSCNC0
            CALL SRCTK
            JR   C,TKNSCNC0
            CP   $20
            JR   C,TKNSCNC0
            CP   $7F
            JR   NC,TKNSCNC0
            CP   '\''
            JR   Z,TKNSCNC0
            CP   '\\'
            JR   Z,TKNSCNC0
            LD   C,A
            CALL SRCTK
            JR   C,TKNSCNC0
            CP   '\''
            JR   NZ,TKNSCNC0
            LD   A,TKNCHRCT
            JP   TKNFNSH
TKNSCNC0: ;@NUC-GLOBAL TokenScanCharacterFailure PERMANENT TKNSCNC0
            JP   TKNLXCLF

; Return carry and the decoded nibble for one hexadecimal digit. Tokenization
; needs only the validity flag; the static-image decoder reuses the value.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
TKNISHXD: ;@NUC-GLOBAL TokenIsHexDigit PERMANENT TKNISHXD
            CP   '0'
            JR   C,.L00001
            CP   '9'+1
            JR   C,.L00000
            OR   $20
            SUB  'a'
            CP   6
            JR   NC,.L00001
            ADD  A,10
            SCF
            RET
.L00000:
            SUB  '0'
            SCF
            RET
.L00001:
            OR   A
            RET

; Scan and validate a bounded-string literal. BC returns the decoded byte
; length. TokenLexemePointer continues to identify the opening quote so the
; declaration parser can decode the bytes directly into the static image.
;@ROUTINE OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
TKNSCNST: ;@NUC-GLOBAL TokenScanString PERMANENT TKNSCNST
            CALL SRCTK
            JR   C,TKNSCNC0
            LD   C,0
.L00000:
            CALL SRCTK
            JR   C,TKNSCNC0
            CP   '"'
            JR   Z,.L00005
            CP   $20
            JR   C,TKNSCNC0
            CP   $7F
            JR   NC,TKNSCNC0
            CP   '\\'
            JR   Z,.L00002
.L00001:
            INC  C
            JR   Z,TKNSCNC0
            JR   .L00000
.L00002:
            CALL SRCTK
            JR   C,TKNSCNC0
            CP   'x'
            JR   Z,.L00004
            LD   HL,STRNGESC
            LD   B,STRNGES0
.L00003:
            CP   (HL)
            JR   Z,.L00001
            INC  HL
            DJNZ .L00003
            JR   TKNSCNC0
.L00004:
            CALL SRCTK
            JR   C,TKNSCNC0
            CALL TKNISHXD
            JR   NC,TKNSCNC0
            CALL SRCTK
            JR   C,TKNSCNC0
            CALL TKNISHXD
            JR   NC,TKNSCNC0
            JR   .L00001
.L00005:
            LD   B,0
            LD   A,C
            LD   (TKNLNGTH),A
            LD   A,TKNSTRNG
            JP   TKNFNSH

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,DE,HL
TKNSKPCM: ;@NUC-GLOBAL TokenSkipComment PERMANENT TKNSKPCM
TKNSKPC0: ;@NUC-GLOBAL TokenSkipCommentLoop PERMANENT TKNSKPC0
            CALL SRCPK
            RET  C
            CP   10
            RET  Z
            CP   13
            RET  Z
            CALL SRCTK
            JR   TKNSKPC0

;@ROUTINE OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
TKNZRNXT: ;@NUC-GLOBAL TokenizerNext PERMANENT TKNZRNXT
TKNZRNX0: ;@NUC-GLOBAL TokenizerNextLoop PERMANENT TKNZRNX0
            CALL TKNRCRDS
            CALL SRCPK
            JP   C,TKNZRATE

            CP   ' '
            JR   Z,TKNZRSKP
            CP   9
            JR   Z,TKNZRSKP
            CP   10
            JP   Z,TKNZRLF
            CP   13
            JP   Z,TKNZRCRL
            CP   '/'
            JR   Z,TKNZRSLS
            CP   '('
            JP   Z,TKNZRLFT
            CP   ')'
            JP   Z,TKNZRRGH
            CP   '['
            JP   Z,TKNZRLF0
            CP   ']'
            JP   Z,TKNZRRG0
            CP   '<'
            JR   Z,TKNZRLSS
            CP   '>'
            JR   Z,TKNZRGRT
            LD   HL,PNCTTNTB
            LD   B,PNCTTNCN
.L00000:
            CP   (HL)
            INC  HL
            JP   Z,TKNZRPNC
            INC  HL
            DJNZ .L00000
            CP   '\''
            JP   Z,TKNSCNCH
            CP   '"'
            JP   Z,TKNSCNST
            CP   '0'
            JR   C,.L00001
            CP   '9'+1
            JP   C,TKNSCNN2
.L00001:
            CALL TKNISLTT
            JP   C,TKNSCNNM
            JR   TKNZRLXC

TKNZRSKP: ;@NUC-GLOBAL TokenizerSkipByte PERMANENT TKNZRSKP
            CALL SRCTK
            JR   TKNZRNX0

TKNZRSLS: ;@NUC-GLOBAL TokenizerSlash PERMANENT TKNZRSLS
            CALL SRCTK
            CALL SRCPK
            JR   C,.L00000
            CP   '/'
            JR   NZ,.L00000
            CALL SRCTK
            CALL TKNSKPCM
            JR   TKNZRNX0
.L00000:
            LD   A,TKNSLSH
            JP   TKNFNSH

TKNZRLSS: ;@NUC-GLOBAL TokenizerLess PERMANENT TKNZRLSS
            CALL SRCTK
            CALL SRCPK
            JR   C,.L00000
            CP   '='
            JR   Z,.L00001
            CP   '>'
            JR   Z,.L00002
.L00000:
            LD   A,TKNLSS
            JP   TKNFNSH
.L00001:
            LD   C,TKNLSSEQ
            JR   TKNZRSMP
.L00002:
            LD   C,TKNNTEQL
            JR   TKNZRSMP

TKNZRGRT: ;@NUC-GLOBAL TokenizerGreater PERMANENT TKNZRGRT
            CALL SRCTK
            CALL SRCPK
            JR   C,.L00000
            CP   '='
            JR   Z,.L00001
.L00000:
            LD   A,TKNGRTR
            JP   TKNFNSH
.L00001:
            LD   C,TKNGRTRE
            JR   TKNZRSMP

TKNZRLFT: ;@NUC-GLOBAL TokenizerLeftParen PERMANENT TKNZRLFT
            LD   C,TKNLFTPR
            JR   TKNZRLF1

TKNZRRGH: ;@NUC-GLOBAL TokenizerRightParen PERMANENT TKNZRRGH
            LD   C,TKNRGHTP
            JR   TKNZRRG1

TKNZRLF0: ;@NUC-GLOBAL TokenizerLeftBracket PERMANENT TKNZRLF0
            LD   C,TKNLFTBR
TKNZRLF1: ;@NUC-GLOBAL TokenizerLeftDelimiter PERMANENT TKNZRLF1
            CALL SRCTK
            LD   A,(SRCDLMTR)
            INC  A
            JR   Z,TKNZRLXC
            LD   (SRCDLMTR),A
            LD   A,C
            JP   TKNFNSH

TKNZRRG0: ;@NUC-GLOBAL TokenizerRightBracket PERMANENT TKNZRRG0
            LD   C,TKNRGHTB
TKNZRRG1: ;@NUC-GLOBAL TokenizerRightDelimiter PERMANENT TKNZRRG1
            LD   A,(SRCDLMTR)
            OR   A
            JR   Z,TKNZRLXC
            DEC  A
            LD   (SRCDLMTR),A
            CALL SRCTK
            LD   A,C
            JP   TKNFNSH

TKNZRLXC: ;@NUC-GLOBAL TokenizerLexicalFailure PERMANENT TKNZRLXC
            JP   TKNLXCLF

TKNZRPNC: ;@NUC-GLOBAL TokenizerPunctuation PERMANENT TKNZRPNC
            LD   C,(HL)
            BIT  7,C
            JR   NZ,TKNZRBSD
TKNZRSMP: ;@NUC-GLOBAL TokenizerSimpleToken PERMANENT TKNZRSMP
            CALL SRCTK
            LD   A,C
            JP   TKNFNSH
TKNZRBSD: ;@NUC-GLOBAL TokenizerBasedNumber PERMANENT TKNZRBSD
            RES  7,C
            LD   B,C
            JR   TKNSCNBS

TKNZRLF: ;@NUC-GLOBAL TokenizerLf PERMANENT TKNZRLF
            CALL SRCTK
            JR   TKNZRFNS
TKNZRCRL: ;@NUC-GLOBAL TokenizerCrLf PERMANENT TKNZRCRL
            CALL SRCTK
            CALL SRCPK
            JR   C,TKNZRLXC
            CP   10
            JR   NZ,TKNZRLXC
            CALL SRCTK
TKNZRFNS: ;@NUC-GLOBAL TokenizerFinishLine PERMANENT TKNZRFNS
            CALL SRCFNSHL
            LD   A,(SRCDLMTR)
            OR   A
            JP   NZ,TKNZRNX0
            LD   A,(SRCLNHST)
            OR   A
            JP   Z,TKNZRNX0
            XOR  A
            LD   (SRCLNHST),A
            LD   A,TKNNWLN
            OR   A
            RET

TKNZRATE: ;@NUC-GLOBAL TokenizerAtEof PERMANENT TKNZRATE
            LD   A,(SRCDLMTR)
            OR   A
            JR   NZ,TKNZRLXC
%IF AggregateCallSlices
            LD   A,(SRCPRTPN)
            OR   A
            JR   NZ,.L00000
            LD   A,(SRCPRTSR)
            OR   A
            JR   Z,.L00001
            LD   A,(SRCLNHST)
            OR   A
            JR   Z,.L00000
            XOR  A
            LD   (SRCLNHST),A
            INC  A
            LD   (SRCPRTPN),A
            LD   A,TKNNWLN
            OR   A
            RET
.L00000:
            XOR  A
            LD   (SRCPRTPN),A
            LD   HL,SRCPRTSR
            DEC  (HL)
            LD   HL,(SRCPRTDS)
            CALL SRCLDPRT
            JP   TKNZRNX0
.L00001:
%ENDIF
            LD   A,(SRCLNHST)
            OR   A
            JR   Z,TKNZREMT
            XOR  A
            LD   (SRCLNHST),A
            LD   A,TKNNWLN
            OR   A
            RET
TKNZREMT: ;@NUC-GLOBAL TokenizerEmitEof PERMANENT TKNZREMT
            LD   A,TokenEof
            OR   A
            RET

;@ROUTINE IN BC OUT A,BC,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
TKNSCNBS: ;@NUC-GLOBAL TokenScanBasedNumber PERMANENT TKNSCNBS
            CALL SRCTK
            LD   HL,0
.L00000:
            LD   D,0
            PUSH HL
            CALL SRCPK
            POP  HL
            JR   C,.L00004
            LD   D,A
            BIT  4,C
            JR   NZ,.L00001
            CALL TKNISHXD
            JR   C,.L00002
            JR   .L00004
.L00001:
            SUB  '0'
            JR   C,.L00004
            CP   2
            JR   C,.L00002
            JR   .L00004
.L00002:
            DEC  B
            JR   Z,.L00005
            LD   E,A
            BIT  4,C
            JR   NZ,.L00003
            ADD  HL,HL
            ADD  HL,HL
            ADD  HL,HL
.L00003:
            ADD  HL,HL
            LD   A,E
            OR   L
            LD   L,A
            PUSH HL
            CALL SRCTK
            POP  HL
            JR   .L00000
.L00004:
            LD   A,B
            CP   C
            JR   Z,.L00005
            LD   A,D
            OR   A
            JP   Z,TKNSCNN4
            JP   TKNSCNN3
.L00005:
            JP   TKNLXCLF

STRNGESC:      DB "0nrt",$27,$22,"\\" ;@NUC-GLOBAL StringEscapeTable PERMANENT STRNGESC
STRNGES0       EQU 7 ;@NUC-GLOBAL StringEscapeCount PERMANENT STRNGES0
