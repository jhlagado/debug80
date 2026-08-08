; Slice-specific NVM loader, validator, interpreter, and service adapter.
;
; The loader admits the canonical one-routine image emitted by nvm-sink.asm,
; with the character literal as its sole varying byte. Validation completes
; before any NVM or service state is changed.

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
            JR   NZ,NvmLoadRejected
            PUSH HL
            POP  IX

            LD   DE,NvmValidationPrefix
            LD   B,43
            CALL NvmCompareBytes
            JR   NC,NvmLoadRejected
            PUSH IX
            POP  HL
            LD   DE,44
            ADD  HL,DE
            LD   DE,NvmValidationSuffix
            LD   B,14
            CALL NvmCompareBytes
            JR   NC,NvmLoadRejected

            PUSH IX
            POP  HL
            LD   (NvmImagePointer),HL
            LD   DE,NvmCodeOffset
            ADD  HL,DE
            LD   (NvmCodePointer),HL
            LD   HL,0
            LD   (NvmPc),HL
            LD   (NvmInstructionStart),HL
            LD   (NvmSlot0),HL
            LD   (NvmArgument0),HL
            LD   (NvmArgumentMask),HL
            LD   (NvmTrapOffset),HL
            XOR  A
            LD   (NvmCompletion),A
            LD   (NvmError),A
            LD   (NvmTrapNumber),A
            LD   (NvmTrapRoutine),A
            LD   (NvmTrapError),A
            LD   (ServiceOutputLength),A
            LD   (ServiceOutputByte),A
            LD   A,NvmRunReady
            LD   (NvmRunState),A
            OR   A
            RET
NvmLoadRejected:
            SCF
            RET

; Fetch one code byte and advance the NVM offset. Carry denotes invalid state.
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
            CP   $51
            JP   Z,NvmExecuteSvc
            CP   $0B
            JP   Z,NvmExecuteJfail
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
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,C
            LD   (NvmSlot0),A
            XOR  A
            LD   (NvmSlot0+1),A
            RET

NvmExecuteArg:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            OR   A
            JP   NZ,NvmInvalidExecution
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,(NvmCompletion)
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   HL,(NvmSlot0)
            LD   (NvmArgument0),HL
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
            LD   A,(NvmArgument0+1)
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   HL,0
            LD   (NvmArgumentMask),HL
            LD   A,(ServiceForceFailure)
            OR   A
            JR   NZ,NvmExecuteSvcFailure
            LD   A,(NvmArgument0)
            LD   (ServiceOutputByte),A
            LD   A,1
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
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,(NvmCompletion)
            CP   NvmCompletionFailure
            JP   NZ,NvmInvalidExecution
            LD   A,(NvmError)
            LD   (NvmSlot0),A
            XOR  A
            LD   (NvmSlot0+1),A
            LD   (NvmCompletion),A
            RET

NvmExecuteFail:
            CALL NvmFetchByte
            JP   C,NvmInvalidExecution
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,(NvmSlot0+1)
            OR   A
            JP   NZ,NvmInvalidExecution
            LD   A,6
            LD   (NvmTrapNumber),A
            XOR  A
            LD   (NvmTrapRoutine),A
            LD   HL,(NvmInstructionStart)
            LD   (NvmTrapOffset),HL
            LD   A,(NvmSlot0)
            LD   (NvmTrapError),A
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
