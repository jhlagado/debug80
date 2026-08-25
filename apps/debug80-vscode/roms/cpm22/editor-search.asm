; Bounded forward literal search with one committed query per execution.

EditorSearchCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSearchBegin:
            LD   HL,EditorQueryLength
            LD   DE,EditorDma
            LD   BC,EditorQueryCapacity+1
            LDIR
EditorSearchQueryRender:
            CALL EditorRenderQuery
EditorSearchQueryRead:
            CALL EditorReadByte
            CP   27
            JR   Z,EditorSearchCancel
            CP   13
            JR   Z,EditorSearchAccept
            CP   8
            JR   Z,EditorSearchQueryDelete
            CP   9
            JR   Z,EditorSearchQueryAppend
            CP   32
            JR   C,EditorSearchQueryRing
            CP   127
            JR   C,EditorSearchQueryAppend
            JR   Z,EditorSearchQueryDelete
EditorSearchQueryRing:
            LD   A,7
            CALL EditorOutputByte
            JR   EditorSearchQueryRead
EditorSearchQueryDelete:
            LD   HL,EditorQueryLength
            LD   A,(HL)
            OR   A
            JR   Z,EditorSearchQueryRing
            DEC  (HL)
            JR   EditorSearchQueryRender
EditorSearchQueryAppend:
            LD   C,A
            LD   HL,EditorQueryLength
            LD   A,(HL)
            CP   EditorQueryCapacity
            JR   NC,EditorSearchQueryRing
            INC  (HL)
            INC  HL
            LD   E,A
            LD   D,0
            ADD  HL,DE
            LD   (HL),C
            JR   EditorSearchQueryRender
EditorSearchAccept:
            LD   A,(EditorQueryLength)
            OR   A
            JR   NZ,EditorSearchInitial
EditorSearchCancel:
            LD   HL,EditorDma
            LD   DE,EditorQueryLength
            LD   BC,EditorQueryCapacity+1
            LDIR
            XOR  A
            LD   (EditorStatus),A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorRenderQuery:
            LD   DE,EditorSearchPrompt
            CALL EditorStatusBegin
            LD   A,(EditorQueryLength)
            OR   A
            JR   Z,EditorRenderQueryFill
            LD   B,A
            LD   HL,EditorQueryBuffer
EditorRenderQueryLoop:
            LD   A,(HL)
            CP   9
            JR   NZ,EditorRenderQueryByte
            LD   A,'>'
EditorRenderQueryByte:
            PUSH HL
            PUSH BC
            CALL EditorStatusByte
            POP  BC
            POP  HL
            INC  HL
            DJNZ EditorRenderQueryLoop
EditorRenderQueryFill:
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
            PUSH HL
            LD   A,(EditorQueryLength)
            LD   B,A
            LD   E,A
            LD   D,0
            ADD  HL,DE
            LD   DE,(EditorLength)
            INC  DE
            OR   A
            SBC  HL,DE
            POP  HL
            JR   NC,EditorSearchAdvance
EditorSearchMatchFits:
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   DE,EditorQueryBuffer
EditorSearchMatchLoop:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,EditorSearchAdvance
            INC  DE
            INC  HL
            DJNZ EditorSearchMatchLoop
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
