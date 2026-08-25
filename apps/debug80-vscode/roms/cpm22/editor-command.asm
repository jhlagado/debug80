; Command-tail parser for EDIT and EDIT NAME.EXT.

EditorCommandLength .equ $0080
EditorCommandStart  .equ $0081

EditorCommandCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX
EditorPrepareCommand:
            LD   HL,EditorDefaultName
            LD   DE,EditorFcb
            CALL EditorBuildFcb
            LD   A,(EditorCommandLength)
            LD   B,A
            LD   HL,EditorCommandStart
            CALL EditorCommandSkipSpaces
            JR   Z,EditorCommandReady
            LD   (EditorScratchA),HL
            LD   A,B
            LD   (EditorScratchC),A
            CALL EditorCommandClearName
            LD   HL,(EditorScratchA)
            LD   A,(EditorScratchC)
            LD   B,A
            CALL EditorCommandParseName
            JR   C,EditorCommandInvalid
            CALL EditorCommandSkipSpaces
            JR   NZ,EditorCommandInvalid
EditorCommandReady:
            LD   HL,EditorFcb+9
            LD   DE,EditorBackupExtension
            CALL EditorCommandExtensionEqual
            JR   Z,EditorCommandInvalid
            LD   HL,EditorFcb+9
            LD   DE,EditorTemporaryExtension
            CALL EditorCommandExtensionEqual
            JR   Z,EditorCommandInvalid
            XOR  A
            RET
EditorCommandInvalid:
            LD   A,EditorErrorCommand
            SCF
            RET

.routine in B,HL out A,B,HL,zero clobbers carry,sign,parity,halfCarry
EditorCommandSkipSpaces:
            LD   A,B
            OR   A
            RET  Z
            LD   A,(HL)
            CP   ' '
            RET  NZ
            INC  HL
            DEC  B
            JR   EditorCommandSkipSpaces

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorCommandClearName:
            XOR  A
            LD   (EditorFcb),A
            LD   HL,EditorFcb+1
            LD   DE,EditorFcb+2
            LD   BC,10
            LD   (HL),' '
            LDIR
            RET

.routine in B,HL out A,B,HL,carry,zero clobbers sign,parity,halfCarry,C,D,IX
EditorCommandParseName:
            LD   IX,EditorFcb+1
            LD   D,8
            LD   C,0
EditorCommandNameByte:
            LD   A,B
            OR   A
            JR   Z,EditorCommandNameDone
            LD   A,(HL)
            CP   ' '
            JR   Z,EditorCommandNameDone
            CP   '.'
            JR   NZ,EditorCommandNameData
            LD   A,D
            CP   8
            JR   NZ,EditorCommandNameBad
            LD   A,C
            OR   A
            JR   Z,EditorCommandNameBad
            LD   IX,EditorFcb+9
            LD   D,3
            LD   C,0
            JR   EditorCommandNameTake
EditorCommandNameData:
            CP   'a'
            JR   C,EditorCommandNameCheck
            CP   'z'+1
            JR   NC,EditorCommandNameCheck
            AND  $DF
EditorCommandNameCheck:
            CALL EditorCommandFilenameChar
            JR   C,EditorCommandNameBad
            INC  C
            PUSH AF
            LD   A,D
            CP   C
            JR   C,EditorCommandNameOverflow
            POP  AF
            LD   (IX+0),A
            INC  IX
EditorCommandNameTake:
            INC  HL
            DEC  B
            JR   EditorCommandNameByte
EditorCommandNameDone:
            LD   A,C
            OR   A
            JR   Z,EditorCommandNameBad
            RET
EditorCommandNameOverflow:
            POP  AF
EditorCommandNameBad:
            SCF
            RET

.routine in A out A,carry clobbers zero,sign,parity,halfCarry
EditorCommandFilenameChar:
            CP   '!'
            RET  C
            CP   $7F
            JR   NC,EditorCommandFilenameBad
            CP   '*'
            JR   C,EditorCommandFilenameHigh
            CP   '-'
            JR   C,EditorCommandFilenameBad
            CP   '/'
            JR   Z,EditorCommandFilenameBad
            CP   ':'
            JR   C,EditorCommandFilenameHigh
            CP   '@'
            JR   C,EditorCommandFilenameBad
EditorCommandFilenameHigh:
            CP   '['
            JR   C,EditorCommandFilenameReady
            CP   '^'
            JR   C,EditorCommandFilenameBad
            CP   '_'
            JR   Z,EditorCommandFilenameBad
EditorCommandFilenameReady:
            OR   A
            RET
EditorCommandFilenameBad:
            SCF
            RET

.routine in DE,HL out A,zero clobbers carry,sign,parity,halfCarry,B,DE,HL
EditorCommandExtensionEqual:
            LD   B,3
EditorCommandExtensionLoop:
            LD   A,(DE)
            CP   (HL)
            RET  NZ
            INC  DE
            INC  HL
            DJNZ EditorCommandExtensionLoop
            XOR  A
            RET
EditorCommandCodeEnd:
