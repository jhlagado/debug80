; Stage 6 native publisher. The complete checked static image is emitted after
; the initial JP and before main's first instruction. TypedNativeBeginMain
; patches the JP operand to the first code byte, so source execution cannot
; observe initialization in progress.

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
NativeEncodeAggregateProgram:
            LD   HL,GeneratedLimit
.routine in HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,D,DE,HL,IX,IY
NativeEncodeAggregateProgramWithinLimit:
            CALL NativeEncodeProgramHeader
            JP   C,NativeAbortProgram
            LD   HL,StaticImageBase
            LD   A,(StaticImageLength)
            OR   A
            JR   Z,AggregateNativeDispatch
            LD   C,A
AggregateNativeCopyLoop:
            LD   A,(HL)
            INC  HL
            PUSH HL
            CALL NativeEmitByte
            POP  HL
            JP   C,NativeAbortProgram
            DEC  C
            JR   NZ,AggregateNativeCopyLoop
AggregateNativeDispatch:
            CALL TypedNativeDispatch
            JP   C,NativeAbortProgram
            JP   NativeFinishProgram
