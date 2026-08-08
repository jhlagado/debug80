; Checked semantic-operation transcript used by the direct-Z80 encoders. The
; leading byte is the operation count.

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

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
SemanticSinkEmitProgram:
            LD   C,A
            LD   A,SemanticLoadU8
            CALL SemanticSinkPut
            RET  C
            LD   A,C
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticWriteOutputByte
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticPropagate
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticReturn
            CALL SemanticSinkPut
            RET  C
            LD   A,4
            LD   (SinkOperationCount),A
            LD   (SemanticBufferBase),A
            OR   A
            RET
