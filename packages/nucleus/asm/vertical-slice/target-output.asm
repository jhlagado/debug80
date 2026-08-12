; Flat append-only target output. The operating adapter owns NOBJ framing,
; service destinations, image fill, CRC, and the two sequential spools.

; IX points at the stable compact descriptor supplied by the adapter.
.routine in IX out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
BeginTargetFlatProgram:
            LD   A,TargetOutputClosed
            LD   (TargetOutputBank),A
            LD   L,(IX+TargetDescriptorRuntimeIdentity)
            LD   H,(IX+TargetDescriptorRuntimeIdentity+1)
            LD   DE,NucleusRuntimeIdentity
            OR   A
            SBC  HL,DE
            JP   NZ,TargetConfigurationFailure
            LD   A,(IX+TargetDescriptorFlags)
            CP   TargetDescriptorEstablishStack+1
            JP   NC,TargetConfigurationFailure
            LD   L,(IX+TargetDescriptorImageBase)
            LD   H,(IX+TargetDescriptorImageBase+1)
            LD   (TargetImageBase),HL
            LD   E,(IX+TargetDescriptorImageCapacity)
            LD   D,(IX+TargetDescriptorImageCapacity+1)
            LD   (TargetImageCapacity),DE
            CALL TargetValidateRegion
            RET  C
            LD   L,(IX+TargetDescriptorWritableBase)
            LD   H,(IX+TargetDescriptorWritableBase+1)
            LD   (TargetWritableBase),HL
            LD   E,(IX+TargetDescriptorWritableCapacity)
            LD   D,(IX+TargetDescriptorWritableCapacity+1)
            LD   (TargetWritableCapacity),DE
            CALL TargetValidateRegion
            RET  C
            CALL TargetClassifyFlatLayout
            RET  C
            LD   HL,(ReadOnlyImageLength)
            LD   A,(TargetLayoutMode)
            OR   A
            JR   Z,TargetFlatReadOnlyReady
            LD   DE,(StaticImageLength)
            ADD  HL,DE
            JR   C,TargetBeginCapacityFailure
            LD   DE,NucleusRuntimeVectorLength+NucleusRuntimeStateLength
            ADD  HL,DE
            JR   C,TargetBeginCapacityFailure
TargetFlatReadOnlyReady:
            LD   (TargetReadOnlyLength),HL
            LD   DE,NucleusRuntimeExpectedLength+3
            ADD  HL,DE
            JR   C,TargetBeginCapacityFailure
            EX   DE,HL                    ; DE is fixed prefix length
            LD   HL,(TargetImageCapacity)
            OR   A
            SBC  HL,DE
            JR   C,TargetBeginCapacityFailure
            LD   A,H
            OR   L
            JR   Z,TargetBeginCapacityFailure ; at least one code byte is required
            LD   (EmitLimit),HL           ; remaining code capacity after prefix
            LD   HL,(TargetImageBase)
            ADD  HL,DE
            JR   C,TargetBeginCapacityFailure
            LD   (TargetCodeBase),HL
            LD   HL,(EmitLimit)
            LD   (TargetCodeCapacity),HL
            LD   A,(TargetLayoutMode)
            OR   A
            JR   NZ,TargetCodeCapacityReady
            LD   DE,(TargetCodeBase)
            LD   HL,(TargetWritableBase)
            OR   A
            SBC  HL,DE
            JR   C,TargetBeginCapacityFailure
            JR   Z,TargetBeginCapacityFailure
            LD   (TargetCodeCapacity),HL
            JR   TargetCodeCapacityReady
TargetBeginCapacityFailure:
            JP   TargetCapacityFailure
TargetCodeCapacityReady:

            LD   IX,(TargetDescriptorPointer)
            CALL TargetSinkBegin
            JP   C,TargetOutputFailure
            XOR  A
            LD   (TargetOutputBank),A
            LD   HL,(TargetImageBase)
            LD   (EmitCursor),HL
            LD   HL,(TargetImageCapacity)
            LD   (EmitLimit),HL
            LD   A,$C3
            CALL EmitByte
            RET  C
            LD   HL,(EmitCursor)
            LD   (EmitDataFixup),HL
            LD   HL,0
            CALL EmitWord
            RET  C

            LD   HL,(EmitCursor)
            LD   (TargetLinkedRuntimeBase),HL
            LD   DE,NucleusRuntimeExpectedLength
            ADD  HL,DE
            JP   C,TargetCapacityFailure
            LD   (TargetReadOnlyBase),HL
            CALL TargetPrepareRuntimeContext
            RET  C
            XOR  A
            LD   DE,NucleusRuntimeIdentity
            LD   BC,NucleusRuntimeExpectedLength
            LD   IX,TargetRuntimeContext
            LD   HL,(TargetLinkedRuntimeBase)
            CALL TargetSinkRuntimeImage
            JP   C,TargetOutputFailure
            LD   DE,NucleusRuntimeExpectedLength
            LD   HL,(EmitLimit)
            OR   A
            SBC  HL,DE
            JP   C,TargetCapacityFailure
            LD   (EmitLimit),HL
            LD   HL,(EmitCursor)
            ADD  HL,DE
            LD   (EmitCursor),HL
            OR   A
            RET

; HL is a region base and DE a nonzero capacity. Carry reports every wrapped
; end except the legal exact mathematical end $10000.
.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,HL
TargetValidateRegion:
            LD   A,D
            OR   E
            JP   Z,TargetCapacityFailure
            ADD  HL,DE
            JR   NC,TargetRegionReady
            LD   A,H
            OR   L
            JP   NZ,TargetCapacityFailure
TargetRegionReady:
            OR   A
            RET

; Classify two checked nonempty regions without storing an exclusive $10000
; end in a word. Loaded means writable is wholly inside image; ROM means the
; half-open regions are disjoint. Every partial overlap is rejected.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
TargetClassifyFlatLayout:
            LD   HL,(TargetWritableBase)
            LD   DE,(TargetImageBase)
            OR   A
            SBC  HL,DE                    ; writable offset from image base
            JR   C,TargetWritableBeforeImage
            LD   DE,(TargetImageCapacity)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  BC                       ; BC = writable offset
            JR   NC,TargetFlatRomReady    ; starts at or after image end
            LD   HL,(TargetImageCapacity)
            OR   A
            SBC  HL,BC                    ; remaining image capacity
            LD   DE,(TargetWritableCapacity)
            OR   A
            SBC  HL,DE
            JP   C,TargetConfigurationFailure
            XOR  A
            LD   (TargetLayoutMode),A
            RET
TargetWritableBeforeImage:
            LD   HL,(TargetImageBase)
            LD   DE,(TargetWritableBase)
            OR   A
            SBC  HL,DE                    ; distance to image start
            LD   DE,(TargetWritableCapacity)
            OR   A
            SBC  HL,DE
            JP   C,TargetConfigurationFailure
TargetFlatRomReady:
            LD   A,TargetLayoutRom
            LD   (TargetLayoutMode),A
            OR   A
            RET

; Build the compiler-owned portion of the complete operating-layer link
; context. Service destinations are supplied by the adapter at this call.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
TargetPrepareRuntimeContext:
            LD   HL,(TargetLinkedRuntimeBase)
            LD   (TargetContextRuntimeBase),HL
            LD   HL,(TargetWritableBase)
            LD   (TargetContextWritableBase),HL
            LD   DE,(TargetWritableCapacity)
            LD   (TargetContextWritableCapacity),DE
            LD   (TargetContextVectorBase),HL
            LD   DE,NucleusRuntimeVectorLength
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
            LD   (TargetContextStateBase),HL
            LD   DE,NucleusRuntimeStateLength
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
            LD   (TargetContextDataBase),HL
            LD   BC,(StaticImageLength)
            LD   DE,(ProgramBssLength)
            LD   H,B
            LD   L,C
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
            LD   (TargetContextDataCapacity),HL
            LD   HL,(TargetContextDataBase)
            LD   DE,(StaticImageLength)
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
            LD   (TargetBssBase),HL
            LD   HL,(TargetReadOnlyBase)
            LD   A,(TargetLayoutMode)
            OR   A
            JR   Z,TargetContextRoDataReady
            LD   DE,NucleusRuntimeVectorLength+NucleusRuntimeStateLength
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
            LD   DE,(StaticImageLength)
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
TargetContextRoDataReady:
            LD   (TargetContextRoDataBase),HL
            LD   HL,(ReadOnlyImageLength)
            LD   (TargetContextRoDataCapacity),HL
            LD   DE,NucleusRuntimeVectorLength+NucleusRuntimeStateLength
            LD   HL,(StaticImageLength)
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
            LD   DE,(ProgramBssLength)
            ADD  HL,DE
            JR   C,TargetPrepareCapacityFailure
            LD   DE,(TargetWritableCapacity)
            OR   A
            SBC  HL,DE
            JR   C,TargetWritableAllocationReady
            JR   Z,TargetWritableAllocationReady
TargetPrepareCapacityFailure:
            JP   TargetCapacityFailure
TargetWritableAllocationReady:
            XOR  A
            RET

; Emit a call to one identity-fixed helper in the context-linked runtime.
; DE is the helper offset published by nucleus-runtime-identity.asmi.
.routine in DE out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
EmitRuntimeCall:
            LD   HL,(TargetLinkedRuntimeBase)
            ADD  HL,DE
            JP   EmitCall

; Resolve one identity-fixed writable-state offset for generated operands.
.routine in DE out A,HL,carry,zero clobbers sign,parity,halfCarry
TargetStateAddress:
            LD   HL,(TargetContextStateBase)
            ADD  HL,DE
            OR   A
            RET

; A is the identity-defined RAM-vector ordinal. The generated call reaches the
; writable vector rather than an address in the compiler's proof adapter.
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL
EmitTargetVectorCall:
            LD   E,A
            ADD  A,A
            ADD  A,E
            LD   E,A
            LD   D,0
            LD   HL,(TargetContextVectorBase)
            ADD  HL,DE
            JP   EmitCall

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
FinishTargetFlatProgram:
            LD   HL,(EmitCursor)
            LD   DE,(TargetCodeBase)
            OR   A
            SBC  HL,DE
            LD   (TargetCodeLength),HL
            LD   (GeneratedSize),HL
            CALL TargetEmitLoadedInitialData
            JR   C,AbortTargetProgram
            LD   HL,(EmitCursor)
            LD   DE,(TargetImageBase)
            OR   A
            SBC  HL,DE
            LD   (TargetMapUsedLength),HL
            LD   HL,(TargetImageBase)
            LD   (TargetMapEntryAddress),HL
            XOR  A
            LD   (TargetMapEntryBank),A
            LD   HL,(TargetReadOnlyBase)
            LD   DE,(TargetReadOnlyLength)
            LD   A,D
            OR   E
            JR   NZ,TargetMapReadOnlyReady
            LD   HL,0
TargetMapReadOnlyReady:
            LD   (TargetMapReadOnlyBase),HL
            LD   (TargetMapReadOnlyLength),DE
            LD   HL,(TargetCodeBase)
            LD   (TargetMapCodeBase),HL
            LD   HL,(TargetCodeLength)
            LD   (TargetMapCodeLength),HL
            LD   IX,TargetFlatMapBase
            CALL TargetSinkMapFlat
            JR   C,TargetFinishOutputFailure
            CALL TargetSinkCommit
            JR   C,TargetFinishOutputFailure
            XOR  A
            RET

; Loaded output places the vector/state/program initializer at its run address
; after code. ROM output already emitted the same bytes before code.
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
TargetEmitLoadedInitialData:
            LD   A,(TargetLayoutMode)
            OR   A
            RET  NZ
            LD   HL,(TargetWritableBase)
            LD   (EmitCursor),HL
            LD   HL,(StaticImageLength)
            LD   DE,NucleusRuntimeVectorLength+NucleusRuntimeStateLength
            ADD  HL,DE
            LD   (EmitLimit),HL
            LD   B,NucleusRuntimeVectorLength+NucleusRuntimeStateLength
            XOR  A
TargetLoadedRuntimeInitialLoop:
            PUSH BC
            CALL EmitByte
            POP  BC
            RET  C
            DJNZ TargetLoadedRuntimeInitialLoop
            LD   HL,StaticImageBase
            LD   BC,(StaticImageLength)
TargetLoadedDataLoop:
            LD   A,B
            OR   C
            RET  Z
            LD   A,(HL)
            INC  HL
            PUSH BC
            PUSH HL
            CALL EmitByte
            POP  HL
            POP  BC
            RET  C
            DEC  BC
            JR   TargetLoadedDataLoop

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
AbortTargetProgram:
            PUSH AF
            LD   A,(TargetOutputBank)
            INC  A
            CALL NZ,TargetSinkAbort
            POP  AF
            SCF
            RET

TargetConfigurationFailure:
            LD   A,DiagnosticTargetConfiguration
            JP   CompilerSetDiagnostic
TargetCapacityFailure:
            LD   A,DiagnosticTargetCapacity
            JP   CompilerSetDiagnostic
; A late map or commit failure still owns an open sink generation. Preserve
; the adapter's diagnostic and abort before entering the common output tail.
TargetFinishOutputFailure:
            PUSH AF
            CALL TargetSinkAbort
            POP  AF
TargetOutputFailure:
            OR   A
            JR   NZ,TargetOutputDiagnosticReady
            LD   A,DiagnosticTargetOutput
TargetOutputDiagnosticReady:
            JP   CompilerSetDiagnostic
