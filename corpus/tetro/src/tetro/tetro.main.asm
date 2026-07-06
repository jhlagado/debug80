; TEC-1G tetro
; ------------------
; John Hardy, 2026. All wrongs reserved.
; Attribution is informational only; no proprietary ownership asserted.
; "Copyleft" in the Tiny Basic hobby sense (sharing listings); not GPL.
; SPDX-License-Identifier: 0BSD (grant text: repository root LICENSE)
;
; Minimal interactive 8x8 RGB matrix example for the MON-3 layout.
;
; Goal:
;   Prove the frame-scan architecture with the smallest visible program:
;   a 4x4 bitmap shape moved left/right and down by frame-driven gravity while
;   the display is scanned with fixed row dwell, freezing into a landed board
;   on collision and respawning a new active piece.
;
; Controls (MON-3 key codes):
;   left  (0x11) = move left
;   right (0x10) = move right
;   GO     (0x12) = soft drop
;   AD     (0x13) = counter-clockwise rotate
;   C      (0x0C) = clockwise rotate
;   1/3    (0x01/0x03) = move left/right
;   2      (0x02) = soft drop
;   6      (0x06) = clockwise rotate
;   0      (0x00) = pause
;
; Design:
;   - One full 8-row frame is scanned per main-loop iteration.
;   - Game work runs while the matrix is blank between frames.
;   - The Framebuffer is 8 rows x 4 bytes (R/G/B/Aux).
;   - The landed board is stored as RGB bitplanes plus monochrome occupancy.
;   - The active object is a 4x4 bitmap blitted in its piece colour over the board.
;   - Pieces are selected from a PRNG-driven 7-piece stream with preview.

        .org     0x4000

        .include "../shared/constants.asm"
        .include "constants.asm"

;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
@Start:
        CALL    InitState

MainLoop:
        CALL    ScanFrame
        CALL    LogicTick
        JR      MainLoop

        .include "geometry-helpers.asm"
        .include "collision.asm"
        .include "../shared/framebuffer-core.asm"
        .include "../shared/framebuffer-draw.asm"
        .include "render.asm"
        .include "piece-active.asm"
        .include "board-lock.asm"
        .include "game-init.asm"
        .include "../shared/scan-tick.asm"
        .include "scan-frame.asm"
        .include "../shared/sound.asm"
        .include "sound.asm"
        .include "../shared/hud.asm"
        .include "hud.asm"
        .include "../shared/lcd.asm"
        .include "ui.asm"
        .include "logic-dispatch.asm"
        .include "input.asm"
        .include "data.asm"
        .include "ram.asm"
