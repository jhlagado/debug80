; Contiguous text editing primitives. Cursor and length are logical offsets.

EditorBufferCodeStart:
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorBufferInsertByte:
            LD   (EditorScratchC),A
            LD   A,1
            CALL EditorBufferOpenGap
            RET  C
            LD   A,(EditorScratchC)
            LD   (HL),A
            LD   HL,(EditorCursor)
            INC  HL
            LD   (EditorCursor),HL
            JP   EditorBufferChanged

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorBufferInsertNewline:
            LD   A,2
            CALL EditorBufferOpenGap
            RET  C
            LD   (HL),13
            INC  HL
            LD   (HL),10
            LD   HL,(EditorCursor)
            INC  HL
            INC  HL
            LD   (EditorCursor),HL
            JP   EditorBufferChanged

; Open A bytes at the cursor and return their first address in HL. The buffer
; and all state remain unchanged on capacity failure.
.routine in A out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
EditorBufferOpenGap:
            LD   L,A
            LD   H,0
            LD   (EditorScratchA),HL
            LD   DE,(EditorLength)
            LD   HL,EditorTextCapacity
            OR   A
            SBC  HL,DE
            LD   DE,(EditorScratchA)
            OR   A
            SBC  HL,DE
            JR   C,EditorBufferFull
            LD   HL,(EditorLength)
            LD   DE,(EditorCursor)
            OR   A
            SBC  HL,DE
            LD   B,H
            LD   C,L
            LD   HL,(EditorLength)
            LD   DE,EditorTextBase
            ADD  HL,DE
            DEC  HL
            PUSH HL
            LD   DE,(EditorScratchA)
            ADD  HL,DE
            LD   D,H
            LD   E,L
            POP  HL
            LD   A,B
            OR   C
            JR   Z,EditorBufferGapReady
            LDDR
EditorBufferGapReady:
            LD   HL,(EditorLength)
            LD   DE,(EditorScratchA)
            ADD  HL,DE
            LD   (EditorLength),HL
            LD   HL,(EditorCursor)
            LD   DE,EditorTextBase
            ADD  HL,DE
            OR   A
            RET
EditorBufferFull:
            LD   A,EditorStatusFull
            LD   (EditorStatus),A
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorBufferBackspace:
            LD   HL,(EditorCursor)
            LD   A,H
            OR   L
            JP   Z,EditorBufferBoundary
            DEC  HL
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   A,(HL)
            CP   10
            JR   NZ,EditorBufferBackspaceOne
            LD   HL,(EditorCursor)
            DEC  HL
            LD   A,H
            OR   L
            JR   Z,EditorBufferBackspaceOne
            DEC  HL
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   A,(HL)
            CP   13
            JR   NZ,EditorBufferBackspaceOne
            LD   HL,(EditorCursor)
            DEC  HL
            DEC  HL
            LD   (EditorCursor),HL
            LD   A,2
            JR   EditorBufferDeleteSpan
EditorBufferBackspaceOne:
            LD   HL,(EditorCursor)
            DEC  HL
            LD   (EditorCursor),HL
            LD   A,1
            JR   EditorBufferDeleteSpan

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorBufferDelete:
            LD   HL,(EditorCursor)
            LD   DE,(EditorLength)
            OR   A
            SBC  HL,DE
            JR   Z,EditorBufferBoundary
            ADD  HL,DE
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   A,(HL)
            CP   13
            JR   NZ,EditorBufferDeleteOne
            INC  HL
            LD   A,(HL)
            CP   10
            JR   NZ,EditorBufferDeleteOne
            LD   A,2
            JR   EditorBufferDeleteSpan
EditorBufferDeleteOne:
            LD   A,1

; Delete A bytes beginning at the current cursor.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorBufferDeleteSpan:
            LD   L,A
            LD   H,0
            LD   (EditorScratchA),HL
            LD   HL,(EditorLength)
            LD   DE,(EditorCursor)
            OR   A
            SBC  HL,DE
            LD   DE,(EditorScratchA)
            OR   A
            SBC  HL,DE
            LD   B,H
            LD   C,L
            LD   HL,(EditorCursor)
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   D,H
            LD   E,L
            LD   HL,(EditorScratchA)
            ADD  HL,DE
            LD   A,B
            OR   C
            JR   Z,EditorBufferDeleteReady
            LDIR
EditorBufferDeleteReady:
            LD   HL,(EditorLength)
            LD   DE,(EditorScratchA)
            OR   A
            SBC  HL,DE
            LD   (EditorLength),HL
            JR   EditorBufferChanged

.routine out A,carry,zero clobbers sign,parity,halfCarry
EditorBufferChanged:
            LD   A,EditorFlagDirty
            LD   (EditorFlags),A
            XOR  A
            LD   (EditorStatus),A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry
EditorBufferBoundary:
            LD   A,EditorStatusBoundary
            LD   (EditorStatus),A
            SCF
            RET

.routine in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
EditorBufferByteAt:
            LD   DE,(EditorLength)
            OR   A
            SBC  HL,DE
            JR   NC,EditorBufferByteAtEnd
            ADD  HL,DE
            LD   DE,EditorTextBase
            ADD  HL,DE
            LD   A,(HL)
            OR   A
            RET
EditorBufferByteAtEnd:
            SCF
            RET
EditorBufferCodeEnd:
