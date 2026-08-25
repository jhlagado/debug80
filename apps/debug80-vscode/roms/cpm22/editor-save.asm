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
            LD   C,22
            CALL EditorTransactionCall
            INC  A
            JR   Z,EditorSaveCreateFailure
            LD   A,1
            LD   (EditorSaveState),A
            CALL EditorSaveWriteContent
            JR   C,EditorSaveWriteFailure
            LD   C,16
            CALL EditorTransactionCall
            INC  A
            JR   Z,EditorSaveCloseFailure
            CALL EditorSaveCopySelected
            LD   HL,EditorTransactionFcb
            CALL EditorSaveBuildRename
            LD   HL,$4142
            LD   (EditorTransactionFcb+25),HL
            LD   A,'K'
            LD   (EditorTransactionFcb+27),A
            LD   C,23
            CALL EditorTransactionCall
            INC  A
            JR   Z,EditorSaveRenameFailure
            LD   A,3
            LD   (EditorSaveState),A
            CALL EditorSaveSetTemporary
            LD   HL,EditorFcb
            CALL EditorSaveBuildRename
            LD   C,23
            CALL EditorTransactionCall
            INC  A
            JR   Z,EditorSaveRenameFailure
            LD   A,7
            LD   (EditorSaveState),A
            CALL EditorSaveSetBackup
            LD   C,19
            CALL EditorTransactionCall
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
            LD   C,15
            CALL EditorTransactionCall
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
            JR   EditorSaveWriteRecord

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorSaveWriteRecord:
            LD   C,21
            CALL EditorTransactionCall
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
            LD   C,19
            CALL EditorTransactionCall
EditorSaveRollbackTemporary:
            CALL EditorSaveSetTemporary
            LD   C,16
            CALL EditorTransactionCall
            CALL EditorSaveSetTemporary
            LD   C,19
            CALL EditorTransactionCall
            LD   A,(EditorSaveState)
            AND  2
            JR   Z,EditorSaveRollbackDone
            CALL EditorSaveSetBackup
            LD   HL,EditorFcb
            CALL EditorSaveBuildRename
            LD   C,23
            CALL EditorTransactionCall
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
            LD   A,'$'
            JR   EditorSaveSetExtension

.routine out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveSetBackup:
            CALL EditorSaveCopySelected
            LD   HL,$4142
            LD   A,'K'

.routine in A,HL out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveSetExtension:
            LD   (EditorTransactionFcb+9),HL
            LD   (EditorTransactionFcb+11),A
            RET

.routine in HL out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
EditorSaveBuildRename:
            LD   DE,EditorTransactionFcb+16
            LD   BC,12
            LDIR
            RET
EditorSaveCodeEnd:
