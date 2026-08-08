; Streaming NVM encoder for the fixed counted-loop semantic stream.

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NvmEmitByte:
            LD   B,A
            LD   HL,(EmitCursor)
            LD   DE,GeneratedLimit
            LD   A,H
            CP   D
            JR   NZ,NvmEmitByteRoom
            LD   A,L
            CP   E
            JR   Z,NvmEmitByteFull
NvmEmitByteRoom:
            LD   A,B
            LD   (HL),A
            INC  HL
            LD   (EmitCursor),HL
            OR   A
            RET
NvmEmitByteFull:
            LD   A,DiagnosticSinkCapacity
            JP   CompilerSetDiagnostic

.routine out carry,zero,HL clobbers sign,parity,halfCarry,A,DE
NvmCurrentCodeOffset:
            LD   HL,(EmitCursor)
            LD   DE,(EmitCodeStart)
            OR   A
            SBC  HL,DE
            RET

.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
NvmPatchWord:
            LD   A,L
            LD   (DE),A
            INC  DE
            LD   A,H
            LD   (DE),A
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NvmEncodeLoopProgram:
            LD   HL,NvmEncoderHeaderTemplate
            LD   DE,GeneratedBase
            LD   BC,NvmCodeOffset
            LDIR
            LD   HL,GeneratedBase+NvmCodeOffset
            LD   (EmitCursor),HL
            LD   (EmitCodeStart),HL

            LD   A,$01
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+2)
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C

            LD   A,$01
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+4)
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C

            LD   A,$01
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+5)
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C

            LD   A,$01
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C
            LD   A,2
            CALL NvmEmitByte
            RET  C

            LD   A,$01
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+5)
            DEC  A
            CALL NvmEmitByte
            RET  C
            LD   A,5
            CALL NvmEmitByte
            RET  C

            CALL NvmCurrentCodeOffset
            LD   (EmitLoopHead),HL
            LD   A,$2A
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C
            LD   A,3
            CALL NvmEmitByte
            RET  C

            LD   A,$09
            CALL NvmEmitByte
            RET  C
            LD   A,3
            CALL NvmEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitExitFixup),HL
            XOR  A
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C

            LD   A,$01
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+7)
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C
            LD   A,$04
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,$51
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C

            LD   A,$0B
            CALL NvmEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitFailureFixup),HL
            XOR  A
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C

            LD   A,$2A
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,5
            CALL NvmEmitByte
            RET  C
            LD   A,3
            CALL NvmEmitByte
            RET  C
            LD   A,$09
            CALL NvmEmitByte
            RET  C
            LD   A,3
            CALL NvmEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitUpdateExitFixup),HL
            XOR  A
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C

            LD   A,$10
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,2
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,$08
            CALL NvmEmitByte
            RET  C
            LD   HL,(EmitLoopHead)
            LD   C,H
            LD   A,L
            CALL NvmEmitByte
            RET  C
            LD   A,C
            CALL NvmEmitByte
            RET  C

            CALL NvmCurrentCodeOffset
            LD   DE,(EmitExitFixup)
            CALL NvmPatchWord
            CALL NvmCurrentCodeOffset
            LD   DE,(EmitUpdateExitFixup)
            CALL NvmPatchWord
            LD   A,$52
            CALL NvmEmitByte
            RET  C

            CALL NvmCurrentCodeOffset
            LD   DE,(EmitFailureFixup)
            CALL NvmPatchWord
            LD   A,$06
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C
            LD   A,$54
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C

            LD   HL,(EmitCursor)
            LD   DE,GeneratedBase
            OR   A
            SBC  HL,DE
            LD   (GeneratedSize),HL
            OR   A
            RET

; Emit the checked-array comparison image. The Z80 does not execute this image;
; the host validator and reference VM consume it as an independent oracle.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
NvmEncodeArrayProgram:
            LD   HL,ArrayNvmHeaderTemplate
            LD   DE,GeneratedBase
            LD   BC,40
            LDIR
            LD   HL,GeneratedBase+40
            LD   (EmitCursor),HL

            LD   A,1
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            CALL NvmEmitByte
            RET  C
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+2)
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+3)
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+4)
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+5)
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+6)
            CALL NvmEmitByte
            RET  C

            LD   HL,(EmitCursor)
            LD   (EmitCodeStart),HL
            LD   A,$51
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,$0B
            CALL NvmEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitFailureFixup),HL
            XOR  A
            CALL NvmEmitByte
            RET  C
            CALL NvmEmitByte
            RET  C
            LD   A,$05
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,$40
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C
            LD   A,$42
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,(SemanticBufferBase+2)
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,2
            CALL NvmEmitByte
            RET  C
            LD   A,$48
            CALL NvmEmitByte
            RET  C
            LD   A,2
            CALL NvmEmitByte
            RET  C
            LD   A,3
            CALL NvmEmitByte
            RET  C
            LD   A,$04
            CALL NvmEmitByte
            RET  C
            LD   A,3
            CALL NvmEmitByte
            RET  C
            XOR  A
            CALL NvmEmitByte
            RET  C
            LD   A,$51
            CALL NvmEmitByte
            RET  C
            LD   A,1
            CALL NvmEmitByte
            RET  C
            LD   A,$0B
            CALL NvmEmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitExitFixup),HL
            XOR  A
            CALL NvmEmitByte
            RET  C
            CALL NvmEmitByte
            RET  C
            LD   A,$52
            CALL NvmEmitByte
            RET  C

            CALL NvmCurrentCodeOffset
            LD   DE,(EmitFailureFixup)
            CALL NvmPatchWord
            LD   A,$06
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C
            LD   A,$54
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C

            CALL NvmCurrentCodeOffset
            LD   DE,(EmitExitFixup)
            CALL NvmPatchWord
            LD   A,$06
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C
            LD   A,$54
            CALL NvmEmitByte
            RET  C
            LD   A,4
            CALL NvmEmitByte
            RET  C

            LD   HL,(EmitCursor)
            LD   DE,GeneratedBase
            OR   A
            SBC  HL,DE
            LD   (GeneratedSize),HL
            OR   A
            RET
