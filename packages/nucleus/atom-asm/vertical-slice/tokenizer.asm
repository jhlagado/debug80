; Tokenizer subset for the Stage-3 source program. It preserves the normative
; streaming positions and longest-name behavior while recognizing only the
; token families the slice can pass to its parser.

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
            XOR  A
            LD   (TKNLNGTH),A
            RET

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
TKNFNSH: ;@NUC-GLOBAL TokenFinish PERMANENT TKNFNSH
            LD   (TKNKND),A
            LD   A,1
            LD   (SRCLNHST),A
            LD   A,(TKNKND)
            OR   A
            RET

;@ROUTINE OUT CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,HL
TKNLXCLF: ;@NUC-GLOBAL TokenLexicalFailure PERMANENT TKNLXCLF
            LD   A,DGNSTCLX
            JP   CMPLRSTD

; Carry is set when A can begin a Nucleus identifier.
;@ROUTINE IN A OUT A,CARRY CLOBBERS ZERO,SIGN,PARITY,HALFCARRY
TKNISLTT: ;@NUC-GLOBAL TokenIsLetter PERMANENT TKNISLTT
            CP   'A'
            JR   C,.L00000
            CP   'Z'+1
            JR   C,.L00001
            CP   'a'
            JR   C,.L00000
            CP   'z'+1
            JR   C,.L00001
.L00000:
            OR   A
            RET
.L00001:
            SCF
            RET

; Carry is set for identifier continuation bytes.
;@ROUTINE IN A OUT A,CARRY CLOBBERS ZERO,SIGN,PARITY,HALFCARRY
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

; Compare the current NAME token against B bytes at HL. Carry means equal.
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

; Scan a complete name before testing the reserved-word spellings used here.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
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

            LD   HL,KYWRDSB
            LD   B,3
            CALL TKNNMEQL
            JR   C,.L00000
            LD   HL,KYWRDFLS
            LD   B,5
            CALL TKNNMEQL
            JR   C,.L00001
            LD   HL,KYWRDELS
            LD   B,4
            CALL TKNNMEQL
            JR   C,.L00002
            LD   HL,KYWRDFL
            LD   B,4
            CALL TKNNMEQL
            JR   C,.L00003
            LD   HL,KYWRDEND
            LD   B,3
            CALL TKNNMEQL
            JR   C,.L00004
            LD   A,TKNNM
            JP   TKNFNSH
.L00000:
            LD   A,TokenSub
            JP   TKNFNSH
.L00001:
            LD   A,TKNFLS
            JP   TKNFNSH
.L00002:
            LD   A,TKNELS
            JP   TKNFNSH
.L00003:
            LD   A,TKNFL
            JP   TKNFNSH
.L00004:
            LD   A,TokenEnd
            JP   TKNFNSH

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
TKNSCNCH: ;@NUC-GLOBAL TokenScanCharacter PERMANENT TKNSCNCH
            CALL SRCTK
            JP   C,TKNLXCLF
            CALL SRCPK
            JP   C,TKNLXCLF
            CP   $20
            JP   C,TKNLXCLF
            CP   $7F
            JP   NC,TKNLXCLF
            CP   '\''
            JP   Z,TKNLXCLF
            CP   '\\'
            JP   Z,TKNLXCLF
            CALL SRCTK
            LD   (TKNVL),A
            CALL SRCPK
            JP   C,TKNLXCLF
            CP   '\''
            JP   NZ,TKNLXCLF
            CALL SRCTK
            LD   A,TKNCHRCT
            JP   TKNFNSH

; Skip a line comment, leaving its physical line ending for normal handling.
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

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,DE,HL
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
            JR   Z,TKNZRLF
            CP   13
            JR   Z,TKNZRCRL
            CP   '/'
            JR   Z,TKNZRSLS
            CP   '('
            JR   Z,TKNZRLFT
            CP   ')'
            JR   Z,TKNZRRGH
            CP   '\''
            JP   Z,TKNSCNCH
            CALL TKNISLTT
            JP   C,TKNSCNNM
            JP   TKNLXCLF

TKNZRSKP: ;@NUC-GLOBAL TokenizerSkipByte PERMANENT TKNZRSKP
            CALL SRCTK
            JR   TKNZRNX0

TKNZRSLS: ;@NUC-GLOBAL TokenizerSlash PERMANENT TKNZRSLS
            CALL SRCTK
            CALL SRCPK
            JP   C,TKNLXCLF
            CP   '/'
            JP   NZ,TKNLXCLF
            CALL SRCTK
            CALL TKNSKPCM
            JR   TKNZRNX0

TKNZRLFT: ;@NUC-GLOBAL TokenizerLeftParen PERMANENT TKNZRLFT
            CALL SRCTK
            LD   A,(SRCDLMTR)
            INC  A
            JP   Z,TKNLXCLF
            LD   (SRCDLMTR),A
            LD   A,TKNLFTPR
            JP   TKNFNSH

TKNZRRGH: ;@NUC-GLOBAL TokenizerRightParen PERMANENT TKNZRRGH
            LD   A,(SRCDLMTR)
            OR   A
            JP   Z,TKNLXCLF
            DEC  A
            LD   (SRCDLMTR),A
            CALL SRCTK
            LD   A,TKNRGHTP
            JP   TKNFNSH

TKNZRLF: ;@NUC-GLOBAL TokenizerLf PERMANENT TKNZRLF
            CALL SRCTK
            CALL SRCFNSHL
            LD   A,(SRCDLMTR)
            OR   A
            JR   NZ,TKNZRNX0
            LD   A,(SRCLNHST)
            OR   A
            JP   Z,TKNZRNX0
            XOR  A
            LD   (SRCLNHST),A
            LD   A,TKNNWLN
            LD   (TKNKND),A
            OR   A
            RET

TKNZRCRL: ;@NUC-GLOBAL TokenizerCrLf PERMANENT TKNZRCRL
            CALL SRCTK
            CALL SRCPK
            JP   C,TKNLXCLF
            CP   10
            JP   NZ,TKNLXCLF
            CALL SRCTK
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
            LD   (TKNKND),A
            OR   A
            RET

TKNZRATE: ;@NUC-GLOBAL TokenizerAtEof PERMANENT TKNZRATE
            LD   A,(SRCDLMTR)
            OR   A
            JP   NZ,TKNLXCLF
            LD   A,(TKNZREFP)
            OR   A
            JR   NZ,TKNZREMT
            LD   A,(SRCLNHST)
            OR   A
            JR   Z,TKNZREMT
            XOR  A
            LD   (SRCLNHST),A
            INC  A
            LD   (TKNZREFP),A
            LD   A,TKNNWLN
            LD   (TKNKND),A
            OR   A
            RET
TKNZREMT: ;@NUC-GLOBAL TokenizerEmitEof PERMANENT TKNZREMT
            LD   A,TokenEof
            LD   (TKNKND),A
            OR   A
            RET
