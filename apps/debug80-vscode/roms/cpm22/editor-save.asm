; Recoverable save using NAME.$$$ and NAME.BAK.

EditorSaveCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSave:
            XOR  A
            LD   (EditorSaveState),A
            CALL EditorSaveSetTemporary
            CALL EditorSaveRequireAbsent
            JR   C,EditorSaveConflict
            CALL EditorSaveSetBackup
            CALL EditorSaveRequireAbsent
            JR   C,EditorSaveConflict
            CALL EditorSaveSetTemporary
            LD   DE,EditorTransactionFcb
            LD   C,22
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorSaveCreateFailure
            LD   A,1
            LD   (EditorSaveState),A
            CALL EditorSaveWriteContent
            JR   C,EditorSaveWriteFailure
            LD   DE,EditorTransactionFcb
            LD   C,16
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorSaveCloseFailure
            CALL EditorSaveBuildSelectedToBackup
            LD   DE,EditorTransactionFcb
            LD   C,23
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorSaveRenameFailure
            LD   A,3
            LD   (EditorSaveState),A
            CALL EditorSaveBuildTemporaryToSelected
            LD   DE,EditorTransactionFcb
            LD   C,23
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorSaveRenameFailure
            LD   A,7
            LD   (EditorSaveState),A
            CALL EditorSaveSetBackup
            LD   DE,EditorTransactionFcb
            LD   C,19
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorSaveRenameFailure
            XOR  A
            LD   (EditorSaveState),A
            LD   A,(EditorFlags)
            AND  $FC
            LD   (EditorFlags),A
            LD   A,EditorStatusSaved
            LD   (EditorStatus),A
            OR   A
            RET
EditorSaveConflict:
            LD   A,EditorStatusSaveConflict
            JR   EditorSaveFail
EditorSaveCreateFailure:
            LD   A,EditorStatusSaveCreate
            JR   EditorSaveFail
EditorSaveWriteFailure:
            LD   A,EditorStatusSaveWrite
            JR   EditorSaveFail
EditorSaveCloseFailure:
            LD   A,EditorStatusSaveClose
            JR   EditorSaveFail
EditorSaveRenameFailure:
            LD   A,EditorStatusSaveRename
EditorSaveFail:
            LD   (EditorStatus),A
            CALL EditorSaveRollback
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSaveRequireAbsent:
            LD   DE,EditorTransactionFcb
            LD   C,15
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorSaveAbsent
            SCF
            RET
EditorSaveAbsent:
            XOR  A
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSaveWriteContent:
            LD   HL,EditorTextBase
            LD   (EditorScratchA),HL
            LD   HL,(EditorLength)
            LD   (EditorScratchB),HL
EditorSaveRecordLoop:
            LD   HL,(EditorScratchB)
            LD   DE,128
            OR   A
            SBC  HL,DE
            JR   C,EditorSavePartialRecord
            LD   (EditorScratchB),HL
            LD   DE,(EditorScratchA)
            CALL EditorSetDma
            CALL EditorSaveWriteRecord
            RET  C
            LD   HL,(EditorScratchA)
            LD   DE,128
            ADD  HL,DE
            LD   (EditorScratchA),HL
            JR   EditorSaveRecordLoop
EditorSavePartialRecord:
            ADD  HL,DE
            LD   A,H
            OR   L
            RET  Z
            LD   (EditorScratchB),HL
            LD   HL,EditorDma
            LD   DE,EditorDma+1
            LD   BC,127
            LD   (HL),$1A
            LDIR
            LD   HL,(EditorScratchA)
            LD   DE,EditorDma
            LD   BC,(EditorScratchB)
            LDIR
            LD   DE,EditorDma
            CALL EditorSetDma
            JP   EditorSaveWriteRecord

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSaveWriteRecord:
            LD   DE,EditorTransactionFcb
            LD   C,21
            CALL EditorCallBdos
            OR   A
            RET  Z
            SCF
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSaveRollback:
            LD   A,(EditorSaveState)
            OR   A
            RET  Z
            AND  4
            JR   Z,EditorSaveRollbackTemporary
            CALL EditorSaveCopySelected
            LD   DE,EditorTransactionFcb
            LD   C,19
            CALL EditorCallBdos
EditorSaveRollbackTemporary:
            CALL EditorSaveSetTemporary
            LD   DE,EditorTransactionFcb
            LD   C,16
            CALL EditorCallBdos
            CALL EditorSaveSetTemporary
            LD   DE,EditorTransactionFcb
            LD   C,19
            CALL EditorCallBdos
            LD   A,(EditorSaveState)
            AND  2
            JR   Z,EditorSaveRollbackDone
            CALL EditorSaveBuildBackupToSelected
            LD   DE,EditorTransactionFcb
            LD   C,23
            CALL EditorCallBdos
            INC  A
            JR   NZ,EditorSaveRollbackDone
            LD   A,EditorStatusSaveRollback
            LD   (EditorStatus),A
EditorSaveRollbackDone:
            XOR  A
            LD   (EditorSaveState),A
            RET

.routine out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveCopySelected:
            LD   HL,EditorFcb
            LD   DE,EditorTransactionFcb
            JP   EditorBuildFcb

.routine out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveSetTemporary:
            CALL EditorSaveCopySelected
            LD   HL,$2424
            LD   (EditorTransactionFcb+9),HL
            LD   A,'$'
            LD   (EditorTransactionFcb+11),A
            RET

.routine out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveSetBackup:
            CALL EditorSaveCopySelected
            LD   HL,$4142
            LD   (EditorTransactionFcb+9),HL
            LD   A,'K'
            LD   (EditorTransactionFcb+11),A
            RET

.routine out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveBuildSelectedToBackup:
            CALL EditorSaveCopySelected
            LD   HL,EditorTransactionFcb
            LD   DE,EditorTransactionFcb+16
            LD   BC,12
            LDIR
            LD   HL,$4142
            LD   (EditorTransactionFcb+25),HL
            LD   A,'K'
            LD   (EditorTransactionFcb+27),A
            RET

.routine out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveBuildTemporaryToSelected:
            CALL EditorSaveSetTemporary
            LD   HL,EditorFcb
            LD   DE,EditorTransactionFcb+16
            LD   BC,12
            LDIR
            RET

.routine out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveBuildBackupToSelected:
            CALL EditorSaveSetBackup
            LD   HL,EditorFcb
            LD   DE,EditorTransactionFcb+16
            LD   BC,12
            LDIR
            RET
EditorSaveCodeEnd:
