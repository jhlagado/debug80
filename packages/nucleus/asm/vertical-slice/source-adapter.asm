; Memory-backed implementation of the ordered source-byte adapter.

.routine in A,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
SourceInitialize:
            LD   (SourcePartId),A
            LD   (SourceCursor),HL
            EX   DE,HL
            LD   (SourceEnd),HL
            LD   HL,0
            LD   (SourceOffset),HL
            INC  HL
            LD   (SourceLine),HL
            LD   (SourceColumn),HL
            XOR  A
            LD   (SourceLineHasToken),A
            LD   (SourceDelimiterDepth),A
            RET

; Return the current source byte in A. Carry denotes the separate EOF event.
.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
SourcePeek:
            LD   HL,(SourceCursor)
            LD   DE,(SourceEnd)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   NZ,SourcePeekByte
            SCF
            RET
SourcePeekByte:
            LD   A,(HL)
            OR   A
            RET

; Consume one byte and advance byte offset and byte column. Newline handling
; is separate because LF and CRLF each advance the logical line only once.
.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
SourceTake:
            PUSH BC
            CALL SourcePeek
            JR   C,SourceTakeEof
            LD   B,A
            LD   HL,(SourceCursor)
            INC  HL
            LD   (SourceCursor),HL
            LD   HL,(SourceOffset)
            INC  HL
            LD   (SourceOffset),HL
            LD   HL,(SourceColumn)
            INC  HL
            LD   (SourceColumn),HL
            LD   A,B
            POP  BC
            OR   A
            RET
SourceTakeEof:
            POP  BC
            SCF
            RET

.routine out carry,zero clobbers sign,parity,halfCarry,A,HL
SourceFinishLine:
            LD   HL,(SourceLine)
            INC  HL
            LD   (SourceLine),HL
            LD   HL,1
            LD   (SourceColumn),HL
            OR   A
            RET
