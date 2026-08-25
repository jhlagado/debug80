; Native full-screen editor for the ideal Debug80 CP/M 2.2 platform.

            .include "editor-memory.asmi"

            .org EditorCodeBase
EditorTransientStart:
            JP   EditorEntry

EditorCodeStart:
            .include "editor-bdos.asm"
            .include "editor-command.asm"
            .include "editor-load.asm"
            .include "editor-buffer.asm"
            .include "editor-navigation.asm"
            .include "editor-screen.asm"
            .include "editor-save.asm"
            .include "editor-main.asm"
EditorCodeEnd:

EditorImmutableStart:
EditorDefaultName:        .db 0,"INPUT   ","NU "
EditorBackupExtension:    .db "BAK"
EditorTemporaryExtension: .db "$$$"
EditorErrorPrefix:        .db 13,10,"EDIT error ","$"
EditorNewline:            .db 13,10,"$"
EditorClearHome:          .db 27,"[2J",27,"[H","$"
EditorStatusPosition:     .db 27,"[24;1H","$"
EditorReverseOn:          .db 27,"[7m","$"
EditorReverseOff:         .db 27,"[0m","$"
EditorCursorPrefix:       .db 27,"[","$"
EditorStatusPrefix:       .db "EDIT ",0
EditorStatusHints:        .db "  ^S Save  ^Q Quit",0
EditorStatusSavedText:    .db "Saved  ",0
EditorStatusFullText:     .db "Full  ",0
EditorStatusDiscardText:  .db "Discard changes? ^Q again  ",0
EditorStatusSaveFailedText: .db "Save failed ",0
EditorImmutableEnd:
EditorResidentEnd:
            .end
