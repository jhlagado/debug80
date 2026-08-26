; Single literal replacement at an exact current query match. The inactive
; CP/M DMA record stages the replacement text.

EditorReplaceCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IXH,IXL,IYH,IYL
EditorReplaceBegin:
            LD   A,(EditorQueryLength)
            OR   A
            JR   Z,EditorSearchNoQuery
            LD   C,A
            LD   HL,(EditorCursor)
            CALL EditorReplaceMatchAt
            JR   NZ,EditorSearchNotFound
            LD   HL,EditorDma
            LD   (HL),0
            LD   DE,EditorReplacePrompt
            CALL EditorLiteralInput
            JP   C,EditorReadyReturn

; Apply the staged replacement at the current exact match. Opening or deleting
; at the replacement start leaves precisely the span that the copy overwrites.
; Growth is checked before any text or persistent editor state changes.
EditorReplaceApply:
            LD   A,(EditorQueryLength)
            LD   B,A
            LD   A,(EditorDma)
            SUB  B
            JR   NC,EditorReplaceGrow
            NEG
            CALL EditorBufferDeleteSpan
            JR   EditorReplaceCopy
EditorReplaceGrow:
            JR   Z,EditorReplaceCopy
            CALL EditorBufferOpenGap
            RET  C
EditorReplaceCopy:
            LD   A,(EditorDma)
            OR   A
            JR   Z,EditorReplaceChanged
            LD   C,A
            LD   B,0
            LD   HL,(EditorCursor)
            LD   DE,EditorTextBase
            ADD  HL,DE
            EX   DE,HL
            LD   HL,EditorDma+1
            LDIR
EditorReplaceChanged:
            LD   HL,EditorFlags
            SET  0,(HL)
            RES  2,(HL)
            INC  HL
            LD   (HL),EditorStatusReplaced
            XOR  A
            RET

; Test the committed query at logical offset HL. C is its nonzero length. Z
; means an exact match. NZ also covers a query extending beyond logical EOF.
.routine in C,HL out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
EditorReplaceMatchAt:
            PUSH HL
            LD   B,0
            ADD  HL,BC
            LD   DE,(EditorLength)
            SBC  HL,DE
            POP  HL
            JR   C,EditorReplaceMatchFits
            RET  NZ
EditorReplaceMatchFits:
            LD   B,C
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   DE,EditorQueryBuffer
EditorReplaceMatchLoop:
            LD   A,(DE)
            CP   (HL)
            RET  NZ
            INC  DE
            INC  HL
            DJNZ EditorReplaceMatchLoop
            RET
EditorReplaceCodeEnd:
