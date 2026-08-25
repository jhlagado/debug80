; Full repaint for the 80-by-24 terminal profile.

EditorScreenCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorRender:
            CALL EditorEnsureViewport
            LD   DE,EditorClearHome
            CALL EditorOutputText
            LD   HL,(EditorTop)
            LD   B,23
EditorRenderRows:
            PUSH BC
            CALL EditorRenderLine
            LD   (EditorRenderPointer),HL
            CALL EditorOutputNewline
            LD   HL,(EditorRenderPointer)
            POP  BC
            DJNZ EditorRenderRows
            CALL EditorRenderStatus
            JP   EditorPositionCursor

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorEnsureViewport:
            LD   HL,(EditorCursor)
            CALL EditorNavigationLineStart
            LD   (EditorScratchA),HL
EditorEnsureVertical:
            LD   DE,(EditorTop)
            OR   A
            SBC  HL,DE
            JR   NC,EditorEnsureCountRows
            LD   HL,(EditorScratchA)
            LD   (EditorTop),HL
EditorEnsureCountRows:
            LD   HL,(EditorTop)
            LD   B,0
EditorEnsureRowLoop:
            LD   DE,(EditorScratchA)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   Z,EditorEnsureRowReady
            CALL EditorNavigationNextLine
            JR   C,EditorEnsureRowReady
            INC  B
            LD   A,B
            CP   23
            JR   C,EditorEnsureRowLoop
            LD   HL,(EditorTop)
            CALL EditorNavigationNextLine
            JR   C,EditorEnsureRowReady
            LD   (EditorTop),HL
            LD   HL,(EditorScratchA)
            JR   EditorEnsureVertical
EditorEnsureRowReady:
            LD   A,B
            LD   (EditorCursorScreenRow),A
            CALL EditorNavigationCursorColumn
            LD   DE,80
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,EditorEnsureNoHorizontal
            LD   DE,79
            OR   A
            SBC  HL,DE
            LD   (EditorHorizontal),HL
            LD   HL,79
            JR   EditorEnsureColumnReady
EditorEnsureNoHorizontal:
            LD   DE,0
            LD   (EditorHorizontal),DE
EditorEnsureColumnReady:
            LD   A,L
            LD   (EditorCursorScreenColumn),A
            RET

; Render one logical line beginning at HL and return the next line's offset or
; logical EOF. RenderColumn is the source visual column; RenderCount is cells.
.routine in HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
EditorRenderLine:
            LD   (EditorRenderPointer),HL
            LD   HL,0
            LD   (EditorRenderColumn),HL
            LD   (EditorRenderCount),HL
EditorRenderLineLoop:
            LD   HL,(EditorRenderPointer)
            PUSH HL
            CALL EditorBufferByteAt
            POP  HL
            JR   C,EditorRenderLineDone
            CP   10
            JR   Z,EditorRenderLineNewline
            CP   13
            JR   Z,EditorRenderLineCr
            CP   9
            JR   Z,EditorRenderLineTab
            CALL EditorRenderCell
            JR   EditorRenderLineAdvance
EditorRenderLineTab:
            LD   HL,(EditorRenderColumn)
            CALL EditorNavigationNextTab
            LD   (EditorScratchB),HL
EditorRenderTabLoop:
            LD   A,' '
            CALL EditorRenderCell
            LD   HL,(EditorRenderColumn)
            LD   DE,(EditorScratchB)
            OR   A
            SBC  HL,DE
            JR   NZ,EditorRenderTabLoop
EditorRenderLineAdvance:
            LD   HL,(EditorRenderPointer)
            INC  HL
            LD   (EditorRenderPointer),HL
            JR   EditorRenderLineLoop
EditorRenderLineCr:
            INC  HL
            LD   (EditorRenderPointer),HL
            PUSH HL
            CALL EditorBufferByteAt
            POP  HL
            JR   C,EditorRenderLineDone
            CP   10
            JR   NZ,EditorRenderLineDone
EditorRenderLineNewline:
            INC  HL
            LD   (EditorRenderPointer),HL
EditorRenderLineDone:
            LD   HL,(EditorRenderPointer)
            RET

; Render one visual cell in A when it lies in the horizontal viewport.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorRenderCell:
            LD   (EditorScratchC),A
            LD   HL,(EditorRenderColumn)
            LD   DE,(EditorHorizontal)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,EditorRenderCellAdvance
            LD   DE,(EditorRenderCount)
            LD   A,D
            OR   A
            JR   NZ,EditorRenderCellAdvance
            LD   A,E
            CP   80
            JR   NC,EditorRenderCellAdvance
            LD   A,(EditorScratchC)
            CALL EditorOutputByte
            LD   HL,(EditorRenderCount)
            INC  HL
            LD   (EditorRenderCount),HL
EditorRenderCellAdvance:
            LD   HL,(EditorRenderColumn)
            INC  HL
            LD   (EditorRenderColumn),HL
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorRenderStatus:
            LD   DE,EditorStatusPosition
            CALL EditorOutputText
            LD   DE,EditorReverseOn
            CALL EditorOutputText
            LD   HL,0
            LD   (EditorRenderCount),HL
            LD   DE,EditorStatusPrefix
            CALL EditorStatusText
            LD   HL,EditorFcb+1
            LD   B,8
EditorStatusNameLoop:
            LD   A,(HL)
            PUSH HL
            PUSH BC
            CALL EditorStatusByte
            POP  BC
            POP  HL
            INC  HL
            DJNZ EditorStatusNameLoop
            LD   A,'.'
            CALL EditorStatusByte
            LD   HL,EditorFcb+9
            LD   B,3
EditorStatusExtensionLoop:
            LD   A,(HL)
            PUSH HL
            PUSH BC
            CALL EditorStatusByte
            POP  BC
            POP  HL
            INC  HL
            DJNZ EditorStatusExtensionLoop
            LD   A,' '
            CALL EditorStatusByte
            LD   A,(EditorFlags)
            AND  EditorFlagDirty
            LD   A,' '
            JR   Z,EditorStatusDirtyReady
            LD   A,'*'
EditorStatusDirtyReady:
            CALL EditorStatusByte
            LD   A,' '
            CALL EditorStatusByte
            LD   A,' '
            CALL EditorStatusByte
            CALL EditorStatusMessage
            LD   DE,EditorStatusHints
            CALL EditorStatusText
EditorStatusFill:
            LD   HL,(EditorRenderCount)
            LD   A,L
            CP   80
            JR   NC,EditorStatusFilled
            LD   A,' '
            CALL EditorStatusByte
            JR   EditorStatusFill
EditorStatusFilled:
            LD   DE,EditorReverseOff
            JP   EditorOutputText

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorStatusMessage:
            LD   A,(EditorStatus)
            OR   A
            RET  Z
            CP   EditorStatusSaved
            LD   DE,EditorStatusSavedText
            JR   Z,EditorStatusMessageText
            CP   EditorStatusFull
            LD   DE,EditorStatusFullText
            JR   Z,EditorStatusMessageText
            CP   EditorStatusDiscard
            LD   DE,EditorStatusDiscardText
            JR   Z,EditorStatusMessageText
            CP   EditorStatusSaveConflict
            JR   C,EditorStatusMessageDone
            LD   DE,EditorStatusSaveFailedText
            CALL EditorStatusText
            LD   A,(EditorStatus)
            CALL EditorStatusHexByte
EditorStatusMessageDone:
            RET
EditorStatusMessageText:
            JP   EditorStatusText

.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorStatusText:
            LD   A,(DE)
            OR   A
            RET  Z
            INC  DE
            PUSH DE
            CALL EditorStatusByte
            POP  DE
            JR   EditorStatusText

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorStatusByte:
            CALL EditorOutputByte
            LD   HL,(EditorRenderCount)
            INC  HL
            LD   (EditorRenderCount),HL
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorStatusHexByte:
            LD   (EditorScratchC),A
            RRCA
            RRCA
            RRCA
            RRCA
            CALL EditorStatusHexNibble
            LD   A,(EditorScratchC)
            JP   EditorStatusHexNibble
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorStatusHexNibble:
            AND  $0F
            ADD  A,'0'
            CP   '9'+1
            JP   C,EditorStatusByte
            ADD  A,7
            JP   EditorStatusByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorPositionCursor:
            LD   A,(EditorCursorScreenRow)
            INC  A
            LD   (EditorScratchA),A
            LD   A,(EditorCursorScreenColumn)
            INC  A
            LD   (EditorScratchA+1),A
            LD   DE,EditorCursorPrefix
            CALL EditorOutputText
            LD   A,(EditorScratchA)
            CALL EditorOutputDecimal
            LD   A,';'
            CALL EditorOutputByte
            LD   A,(EditorScratchA+1)
            CALL EditorOutputDecimal
            LD   A,'H'
            JP   EditorOutputByte

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorOutputDecimal:
            LD   B,0
EditorOutputDecimalLoop:
            CP   10
            JR   C,EditorOutputDecimalReady
            SUB  10
            INC  B
            JR   EditorOutputDecimalLoop
EditorOutputDecimalReady:
            LD   (EditorScratchC),A
            LD   A,B
            OR   A
            JR   Z,EditorOutputDecimalOnes
            ADD  A,'0'
            CALL EditorOutputByte
EditorOutputDecimalOnes:
            LD   A,(EditorScratchC)
            ADD  A,'0'
            JP   EditorOutputByte

.routine in A out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorOutputByte:
            LD   E,A
            LD   C,6
            JP   EditorCallBdos

.routine in DE out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorOutputText:
            LD   A,(DE)
            CP   '$'
            RET  Z
            INC  DE
            PUSH DE
            CALL EditorOutputByte
            POP  DE
            JR   EditorOutputText

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorOutputNewline:
            LD   A,13
            CALL EditorOutputByte
            LD   A,10
            JP   EditorOutputByte

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorRingBell:
            LD   A,7
            JP   EditorOutputByte
EditorScreenCodeEnd:
