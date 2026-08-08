; Checked semantic-operation buffer for the counted-loop slice.

.routine out carry,zero clobbers sign,parity,halfCarry,A,HL
SemanticSinkReset:
            LD   HL,SemanticBufferBase+1
            LD   (SinkCursor),HL
            XOR  A
            LD   (SinkOperationCount),A
            LD   (SemanticBufferBase),A
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
SemanticSinkPut:
            LD   B,A
            LD   HL,(SinkCursor)
            LD   DE,SemanticBufferLimit
            LD   A,H
            CP   D
            JR   NZ,SemanticSinkPutRoom
            LD   A,L
            CP   E
            JR   Z,SemanticSinkPutFull
SemanticSinkPutRoom:
            LD   A,B
            LD   (HL),A
            INC  HL
            LD   (SinkCursor),HL
            OR   A
            RET
SemanticSinkPutFull:
            LD   A,DiagnosticSinkCapacity
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
SemanticSinkEmitProgram:
            LD   A,SemanticDeclareU8
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedDeclarationInitial)
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticForUntilU8
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedLoopInitial)
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedLoopBound)
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticWriteOutputByte
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedOutputByte)
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticPropagate
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticEndLoop
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticReturn
            CALL SemanticSinkPut
            RET  C
            LD   A,6
            LD   (SinkOperationCount),A
            LD   (SemanticBufferBase),A
            OR   A
            RET
