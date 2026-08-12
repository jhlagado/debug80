; Aggregate Z80 publisher. The complete checked initialized-data and constant
; image is emitted after
; the initial JP and before main's first instruction. TypedBeginMain
; patches the JP operand to the first code byte, so source execution cannot
; observe initialization in progress.

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeAggregateProgram:
.if TargetStreamingOutput
            LD   IX,(TargetDescriptorPointer)
            CALL BeginTargetFlatProgram
            JP   C,AbortTargetProgram
.else
.if AggregateCallSlices
            LD   HL,GeneratedCodeLimit
.else
            LD   HL,GeneratedLimit
.endif
.endif
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
EncodeAggregateProgramWithinLimit:
.if TargetStreamingOutput
            ; BeginTargetFlatProgram already selected the first read-only byte.
            LD   A,(TargetLayoutMode)
            OR   A
            JR   Z,AggregateTargetLoadedRoData
            LD   B,NucleusRuntimeVectorLength+NucleusRuntimeStateLength
            XOR  A
AggregateRuntimeInitialLoop:
            PUSH BC
            CALL EmitByte
            POP  BC
            JP   C,AggregateAbortProgram
            DJNZ AggregateRuntimeInitialLoop
            JR   AggregateTargetCopyReady
AggregateTargetLoadedRoData:
            LD   HL,StaticImageBase
            LD   DE,(StaticImageLength)
            ADD  HL,DE
            LD   BC,(ReadOnlyImageLength)
            JR   AggregateTargetCopySelected
AggregateTargetCopyReady:
.else
.if AggregateCallSlices
            CALL BeginSegmentedProgram
            JP   C,AbortSegmentedProgram
            LD   A,SegmentRoData
            CALL SelectOutputSegment
.else
            CALL EncodeProgramHeader
            JP   C,AbortProgram
.endif
.endif
.if SegmentedOutput
            LD   HL,(ReadOnlyImageLength)
            LD   BC,(StaticImageLength)
            ADD  HL,BC
            LD   B,H
            LD   C,L
            LD   HL,StaticImageBase
.else
            LD   HL,StaticImageBase
            LD   BC,(StaticImageLength)
.endif
.if TargetStreamingOutput
AggregateTargetCopySelected:
.endif
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
.if TargetStreamingOutput
            LD   HL,(EmitCursor)
            LD   (TargetCodeBase),HL
            LD   A,(TargetLayoutMode)
            OR   A
            JR   NZ,AggregateTargetCodeReady
            LD   HL,(TargetCodeCapacity)
            LD   (EmitLimit),HL
AggregateTargetCodeReady:
.else
.if AggregateCallSlices
            LD   A,SegmentCode
            CALL SelectOutputSegment
            CALL EncodeSegmentedProgramHeader
            JP   C,AbortSegmentedProgram
.endif
.endif
            CALL TypedDispatch
            JP   C,AggregateAbortProgram
.if TargetStreamingOutput
            JP   FinishTargetFlatProgram
.else
.if AggregateCallSlices
            JP   FinishSegmentedProgram
.else
            JP   FinishProgram
.endif
.endif

.if TargetStreamingOutput
AggregateAbortProgram .equ AbortTargetProgram
.else
.if AggregateCallSlices
AggregateAbortProgram .equ AbortSegmentedProgram
.else
AggregateAbortProgram .equ AbortProgram
.endif
.endif
