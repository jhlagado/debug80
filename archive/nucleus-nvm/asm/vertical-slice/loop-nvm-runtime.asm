; Loader and interpreter for the counted-loop NVM proof image.

.routine in B,DE,HL out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
NvmCompareBytes:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,NvmCompareBytesNo
            INC  DE
            INC  HL
            DJNZ NvmCompareBytes
            SCF
            RET
NvmCompareBytesNo:
            OR   A
            RET

; HL..DE is the half-open candidate image range. Carry means rejection.
.routine in DE,HL out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX
NvmLoad:
            PUSH HL
            OR   A
            SBC  HL,DE
            LD   BC,-NvmImageSize
            OR   A
            SBC  HL,BC
            POP  HL
            JP   NZ,NvmLoadRejected
            PUSH HL
            POP  IX

            LD   DE,NvmValidationTemplate
            LD   B,43
            CALL NvmCompareBytes
            JP   NC,NvmLoadRejected
            PUSH IX
            POP  HL
            LD   BC,44
            ADD  HL,BC
            LD   DE,NvmValidationTemplate+44
            LD   B,2
            CALL NvmCompareBytes
            JP   NC,NvmLoadRejected
            PUSH IX
            POP  HL
            LD   BC,47
            ADD  HL,BC
            LD   DE,NvmValidationTemplate+47
            LD   B,2
            CALL NvmCompareBytes
            JP   NC,NvmLoadRejected
            PUSH IX
            POP  HL
            LD   BC,50
            ADD  HL,BC
            LD   DE,NvmValidationTemplate+50
            LD   B,5
            CALL NvmCompareBytes
            JP   NC,NvmLoadRejected
            PUSH IX
            POP  HL
            LD   BC,56
            ADD  HL,BC
            LD   DE,NvmValidationTemplate+56
            LD   B,10
            CALL NvmCompareBytes
            JP   NC,NvmLoadRejected
            PUSH IX
            POP  HL
            LD   BC,67
            ADD  HL,BC
            LD   DE,NvmValidationTemplate+67
            LD   B,29
            CALL NvmCompareBytes
            JP   NC,NvmLoadRejected

            PUSH IX
            POP  HL
            LD   (NvmImagePointer),HL
            LD   DE,NvmCodeOffset
            ADD  HL,DE
            LD   (NvmCodePointer),HL
            LD   HL,0
            LD   (NvmPc),HL
            LD   (NvmInstructionStart),HL
            LD   (NvmArgument0),HL
            LD   (NvmArgumentMask),HL
            LD   (NvmTrapOffset),HL
            LD   HL,NvmSlots
            LD   B,NvmSlotsEnd-NvmSlots
            XOR  A
NvmLoadClearSlots:
            LD   (HL),A
            INC  HL
            DJNZ NvmLoadClearSlots
            LD   (NvmCompletion),A
            LD   (NvmError),A
            LD   (NvmTrapNumber),A
            LD   (NvmTrapRoutine),A
            LD   (NvmTrapError),A
            LD   (ServiceCallCount),A
            LD   (ServiceOutputLength),A
            LD   HL,ServiceOutputBase
            LD   B,ServiceOutputCapacity
NvmLoadClearOutput:
            LD   (HL),A
            INC  HL
            DJNZ NvmLoadClearOutput
            LD   A,NvmRunReady
            LD   (NvmRunState),A
            OR   A
            RET
NvmLoadRejected:
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
NvmFetchByte:
            LD   HL,(NvmPc)
            LD   DE,NvmCodeSize
            LD   A,H
            OR   A
            JR   NZ,NvmFetchByteInvalid
            LD   A,L
            CP   E
            JR   NC,NvmFetchByteInvalid
            PUSH HL
            INC  HL
            LD   (NvmPc),HL
            POP  HL
            LD   DE,(NvmCodePointer)
            ADD  HL,DE
            LD   A,(HL)
            OR   A
            RET
NvmFetchByteInvalid:
            SCF
            RET

.routine in A out carry,zero,HL clobbers sign,parity,halfCarry,A,DE
NvmSlotAddress:
            CP   NvmClobberCount
            JR   NC,NvmSlotAddressInvalid
            LD   L,A
            LD   H,0
            ADD  HL,HL
            LD   DE,NvmSlots
            ADD  HL,DE
            OR   A
            RET
NvmSlotAddressInvalid:
            SCF
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
NvmReadSlotByte:
            CALL NvmSlotAddress
            RET  C
            INC  HL
            LD   A,(HL)
            OR   A
            JR   NZ,NvmReadSlotByteInvalid
            DEC  HL
            LD   A,(HL)
            OR   A
            RET
NvmReadSlotByteInvalid:
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NvmStep:
            LD   HL,(NvmPc)
            LD   (NvmInstructionStart),HL
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CP   $01
            JP   Z,NvmExecuteLdi8
            CP   $04
            JP   Z,NvmExecuteArg
            CP   $08
            JP   Z,NvmExecuteJmp
            CP   $09
            JP   Z,NvmExecuteJz
            CP   $0B
            JP   Z,NvmExecuteJfail
            CP   $10
            JP   Z,NvmExecuteAdd8
            CP   $2A
            JP   Z,NvmExecuteLt8
            CP   $51
            JP   Z,NvmExecuteSvc
            CP   $52
            JP   Z,NvmExecuteRet
            CP   $06
            JP   Z,NvmExecuteGete
            CP   $54
            JP   Z,NvmExecuteFail
            JP   NvmInvalidExecution

NvmExecuteLdi8:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   C,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmSlotAddress
            JP   C,NvmInvalidExecution
            LD   (HL),C
            INC  HL
            LD   (HL),0
            RET

NvmExecuteLt8:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmReadSlotByte
            JP   C,NvmInvalidExecution
            LD   B,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmReadSlotByte
            JP   C,NvmInvalidExecution
            LD   C,A
            LD   A,B
            CP   C
            LD   C,0
            JR   NC,NvmExecuteLt8Result
            INC  C
NvmExecuteLt8Result:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmSlotAddress
            JP   C,NvmInvalidExecution
            LD   (HL),C
            INC  HL
            LD   (HL),0
            RET

NvmExecuteAdd8:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmReadSlotByte
            JP   C,NvmInvalidExecution
            LD   B,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmReadSlotByte
            JP   C,NvmInvalidExecution
            ADD  A,B
            LD   C,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmSlotAddress
            JP   C,NvmInvalidExecution
            LD   (HL),C
            INC  HL
            LD   (HL),0
            RET

NvmExecuteJz:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmReadSlotByte
            JP   C,NvmInvalidExecution
            CP   2
            JP   NC,NvmInvalidExecution
            PUSH AF
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   C,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   B,A
            POP  AF
            OR   A
            RET  NZ
            LD   H,B
            LD   L,C
            LD   (NvmPc),HL
            RET

NvmExecuteJmp:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   C,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   H,A
            LD   L,C
            LD   (NvmPc),HL
            RET

NvmExecuteArg:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmReadSlotByte
            JP   C,NvmInvalidExecution
            LD   C,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,(NvmCompletion)
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,C
            LD   (NvmArgument0),A
            XOR  A
            LD   (NvmArgument0+1),A
            LD   HL,1
            LD   (NvmArgumentMask),HL
            RET

NvmExecuteSvc:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CP   1
            JP   NZ,NvmInvalidExecution
            LD   A,(NvmCompletion)
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   HL,(NvmArgumentMask)
            LD   DE,1
            OR   A
            SBC  HL,DE
            JP   NZ,NvmInvalidExecution
            LD   HL,0
            LD   (NvmArgumentMask),HL
            LD   A,(ServiceCallCount)
            INC  A
            LD   (ServiceCallCount),A
            LD   B,A
            LD   A,(ServiceFailureCall)
            OR   A
            JR   Z,NvmExecuteSvcSuccess
            CP   B
            JR   Z,NvmExecuteSvcFailure
NvmExecuteSvcSuccess:
            LD   A,(ServiceOutputLength)
            CP   ServiceOutputCapacity
            JR   NC,NvmExecuteSvcFailure
            LD   E,A
            LD   D,0
            LD   HL,ServiceOutputBase
            ADD  HL,DE
            LD   A,(NvmArgument0)
            LD   (HL),A
            LD   A,(ServiceOutputLength)
            INC  A
            LD   (ServiceOutputLength),A
            LD   A,NvmCompletionSuccess
            LD   (NvmCompletion),A
            RET
NvmExecuteSvcFailure:
            LD   A,3
            LD   (NvmError),A
            LD   A,NvmCompletionFailure
            LD   (NvmCompletion),A
            RET

NvmExecuteJfail:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   C,A
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   B,A
            LD   A,(NvmCompletion)
            CP   NvmCompletionFailure
            JR   Z,NvmExecuteJfailTaken
            CP   NvmCompletionSuccess
            JP   NZ,NvmInvalidExecution
            XOR  A
            LD   (NvmCompletion),A
            RET
NvmExecuteJfailTaken:
            LD   H,B
            LD   L,C
            LD   (NvmPc),HL
            RET

NvmExecuteRet:
            LD   A,(NvmCompletion)
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,NvmRunSucceeded
            LD   (NvmRunState),A
            RET

NvmExecuteGete:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            LD   C,A
            LD   A,(NvmCompletion)
            CP   NvmCompletionFailure
            JP   NZ,NvmInvalidExecution
            LD   A,C
            CALL NvmSlotAddress
            JP   C,NvmInvalidExecution
            LD   A,(NvmError)
            LD   (HL),A
            INC  HL
            LD   (HL),0
            XOR  A
            LD   (NvmCompletion),A
            RET

NvmExecuteFail:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            CALL NvmReadSlotByte
            JP   C,NvmInvalidExecution
            LD   (NvmTrapError),A
            LD   A,6
            LD   (NvmTrapNumber),A
            XOR  A
            LD   (NvmTrapRoutine),A
            LD   HL,(NvmInstructionStart)
            LD   (NvmTrapOffset),HL
            LD   A,NvmRunTrapped
            LD   (NvmRunState),A
            RET

NvmInvalidExecution:
            LD   A,NvmRunInvalid
            LD   (NvmRunState),A
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,B,C,DE,HL,IX,IY
NvmRun:
NvmRunLoop:
            LD   A,(NvmRunState)
            CP   NvmRunReady
            RET  NZ
            CALL NvmStep
            JR   NvmRunLoop
