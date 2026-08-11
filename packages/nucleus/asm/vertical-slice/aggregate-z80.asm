; Stage 6 Z80 publisher. The complete checked static image is emitted after
; the initial JP and before main's first instruction. TypedBeginMain
; patches the JP operand to the first code byte, so source execution cannot
; observe initialization in progress.

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeAggregateProgram:
.if AggregateCallSlices
            LD   HL,GeneratedCodeLimit
.else
            LD   HL,GeneratedLimit
.endif
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeAggregateProgramWithinLimit:
.if AggregateCallSlices
            CALL BeginSegmentedProgram
            JP   C,AbortSegmentedProgram
            LD   A,SegmentRoData
            CALL SelectOutputSegment
.else
            CALL EncodeProgramHeader
            JP   C,AbortProgram
.endif
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
            JP   C,AggregateAbortProgram
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,AggregateCopyLoop
AggregateDispatch:
.if AggregateCallSlices
            LD   A,SegmentCode
            CALL SelectOutputSegment
            CALL EncodeSegmentedProgramHeader
            JP   C,AbortSegmentedProgram
.endif
            CALL TypedDispatch
            JP   C,AggregateAbortProgram
.if AggregateCallSlices
            JP   FinishSegmentedProgram
.else
            JP   FinishProgram
.endif

.if AggregateCallSlices
AggregateAbortProgram .equ AbortSegmentedProgram
.else
AggregateAbortProgram .equ AbortProgram
.endif
