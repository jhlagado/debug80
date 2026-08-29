TOUTRNL EQU 70
TOUTRUN EQU 0
TOUTTRP EQU 1
TOFLGLM EQU 2
TOSTK02 EQU 3842
TOVEC03 EQU 36
TOEXL03 EQU 367
TOIXRIH EQU 1
TOIXIBH EQU 3
TOIXICH EQU 5
TOIXWBH EQU 7
TOIXWCH EQU 9
TOIXRID EQU 0
TOIXFLG EQU 10
TOIXIBS EQU 2
TOIXICP EQU 4
TOIXWBS EQU 6
TOIXWCP EQU 8

; Flat append-only target output. The operating adapter owns NOBJ framing,
; service destinations, image fill, CRC, and the two sequential spools.


; Emit entry opcode A followed by one retained zero-word fixup operand.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
TRGTEMTE: ;@NUC-GLOBAL TargetEmitEntryPlaceholder PERMANENT TRGTEMTE
            CALL EmitByte
            RET  C
            LD   HL,(EMTCRSR)
            LD   (EMTDTFXP),HL
            LD   HL,0
            JP   EmitWord

; Emit one terminal-state byte comparison. DE selects the runtime-state byte
; and C supplies the expected value.
;@ROUTINE IN C,DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
TRGTEMTT: ;@NUC-GLOBAL TargetEmitTerminalTest PERMANENT TRGTEMTT
            PUSH BC
            CALL TRGTSTTA
            LD   A,$3A                    ; LD A,(nn)
            CALL EMTOPCDW
            POP  BC
            RET  C
            LD   A,$FE                    ; CP n
            CALL EMTOPCDB
            RET  C
            LD   HL,TRGTTRM0
            JP   EmitPair

; IX points at the stable compact descriptor supplied by the adapter.
;@ROUTINE IN IX OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
BGNTRGTF: ;@NUC-GLOBAL BeginTargetFlatProgram PERMANENT BGNTRGTF
            LD   A,TRGTOTP0
            LD   (TRGTOTPT),A
            LD   L,(IX+TOIXRID)
            LD   H,(IX+TOIXRIH)
            LD   DE,NCLSRNTM
            OR   A
            SBC  HL,DE
            JP   NZ,TRGTCNFG
            LD   A,(IX+TOIXFLG)
            CP   TOFLGLM
            JP   NC,TRGTCNFG
            LD   (TRGTSTC0),A
            LD   L,(IX+TOIXIBS)
            LD   H,(IX+TOIXIBH)
            LD   (TRGTIMGB),HL
            LD   E,(IX+TOIXICP)
            LD   D,(IX+TOIXICH)
            LD   (TRGTIMGC),DE
            CALL TRGTVLDT
            RET  C
            LD   L,(IX+TOIXWBS)
            LD   H,(IX+TOIXWBH)
            LD   (TRGTWRTB),HL
            LD   E,(IX+TOIXWCP)
            LD   D,(IX+TOIXWCH)
            LD   (TRGTWRT0),DE
            CALL TRGTVLDT
            RET  C
            CALL TRGTCLSS
            RET  C
            ; Determine the exact startup extent and validate the optional
            ; established stack before the adapter opens a generation.
            LD   HL,26                   ; JP/CALL main plus terminal dispatch
            LD   A,(TRGTLYTM)
            OR   A
            JR   Z,.L00000
            LD   DE,11                   ; LD HL/DE/BC plus LDIR
            ADD  HL,DE
.L00000:
            LD   DE,(PRGRMBSS)
            LD   A,D
            OR   E
            JR   Z,.L00001
            LD   DE,9                    ; LD HL/BC plus CALL InitializeBss
            ADD  HL,DE
.L00001:
            LD   A,(TRGTSTC0)
            OR   A
            JR   Z,.L00004
            LD   DE,13                   ; save/select SP plus terminal restore
            ADD  HL,DE
            PUSH HL
            CALL TRGTINTL
            JR   C,.L00002
            LD   DE,(PRGRMBSS)
            ADD  HL,DE
            JR   C,.L00002
            LD   DE,TOSTK02
            ADD  HL,DE
            JR   C,.L00002
            LD   DE,(TRGTWRT0)
            OR   A
            SBC  HL,DE
            JR   C,.L00003
            JR   Z,.L00003
.L00002:
            POP  HL
            JR   TRGTCPCT
.L00003:
            POP  HL
.L00004:
            LD   (TRGTSTRT),HL
            LD   A,(TRGTDSCB)
            CP   1
            JP   NZ,TRGTBGNB
            LD   HL,(RDONLYIM)
            LD   A,(TRGTLYTM)
            OR   A
            JR   Z,.L00005
            LD   DE,(STTCIMGL)
            ADD  HL,DE
            JR   C,.L00006
            LD   DE,TOUTRNL
            ADD  HL,DE
            JR   C,.L00006
.L00005:
            LD   (TRGTRDO0),HL
            LD   DE,TOEXL03
            ADD  HL,DE
            JR   C,.L00006
            LD   DE,(TRGTSTRT)
            ADD  HL,DE
            JR   C,.L00006
            EX   DE,HL                    ; DE is fixed prefix length
            LD   HL,(TRGTIMGC)
            OR   A
            SBC  HL,DE
            JR   C,.L00006
            LD   A,H
            OR   L
            JR   Z,.L00006 ; at least one code byte is required
            LD   (EMTLMT),HL           ; remaining code capacity after prefix
            LD   HL,(TRGTIMGB)
            ADD  HL,DE
            JR   C,.L00006
            LD   (TRGTCDBS),HL
            LD   HL,(EMTLMT)
            LD   (TRGTCDCP),HL
            LD   A,(TRGTLYTM)
            OR   A
            JR   NZ,TRGTCDC0
            LD   DE,(TRGTCDBS)
            LD   HL,(TRGTWRTB)
            OR   A
            SBC  HL,DE
            JR   C,.L00006
            JR   Z,.L00006
            LD   (TRGTCDCP),HL
            JR   TRGTCDC0
.L00006:
TRGTCPCT: ;@NUC-GLOBAL TargetCapacityFailure PERMANENT TRGTCPCT
            LD   A,DGNSTCT3
            JP   CMPLRSTD
TRGTCDC0: ;@NUC-GLOBAL TargetCodeCapacityReady PERMANENT TRGTCDC0

            LD   IX,(TRGTDSCA)
            CALL TRGTSNKB
            JP   C,TRGTOTP1
            XOR  A
            LD   (TRGTOTPT),A
            LD   HL,(TRGTIMGB)
            LD   (EMTCRSR),HL
            LD   HL,(TRGTIMGC)
            LD   (EMTLMT),HL
            LD   A,$C3
            CALL TRGTEMTE
            RET  C

            LD   HL,(EMTCRSR)
            LD   (TRGTLNKD),HL
            LD   DE,NCLSRNT0
            ADD  HL,DE
            JR   C,TRGTCPCT
            LD   DE,(TRGTSTRT)
            ADD  HL,DE
            JR   C,TRGTCPCT
            LD   (TRGTRDON),HL
            CALL TRGTPRPR
            RET  C
            LD   HL,(TRGTLNKD)
            XOR  A
            CALL TRGTEMTR
            RET  C
            JP   TRGTEMTS

; Address one retained output-bank cursor and exact remaining-capacity word.
;@ROUTINE IN A OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE
TRGTBNK7: ;@NUC-GLOBAL TargetBankStateAddress PERMANENT TRGTBNK7
            LD   L,A
            LD   H,0
            ADD  HL,HL
            ADD  HL,HL
            LD   DE,TRGTBNK2
            ADD  HL,DE
            OR   A
            RET

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,D,DE,HL
TRGTSVOT: ;@NUC-GLOBAL TargetSaveOutputBank PERMANENT TRGTSVOT
            LD   A,(TRGTOTPT)
            CP   TRGTOTP0
            RET  Z
            CALL TRGTBNK7
            LD   DE,(EMTCRSR)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   DE,(EMTLMT)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            OR   A
            RET

; Select the bank that receives subsequent generated bytes and derive the
; bank-local aggregate-constant bounds carried by generated region checks.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,D,DE,HL
TRGTSLCT: ;@NUC-GLOBAL TargetSelectOutputBank PERMANENT TRGTSLCT
            LD   C,A
            LD   A,(TRGTDSCB)
            DEC  A
            CP   C
            JP   C,TRGTCNFG
            LD   A,(TRGTOTPT)
            CP   C
            RET  Z
            CALL TRGTSVOT
            LD   A,C
            LD   (TRGTOTPT),A
            CALL TRGTBNK7
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            LD   (EMTCRSR),DE
            INC  HL
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            LD   (EMTLMT),DE
            LD   A,(TRGTOTPT)
            CALL TRGTBNKR
            LD   C,(HL)
            INC  HL
            LD   B,(HL)
            LD   (TRGTCRR1),BC
            LD   HL,(TRGTIMGB)
            LD   DE,TOEXL03
            ADD  HL,DE
            LD   A,(TRGTOTPT)
            LD   D,A
            LD   A,(TRGTDSCC)
            CP   D
            JR   NZ,.L00000
            LD   DE,(TRGTSTRT)
            ADD  HL,DE
            LD   DE,TOUTRNL
            ADD  HL,DE
            LD   DE,(STTCIMGL)
            ADD  HL,DE
.L00000:
            LD   (TRGTCRR2),HL
            OR   A
            RET

; Consume DE bytes from the selected bank after one provider operation.
;@ROUTINE IN DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,HL
TRGTCNSM: ;@NUC-GLOBAL TargetConsumeExtent PERMANENT TRGTCNSM
            LD   HL,(EMTLMT)
            OR   A
            SBC  HL,DE
            JP   C,TRGTCPCT
            LD   B,H
            LD   C,L
            LD   HL,(EMTCRSR)
            ADD  HL,DE
            JR   NC,.L00000
            LD   A,B
            OR   C
            JP   NZ,TRGTCPCT
.L00000:
            LD   (EMTCRSR),HL
            LD   (EMTLMT),BC
            OR   A
            RET

; Ask the context-sensitive provider for one complete resolved runtime and
; consume its identity-fixed extent from the selected bank.
;@ROUTINE IN A,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
TRGTEMTR: ;@NUC-GLOBAL TargetEmitRuntimeImage PERMANENT TRGTEMTR
            LD   DE,NCLSRNTM
            LD   BC,NCLSRNT0
            LD   IX,TRGTRNT1
            CALL TRGTSNKR
            LD   DE,NCLSRNT0
TRGTCNS0: ;@NUC-GLOBAL TargetConsumeProviderExtent PERMANENT TRGTCNS0
            JP   C,TRGTOTP1
            JR   TRGTCNSM

; Banked output is always ROM. Initialize one retained cursor/capacity pair
; per bank, emit every uniform runtime, the entry-only startup/initial image,
; and then the declaration-ordered aggregate constants before source code.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
TRGTBGNB: ;@NUC-GLOBAL TargetBeginBankedProgram PERMANENT TRGTBGNB
            LD   A,(TRGTLYTM)
            OR   A
            JP   Z,TRGTCNFG
            LD   HL,(TRGTIMGB)
            LD   DE,3
            ADD  HL,DE
            LD   (TRGTLNKD),HL
            LD   HL,0
            LD   (TRGTRDON),HL
            CALL TRGTPRPR
            RET  C
            LD   IX,(TRGTDSCA)
            CALL TRGTSNKB
            JP   C,TRGTOTP1
            LD   A,(TRGTDSCB)
            LD   B,A
            LD   HL,TRGTBNK2
.L00000:
            LD   DE,(TRGTIMGB)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   DE,(TRGTIMGC)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            DJNZ .L00000
            LD   A,TRGTOTP0
            LD   (TRGTOTPT),A
            LD   C,0
.L00001:
            LD   A,C
            PUSH BC
            CALL TRGTSLCT
            POP  BC
            RET  C
            LD   A,(TRGTDSCC)
            CP   C
            JR   NZ,.L00002
            LD   A,$C3
            PUSH BC
            CALL TRGTEMTE
            POP  BC
            RET  C
            JR   .L00003
.L00002:
            LD   DE,3
            PUSH BC
            CALL TRGTCNSM
            POP  BC
            RET  C
.L00003:
            PUSH BC
            LD   A,C
            LD   HL,(TRGTLNKD)
            CALL TRGTEMTR
            POP  BC
            RET  C
            LD   A,(TRGTDSCC)
            CP   C
            JR   NZ,.L00004
            LD   HL,(EMTCRSR)
            LD   DE,(TRGTSTRT)
            ADD  HL,DE
            JP   C,TRGTCPCT
            LD   (TRGTRDON),HL
            CALL TRGTEMTS
            RET  C
            LD   HL,(EMTCRSR)
            CALL TRGTEMT1
            RET  C
            PUSH BC
            LD   HL,STTCIMGB
            LD   BC,(STTCIMGL)
            CALL EMTBLCK
            POP  BC
            RET  C
.L00004:
            LD   A,(TRGTOTPT)
            LD   C,A
            INC  C
            LD   A,(TRGTDSCB)
            CP   C
            JR   NZ,.L00001
            JP   TRGTEMTB

; HL is a region base and DE a nonzero capacity. Carry reports every wrapped
; end except the legal exact mathematical end $10000.
;@ROUTINE IN DE,HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,HL
TRGTVLDT: ;@NUC-GLOBAL TargetValidateRegion PERMANENT TRGTVLDT
            LD   A,D
            OR   E
            JP   Z,TRGTCPCT
            ADD  HL,DE
            JR   NC,.L00000
            LD   A,H
            OR   L
            JP   NZ,TRGTCPCT
.L00000:
            OR   A
            RET

; Classify two checked nonempty regions without storing an exclusive $10000
; end in a word. Loaded means writable is wholly inside image; ROM means the
; half-open regions are disjoint. Every partial overlap is rejected.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
TRGTCLSS: ;@NUC-GLOBAL TargetClassifyFlatLayout PERMANENT TRGTCLSS
            LD   HL,(TRGTWRTB)
            LD   DE,(TRGTIMGB)
            OR   A
            SBC  HL,DE                    ; writable offset from image base
            JR   C,.L00000
            LD   DE,(TRGTIMGC)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  BC                       ; BC = writable offset
            JR   NC,.L00001    ; starts at or after image end
            LD   HL,(TRGTIMGC)
            OR   A
            SBC  HL,BC                    ; remaining image capacity
            LD   DE,(TRGTWRT0)
            OR   A
            SBC  HL,DE
            JP   C,TRGTCNFG
            XOR  A
            LD   (TRGTLYTM),A
            RET
.L00000:
            LD   HL,(TRGTIMGB)
            LD   DE,(TRGTWRTB)
            OR   A
            SBC  HL,DE                    ; distance to image start
            LD   DE,(TRGTWRT0)
            OR   A
            SBC  HL,DE
            JP   C,TRGTCNFG
.L00001:
            LD   A,TRGTLYTR
            LD   (TRGTLYTM),A
            OR   A
            RET

; Build the compiler-owned portion of the complete operating-layer link
; context. Service destinations are supplied by the adapter at this call.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
TRGTPRPR: ;@NUC-GLOBAL TargetPrepareRuntimeContext PERMANENT TRGTPRPR
            LD   HL,(TRGTLNKD)
            LD   (TRGTCNTX),HL
            LD   HL,(TRGTWRTB)
            LD   (TRGTCNT0),HL
            LD   DE,(TRGTWRT0)
            LD   (TRGTCNT1),DE
            LD   (TRGTCNT3),HL
            LD   DE,NCLSRNT2
            ADD  HL,DE
            JR   C,.L00003
            LD   (TRGTCNT2),HL
            LD   DE,NCLSRNT3
            ADD  HL,DE
            JR   C,.L00003
            LD   (TRGTCNT4),HL
            LD   BC,(STTCIMGL)
            LD   DE,(PRGRMBSS)
            LD   H,B
            LD   L,C
            ADD  HL,DE
            JR   C,.L00003
            LD   (TRGTCNT5),HL
            LD   HL,(TRGTCNT4)
            LD   DE,(STTCIMGL)
            ADD  HL,DE
            JR   C,.L00003
            LD   (TRGTBSSB),HL
            LD   A,(TRGTDSCB)
            CP   1
            JR   Z,.L00000
            LD   HL,0
            LD   (TRGTCNT6),HL
            LD   (TRGTCNT7),HL
            JR   .L00002
.L00000:
            LD   HL,(TRGTRDON)
            LD   A,(TRGTLYTM)
            OR   A
            JR   Z,.L00001
            LD   DE,TOUTRNL
            ADD  HL,DE
            JR   C,.L00003
            LD   DE,(STTCIMGL)
            ADD  HL,DE
            JR   C,.L00003
.L00001:
            LD   (TRGTCNT6),HL
            LD   HL,(RDONLYIM)
            LD   (TRGTCNT7),HL
.L00002:
            CALL TRGTINTL
            JR   C,.L00003
            LD   DE,(PRGRMBSS)
            ADD  HL,DE
            JR   C,.L00003
            LD   DE,(TRGTWRT0)
            OR   A
            SBC  HL,DE
            JR   C,.L00004
            JR   Z,.L00004
.L00003:
            JP   TRGTCPCT
.L00004:
            XOR  A
            RET

; Emit a call to one identity-fixed helper in the context-linked runtime.
; DE is the helper offset published by nucleus-runtime-identity.asmi.
;@ROUTINE IN DE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTRNTMC: ;@NUC-GLOBAL EmitRuntimeCall PERMANENT EMTRNTMC
            LD   HL,(TRGTLNKD)
            ADD  HL,DE
            JP   EmitCall

; Resolve one identity-fixed writable-state offset for generated operands.
;@ROUTINE IN DE OUT A,HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY
TRGTSTTA: ;@NUC-GLOBAL TargetStateAddress PERMANENT TRGTSTTA
            LD   HL,(TRGTCNT2)
            ADD  HL,DE
            OR   A
            RET

;@ROUTINE OUT DE,HL,CARRY CLOBBERS HALFCARRY
TRGTINTL: ;@NUC-GLOBAL TargetInitializedLength PERMANENT TRGTINTL
            LD   HL,(STTCIMGL)
            LD   DE,TOUTRNL
            ADD  HL,DE
            RET

; A is the identity-defined RAM-vector ordinal. The generated call reaches the
; writable vector rather than an address in the compiler's proof adapter.
;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTTRGTV: ;@NUC-GLOBAL EmitTargetVectorCall PERMANENT EMTTRGTV
            CALL TRGTVCTR
            JP   EmitCall
;@ROUTINE IN A OUT HL,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,A,DE
TRGTVCTR: ;@NUC-GLOBAL TargetVectorAddress PERMANENT TRGTVCTR
            LD   E,A
            ADD  A,A
            ADD  A,E
            LD   E,A
            LD   D,0
            LD   HL,(TRGTCNT3)
            ADD  HL,DE
            RET

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL
EMTTRGT0: ;@NUC-GLOBAL EmitTargetVectorJump PERMANENT EMTTRGT0
            CALL TRGTVCTR
            LD   A,$C3
            JP   EMTOPCDW

; Emit the implicit flat startup at the address already accounted for by
; TargetStartupLength. The entry-slot patch is resolved before source code,
; while the main operand remains the ordinary checked forward fixup.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL
TRGTEMTS: ;@NUC-GLOBAL TargetEmitStartup PERMANENT TRGTEMTS
            LD   DE,(EMTDTFXP)
            LD   HL,(EMTCRSR)
            CALL PTCHWRD
            RET  C
            LD   A,(TRGTSTC0)
            OR   A
            JR   Z,.L00000
            LD   HL,0
            CALL EMTLDHL
            RET  C
            LD   A,$39                    ; ADD HL,SP
            CALL EmitByte
            RET  C
            LD   A,$EB                    ; EX DE,HL
            CALL EmitByte
            RET  C
            LD   HL,(TRGTWRTB)
            LD   DE,(TRGTWRT0)
            ADD  HL,DE                    ; $0000 denotes mathematical $10000
            CALL EMTLDHL
            RET  C
            LD   A,$F9                    ; LD SP,HL
            CALL EmitByte
            RET  C
            LD   A,$D5                    ; PUSH DE, saved incoming SP
            CALL EmitByte
            RET  C
.L00000:
            LD   A,(TRGTLYTM)
            OR   A
            JR   Z,.L00001
            LD   HL,(TRGTRDON)
            CALL EMTLDHL
            RET  C
            LD   DE,(TRGTWRTB)
            CALL EMTLDDEI
            RET  C
            CALL TRGTINTL
            CALL EMTLDBCI
            RET  C
            LD   HL,SGMNTDCP
            CALL EmitPair
            RET  C
.L00001:
            LD   HL,(PRGRMBSS)
            LD   A,H
            OR   L
            JR   Z,.L00002
            LD   HL,(TRGTBSSB)
            CALL EMTLDHL
            RET  C
            LD   HL,(PRGRMBSS)
            CALL EMTLDBCI
            RET  C
            LD   DE,NCLSRNTF
            CALL EMTRNTMC
            RET  C
.L00002:
            LD   A,(TRGTSTC0)
            OR   A
            LD   A,$C3                    ; JP main when inheriting SP
            JR   Z,.L00003
            LD   A,$CD                    ; CALL main before restoring SP
.L00003:
            CALL TRGTEMTE
            RET  C
            LD   HL,(EMTCRSR)
            LD   (TRGTTRMN),HL
            LD   A,(TRGTSTC0)
            OR   A
            JR   Z,.L00004
            LD   HL,TRGTSTR0
            LD   B,3
            CALL EMTBYTS
            RET  C
.L00004:
            LD   DE,TOUTRUN
            LD   C,RNSCCDD
            CALL TRGTEMTT
            RET  C
            LD   A,6                      ; success vector
            CALL EMTTRGT0
            RET  C
            LD   DE,TOUTTRP
            LD   C,6                      ; unhandled trap number
            CALL TRGTEMTT
            RET  C
            LD   A,7                      ; unhandled-failure vector
            CALL EMTTRGT0
            RET  C
            LD   A,8                      ; trap vector
            JP   EMTTRGT0

; Publish one truthful coarse source-code segment for single-part flat builds.
; Multipart code needs per-operation source positions before it can be mapped
; without attributing generated bytes to the wrong source part.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,B,C,DE,HL,IX,IY
TRGTEMT0: ;@NUC-GLOBAL TargetEmitSourceProvenanceSinglePart PERMANENT TRGTEMT0
            LD   A,(TRGTSRCP)
            CP   1
            RET  NZ
            LD   HL,(TRGTCDLN)
            LD   A,H
            OR   L
            RET  Z
            LD   DE,(TRGTCDBS)
            ADD  HL,DE
            LD   A,1
            LD   C,0
            JP   TRGTSNK0

; Append the provider-owned initialized vector/state image at its run or load
; address. The same complete context that linked the helper image selects it.
;@ROUTINE IN HL OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
TRGTEMT1: ;@NUC-GLOBAL TargetEmitRuntimeInitialImage PERMANENT TRGTEMT1
            LD   A,(TRGTOTPT)
            LD   DE,NCLSRNTM
            LD   BC,TOUTRNL
            LD   IX,TRGTRNT1
            CALL TRGTSNK3
            LD   DE,TOUTRNL
            JP   TRGTCNS0

;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
FNSHTRGT: ;@NUC-GLOBAL FinishTargetFlatProgram PERMANENT FNSHTRGT
            LD   A,(TRGTDSCB)
            CP   1
            JP   NZ,.L00005
            LD   HL,(EMTCRSR)
            LD   DE,(TRGTCDBS)
            OR   A
            SBC  HL,DE
            LD   (TRGTCDLN),HL
            CALL TRGTEMT0
            JP   C,TRGTFNSH
            ; Loaded output appends the initialized run image after code. ROM
            ; output already emitted the same bytes before source code.
            LD   A,(TRGTLYTM)
            OR   A
            JR   NZ,.L00000
            LD   HL,(TRGTWRTB)
            LD   (EMTCRSR),HL
            XOR  A
            LD   (TRGTOTPT),A
            CALL TRGTINTL
            LD   (EMTLMT),HL
            LD   HL,(TRGTWRTB)
            CALL TRGTEMT1
            JP   C,ABRTTRGT
            LD   HL,STTCIMGB
            LD   BC,(STTCIMGL)
            CALL EMTBLCK
            JP   C,ABRTTRGT
.L00000:
            LD   HL,(RDONLYIM)
            LD   (TRGTMPA0),HL
            LD   A,H
            OR   L
            LD   HL,0
            JR   Z,.L00001
            LD   HL,(TRGTCNT6)
.L00001:
            LD   (TRGTMPAG),HL
            LD   HL,(EMTCRSR)
            LD   DE,(TRGTIMGB)
            OR   A
            SBC  HL,DE
            LD   (TRGTMPUS),HL
            LD   HL,(TRGTIMGB)
            LD   (TRGTMPE0),HL
            XOR  A
            LD   (TRGTMPEN),A
            LD   HL,(TRGTRDON)
            LD   DE,(TRGTRDO0)
            LD   A,D
            OR   E
            JR   NZ,.L00002
            LD   HL,0
.L00002:
            LD   (TRGTMPRD),HL
            LD   (TRGTMPR0),DE
            LD   HL,(TRGTCDBS)
            LD   (TRGTMPCD),HL
            LD   HL,(TRGTCDLN)
            LD   (TRGTMPC0),HL
            LD   HL,(TRGTWRTB)
            LD   (TRGTMPWR),HL
            LD   (TRGTMPIN),HL
            LD   (TRGTMPVC),HL
            LD   HL,(TRGTWRT0)
            LD   (TRGTMPW0),HL
            LD   HL,NCLSRNT2
            LD   (TRGTMPV0),HL
            CALL TRGTINTL
            LD   (TRGTMPI0),HL
            LD   (TRGTMPD1),HL
            LD   HL,(TRGTBSSB)
            LD   (TRGTMPBS),HL
            LD   HL,(PRGRMBSS)
            LD   (TRGTMPB0),HL
            LD   HL,TRGTSTCK
            LD   (TRGTMPST),HL
            XOR  A
            LD   (TRGTMPDT),A
            LD   HL,(TRGTWRTB)
            LD   A,(TRGTLYTM)
            OR   A
            JR   Z,.L00003
            LD   HL,(TRGTRDON)
.L00003:
            LD   (TRGTMPD0),HL
            LD   IX,TRGTFLTM
            CALL TRGTSNKM
.L00004:
            JR   C,TRGTFNSH
            CALL TRGTSNKC
            JR   C,TRGTFNSH
            XOR  A
            RET

; The operating adapter already owns the descriptor, part-bank array, and
; NOBJ encoder. Give it the two compact retained per-bank tables plus the
; common layout state; it deterministically forms and validates the MAP.
;@ROUTINE OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
.L00005:
            CALL TRGTSVOT
            JR   C,TRGTFNSH
            LD   IX,(TRGTDSCA)
            LD   IY,TRGTBNK2
            LD   HL,TRGTBNK0
            CALL TRGTSNK6
            JR   .L00004

;@ROUTINE IN A OUT A,CARRY,ZERO CLOBBERS SIGN,PARITY,HALFCARRY,BC,DE,HL,IX,IY
ABRTTRGT: ;@NUC-GLOBAL AbortTargetProgram PERMANENT ABRTTRGT
            PUSH AF
            LD   A,(TRGTOTPT)
            INC  A
            CALL NZ,TRGTSNKA
            POP  AF
            SCF
            RET

TRGTCNFG: ;@NUC-GLOBAL TargetConfigurationFailure PERMANENT TRGTCNFG
            LD   A,DGNSTCT2
            JR   TRGTDGNS
; A late map or commit failure still owns an open sink generation. Preserve
; the adapter's diagnostic and abort before entering the common output tail.
TRGTFNSH: ;@NUC-GLOBAL TargetFinishOutputFailure PERMANENT TRGTFNSH
            PUSH AF
            CALL TRGTSNKA
            POP  AF
TRGTOTP1: ;@NUC-GLOBAL TargetOutputFailure PERMANENT TRGTOTP1
            OR   A
            JR   NZ,TRGTDGNS
            LD   A,DGNSTCT4
TRGTDGNS: ;@NUC-GLOBAL TargetDiagnosticReady PERMANENT TRGTDGNS
            JP   CMPLRSTD

TRGTSTR0: DB $C1,$E1,$F9  ;@NUC-GLOBAL TargetStartupRestoreBytes PERMANENT TRGTSTR0; discard CALL return / restore SP
