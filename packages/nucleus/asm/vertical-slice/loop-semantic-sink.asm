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

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
SemanticSinkEmitProgram:
            LD   A,(ParsedProgramKind)
            CP   ProgramKindArray
            JP   Z,SemanticSinkEmitArrayProgram
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

SemanticSinkEmitArrayProgram:
            LD   A,SemanticStaticU8Array
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedArrayLength)
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedArrayByte0)
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedArrayByte1)
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedArrayByte2)
            CALL SemanticSinkPut
            RET  C
            LD   A,(ParsedArrayByte3)
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticReadInputByte
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticPropagate
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticStoreResultU8
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticLoadArrayU8
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticWriteOutputU8
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticPropagate
            CALL SemanticSinkPut
            RET  C
            LD   A,SemanticReturn
            CALL SemanticSinkPut
            RET  C
            LD   A,8
            LD   (SinkOperationCount),A
            LD   (SemanticBufferBase),A
            OR   A
            RET
