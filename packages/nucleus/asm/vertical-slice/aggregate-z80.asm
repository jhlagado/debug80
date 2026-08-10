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
            LD   BC,(StaticImageLength)
            LD   A,B
            OR   C
            JR   Z,AggregateDispatch
AggregateCopyLoop:
            LD   A,(HL)
            INC  HL
            PUSH BC
            PUSH HL
            CALL EmitByte
            POP  HL
            POP  BC
            JP   C,AbortProgram
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,AggregateCopyLoop
AggregateDispatch:
            CALL TypedDispatch
            JP   C,AbortProgram
            JP   FinishProgram
