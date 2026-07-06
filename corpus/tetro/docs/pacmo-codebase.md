# Pacmo: a tour of the code

Pacmo is a maze game for the TEC-1G 8x8 RGB matrix. The visible display is not the whole world; it is an 8x8 window into a 15x15 maze. The player is a single bright pixel, the maze scrolls under that pixel where possible, and enemies move through the same world on their own timers.

The implementation follows the same hard constraint as Tetro: there are no interrupts and no background thread. Matrix scanout, speaker timing, Score display, input, enemy movement, collision, and rendering all share one loop. Pacmo therefore uses the same fixed-dwell frame scan model, but its game logic is about a scrolling world, consumable paths, power mode, and monster records rather than falling pieces.

This document describes the current Pacmo code. The shared loop, scan tick, LCD, HUD, sound, and Framebuffer contracts are covered in [shared-codebase.md](shared-codebase.md).

---

## Source layout

The Debug80 target is still the top-level file:

```text
src/pacmo/pacmo.main.asm
```

That file owns the `ORG`, the reset entry, the main loop, and the include order. Debug80 can treat it as the Pacmo target without needing to know how the internal files are arranged.

The current Pacmo include order is:

```asm
.include "../shared/constants.asm"

Start:
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
```

The include order is deliberate. `shared/scan-tick.asm` calls `SndService` and `HudScanDig` before their labels appear in the include stream. AZM resolves those forward references. The pattern keeps scanout generic while letting Pacmo decide which sound and HUD services satisfy the calls.

The split is intentional. Files under `src/shared/` are generic hardware or buffer routines that can serve more than one game. Files under `src/pacmo/` contain Pacmo's rules, state, tables, and game-specific wrappers.

This is still a careful harmonisation, not a large engine abstraction. Shared files are the small, stable pieces: scan tick, LCD primitives, Score digit scanning, sound state machine, and Framebuffer core helpers. Pacmo keeps its own maze rules, monster behaviour, rendering, Score events, and presentation choices.

---

## Runtime model

```asm
MainLoop:
    CALL    ScanFrame
    CALL    LogicTick
    JR      MainLoop
```

Those three instructions in `src/pacmo/pacmo.main.asm` are the whole runtime. Pacmo uses the shared cooperative loop described in [shared-codebase.md](shared-codebase.md): `ScanFrame` keeps the hardware alive for one visible frame, and `LogicTick` performs one game frame while the matrix is blank.

This means the display, Score digits, speaker, keypad, scrolling, monster movement, rendering, and level timing all share the same cooperative clock.

---

## Logic dispatch

Pacmo's `LogicTick` is a blanking-interval frame dispatcher. `ScanFrame` has already emitted all eight visible matrix rows with fixed dwell and blanked the row port before `LogicTick` runs.

Each logic frame runs the frame-wide duties: input polling, level-complete timing, power-mode timing, monster ticks, and player-caught collision checks. It then rebuilds the full Framebuffer from the current world, pills, Monsters, and player state for the next visible `ScanFrame`.

This keeps visible scan rows on a common workload. Irregular game work can lengthen the inter-frame blanking interval, but it no longer changes the dwell time of any specific row.

The generic helpers for clearing and copying live in `src/shared/framebuffer-core.asm`: `FbClearAll`, `FbClearRow`, `FbCopyRow`, and `FbCopyAll`. Pacmo still owns the actual rendering because the maze, eaten-path mask, power pills, player state, and monster state are game-specific.

---

## World, viewport, and coordinates

The world is a 15x15 grid. It is stored in `PacWorldRows` as two bytes per row: a high byte and a low byte. Bit 15 is world column 0. Bit 1 is world column 14. Bit 0 is outside the maze and is forced on during completion checks so the unused bit does not prevent the level from completing.

The viewport is 8x8. `ViewX` and `ViewY` are the world coordinates of the visible top-left cell. `PlayerX` and `PlayerY` are world coordinates. Rendering converts world to screen with subtraction:

```text
screenX = worldX - ViewX
screenY = worldY - ViewY
```

Only cells whose screen coordinates are in `0..7` are drawn.

Horizontal movement is tied to the matrix orientation. On the matrix, screen x 0 is the leftmost visible column and maps to the most significant bit. Pacmo keeps the MON-3 key constants as hardware truth:

- `KeyLeft  = 0x11`
- `KeyRight = 0x10`

After the emulator was corrected to match the hardware orientation, the left and right keys intentionally dispatch to the opposite internal Pacmo direction so the same physical controls keep their player-facing meaning.

---

## Input and movement

`PollInput` lives in `movement.asm`. It blocks movement while the splash screen is active, while the player is caught, and while the round-complete delay is active.

Input comes from MON-3 through:

```asm
LD      C,ApiScanKeys
RST     0x10
```

Pacmo normalizes raw keys into movement intents. The game logic does not care whether "up" came from ADD or key 6. The current mappings are:

- `KeyLeft` -> `PacDirRight`
- `KeyRight` -> `PacDirLeft`
- key 1 -> `PacDirRight`
- key 3 -> `PacDirLeft`
- ADD / `KeyRotateCcw` -> `PacDirUp`
- key 6 -> `PacDirUp`
- GO / `KeyRotate` -> `PacDirDown`
- key 2 -> `PacDirDown`
- key 0 -> pause
- any new key press while Paused -> resume

Player-facing controls are therefore:

| Key | Action |
| --- | --- |
| `<` | move left |
| `>` | move right |
| `AD` | move up |
| `GO` | move down |
| `0` | pause |
| any key | resume from pause |

The alternative inverted-T layout is:

```text
      6 = up
1 = left   3 = right
      2 = down
```

Held-key movement is throttled by `MoveCooldown` and `LastKey`. A new direction gets a one-tick cooldown so it moves promptly; a held direction reloads from `PacMovePeriod`, currently matching the level-1 monster step period so repeat is deliberately slow.

Pause follows the Tetro new-press pattern: `0` enters pause, and any new key press resumes. Holding a key does not repeatedly flip the state. While Paused, scanout, rendering, the HUD, and speaker service continue, but movement, monster ticks, collision checks, level gates, and power-mode countdown stop.

Each move constructs a candidate coordinate in `B` and `C`, then calls `TryMovePlyBc`. That routine rejects walls via `IsWallAtBc`, commits `PlayerX/Y` on success, consumes a power pill if present, marks the path as eaten, checks for round completion, checks monster collision, and updates the viewport.

---

## Scrolling

`UpdViewPly` keeps the player near the middle of the visible 8x8 window. Because the window has no single centre cell, Pacmo uses a comfort band: screen positions 3 and 4. If the player moves outside that band, the corresponding view origin moves by one cell, unless it is already clamped at the world edge.

`AdjustViewAxis` implements the rule for one axis:

- if `player - view < 3`, decrement the view origin if possible
- if `player - view >= 5`, increment the view origin if possible
- otherwise leave it alone
- clamp to `0..PacViewMax`

For a 15x15 world and an 8x8 viewport, `PacViewMax` is 7. At the world edges the view stops scrolling and the player moves away from the centre. In the middle of the world, the viewport does most of the visible movement.

---

## Maze consumption and scoring

Pacmo treats every open path cell as something to consume. The maze initially renders walls and uneaten paths. When the player enters an open cell, `MarkEatenBc` sets the corresponding bit in `PacEatenRows`.

`PacEatenRows` mirrors the world row format: two bytes per row for the 15 columns. The render path ORs the wall mask with the eaten mask, then inverts the result to get the visible uneaten path mask. Eaten paths render as black.

Scores are 16-bit and displayed on the six seven-segment digits. The event values are:

- path cell: 10
- power pill: 50
- fleeing monster: 200

`AddScoreA` adds an 8-bit event value to `PacScore`, then calls `UpdScoreDisplay`.

`src/shared/hud.asm` handles scanning the six digits and owns the decimal formatter. `src/pacmo/hud.asm` is a local wrapper: it loads `PacScore` into `HL` and tail-calls the shared HUD formatter, which owns the `HudSegBuffer` destination.

---

## Power pills and power mode

Power pills are stored as x,y pairs in `PacPowerPills`, terminated by `0xFF`. The eaten state is a bit mask in `PacPwrPillsEat`, one bit per listed pill.

When the player enters a power-pill cell, `EatPwrPillBc`:

- sets the corresponding eaten bit
- adds `PacScorePower`
- starts the Pacmo power-pill sound
- loads `PacPowerTimer`
- sets all monster states to `PacEnemyFlee`
- updates the LCD to the power-mode screen

Power mode is global for Monsters that are already active. `TickPowerTimer` decrements the 16-bit timer once per logic frame. When it reaches zero, all monster states return to attack and the LCD returns to the running screen.

Rendering uses the timer for a warning blink. A fleeing monster normally uses `PacColorEnFlee`. Near the end of the timer, the low byte is masked with `PacPwrWarnMask`, and the monster alternates between flee and attack colour.

If the player eats a fleeing monster, that monster enters respawn state. Other Monsters remain in their current state; eating one monster does not cancel the global power timer.

---

## Monsters

Monsters are records in RAM. `MonsterSize` is six bytes:

- x
- y
- direction
- timer
- respawn timer
- state

There are currently three records: `Monster0`, `Monster1`, and `Monster2`. Level 1 uses two Monsters. Level 2 and above include the third.

`TickEnemy` is passed a monster record in `IX`. It returns immediately during splash, caught, or round-complete states. If the monster is respawning, `TickEnemyResp` counts down and keeps the monster hidden. Otherwise, the movement timer decrements. When the timer reaches zero, it reloads from `EnemyPeriodCur` and chooses movement based on state.

Attack mode uses a greedy chase. `EnemyChaseDirs` compares horizontal and vertical distance to the player and returns a preferred direction and secondary direction. `EnemyAttackStep` tries the preferred direction, then the secondary direction, while avoiding immediate reversal. If both fail, it falls back to roam.

Flee mode uses `EnemyRoamStep`. It is deterministic rather than random. The first candidate direction is derived from the monster's x, y, current direction, and current level; then it rotates through up to four directions, skipping the immediate reverse unless no other move works. This gives wandering behaviour without a PRNG.

Movement commits through `EnemyTryMove`, which checks bounds, probes walls with `IsWallAtBc`, and writes the new x, y, and direction only when the move succeeds.

---

## Collision and respawn

Player/monster collision is checked by `CheckPlyCaught`, again with the monster record in `IX`.

If the monster is respawning, it cannot collide. If x and y differ, there is no collision. If the monster is in flee state, `EatEnemy` hides it, starts its respawn timer, plays the eaten sound, updates the LCD, and adds Score. Otherwise `EnterCaught` decrements `PacLives`, latches the caught state, loads the restart gate, plays the caught sound, updates the LCD, and rebuilds the Framebuffer.

Pacmo starts a new game with three lives. A caught state with lives remaining shows `PACMO CAUGHT` and `LIVES N` on the LCD. After the gate opens, any key resets the player and Monsters while preserving the current level, Score, eaten paths, and remaining pills. When the final life is lost, `PacGameOver` is set instead, and the LCD shows `GAME OVER` with the normal restart prompt. The next key after the gate restarts the whole game.

Respawn is deliberately not "return to a fixed home cell." When a respawn timer expires, `EnemySelectResp` scans `PacEnemySpawns`. Each candidate is scored. A candidate currently visible in the viewport scores zero. A candidate less than eight cells from the player scores zero. Otherwise the Score is:

```text
distance from player + distance from other active Monsters
```

The best candidate wins, with ties keeping the earlier table entry. This keeps respawns off-screen, away from the player, and less likely to stack multiple Monsters together.

When a monster respawns, its state is attack, its direction is right, and its movement timer reloads from `EnemyPeriodCur`.

---

## Level completion and progression

The level is complete when every open cell in `PacWorldRows` has been marked eaten in `PacEatenRows`. `CheckRoundDone` walks both byte streams row by row. It ORs world walls and eaten bits together. If both bytes in every row are effectively all ones, no uneaten open path remains.

On completion, Pacmo sets `PacRoundDone`, loads `PacLvlDoneGate`, plays the level-complete sound, and updates the LCD. During the gate the player cannot move. Rendering turns walls white and the player white, so completion is visible without destroying the maze display.

`TickLvlDoneGate` decrements the gate. When it expires, `PacAdvanceLevel` increments `PacLevel`, reduces `EnemyPeriodCur` down toward `PacEnemyPerMin`, initializes a new level, and restores the running LCD.

Difficulty currently rises in two ways:

- level 2 enables the third monster
- later levels reduce the monster period by `PacEnemyPerStep` until the minimum is reached

---

## Rendering

Pacmo uses the shared double-buffer core and shared Framebuffer draw primitives, but owns its renderers.

`RebuildFb` is the full redraw path used during initialization, state changes, and every steady-state logic frame.

`RendWorldRow` is the steady-state maze renderer. It accepts a screen row `0..7`, combines that row with `ViewY`, reads the matching world and eaten-path rows, and uses `WindowByteBc` to extract the visible eight bits from each 15-bit row. Walls and uneaten paths are passed to `WrWorldColors`, which writes red, green, and blue plane bytes according to the current palette.

`RendWorldBack` remains as a full-frame wrapper for initialization and state rebuild paths. It calls the row renderer eight times rather than owning separate world-render logic.

Wall colour is state-dependent:

- normal: `PacColorWall`
- player caught: `PacColorCaught`
- round complete: `PacColorDone`

`RendPwrPillRow` walks the power-pill table and draws only uneaten pills on the requested screen row. `RendPwrPills` remains the full-frame wrapper.

`RendMonsRow` filters Monsters by the requested screen row before calling `RendEnemyBack`. `RendEnemyBack` converts a monster's world x,y to screen x,y, skips off-screen and respawning Monsters, chooses attack or flee colour, and writes one cell.

`RendPlyRow` draws the player only when the requested row matches the player's visible screen row. `RendPlyBack` still owns the cell colour choice. The player is drawn last so it appears over paths, pills, and Monsters. It is normally yellow. When the round is complete it is white. When caught it is red.

Single-cell overlays go through `FbSetCell`. The render path converts screen x coordinates with `MxMask`, then passes the Framebuffer row pointer, cell bit mask, and colour bitfield to the shared cell writer. `FbSetCell` clears that bit from each RGB plane not present in the colour and sets it in each plane that is present. This matters because an enemy over a green path should render as red, not yellow from red plus green.

The player-facing colour legend is:

| Colour | Meaning |
| --- | --- |
| blue | wall |
| green | uneaten path |
| black | eaten path |
| yellow | player |
| white | power pill, or round-complete state |
| red | attacking monster, caught state, or game-over cue |
| magenta | fleeing monster during power mode |

---

## LCD, Score, and sound

LCD primitives are shared in `src/shared/lcd.asm`: busy wait, command write, string write, script runner, single-character output, row string writer, and table-character output. Pacmo-specific screens remain in `src/pacmo/ui.asm`.

The LCD screens are script tables in `data.asm`. Each script is a sequence of row command plus text pointer, terminated by zero. The running, Paused, power, and enemy-eaten screens call `LcdRefStatus` after the script so row 2 shows the current level and row 3 shows `LIVES N`.

The Score display is split. Shared `HudScanDig` handles multiplexing, and shared `HudWriteU16` converts the 16-bit Score to segment patterns using repeated subtraction because the Z80 has no division instruction. Pacmo-local `UpdScoreDisplay` is only the wrapper for `PacScore`.

Sound is split the same way. Shared `SndStart` and `SndService` implement the square-wave state machine. Pacmo-local sound wrappers in `src/pacmo/sound.asm` load event-specific duration and divider values:

- power pill
- fleeing monster eaten, now tuned as a longer confirmation cue
- player caught, now tuned as a longer game-over cue
- level complete

There is no movement sound now; it was removed because it made the game noisier without adding useful information.

---

## Data layout

`data.asm` contains constants, LCD text, the world bitmap, power-pill positions, and respawn candidates. Most game tuning is here: move period, power timer, scoring, palette, monster speed, respawn delay, and level difficulty steps.

Most static Pacmo data lives here: the 15-row maze bitmap, power-pill table, enemy respawn table, colour constants, Score values, sound durations, LCD strings, and LCD scripts. Changing a message, palette entry, Score value, or respawn candidate is usually a data edit rather than a logic edit.

`ram.asm` is arranged around the systems that mutate it:

- player coordinates
- monster records
- viewport origin
- input repeat state
- splash flag
- HUD and speaker state
- Score and HUD segment buffer
- frame counter
- render scratch
- power-pill eaten mask and power timer
- round-complete and caught flags
- game-over flag and lives counter
- level and delay gates
- scan state and framebuffers
- eaten-path bitmap

`Monster0`, `Monster1`, and `Monster2` are contiguous records, and symbolic aliases such as `EnemyX` and `Enemy2Timer` point into those records. New enemy code should prefer `IX` record access; the aliases exist mostly for initialization and readability.

The Framebuffer is the same shape used by Tetro and the shared scanout: eight rows, four bytes per row. The first three bytes are red, green, and blue. The fourth is aux/padding and is cleared but not emitted by scanout.

---

## Shared versus Pacmo-specific code

Currently shared and generic:

- `shared/constants.asm`: hardware ports, MON-3 keys, colours, dimensions
- `shared/scan-tick.asm`: matrix scanout and scan-state advance
- `shared/framebuffer-core.asm`: back-buffer clear and copy
- `shared/framebuffer-draw.asm`: matrix x-to-mask conversion and RGB Framebuffer draw primitives
- `shared/sound.asm`: speaker divider service
- `shared/hud.asm`: seven-segment scan, blanking, digit/glyph tables, and decimal formatting
- `shared/lcd.asm`: HD44780 primitive operations, script renderer, row string writer, and table-character writer

Currently Pacmo-specific:

- `game-init.asm`: level/player/monster initialization
- `logic-dispatch.asm`: Pacmo frame schedule, power timer, monster AI, respawn, level progression
- `movement.asm`: input normalization, player movement, path/power consumption, game-over entry
- `render.asm`: maze, pills, Monsters, player, and calls into shared cell-colour primitives
- `sound.asm`: Pacmo event sound names and durations
- `hud.asm`: Pacmo Score display wrapper for the shared HUD formatter
- `ui.asm`: Pacmo LCD status screens
- `data.asm`: maze, palette, text, scoring, tuning, spawn tables
- `ram.asm`: Pacmo state layout

Pacmo Score formatting goes through the shared HUD formatter via its local wrapper. Pacmo cell rendering uses `FbSetCell`, and Pacmo x-to-mask conversion uses `MxMask`.

---

## A complete play sequence

On boot, `InitState` clears the Score, starts level 1, gives the player three lives, sets the base monster period, calls `InitLevelState`, marks the splash active, and shows the Pacmo splash on the LCD.

`InitLevelState` places the player at the centre of the 15x15 maze, initializes two or three monster records, sets the viewport origin to `(3,3)`, clears timers and flags, initializes scan state, clears the framebuffers and eaten-path map, marks the player's starting cell eaten without awarding Score, updates the Score display, and rebuilds the Framebuffer.

The main loop runs. The matrix, HUD, and speaker are serviced continuously. While the splash flag is set, the first keypress clears it and shows the running LCD screen.

The player presses a movement key. `PollInput` normalizes it into a direction and applies repeat timing. A move routine calculates a target cell. `TryMovePlyBc` checks the wall map. If the target is a wall, nothing changes. If it is open, the player position is committed, power pills are consumed, the path is marked eaten, level completion is checked, monster collision is checked, and the viewport is adjusted.

Every logic frame, Monsters tick. In attack mode they try to reduce distance to the player. In flee mode they roam. If a monster reaches the player in attack mode, Pacmo enters caught state. The walls turn red, the LCD says `PACMO CAUGHT` and shows the remaining lives, the caught sound plays, and a restart gate prevents an immediate accidental restart. If no lives remain, the LCD says `GAME OVER` and the next restart begins a fresh game.

If the player eats a power pill, all active Monsters enter flee state for the timer duration. If the player catches a fleeing monster, that monster disappears and respawns later at the best off-screen candidate. Other Monsters continue independently.

As the player eats paths, the green path cells turn black. When no open path cells remain uneaten, the level-complete flag is set. The walls turn white, the level-complete sound plays, the LCD reports completion, and a short gate runs. Then `PacAdvanceLevel` increments the level, speeds Monsters up within bounds, initializes the next level, and play resumes.

---

## Map

```text
target
  src/pacmo/pacmo.main.asm
    ORG, Start, MainLoop, include order

shared hardware helpers
  shared/scan-tick.asm
    ScanTick -> SndService, HudScanDig, ScanNext
  shared/sound.asm
    SndStart, SndService
  shared/hud.asm
    HudScanDig, HudBlankDig
  shared/lcd.asm
    LcdBusy, LcdCmd, LcdString, LcdScript, LcdPutc, LcdRowStr, LcdPutcTbl
  shared/framebuffer-core.asm
    FbClearAll, FbClearRow, FbCopyRow, FbCopyAll
  shared/framebuffer-draw.asm
    MxMask, FbSetCell, FbOrRow

Pacmo wrappers and presentation
  pacmo/sound.asm
    PacSndPower, EAT_ENEMY, CAUGHT, LEVEL_COMPLETE
  pacmo/hud.asm
    UpdScoreDisplay
  pacmo/ui.asm
    LcdShowPacSplash, RUNNING, POWER, ENEMY_EATEN, CAUGHT, COMPLETE

Pacmo rules
  pacmo/logic-dispatch.asm
    LogicTick, power timer, monster AI, respawn, level progression
  pacmo/movement.asm
    input normalization, player movement, consumption, collision, scrolling
  pacmo/render.asm
    maze, pills, Monsters, player, cell colour overlay
  pacmo/game-init.asm
    cold Start, level initialization, Framebuffer/eaten-path clearing

state and data
  pacmo/ram.asm
    all mutable Pacmo state
  pacmo/data.asm
    maze, palette, Score values, LCD scripts, spawn tables
```
