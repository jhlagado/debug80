; Stage 6 Z80 publisher. The complete checked static image is emitted after
; the initial JP and before main's first instruction. TypedBeginMain
; patches the JP operand to the first code byte, so source execution cannot
; observe initialization in progress.

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeAggregateProgram:
            LD   HL,GeneratedLimit
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeAggregateProgramWithinLimit:
            CALL EncodeProgramHeader
            JP   C,AbortProgram
            LD   HL,StaticImageBase
            LD   A,(StaticImageLength)
            OR   A
            JR   Z,AggregateDispatch
            LD   C,A
AggregateCopyLoop:
            LD   A,(HL)
            INC  HL
            PUSH HL
            CALL EmitByte
            POP  HL
            JP   C,AbortProgram
            DEC  C
            JR   NZ,AggregateCopyLoop
AggregateDispatch:
            CALL TypedDispatch
            JP   C,AbortProgram
            JP   FinishProgram
