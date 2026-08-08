; Checked semantic-operation buffer for the counted-loop and array slices.

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

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
SemanticSinkOperation:
            CALL SemanticSinkPut
            RET  C
            LD   HL,SinkOperationCount
            INC  (HL)
            XOR  A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry
SemanticSinkFinish:
            LD   A,(SinkOperationCount)
            LD   (SemanticBufferBase),A
            OR   A
            RET
