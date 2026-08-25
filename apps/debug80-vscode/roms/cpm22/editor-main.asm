; Transient entry, raw-key dispatcher, and CCP return.

EditorMainCodeStart:
.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
EditorEntry:
            LD   (EditorRestoreSp+1),SP
            LD   SP,EditorStackTop
            CALL EditorRun
EditorRestoreSp:
            LD   SP,0
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
EditorRun:
            CALL EditorPrepareCommand
            JP   C,EditorRunError
            CALL EditorLoadFile
            JP   C,EditorRunError
            CALL EditorRender
EditorMainLoop:
            CALL EditorReadByte
            CP   17
            JP   Z,EditorCommandQuit
            PUSH AF
            LD   A,(EditorFlags)
            AND  $FD
            LD   (EditorFlags),A
            POP  AF
            CP   19
            JR   Z,EditorCommandSave
            CP   27
            JR   Z,EditorCommandEscape
            CP   13
            JR   Z,EditorCommandNewline
            CP   8
            JR   Z,EditorCommandBackspace
            CP   127
            JR   Z,EditorCommandDelete
            CP   9
            JR   Z,EditorCommandInsert
            CP   32
            JR   C,EditorCommandUnsupported
            CP   127
            JR   NC,EditorCommandUnsupported
EditorCommandInsert:
            CALL EditorBufferInsertByte
            JR   EditorCommandComplete
EditorCommandNewline:
            CALL EditorBufferInsertNewline
            JR   EditorCommandComplete
EditorCommandBackspace:
            CALL EditorBufferBackspace
            JR   EditorCommandComplete
EditorCommandDelete:
            CALL EditorBufferDelete
            JR   EditorCommandComplete
EditorCommandSave:
            CALL EditorSave
            JR   EditorCommandComplete
EditorCommandEscape:
            CALL EditorReadEscapeByte
            JR   C,EditorCommandUnsupported
            CP   '['
            JR   NZ,EditorCommandUnsupported
            CALL EditorReadEscapeByte
            JR   C,EditorCommandUnsupported
            CP   'A'
            JR   Z,EditorCommandUp
            CP   'B'
            JR   Z,EditorCommandDown
            CP   'C'
            JR   Z,EditorCommandRight
            CP   'D'
            JR   NZ,EditorCommandUnsupported
            CALL EditorMoveLeft
            JR   EditorCommandComplete
EditorCommandUp:
            CALL EditorMoveUp
            JR   EditorCommandComplete
EditorCommandDown:
            CALL EditorMoveDown
            JR   EditorCommandComplete
EditorCommandRight:
            CALL EditorMoveRight
            JR   EditorCommandComplete
EditorCommandUnsupported:
            CALL EditorBufferBoundary
EditorCommandComplete:
            JR   NC,EditorCommandRender
            CALL EditorRingBell
EditorCommandRender:
            CALL EditorRender
            JP   EditorMainLoop

EditorCommandQuit:
            LD   A,(EditorFlags)
            AND  EditorFlagDirty
            JR   Z,EditorCommandExit
            LD   A,(EditorFlags)
            AND  EditorFlagConfirmQuit
            JR   NZ,EditorCommandExit
            LD   A,(EditorFlags)
            OR   EditorFlagConfirmQuit
            LD   (EditorFlags),A
            LD   A,EditorStatusDiscard
            LD   (EditorStatus),A
            CALL EditorRender
            JP   EditorMainLoop
EditorCommandExit:
            LD   DE,EditorClearHome
            JP   EditorOutputText

EditorRunError:
            PUSH AF
            LD   DE,EditorErrorPrefix
            CALL EditorOutputText
            POP  AF
            CALL EditorPrintHexByte
            LD   DE,EditorNewline
            JP   EditorOutputText

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorReadByte:
            LD   DE,$00FF
            LD   C,6
            CALL EditorCallBdos
            OR   A
            JR   Z,EditorReadByte
            RET

.routine out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorReadEscapeByte:
            LD   HL,256
            LD   (EditorScratchA),HL
EditorReadEscapeLoop:
            LD   DE,$00FF
            LD   C,6
            CALL EditorCallBdos
            OR   A
            RET  NZ
            LD   HL,(EditorScratchA)
            DEC  HL
            LD   (EditorScratchA),HL
            LD   A,H
            OR   L
            JR   NZ,EditorReadEscapeLoop
            SCF
            RET

.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorPrintHexByte:
            LD   (EditorScratchC),A
            RRCA
            RRCA
            RRCA
            RRCA
            CALL EditorPrintHexNibble
            LD   A,(EditorScratchC)
            JP   EditorPrintHexNibble
.routine in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
EditorPrintHexNibble:
            AND  $0F
            ADD  A,'0'
            CP   '9'+1
            JP   C,EditorOutputByte
            ADD  A,7
            JP   EditorOutputByte
EditorMainCodeEnd:
