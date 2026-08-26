; Bounded forward literal search with one committed query per execution.

EditorSearchCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IXH,IXL,IYH,IYL
EditorSearchBegin:
            LD   HL,EditorQueryLength
            LD   DE,EditorDma
            LD   BC,EditorQueryCapacity+1
            LDIR
            LD   HL,EditorQueryLength
            LD   DE,EditorSearchPrompt
            CALL EditorLiteralInput
            JR   C,EditorSearchCancel
            LD   A,(EditorQueryLength)
            OR   A
            JP   NZ,EditorSearchInitial
EditorSearchCancel:
            LD   HL,EditorDma
            LD   DE,EditorQueryLength
            LD   BC,EditorQueryCapacity+1
            LDIR
EditorReadyReturn:
            XOR  A
            LD   (EditorStatus),A
            RET

; Read one bounded literal into the length byte and contiguous payload at HL.
; DE selects its reverse-video prompt. Escape returns carry set; Return returns
; carry clear. Unsupported controls ring locally and leave the literal intact.
.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorLiteralInput:
            LD   (EditorRenderPointer),HL
            LD   (EditorRenderColumn),DE
EditorLiteralInputRender:
            LD   DE,(EditorRenderColumn)
            CALL EditorRenderLiteral
EditorLiteralInputRead:
            CALL EditorReadByte
            CP   27
            JR   Z,EditorLiteralInputCancel
            CP   13
            RET  Z
            CP   8
            JR   Z,EditorLiteralInputDelete
            CP   9
            JR   Z,EditorLiteralInputAppend
            CP   32
            JR   C,EditorLiteralInputRing
            CP   127
            JR   C,EditorLiteralInputAppend
            JR   Z,EditorLiteralInputDelete
EditorLiteralInputRing:
            LD   A,7
            CALL EditorOutputByte
            JR   EditorLiteralInputRead
EditorLiteralInputDelete:
            LD   HL,(EditorRenderPointer)
            LD   A,(HL)
            OR   A
            JR   Z,EditorLiteralInputRing
            DEC  (HL)
            JR   EditorLiteralInputRender
EditorLiteralInputAppend:
            LD   C,A
            LD   HL,(EditorRenderPointer)
            LD   A,(HL)
            CP   EditorQueryCapacity
            JR   NC,EditorLiteralInputRing
            INC  (HL)
            INC  HL
            LD   E,A
            LD   D,0
            ADD  HL,DE
            LD   (HL),C
            JR   EditorLiteralInputRender
EditorLiteralInputCancel:
            SCF
            RET

.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorRenderLiteral:
            CALL EditorStatusBegin
            LD   HL,(EditorRenderPointer)
            LD   A,(HL)
            OR   A
            JR   Z,EditorRenderLiteralFill
            LD   B,A
            INC  HL
EditorRenderLiteralLoop:
            LD   A,(HL)
            CP   9
            JR   NZ,EditorRenderLiteralByte
            LD   A,'>'
EditorRenderLiteralByte:
            PUSH HL
            PUSH BC
            CALL EditorStatusByte
            POP  BC
            POP  HL
            INC  HL
            DJNZ EditorRenderLiteralLoop
EditorRenderLiteralFill:
            LD   HL,(EditorRenderCount)
            LD   H,L
            LD   L,23
            LD   (EditorCursorScreenRow),HL
            JP   EditorStatusFill

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IXH,IXL,IYH,IYL
EditorSearchInitial:
            LD   HL,(EditorCursor)
            JR   EditorSearchCheckQuery

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSearchRepeat:
            LD   HL,(EditorCursor)
            INC  HL
EditorSearchCheckQuery:
            LD   A,(EditorQueryLength)
            OR   A
            JR   Z,EditorSearchNoQuery
            LD   C,A

EditorSearchStart:
            LD   A,EditorStatusFound
            LD   (EditorStatus),A
            LD   DE,(EditorLength)
            LD   (EditorScratchA),DE
            JR   EditorSearchNormalize

EditorSearchAdvance:
            LD   HL,(EditorScratchB)
            INC  HL
            LD   DE,(EditorLength)
EditorSearchNormalize:
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,EditorSearchStartReady
            SBC  HL,HL
            LD   A,EditorStatusWrapped
            LD   (EditorStatus),A
EditorSearchStartReady:
            LD   (EditorScratchB),HL

EditorSearchLoop:
            LD   HL,(EditorScratchA)
            LD   A,H
            OR   L
            JR   Z,EditorSearchNotFound
            DEC  HL
            LD   (EditorScratchA),HL
            LD   HL,(EditorScratchB)
            CALL EditorReplaceMatchAt
            JR   NZ,EditorSearchAdvance
EditorSearchFound:
            LD   HL,(EditorScratchB)
            LD   (EditorCursor),HL
            LD   HL,EditorFlags
            RES  2,(HL)
            LD   A,(EditorStatus)
            OR   A
            RET

EditorSearchNoQuery:
            LD   A,EditorStatusNoSearch
            JR   EditorSearchFailure
EditorSearchNotFound:
            LD   A,EditorStatusNotFound
EditorSearchFailure:
            LD   (EditorStatus),A
            SCF
            RET
EditorSearchCodeEnd:
