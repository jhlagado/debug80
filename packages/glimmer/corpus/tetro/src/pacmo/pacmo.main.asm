; TEC-1G pacmo
; ------------------
; First Pacmo experiment: a yellow cursor moving through an 8x8 viewport
; over a larger 15x15 bitmap world.  This target is intentionally separate
; from Tetro so the finished Tetro game remains stable while Pacmo evolves.
; SPDX-License-Identifier: 0BSD

        .org     0x4000

        .include "../shared/constants.asm"

; Start —
; Pacmo entry point. Initializes game state, then scans
; one fixed-dwell matrix frame and runs one blanked logic
; frame forever from MainLoop. The loop does not return
; a semantic status value.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
@Start:
        CALL    InitState

MainLoop:
        CALL    ScanFrame
        CALL    LogicTick
        JR      MainLoop

        .include "../shared/scan-tick.asm"
        .include "scan-frame.asm"
        .include "game-init.asm"
        .include "logic-dispatch.asm"
        .include "movement.asm"
        .include "../shared/framebuffer-core.asm"
        .include "../shared/framebuffer-draw.asm"
        .include "render.asm"
        .include "../shared/sound.asm"
        .include "sound.asm"
        .include "../shared/hud.asm"
        .include "hud.asm"
        .include "../shared/lcd.asm"
        .include "ui.asm"
        .include "data.asm"
        .include "ram.asm"
