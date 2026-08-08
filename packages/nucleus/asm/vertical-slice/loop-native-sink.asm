; Streaming direct-Z80 encoder for the counted-loop semantic stream.

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NativeEmitByte:
            LD   B,A
            LD   HL,(EmitCursor)
            LD   DE,GeneratedLimit
            LD   A,H
            CP   D
            JR   NZ,NativeEmitByteRoom
            LD   A,L
            CP   E
            JR   Z,NativeEmitByteFull
NativeEmitByteRoom:
            LD   A,B
            LD   (HL),A
            INC  HL
            LD   (EmitCursor),HL
            OR   A
            RET
NativeEmitByteFull:
            LD   A,DiagnosticSinkCapacity
            JP   CompilerSetDiagnostic

.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
NativeEmitWord:
            LD   C,H
            LD   A,L
            CALL NativeEmitByte
            RET  C
            LD   A,C
            JP   NativeEmitByte

; Patch one Z80 relative displacement. DE is the operand and HL the target.
.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NativePatchRelative:
            LD   (EmitPatchAddress),DE
            INC  DE
            OR   A
            SBC  HL,DE
            LD   C,L
            LD   A,H
            OR   A
            JR   Z,NativePatchPositive
            INC  A
            JR   NZ,NativePatchInvalid
            BIT  7,C
            JR   Z,NativePatchInvalid
            JR   NativePatchStore
NativePatchPositive:
            BIT  7,C
            JR   NZ,NativePatchInvalid
NativePatchStore:
            LD   DE,(EmitPatchAddress)
            LD   A,C
            LD   (DE),A
            OR   A
            RET
NativePatchInvalid:
            LD   A,DiagnosticFixupRange
            JP   CompilerSetDiagnostic

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
NativeEncodeLoopProgram:
            LD   HL,GeneratedBase
            LD   (EmitCursor),HL
            LD   (EmitCodeStart),HL

            LD   A,$16
            CALL NativeEmitByte
            RET  C
            LD   A,(SemanticBufferBase+2)
            CALL NativeEmitByte
            RET  C
            LD   A,$16
            CALL NativeEmitByte
            RET  C
            LD   A,(SemanticBufferBase+4)
            CALL NativeEmitByte
            RET  C

            LD   HL,(EmitCursor)
            LD   (EmitLoopHead),HL
            LD   A,$7A
            CALL NativeEmitByte
            RET  C
            LD   A,$FE
            CALL NativeEmitByte
            RET  C
            LD   A,(SemanticBufferBase+5)
            CALL NativeEmitByte
            RET  C
            LD   A,$30
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitExitFixup),HL
            XOR  A
            CALL NativeEmitByte
            RET  C

            LD   A,$3E
            CALL NativeEmitByte
            RET  C
            LD   A,(SemanticBufferBase+7)
            CALL NativeEmitByte
            RET  C
            LD   A,$CD
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeWriteOutputByte
            CALL NativeEmitWord
            RET  C
            LD   A,$38
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitFailureFixup),HL
            XOR  A
            CALL NativeEmitByte
            RET  C
            LD   A,$7A
            CALL NativeEmitByte
            RET  C
            LD   A,$FE
            CALL NativeEmitByte
            RET  C
            LD   A,(SemanticBufferBase+5)
            DEC  A
            CALL NativeEmitByte
            RET  C
            LD   A,$30
            CALL NativeEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitUpdateExitFixup),HL
            XOR  A
            CALL NativeEmitByte
            RET  C
            LD   A,$14
            CALL NativeEmitByte
            RET  C
            LD   A,$18
            CALL NativeEmitByte
            RET  C
            XOR  A
            CALL NativeEmitByte
            RET  C
            LD   DE,(EmitCursor)
            DEC  DE
            LD   HL,(EmitLoopHead)
            CALL NativePatchRelative
            RET  C

            LD   HL,(EmitCursor)
            LD   DE,(EmitExitFixup)
            CALL NativePatchRelative
            RET  C
            LD   HL,(EmitCursor)
            LD   DE,(EmitUpdateExitFixup)
            CALL NativePatchRelative
            RET  C
            LD   A,$3E
            CALL NativeEmitByte
            RET  C
            LD   A,NativeRunSucceeded
            CALL NativeEmitByte
            RET  C
            LD   A,$32
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeRunState
            CALL NativeEmitWord
            RET  C
            LD   A,$C9
            CALL NativeEmitByte
            RET  C

            LD   HL,(EmitCursor)
            LD   DE,(EmitFailureFixup)
            CALL NativePatchRelative
            RET  C
            LD   A,$32
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeTrapError
            CALL NativeEmitWord
            RET  C
            LD   A,$AF
            CALL NativeEmitByte
            RET  C
            LD   A,$32
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeTrapRoutine
            CALL NativeEmitWord
            RET  C
            LD   A,$21
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeLoopFailureOffset
            CALL NativeEmitWord
            RET  C
            LD   A,$22
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeTrapOffset
            CALL NativeEmitWord
            RET  C
            LD   A,$3E
            CALL NativeEmitByte
            RET  C
            LD   A,6
            CALL NativeEmitByte
            RET  C
            LD   A,$32
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeTrapNumber
            CALL NativeEmitWord
            RET  C
            LD   A,$3E
            CALL NativeEmitByte
            RET  C
            LD   A,NativeRunTrapped
            CALL NativeEmitByte
            RET  C
            LD   A,$32
            CALL NativeEmitByte
            RET  C
            LD   HL,NativeRunState
            CALL NativeEmitWord
            RET  C
            LD   A,$C9
            CALL NativeEmitByte
            RET  C

            LD   HL,(EmitCursor)
            LD   DE,GeneratedBase
            OR   A
            SBC  HL,DE
            LD   (GeneratedSize),HL
            OR   A
            RET
