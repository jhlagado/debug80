; TEC-1G pacmo
; ------------------
; First Pacmo experiment: a yellow cursor moving through an 8x8 viewport
; over a larger 15x15 bitmap world.  This target is intentionally separate
; from Tetro so the finished Tetro game remains stable while Pacmo evolves.
; SPDX-License-Identifier: 0BSD

%INCLUDE "../shared/constants.asm"
%INCLUDE "constants.asm"
%INCLUDE "main-loop.asm"
%INCLUDE "../shared/scan-tick.asm"
%INCLUDE "scan-frame.asm"
%INCLUDE "game-init.asm"
%INCLUDE "logic-dispatch.asm"
%INCLUDE "movement.asm"
%INCLUDE "../shared/framebuffer-core.asm"
%INCLUDE "../shared/framebuffer-draw.asm"
%INCLUDE "render.asm"
%INCLUDE "../shared/sound.asm"
%INCLUDE "sound.asm"
%INCLUDE "../shared/hud.asm"
%INCLUDE "hud.asm"
%INCLUDE "../shared/lcd.asm"
%INCLUDE "ui.asm"
%INCLUDE "data.asm"
%INCLUDE "ram.asm"
