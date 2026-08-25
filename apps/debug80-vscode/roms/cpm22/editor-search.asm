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
            CP   127
            JR   Z,EditorSearchQueryDelete
            CP   9
            JR   Z,EditorSearchQueryAppend
            CP   32
            JR   C,EditorSearchQueryRing
            CP   127
            JR   C,EditorSearchQueryAppend
EditorSearchQueryRing:
            LD   A,7
            CALL EditorOutputByte
            JR   EditorSearchQueryRead
EditorSearchQueryDelete:
            LD   A,(EditorQueryLength)
            OR   A
            JR   Z,EditorSearchQueryRing
            DEC  A
            LD   (EditorQueryLength),A
            JR   EditorSearchQueryRender
EditorSearchQueryAppend:
            LD   C,A
            LD   A,(EditorQueryLength)
            CP   EditorQueryCapacity
            JR   NC,EditorSearchQueryRing
            LD   E,A
            LD   D,0
            LD   HL,EditorQueryBuffer
            ADD  HL,DE
            LD   (HL),C
            INC  A
            LD   (EditorQueryLength),A
            JR   EditorSearchQueryRender
EditorSearchAccept:
            LD   A,(EditorQueryLength)
            OR   A
            JR   Z,EditorSearchCancel
            JP   EditorSearchInitial
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
            LD   DE,EditorStatusPosition
            CALL EditorOutputText
            LD   DE,EditorReverseOn
            CALL EditorOutputText
            LD   HL,0
            LD   (EditorRenderCount),HL
            LD   DE,EditorSearchPrompt
            CALL EditorStatusText
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
            CALL EditorStatusFill
            LD   A,23
            LD   (EditorCursorScreenRow),A
            LD   A,(EditorQueryLength)
            ADD  A,6
            LD   (EditorCursorScreenColumn),A
            JP   EditorPositionCursor

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IXH,IXL,IYH,IYL
EditorSearchInitial:
            LD   A,(EditorQueryLength)
            OR   A
            JR   Z,EditorSearchNoQuery
            LD   HL,(EditorCursor)
            JR   EditorSearchStart

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSearchRepeat:
            LD   A,(EditorQueryLength)
            OR   A
            JR   Z,EditorSearchNoQuery
            LD   HL,(EditorCursor)
            INC  HL

EditorSearchStart:
            XOR  A
            LD   (EditorScratchC),A
            LD   DE,(EditorLength)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,EditorSearchStartReady
            LD   HL,0
            INC  A
            LD   (EditorScratchC),A
EditorSearchStartReady:
            LD   (EditorScratchB),HL
            LD   (EditorScratchA),DE

EditorSearchLoop:
            LD   HL,(EditorScratchA)
            LD   A,H
            OR   L
            JR   Z,EditorSearchNotFound
            LD   HL,(EditorScratchB)
            CALL EditorSearchMatch
            JR   Z,EditorSearchFound
            LD   HL,(EditorScratchB)
            INC  HL
            LD   DE,(EditorLength)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,EditorSearchAdvanced
            LD   HL,0
            LD   A,1
            LD   (EditorScratchC),A
EditorSearchAdvanced:
            LD   (EditorScratchB),HL
            LD   HL,(EditorScratchA)
            DEC  HL
            LD   (EditorScratchA),HL
            JR   EditorSearchLoop

EditorSearchFound:
            LD   HL,(EditorScratchB)
            LD   (EditorCursor),HL
            LD   A,(EditorFlags)
            AND  $F9
            LD   (EditorFlags),A
            LD   A,(EditorScratchC)
            OR   A
            LD   A,EditorStatusFound
            JR   Z,EditorSearchStatus
            LD   A,EditorStatusWrapped
EditorSearchStatus:
            LD   (EditorStatus),A
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

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSearchMatch:
            LD   A,(EditorQueryLength)
            LD   E,A
            LD   D,0
            ADD  HL,DE
            LD   DE,(EditorLength)
            OR   A
            SBC  HL,DE
            JR   C,EditorSearchMatchFits
            JR   Z,EditorSearchMatchFits
            LD   A,(EditorQueryLength)
            OR   A
            RET
EditorSearchMatchFits:
            LD   HL,(EditorScratchB)
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   DE,EditorQueryBuffer
            LD   A,(EditorQueryLength)
            LD   B,A
EditorSearchMatchLoop:
            LD   A,(DE)
            CP   (HL)
            RET  NZ
            INC  DE
            INC  HL
            DJNZ EditorSearchMatchLoop
            XOR  A
            RET
EditorSearchCodeEnd:
