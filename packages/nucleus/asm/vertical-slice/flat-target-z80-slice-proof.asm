; Prove the compact descriptor and flat append-only compiler sink end to end.

            .include "memory-map.asmi"
SegmentedOutput       .equ 1
TargetStreamingOutput .equ 1
            .include "loop-compiler-state.asmi"
            .include "aggregate-call-state.asmi"
            .include "target-output-state.asmi"
            .include "loop-z80-state.asmi"

            .org CompilerCoreBase
CompilerCodeStart:
LegacyCompilerSlices .equ 0
AggregateCallSlices  .equ 1
Stage7LL1            .equ 1
SourceAdapterCodeStart:
            .include "source-adapter.asm"
SourceAdapterCodeEnd:
TokenizerCodeStart:
            .include "loop-tokenizer.asm"
TokenizerCodeEnd:
SemanticSinkCodeStart:
            .include "loop-semantic-sink.asm"
SemanticSinkCodeEnd:
SymbolCodeStart:
            .include "loop-symbols.asm"
SymbolCodeEnd:
ParserCodeStart:
            .include "loop-parser.asm"
ParserCodeEnd:
CompilerCommonCodeEnd:
SinkCodeStart:
LegacyEncoders .equ 0
            .include "loop-z80-sink.asm"
            .include "target-output.asm"
TypedSinkCodeStart:
            .include "typed-expression-z80.asm"
            .include "aggregate-z80.asm"
TypedSinkCodeEnd:
SinkCodeEnd:
CompilerCodeEnd:
CompilerImmutableStart:
            .include "loop-keywords.asmi"
CompilerImmutableEnd:
CompilerCoreEnd:

            .org SourceBase
FlatTargetSource:
            .db "var value as u16 = 3",10
            .db "sub main()",10
            .db "value = value * 2",10
            .db "end",10
FlatTargetSourceEnd:

FlatTargetParts:
            .db 1
            .dw FlatTargetSource,FlatTargetSourceEnd

FlatTargetDescriptor:
            .dw NucleusRuntimeIdentity
            .dw $8000,$1000
            .dw $4000,$1000
            .db 0
FlatTargetLoadedDescriptor:
            .dw NucleusRuntimeIdentity
            .dw $8000,$2000
            .dw $9000,$1000
            .db 0
FlatTargetEarlyWritableDescriptor:
            .dw NucleusRuntimeIdentity
            .dw $8000,$2000
            .dw $8100,$1000
            .db 0
FlatTargetBadFlagsDescriptor:
            .dw NucleusRuntimeIdentity
            .dw $8000,$1000
            .dw $4000,$1000
            .db 2

            .org TargetRuntimeBase
RuntimeCodeStart:
            .include "proof-z80-runtime.asm"
RuntimeCodeEnd:

            .org ProofBase
.routine out carry,zero clobbers sign,parity,halfCarry,A,BC,DE,HL,IX,IY
ProofStart:
            LD   SP,StackTop
            XOR  A
            LD   (ProofStatus),A
            LD   (ProofCase),A
            LD   (AdapterCommitted),A
            LD   (AdapterAborted),A
            LD   (AdapterMapFailure),A
            LD   (AdapterCommitFailure),A
            LD   HL,AdapterLogBase
            LD   (AdapterCursor),HL
            LD   HL,$F000
            LD   DE,$1000
            LD   A,10
            LD   (ProofCase),A
            CALL TargetValidateRegion
            JP   C,ProofRegionFailure
            LD   HL,$F001
            LD   DE,$1000
            LD   A,11
            LD   (ProofCase),A
            CALL TargetValidateRegion
            JP   NC,ProofRegionFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticTargetCapacity
            JP   NZ,ProofRegionFailure
            LD   HL,$8000
            LD   A,12
            LD   (ProofCase),A
            LD   (TargetImageBase),HL
            LD   HL,$1000
            LD   (TargetImageCapacity),HL
            LD   HL,$8F00
            LD   (TargetWritableBase),HL
            LD   HL,$0200
            LD   (TargetWritableCapacity),HL
            CALL TargetClassifyFlatLayout
            JP   NC,ProofRegionFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticTargetConfiguration
            JP   NZ,ProofRegionFailure
            LD   HL,$2000
            LD   A,13
            LD   (ProofCase),A
            LD   (TargetImageCapacity),HL
            LD   HL,$9000
            LD   (TargetWritableBase),HL
            LD   HL,$0100
            LD   (TargetWritableCapacity),HL
            CALL TargetClassifyFlatLayout
            JP   C,ProofRegionFailure
            LD   A,(TargetLayoutMode)
            OR   A
            JP   NZ,ProofRegionFailure
            LD   A,14
            LD   (ProofCase),A
            LD   A,1
            LD   HL,FlatTargetParts
            LD   IX,FlatTargetEarlyWritableDescriptor
            CALL CompileTargetAggregateCallParts
            JP   NC,ProofLoadedFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticTargetCapacity
            JP   NZ,ProofLoadedFailure
            LD   A,15
            LD   (ProofCase),A
            XOR  A
            LD   (AdapterCommitted),A
            LD   (AdapterAborted),A
            LD   A,61
            LD   (AdapterFailureCountdown),A
            LD   HL,AdapterLogBase
            LD   (AdapterCursor),HL
            LD   A,1
            LD   HL,FlatTargetParts
            LD   IX,FlatTargetLoadedDescriptor
            CALL CompileTargetAggregateCallParts
            JP   NC,ProofLoadedFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticTargetOutput
            JP   NZ,ProofLoadedFailure
            LD   A,(AdapterCommitted)
            OR   A
            JP   NZ,ProofLoadedFailure
            LD   A,(AdapterAborted)
            CP   1
            JP   NZ,ProofLoadedFailure
            LD   A,16
            LD   (ProofCase),A
            XOR  A
            LD   (AdapterCommitted),A
            LD   (AdapterAborted),A
            LD   (AdapterFailureCountdown),A
            LD   HL,AdapterLogBase
            LD   (AdapterCursor),HL
            LD   A,1
            LD   HL,FlatTargetParts
            LD   IX,FlatTargetLoadedDescriptor
            CALL CompileTargetAggregateCallParts
            JP   C,ProofLoadedFailure
            LD   A,(TargetLayoutMode)
            OR   A
            JP   NZ,ProofLoadedFailure
            LD   HL,(AdapterCapturedContext+$0E)
            LD   DE,$816F
            OR   A
            SBC  HL,DE
            JP   NZ,ProofLoadedFailure
            LD   HL,(AdapterCapturedMap+$03)
            LD   DE,$1038
            OR   A
            SBC  HL,DE
            JP   NZ,ProofLoadedFailure
            LD   HL,(AdapterCapturedMap+$05)
            LD   A,H
            OR   L
            JP   NZ,ProofLoadedFailure
            LD   HL,(AdapterCapturedMap+$09)
            LD   DE,$816F
            OR   A
            SBC  HL,DE
            JP   NZ,ProofLoadedFailure
            LD   A,17
            LD   (ProofCase),A
            LD   A,1
            LD   HL,FlatTargetParts
            LD   IX,FlatTargetBadFlagsDescriptor
            CALL CompileTargetAggregateCallParts
            JP   NC,ProofConfigurationFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticTargetConfiguration
            JP   NZ,ProofConfigurationFailure
            LD   A,(AdapterAborted)
            OR   A
            JP   NZ,ProofConfigurationFailure
            XOR  A
            LD   (AdapterCommitted),A
            LD   (AdapterAborted),A
            LD   A,20
            LD   (ProofCase),A
            LD   (AdapterFailureCountdown),A
            LD   A,1
            LD   HL,FlatTargetParts
            LD   IX,FlatTargetDescriptor
            CALL CompileTargetAggregateCallParts
            JP   NC,ProofAtomicFailure
            LD   A,21
            LD   (ProofCase),A
            LD   A,(DiagnosticCode)
            CP   DiagnosticTargetOutput
            JP   NZ,ProofAtomicFailure
            LD   A,22
            LD   (ProofCase),A
            LD   A,(AdapterCommitted)
            OR   A
            JP   NZ,ProofAtomicFailure
            LD   A,23
            LD   (ProofCase),A
            LD   A,(AdapterAborted)
            CP   1
            JP   NZ,ProofAtomicFailure
            LD   A,24
            LD   (ProofCase),A
            LD   HL,(AdapterCursor)
            LD   DE,AdapterLogBase
            OR   A
            SBC  HL,DE
            LD   A,H
            OR   L
            JP   Z,ProofAtomicFailure
            LD   A,30
            LD   (ProofCase),A
            XOR  A
            LD   (AdapterCommitted),A
            LD   (AdapterAborted),A
            LD   (AdapterFailureCountdown),A
            INC  A
            LD   (AdapterMapFailure),A
            LD   HL,AdapterLogBase
            LD   (AdapterCursor),HL
            LD   A,1
            LD   HL,FlatTargetParts
            LD   IX,FlatTargetDescriptor
            CALL CompileTargetAggregateCallParts
            JP   NC,ProofAtomicFailure
            LD   A,(DiagnosticCode)
            CP   DiagnosticTargetOutput
            JP   NZ,ProofAtomicFailure
            LD   A,(AdapterCommitted)
            OR   A
            JP   NZ,ProofAtomicFailure
            LD   A,(AdapterAborted)
            CP   1
            JP   NZ,ProofAtomicFailure
            LD   A,25
            LD   (ProofCase),A
            XOR  A
            LD   (AdapterCommitted),A
            LD   (AdapterAborted),A
            LD   (AdapterFailureCountdown),A
            LD   (AdapterMapFailure),A
            LD   HL,AdapterLogBase
            LD   (AdapterCursor),HL
            LD   A,1
            LD   HL,FlatTargetParts
            LD   IX,FlatTargetDescriptor
            CALL CompileTargetAggregateCallParts
            JR   C,ProofCompileFailure
            LD   A,(AdapterCommitted)
            CP   1
            JR   NZ,ProofCommitFailure
            LD   A,(AdapterAborted)
            OR   A
            JR   NZ,ProofCommitFailure
            LD   HL,(AdapterCapturedBegin+TargetDescriptorImageBase)
            LD   DE,$8000
            OR   A
            SBC  HL,DE
            JR   NZ,ProofBeginFailure
            LD   A,(TargetLayoutMode)
            CP   TargetLayoutRom
            JP   NZ,ProofRegionFailure
            LD   HL,(AdapterCapturedContext+$00)
            LD   DE,$8003
            OR   A
            SBC  HL,DE
            JR   NZ,ProofContextFailure
            LD   HL,(AdapterCapturedContext+$06)
            LD   DE,$4021
            OR   A
            SBC  HL,DE
            JR   NZ,ProofContextFailure
            LD   HL,(AdapterCapturedMap+$01)
            LD   DE,$8000
            OR   A
            SBC  HL,DE
            JR   NZ,ProofMapFailure
            LD   HL,(AdapterCapturedMap+$05)
            LD   DE,$816F
            OR   A
            SBC  HL,DE
            JR   NZ,ProofMapFailure
            LD   HL,(AdapterCursor)
            LD   DE,AdapterLogBase
            OR   A
            SBC  HL,DE
            LD   (AdapterLogLength),HL
            LD   A,H
            OR   L
            JR   Z,ProofLogFailure
            LD   A,$A5
            LD   (ProofStatus),A
            XOR  A
            LD   (ProofCase),A
            HALT

ProofCompileFailure: LD A,1
            JR   ProofFail
ProofCommitFailure:  LD A,2
            JR   ProofFail
ProofBeginFailure:   LD A,3
            JR   ProofFail
ProofContextFailure: LD A,4
            JR   ProofFail
ProofMapFailure:     LD A,5
            JR   ProofFail
ProofLogFailure:     LD A,6
            JR   ProofFail
ProofRegionFailure:  LD A,(ProofCase)
            JR   ProofFail
ProofLoadedFailure:  LD A,(ProofCase)
            JR   ProofFail
ProofAtomicFailure:  LD A,(ProofCase)
            JR   ProofFail
ProofConfigurationFailure: LD A,(ProofCase)
ProofFail:
            LD   (ProofCase),A
            LD   A,$E1
            LD   (ProofStatus),A
            HALT

; Reserve A bytes atomically in the bounded proof-only operation log.
.routine in A out A,IY,carry,zero clobbers sign,parity,halfCarry,DE,HL
AdapterReserve:
            LD   E,A
            LD   A,(AdapterFailureCountdown)
            OR   A
            JR   Z,AdapterReserveCapacity
            DEC  A
            LD   (AdapterFailureCountdown),A
            JR   NZ,AdapterReserveCapacity
            LD   A,DiagnosticTargetOutput
            SCF
            RET
AdapterReserveCapacity:
            LD   A,E
            LD   D,0
            LD   IY,(AdapterCursor)
            PUSH IY
            POP  HL
            ADD  HL,DE
            LD   DE,AdapterLogLimit
            OR   A
            SBC  HL,DE
            JR   C,AdapterReserveReady
            JR   Z,AdapterReserveReady
            LD   A,DiagnosticTargetOutput
            SCF
            RET
AdapterReserveReady:
            ADD  HL,DE
            LD   (AdapterCursor),HL
            OR   A
            RET

.routine in IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IY
TargetSinkBegin:
            LD   HL,AdapterCapturedBegin
            LD   B,TargetDescriptorSize
TargetSinkBeginCopy:
            LD   A,(IX+0)
            LD   (HL),A
            INC  IX
            INC  HL
            DJNZ TargetSinkBeginCopy
            LD   A,1
            LD   (AdapterOpen),A
            OR   A
            RET

.routine in A,C,HL out A,carry,zero clobbers sign,parity,halfCarry,DE
TargetSinkImageByte:
            PUSH IY
            PUSH AF
            PUSH BC
            PUSH HL
            LD   A,7
            CALL AdapterReserve
            JR   C,TargetSinkImageByteReserveFailure
            POP  HL
            POP  BC
            POP  AF
            LD   (IY+0),1
            LD   (IY+1),C
            LD   (IY+2),L
            LD   (IY+3),H
            LD   (IY+4),1
            LD   (IY+5),0
            LD   (IY+6),A
            POP  IY
            OR   A
            RET
TargetSinkImageByteFailure:
            POP  IY
            RET
TargetSinkImageByteReserveFailure:
            LD   E,A
            POP  HL
            POP  BC
            POP  AF
            POP  IY
            LD   A,E
            SCF
            RET

.routine in A,BC,DE,HL,IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
TargetSinkRuntimeImage:
            LD   (AdapterRuntimeBank),A
            LD   (AdapterRuntimeLength),BC
            LD   (AdapterRuntimeIdentity),DE
            LD   (AdapterRuntimeAddress),HL
            LD   (AdapterRuntimeContext),IX
            LD   A,8+TargetContextSize
            CALL AdapterReserve
            RET  C
            LD   A,(AdapterRuntimeBank)
            LD   BC,(AdapterRuntimeLength)
            LD   DE,(AdapterRuntimeIdentity)
            LD   HL,(AdapterRuntimeAddress)
            LD   IX,(AdapterRuntimeContext)
            LD   (IY+0),3
            LD   (IY+1),A
            LD   (IY+2),L
            LD   (IY+3),H
            LD   (IY+4),C
            LD   (IY+5),B
            LD   (IY+6),E
            LD   (IY+7),D
            LD   (AdapterRuntimeLog),IY
            PUSH IY
            POP  HL
            LD   DE,8
            ADD  HL,DE
            EX   DE,HL
            PUSH IX
            POP  HL
            LD   BC,TargetContextSize
            LDIR
            LD   IY,(AdapterRuntimeLog)
            PUSH IY
            POP  HL
            LD   DE,8
            ADD  HL,DE
            LD   DE,AdapterCapturedContext
            LD   BC,TargetContextSize
            LDIR
            LD   IY,(AdapterRuntimeLog)
            OR   A
            RET

.routine in A,C,HL out A,carry,zero clobbers sign,parity,halfCarry,DE
TargetSinkPatchByte:
            PUSH IY
            PUSH AF
            PUSH BC
            PUSH HL
            LD   A,7
            CALL AdapterReserve
            JR   C,TargetSinkPatchByteReserveFailure
            POP  HL
            POP  BC
            POP  AF
            LD   (IY+0),2
            LD   (IY+1),C
            LD   (IY+2),L
            LD   (IY+3),H
            LD   (IY+4),1
            LD   (IY+5),0
            LD   (IY+6),A
            POP  IY
            OR   A
            RET
TargetSinkPatchByteFailure:
            POP  IY
            RET
TargetSinkPatchByteReserveFailure:
            LD   E,A
            POP  HL
            POP  BC
            POP  AF
            POP  IY
            LD   A,E
            SCF
            RET

.routine in C,DE,HL out A,carry,zero clobbers sign,parity,halfCarry
TargetSinkPatchWord:
            PUSH IY
            PUSH BC
            PUSH DE
            PUSH HL
            LD   A,8
            CALL AdapterReserve
            POP  HL
            POP  DE
            POP  BC
            JR   C,TargetSinkPatchWordFailure
            LD   (IY+0),2
            LD   (IY+1),C
            LD   (IY+2),E
            LD   (IY+3),D
            LD   (IY+4),2
            LD   (IY+5),0
            LD   (IY+6),L
            LD   (IY+7),H
            POP  IY
            OR   A
            RET
TargetSinkPatchWordFailure:
            POP  IY
            RET

.routine in IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IY
TargetSinkMapFlat:
            LD   A,(AdapterMapFailure)
            OR   A
            JR   Z,TargetSinkMapReady
            LD   A,DiagnosticTargetOutput
            SCF
            RET
TargetSinkMapReady:
            LD   HL,AdapterCapturedMap
            LD   B,TargetMapSize
TargetSinkMapCopy:
            LD   A,(IX+0)
            LD   (HL),A
            INC  IX
            INC  HL
            DJNZ TargetSinkMapCopy
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry
TargetSinkCommit:
            LD   A,(AdapterCommitFailure)
            OR   A
            JR   Z,TargetSinkCommitReady
            LD   A,DiagnosticTargetOutput
            SCF
            RET
TargetSinkCommitReady:
            LD   A,1
            LD   (AdapterCommitted),A
            OR   A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry
TargetSinkAbort:
            LD   A,1
            LD   (AdapterAborted),A
            OR   A
            RET

ProofStatus: .db 0
ProofCase:   .db 0
AdapterOpen: .db 0
AdapterCommitted: .db 0
AdapterAborted:   .db 0
AdapterCursor:    .dw 0
AdapterLogLength: .dw 0
AdapterFailureCountdown: .db 0
AdapterMapFailure:       .db 0
AdapterCommitFailure:    .db 0
AdapterCapturedBegin:   .ds TargetDescriptorSize
AdapterCapturedContext: .ds TargetContextSize
AdapterCapturedMap:     .ds TargetMapSize
AdapterCapturedRuntimeBase .equ AdapterCapturedContext+$00
AdapterCapturedStateBase   .equ AdapterCapturedContext+$06
AdapterCapturedUsedLength  .equ AdapterCapturedMap+$03
AdapterCapturedCodeLength  .equ AdapterCapturedMap+$0B
AdapterRuntimeBank:     .db 0
AdapterRuntimeLength:   .dw 0
AdapterRuntimeIdentity: .dw 0
AdapterRuntimeAddress:  .dw 0
AdapterRuntimeContext:  .dw 0
AdapterRuntimeLog:      .dw 0
AdapterRuntimeContextPointer .equ AdapterRuntimeContext
ProofEnd:

AdapterLogBase  .equ $B000
AdapterLogLimit .equ $E000
