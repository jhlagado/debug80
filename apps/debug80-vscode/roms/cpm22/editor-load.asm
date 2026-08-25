; Sequential text-file loader and validator.

EditorLoadCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorLoadFile:
            XOR  A
            LD   (EditorLoadPendingCr),A
            LD   HL,0
            LD   (EditorLength),HL
            LD   DE,EditorFcb
            LD   C,15
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorLoadNotFound
            LD   DE,EditorDma
            CALL EditorSetDma
EditorLoadRecord:
            LD   DE,EditorFcb
            LD   C,20
            CALL EditorCallBdos
            OR   A
            JR   Z,EditorLoadScanRecord
            DEC  A
            JR   Z,EditorLoadPhysicalEof
            JR   EditorLoadStorage
EditorLoadScanRecord:
            LD   HL,EditorDma
            LD   B,128
EditorLoadByte:
            LD   A,(HL)
            CP   $1A
            JR   Z,EditorLoadTextEof
            CALL EditorLoadValidateByte
            JR   C,EditorLoadTextError
            PUSH HL
            CALL EditorLoadAppend
            POP  HL
            JR   C,EditorLoadCapacity
            INC  HL
            DJNZ EditorLoadByte
            JR   EditorLoadRecord
EditorLoadTextEof:
            LD   A,(EditorLoadPendingCr)
            OR   A
            JR   NZ,EditorLoadTextError
            JR   EditorLoadClose
EditorLoadPhysicalEof:
            LD   A,(EditorLoadPendingCr)
            OR   A
            JR   NZ,EditorLoadTextError
EditorLoadClose:
            LD   DE,EditorFcb
            LD   C,16
            CALL EditorCallBdos
            INC  A
            JR   Z,EditorLoadStorage
            LD   HL,0
            LD   (EditorCursor),HL
            LD   (EditorTop),HL
            LD   (EditorHorizontal),HL
            LD   (EditorDesiredColumn),HL
            XOR  A
            LD   (EditorFlags),A
            LD   (EditorStatus),A
            RET
EditorLoadNotFound:
            LD   A,EditorErrorNotFound
            SCF
            RET
EditorLoadTextError:
            LD   A,EditorErrorText
            SCF
            RET
EditorLoadCapacity:
            LD   A,EditorErrorCapacity
            SCF
            RET
EditorLoadStorage:
            LD   A,EditorErrorStorage
            SCF
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,C
EditorLoadValidateByte:
            LD   C,A
            LD   A,(EditorLoadPendingCr)
            OR   A
            JR   Z,EditorLoadValidateOrdinary
            LD   A,C
            CP   10
            JR   NZ,EditorLoadValidateBad
            XOR  A
            LD   (EditorLoadPendingCr),A
            LD   A,C
            RET
EditorLoadValidateOrdinary:
            LD   A,C
            CP   13
            JR   Z,EditorLoadValidateCr
            CP   9
            JR   Z,EditorLoadValidateGood
            CP   10
            JR   Z,EditorLoadValidateGood
            CP   32
            JR   C,EditorLoadValidateBad
            CP   127
            JR   NC,EditorLoadValidateBad
EditorLoadValidateGood:
            OR   A
            RET
EditorLoadValidateCr:
            LD   A,1
            LD   (EditorLoadPendingCr),A
            LD   A,C
            OR   A
            RET
EditorLoadValidateBad:
            LD   A,C
            SCF
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
EditorLoadAppend:
            LD   DE,(EditorLength)
            LD   HL,EditorTextCapacity
            OR   A
            SBC  HL,DE
            JR   Z,EditorLoadAppendFull
            LD   HL,EditorTextBase
            ADD  HL,DE
            LD   (HL),A
            INC  DE
            LD   (EditorLength),DE
            OR   A
            RET
EditorLoadAppendFull:
            SCF
            RET
EditorLoadCodeEnd:
